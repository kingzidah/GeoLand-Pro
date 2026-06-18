import jwt from 'jsonwebtoken';
import { AccessRequestStatus, Prisma, Role } from '@prisma/client';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';
import { logger } from '../config/logger';
import {
  markImpersonationSessionActive,
  markImpersonationSessionEnded,
} from './impersonationSession.service';
import type {
  CreateAccessRequestInput,
  ApproveAccessRequestInput,
  ListAccessRequestsQuery,
} from '../validations/accessRequest.schema';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Floor so a near-expiry approval still yields a usable token; the
// OrgAccessRequest status/expiresAt remain the authoritative gate (Phase 3).
const MIN_TOKEN_TTL_SECONDS = 60;

async function enrichWithRequesters<T extends { requestedById: string }>(requests: T[]) {
  const requesterIds = [...new Set(requests.map((r) => r.requestedById))];
  const requesters = requesterIds.length
    ? await prisma.user.findMany({
        where: { id: { in: requesterIds } },
        select: { id: true, firstName: true, lastName: true, email: true, platformRole: true },
      })
    : [];
  const requesterMap = new Map(requesters.map((u) => [u.id, u]));

  return requests.map((r) => ({ ...r, requestedBy: requesterMap.get(r.requestedById) ?? null }));
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const accessRequestService = {
  // ─── PLATFORM STAFF ───────────────────────────────────────────────────────────

  async createRequest(organisationId: string, requestedById: string, data: CreateAccessRequestInput) {
    const organisation = await prisma.organisation.findUnique({
      where: { id: organisationId },
      select: { id: true, name: true },
    });
    if (!organisation) throw ApiError.notFound('Organisation');

    const request = await prisma.orgAccessRequest.create({
      data: {
        organisationId,
        requestedById,
        reason: data.reason,
        requestedScopes: data.requestedScopes,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: requestedById,
        action: 'ACCESS_REQUESTED',
        entityType: 'OrgAccessRequest',
        entityId: request.id,
        metadata: {
          organisationId,
          organisationName: organisation.name,
          requestedScopes: data.requestedScopes,
          reason: data.reason ?? null,
        },
      },
    });

    logger.info('Access request created', { requestId: request.id, organisationId, requestedById });
    return request;
  },

  async listMine(requestedById: string, query: ListAccessRequestsQuery) {
    const skip = (query.page - 1) * query.limit;
    const where: Prisma.OrgAccessRequestWhereInput = {
      requestedById,
      ...(query.status && { status: query.status }),
    };

    const [data, total] = await Promise.all([
      prisma.orgAccessRequest.findMany({
        where,
        include: { organisation: { select: { id: true, name: true, slug: true } } },
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.orgAccessRequest.count({ where }),
    ]);

    return {
      data,
      meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
    };
  },

  async enter(requestId: string, requester: { id: string; email: string; role: Role }) {
    const request = await prisma.orgAccessRequest.findUnique({ where: { id: requestId } });
    if (!request || request.requestedById !== requester.id) throw ApiError.notFound('Access request');

    if (request.status === AccessRequestStatus.APPROVED && request.expiresAt && request.expiresAt < new Date()) {
      await prisma.orgAccessRequest.update({
        where: { id: requestId },
        data: { status: AccessRequestStatus.EXPIRED },
      });
      throw ApiError.badRequest('This access request has expired');
    }

    if (request.status !== AccessRequestStatus.APPROVED) {
      throw ApiError.badRequest(`Cannot enter a request with status ${request.status}`);
    }
    if (!request.expiresAt) {
      throw ApiError.badRequest('Access request has no expiry set');
    }

    const organisation = await prisma.organisation.findUnique({
      where: { id: request.organisationId },
      select: { id: true, name: true, slug: true },
    });
    if (!organisation) throw ApiError.notFound('Organisation');

    const ttlSeconds = Math.max(
      MIN_TOKEN_TTL_SECONDS,
      Math.floor((request.expiresAt.getTime() - Date.now()) / 1000)
    );

    // Fix 1: mark the session live in Redis BEFORE flipping status to ACTIVE.
    // markImpersonationSessionActive throws on Redis failure, so enter() then
    // fails with the request still APPROVED (retryable) rather than stuck
    // ACTIVE with a token whose liveness can never be confirmed. The marker's
    // TTL is ttlSeconds + 1 so it always outlives claim.expiresAt by ~1s —
    // natural expiry is therefore always reported as IMPERSONATION_EXPIRED
    // (the authoritative claim.expiresAt check in
    // applyImpersonationEnforcement), never IMPERSONATION_REVOKED.
    await markImpersonationSessionActive(requestId, ttlSeconds + 1);

    const updated = await prisma.orgAccessRequest.update({
      where: { id: requestId },
      data: { status: AccessRequestStatus.ACTIVE },
    });

    const accessToken = jwt.sign(
      {
        sub: requester.id,
        email: requester.email,
        role: requester.role,
        impersonation: {
          requestId: updated.id,
          organisationId: organisation.id,
          grantedScopes: updated.grantedScopes,
          readOnly: true,
          expiresAt: updated.expiresAt!.toISOString(),
        },
      },
      env.JWT_ACCESS_SECRET,
      { expiresIn: ttlSeconds }
    );

    await prisma.auditLog.create({
      data: {
        userId: requester.id,
        action: 'ACCESS_ENTERED',
        entityType: 'OrgAccessRequest',
        entityId: requestId,
        metadata: {
          organisationId: organisation.id,
          organisationName: organisation.name,
          grantedScopes: updated.grantedScopes,
          expiresAt: updated.expiresAt,
        },
      },
    });

    logger.info('Staff entered impersonation session', {
      requestId,
      requesterId: requester.id,
      organisationId: organisation.id,
    });

    return {
      accessToken,
      expiresIn: ttlSeconds,
      organisation,
      grantedScopes: updated.grantedScopes,
      expiresAt: updated.expiresAt,
    };
  },

  async exit(requestId: string, requesterId: string) {
    const request = await prisma.orgAccessRequest.findUnique({ where: { id: requestId } });
    if (!request || request.requestedById !== requesterId) throw ApiError.notFound('Access request');
    if (request.status !== AccessRequestStatus.ACTIVE) {
      throw ApiError.badRequest(`Cannot exit a request with status ${request.status}`);
    }

    await prisma.orgAccessRequest.update({
      where: { id: requestId },
      data: { status: AccessRequestStatus.ENDED, endedAt: new Date() },
    });

    // Fix 1: invalidate the live session immediately, regardless of the
    // JWT's remaining lifetime — see impersonationSession.service.ts.
    await markImpersonationSessionEnded(requestId);

    await prisma.auditLog.create({
      data: {
        userId: requesterId,
        action: 'ACCESS_ENDED',
        entityType: 'OrgAccessRequest',
        entityId: requestId,
        metadata: { organisationId: request.organisationId },
      },
    });

    logger.info('Staff exited impersonation session', { requestId, requesterId });
  },

  // ─── ORG SUPER_ADMIN ────────────────────────────────────────────────────────────

  async listForOrg(organisationId: string, query: ListAccessRequestsQuery) {
    const skip = (query.page - 1) * query.limit;
    const where: Prisma.OrgAccessRequestWhereInput = {
      organisationId,
      ...(query.status && { status: query.status }),
    };

    const [requests, total] = await Promise.all([
      prisma.orgAccessRequest.findMany({ where, skip, take: query.limit, orderBy: { createdAt: 'desc' } }),
      prisma.orgAccessRequest.count({ where }),
    ]);

    return {
      data: await enrichWithRequesters(requests),
      meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
    };
  },

  async approve(requestId: string, organisationId: string, approverId: string, data: ApproveAccessRequestInput) {
    const request = await prisma.orgAccessRequest.findUnique({ where: { id: requestId } });
    if (!request || request.organisationId !== organisationId) throw ApiError.notFound('Access request');
    if (request.status !== AccessRequestStatus.PENDING) {
      throw ApiError.badRequest(`Cannot approve a request with status ${request.status}`);
    }

    const expiresAt = new Date(Date.now() + data.durationMinutes * 60 * 1000);

    const updated = await prisma.orgAccessRequest.update({
      where: { id: requestId },
      data: {
        status: AccessRequestStatus.APPROVED,
        grantedScopes: data.grantedScopes,
        approvedById: approverId,
        approvedAt: new Date(),
        expiresAt,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: approverId,
        action: 'ACCESS_GRANTED',
        entityType: 'OrgAccessRequest',
        entityId: requestId,
        metadata: {
          requestedById: request.requestedById,
          grantedScopes: data.grantedScopes,
          durationMinutes: data.durationMinutes,
          expiresAt: expiresAt.toISOString(),
        },
      },
    });

    logger.info('Access request approved', { requestId, organisationId, approverId, expiresAt });
    return updated;
  },

  async deny(requestId: string, organisationId: string, approverId: string) {
    const request = await prisma.orgAccessRequest.findUnique({ where: { id: requestId } });
    if (!request || request.organisationId !== organisationId) throw ApiError.notFound('Access request');
    if (request.status !== AccessRequestStatus.PENDING) {
      throw ApiError.badRequest(`Cannot deny a request with status ${request.status}`);
    }

    const updated = await prisma.orgAccessRequest.update({
      where: { id: requestId },
      data: { status: AccessRequestStatus.DENIED, approvedById: approverId, approvedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        userId: approverId,
        action: 'ACCESS_DENIED',
        entityType: 'OrgAccessRequest',
        entityId: requestId,
        metadata: { requestedById: request.requestedById },
      },
    });

    logger.info('Access request denied', { requestId, organisationId, approverId });
    return updated;
  },

  async revoke(requestId: string, organisationId: string, approverId: string) {
    const request = await prisma.orgAccessRequest.findUnique({ where: { id: requestId } });
    if (!request || request.organisationId !== organisationId) throw ApiError.notFound('Access request');
    if (request.status !== AccessRequestStatus.ACTIVE && request.status !== AccessRequestStatus.APPROVED) {
      throw ApiError.badRequest(`Cannot revoke a request with status ${request.status}`);
    }

    const updated = await prisma.orgAccessRequest.update({
      where: { id: requestId },
      data: { status: AccessRequestStatus.REVOKED, endedAt: new Date() },
    });

    // Fix 1: invalidate the live session immediately, regardless of the
    // JWT's remaining lifetime — see impersonationSession.service.ts. Covers
    // both an ACTIVE session (staff currently impersonating) and an APPROVED
    // one (never entered, so this is a harmless no-op DEL).
    await markImpersonationSessionEnded(requestId);

    await prisma.auditLog.create({
      data: {
        userId: approverId,
        action: 'ACCESS_REVOKED',
        entityType: 'OrgAccessRequest',
        entityId: requestId,
        metadata: { requestedById: request.requestedById, previousStatus: request.status },
      },
    });

    logger.info('Access request revoked', { requestId, organisationId, approverId });
    return updated;
  },
};
