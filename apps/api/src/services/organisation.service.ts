import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Prisma, Role } from '@prisma/client';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';
import { logger } from '../config/logger';
import { platformSettingsService } from './platformSettings.service';
import type {
  ListOrganisationsQuery,
  CreateOrganisationInput,
  UpdateOrganisationInput,
  UpdateOrgSettingsInput,
  ListOrgUsersQuery,
  ChangeOrgUserRoleInput,
  CreateInviteInput,
  ListInviteCodesQuery,
} from '../validations/organisation.schema';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BCRYPT_ROUNDS = 12;

const organisationSelect = {
  id: true,
  name: true,
  slug: true,
  logoUrl: true,
  country: true,
  currency: true,
  timezone: true,
  isActive: true,
  subscriptionTier: true,
  commissionRate: true,
  maxProperties: true,
  maxUsers: true,
  onboardingStage: true,
  createdAt: true,
  updatedAt: true,
} as const;

const orgUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  isActive: true,
  isEmailVerified: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function generateUniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || 'organisation';
  let slug = base;
  let suffix = 1;

  while (await prisma.organisation.findUnique({ where: { slug }, select: { id: true } })) {
    suffix += 1;
    slug = `${base}-${suffix}`;
  }

  return slug;
}

function generateTemporaryPassword(): string {
  return crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, '');
}

// ─── Two-founder org-delete confirmation ───────────────────────────────────────
// In-memory pending-deletion store. A first DELETE request generates a token;
// a second DELETE request from a DIFFERENT platform admin, presenting that
// token, performs the actual cascade delete. Entries expire after 10 minutes.
const DELETE_CONFIRMATION_TTL_MS = 10 * 60 * 1000;

interface PendingDeletion {
  token: string;
  requestedBy: string;
  expiresAt: number;
}

const pendingDeletions = new Map<string, PendingDeletion>();

// ─── Service ─────────────────────────────────────────────────────────────────

export const organisationService = {
  // ─── PLATFORM ADMIN ───────────────────────────────────────────────────────────

  async listOrganisations(query: ListOrganisationsQuery) {
    const skip = (query.page - 1) * query.limit;

    const where: Prisma.OrganisationWhereInput = {
      ...(query.isActive !== undefined && { isActive: query.isActive }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { slug: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [organisations, total] = await Promise.all([
      prisma.organisation.findMany({
        where,
        select: {
          ...organisationSelect,
          _count: { select: { users: true, properties: true } },
          users: {
            select: { lastLoginAt: true },
            orderBy: { lastLoginAt: 'desc' },
            take: 1,
          },
        },
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.organisation.count({ where }),
    ]);

    return {
      data: organisations.map(({ users, ...org }) => ({
        ...org,
        userCount: org._count.users,
        propertyCount: org._count.properties,
        lastActiveAt: users[0]?.lastLoginAt ?? null,
      })),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },

  async getOrganisationById(id: string) {
    const organisation = await prisma.organisation.findUnique({
      where: { id },
      select: {
        ...organisationSelect,
        _count: { select: { users: true, properties: true } },
      },
    });

    if (!organisation) throw ApiError.notFound('Organisation');

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const properties = await prisma.property.findMany({ where: { organisationId: id }, select: { id: true } });
    const propertyIds = properties.map((p) => p.id);

    let revenueThisMonthGHS = 0;
    let totalCommissionEarnedGHS = 0;

    if (propertyIds.length > 0) {
      const leases = await prisma.leaseAgreement.findMany({
        where: { plot: { propertyId: { in: propertyIds } } },
        select: { id: true },
      });
      const leaseIds = leases.map((l) => l.id);

      if (leaseIds.length > 0) {
        const [revenueAgg, commissionAgg] = await Promise.all([
          prisma.transaction.aggregate({
            where: {
              leaseId: { in: leaseIds },
              status: 'COMPLETED',
              type: { not: 'REFUND' },
              paidAt: { gte: startOfMonth },
            },
            _sum: { amountGHS: true },
          }),
          prisma.commission.aggregate({
            where: { transaction: { leaseId: { in: leaseIds } } },
            _sum: { amountGHS: true },
          }),
        ]);

        revenueThisMonthGHS = revenueAgg._sum.amountGHS ?? 0;
        totalCommissionEarnedGHS = commissionAgg._sum.amountGHS ?? 0;
      }
    }

    const { _count, ...org } = organisation;
    return {
      ...org,
      userCount: _count.users,
      propertyCount: _count.properties,
      revenueThisMonthGHS,
      totalCommissionEarnedGHS,
    };
  },

  async createOrganisation(data: CreateOrganisationInput, createdBy: string) {
    const existingAdmin = await prisma.user.findUnique({
      where: { email: data.adminEmail },
      select: { id: true },
    });
    if (existingAdmin) throw ApiError.conflict('An account with this email already exists');

    const slug = data.slug ? data.slug : await generateUniqueSlug(data.name);

    const slugTaken = await prisma.organisation.findUnique({ where: { slug }, select: { id: true } });
    if (slugTaken) throw ApiError.conflict(`Organisation slug "${slug}" is already in use`);

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);

    const commissionRate = data.commissionRate ?? (await platformSettingsService.getDefaultCommissionRate());

    const result = await prisma.$transaction(async (tx) => {
      const organisation = await tx.organisation.create({
        data: {
          name: data.name,
          slug,
          logoUrl: data.logoUrl,
          country: data.country,
          currency: data.currency,
          timezone: data.timezone,
          subscriptionTier: data.subscriptionTier,
          commissionRate,
          maxProperties: data.maxProperties,
          maxUsers: data.maxUsers,
        },
        select: organisationSelect,
      });

      const adminUser = await tx.user.create({
        data: {
          email: data.adminEmail,
          phone: data.adminPhone,
          passwordHash,
          firstName: data.adminFirstName,
          lastName: data.adminLastName,
          role: Role.SUPER_ADMIN,
          organisationId: organisation.id,
        },
        select: orgUserSelect,
      });

      return { organisation, adminUser };
    });

    // TODO: Enqueue welcome email via notification job queue once email infrastructure exists
    logger.info('Organisation created — welcome email pending', {
      organisationId: result.organisation.id,
      adminEmail: result.adminUser.email,
      createdBy,
    });

    await prisma.auditLog.create({
      data: {
        userId: createdBy,
        action: 'ORGANISATION_CREATED',
        entityType: 'Organisation',
        entityId: result.organisation.id,
        metadata: {
          name: result.organisation.name,
          slug: result.organisation.slug,
          adminEmail: result.adminUser.email,
        },
      },
    });

    return { ...result, temporaryPassword };
  },

  async updateOrganisation(id: string, data: UpdateOrganisationInput, requesterId: string) {
    const existing = await prisma.organisation.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw ApiError.notFound('Organisation');

    if (data.slug) {
      const slugTaken = await prisma.organisation.findFirst({
        where: { slug: data.slug, NOT: { id } },
        select: { id: true },
      });
      if (slugTaken) throw ApiError.conflict(`Organisation slug "${data.slug}" is already in use`);
    }

    const organisation = await prisma.organisation.update({
      where: { id },
      data,
      select: organisationSelect,
    });

    logger.info('Organisation updated', { organisationId: id, fields: Object.keys(data) });

    await prisma.auditLog.create({
      data: {
        userId: requesterId,
        action: 'ORGANISATION_UPDATED',
        entityType: 'Organisation',
        entityId: id,
        metadata: { fields: Object.keys(data) },
      },
    });

    return organisation;
  },

  async setOrganisationActive(id: string, isActive: boolean, requesterId: string) {
    const existing = await prisma.organisation.findUnique({ where: { id }, select: { isActive: true } });
    if (!existing) throw ApiError.notFound('Organisation');

    const organisation = await prisma.organisation.update({
      where: { id },
      data: { isActive },
      select: organisationSelect,
    });

    if (!isActive) {
      // Immediately invalidate active sessions for everyone in a suspended organisation
      await prisma.user.updateMany({
        where: { organisationId: id },
        data: { refreshTokenHash: null },
      });
    }

    logger.info(isActive ? 'Organisation activated' : 'Organisation suspended', {
      organisationId: id,
      requesterId,
    });

    await prisma.auditLog.create({
      data: {
        userId: requesterId,
        action: isActive ? 'ORGANISATION_ACTIVATED' : 'ORGANISATION_SUSPENDED',
        entityType: 'Organisation',
        entityId: id,
        metadata: { organisationName: organisation.name },
      },
    });

    return organisation;
  },

  // ─── Module 4: Onboarding Pipeline ─────────────────────────────────────────────
  // `onboardingStage` (1-6) drives the kanban board in apps/master-control. The
  // frontend maps stages to a 6-column pipeline; this service just persists the
  // stage and exposes the fields needed to render each card.

  async listOnboardingOrganisations() {
    const organisations = await prisma.organisation.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        onboardingStage: true,
        createdAt: true,
        _count: { select: { users: true } },
      },
      orderBy: [{ onboardingStage: 'asc' }, { createdAt: 'asc' }],
      take: 200,
    });

    return organisations.map(({ _count, ...org }) => ({
      ...org,
      userCount: _count.users,
    }));
  },

  async updateOnboardingStage(id: string, stage: number, requesterId: string) {
    const existing = await prisma.organisation.findUnique({
      where: { id },
      select: { id: true, name: true, onboardingStage: true },
    });
    if (!existing) throw ApiError.notFound('Organisation');

    const organisation = await prisma.organisation.update({
      where: { id },
      data: { onboardingStage: stage },
      select: organisationSelect,
    });

    await prisma.auditLog.create({
      data: {
        userId: requesterId,
        action: 'ONBOARDING_STAGE_UPDATED',
        entityType: 'Organisation',
        entityId: id,
        metadata: { from: existing.onboardingStage, to: stage },
      },
    });

    return organisation;
  },

  async requestOrCompleteDeletion(id: string, requesterId: string, confirmationToken?: string) {
    const organisation = await prisma.organisation.findUnique({
      where: { id },
      select: { id: true, name: true, slug: true },
    });
    if (!organisation) throw ApiError.notFound('Organisation');

    const now = Date.now();
    const pending = pendingDeletions.get(id);

    if (pending && pending.expiresAt < now) {
      pendingDeletions.delete(id);
    }

    const active = pendingDeletions.get(id);

    if (!confirmationToken || !active) {
      // First step: (re)issue a confirmation token. Any platform director with
      // ORG_DELETE may start the request, including re-issuing after expiry.
      const token = crypto.randomBytes(24).toString('hex');
      const expiresAt = now + DELETE_CONFIRMATION_TTL_MS;
      pendingDeletions.set(id, { token, requestedBy: requesterId, expiresAt });

      await prisma.auditLog.create({
        data: {
          userId: requesterId,
          action: 'ORGANISATION_DELETE_REQUESTED',
          entityType: 'Organisation',
          entityId: id,
          metadata: { organisationName: organisation.name },
        },
      });

      logger.warn('Organisation deletion requested — awaiting second founder confirmation', {
        organisationId: id,
        requestedBy: requesterId,
      });

      return {
        status: 'confirmation_required' as const,
        confirmationToken: token,
        expiresAt: new Date(expiresAt).toISOString(),
        message:
          'Deletion requires confirmation from a second platform director. Resubmit this request with the confirmationToken before it expires.',
      };
    }

    if (active.token !== confirmationToken) {
      throw ApiError.badRequest('Invalid confirmation token');
    }

    if (active.requestedBy === requesterId) {
      throw ApiError.forbidden('A different platform director must confirm this deletion');
    }

    pendingDeletions.delete(id);

    await this.cascadeDeleteOrganisation(id);

    await prisma.auditLog.create({
      data: {
        userId: requesterId,
        action: 'ORGANISATION_DELETED',
        entityType: 'Organisation',
        entityId: id,
        metadata: {
          organisationName: organisation.name,
          organisationSlug: organisation.slug,
          requestedBy: active.requestedBy,
          confirmedBy: requesterId,
        },
      },
    });

    logger.warn('Organisation deleted', {
      organisationId: id,
      requestedBy: active.requestedBy,
      confirmedBy: requesterId,
    });

    return { status: 'deleted' as const, message: `Organisation "${organisation.name}" has been permanently deleted` };
  },

  async cascadeDeleteOrganisation(organisationId: string) {
    await prisma.$transaction(async (tx) => {
      const properties = await tx.property.findMany({ where: { organisationId }, select: { id: true } });
      const propertyIds = properties.map((p) => p.id);

      const plots = propertyIds.length
        ? await tx.plot.findMany({ where: { propertyId: { in: propertyIds } }, select: { id: true } })
        : [];
      const plotIds = plots.map((p) => p.id);

      const leases = plotIds.length
        ? await tx.leaseAgreement.findMany({ where: { plotId: { in: plotIds } }, select: { id: true } })
        : [];
      const leaseIds = leases.map((l) => l.id);

      const rentRecords = leaseIds.length
        ? await tx.rentRecord.findMany({ where: { leaseId: { in: leaseIds } }, select: { id: true } })
        : [];
      const rentRecordIds = rentRecords.map((r) => r.id);

      const transactions =
        rentRecordIds.length || leaseIds.length
          ? await tx.transaction.findMany({
              where: {
                OR: [
                  ...(rentRecordIds.length ? [{ rentRecordId: { in: rentRecordIds } }] : []),
                  ...(leaseIds.length ? [{ leaseId: { in: leaseIds } }] : []),
                ],
              },
              select: { id: true },
            })
          : [];
      const transactionIds = transactions.map((t) => t.id);

      const users = await tx.user.findMany({ where: { organisationId }, select: { id: true } });
      const userIds = users.map((u) => u.id);

      // 1. Documents referencing org plots/leases/users (createdBy is a required FK — Restrict)
      if (plotIds.length || leaseIds.length || userIds.length) {
        await tx.document.deleteMany({
          where: {
            OR: [
              ...(plotIds.length ? [{ plotId: { in: plotIds } }] : []),
              ...(leaseIds.length ? [{ leaseId: { in: leaseIds } }] : []),
              ...(userIds.length ? [{ createdById: { in: userIds } }] : []),
            ],
          },
        });
      }

      // 2. Notifications referencing org users/leases
      if (userIds.length || leaseIds.length) {
        await tx.notification.deleteMany({
          where: {
            OR: [
              ...(userIds.length ? [{ userId: { in: userIds } }] : []),
              ...(leaseIds.length ? [{ leaseId: { in: leaseIds } }] : []),
            ],
          },
        });
      }

      // 3. Commissions reference Transaction with Restrict — delete before transactions
      if (transactionIds.length) {
        await tx.commission.deleteMany({ where: { transactionId: { in: transactionIds } } });
        await tx.transaction.deleteMany({ where: { id: { in: transactionIds } } });
      }

      // 4. Lease agreements — cascades RentRecord; unblocks Plot (lease.plot Restrict)
      //    and TenantProfile (lease.tenant Restrict)
      if (leaseIds.length) {
        await tx.leaseAgreement.deleteMany({ where: { id: { in: leaseIds } } });
      }

      // 5. Audit logs authored by org users — unblocks User deletion (auditLog.user Restrict)
      if (userIds.length) {
        await tx.auditLog.deleteMany({ where: { userId: { in: userIds } } });
      }

      // 6. Properties — cascades Plot, SurveyPoint, SurveyImport, GeofenceAlert (+AlertEvent),
      //    GeotaggedPhoto, SatelliteImage, VaultSubscription
      await tx.property.deleteMany({ where: { organisationId } });

      // 7. Users — cascades TenantProfile
      await tx.user.deleteMany({ where: { organisationId } });

      // 8. Remaining org-scoped records
      await tx.inviteCode.deleteMany({ where: { organisationId } });
      await tx.supportTicket.deleteMany({ where: { organisationId } });

      // 9. The organisation itself
      await tx.organisation.delete({ where: { id: organisationId } });
    });
  },

  // BREAK-GLASS: to be rebuilt as admin-only, logged, consent-exempt (see cache doc)
  async impersonateOrganisation(id: string, requesterId: string) {
    const organisation = await prisma.organisation.findUnique({ where: { id }, select: { id: true, name: true, isActive: true } });
    if (!organisation) throw ApiError.notFound('Organisation');

    const targetUser = await prisma.user.findFirst({
      where: { organisationId: id, role: Role.SUPER_ADMIN, isActive: true },
      select: { id: true, email: true, role: true, firstName: true, lastName: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!targetUser) throw ApiError.notFound('No active SUPER_ADMIN found for this organisation');

    const accessToken = jwt.sign(
      { sub: targetUser.id, email: targetUser.email, role: targetUser.role },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' }
    );

    await prisma.auditLog.create({
      data: {
        userId: targetUser.id,
        action: 'ORGANISATION_IMPERSONATION_STARTED',
        entityType: 'Organisation',
        entityId: organisation.id,
        metadata: {
          impersonatedBy: requesterId,
          targetUserId: targetUser.id,
          targetEmail: targetUser.email,
          organisationName: organisation.name,
        },
      },
    });

    logger.info('Platform admin started impersonation', {
      organisationId: id,
      impersonatedBy: requesterId,
      targetUserId: targetUser.id,
    });

    return {
      accessToken,
      expiresIn: '15m',
      user: targetUser,
      organisation: { id: organisation.id, name: organisation.name },
    };
  },

  async getPlatformStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalOrganisations,
      activeOrganisations,
      totalUsers,
      totalProperties,
      revenueThisMonth,
      commissionEarned,
    ] = await Promise.all([
      prisma.organisation.count(),
      prisma.organisation.count({ where: { isActive: true } }),
      prisma.user.count(),
      prisma.property.count({ where: { isActive: true } }),
      prisma.transaction.aggregate({
        _sum: { amountGHS: true },
        where: { status: 'COMPLETED', paidAt: { gte: startOfMonth } },
      }),
      prisma.commission.aggregate({ _sum: { amountGHS: true } }),
    ]);

    return {
      totalOrganisations,
      activeOrganisations,
      totalUsers,
      totalProperties,
      totalRevenueThisMonthGHS: revenueThisMonth._sum.amountGHS ?? 0,
      totalCommissionEarnedGHS: commissionEarned._sum.amountGHS ?? 0,
    };
  },

  // ─── ORG ADMIN (within own organisation) ─────────────────────────────────────

  async getOrgSettings(organisationId: string) {
    const organisation = await prisma.organisation.findUnique({
      where: { id: organisationId },
      select: organisationSelect,
    });
    if (!organisation) throw ApiError.notFound('Organisation');
    return organisation;
  },

  async updateOrgSettings(organisationId: string, data: UpdateOrgSettingsInput) {
    const organisation = await prisma.organisation.update({
      where: { id: organisationId },
      data,
      select: organisationSelect,
    });

    logger.info('Organisation settings updated', { organisationId, fields: Object.keys(data) });
    return organisation;
  },

  async listOrgUsers(organisationId: string, query: ListOrgUsersQuery) {
    const skip = (query.page - 1) * query.limit;

    const where: Prisma.UserWhereInput = {
      organisationId,
      ...(query.role && { role: query.role }),
      ...(query.search && {
        OR: [
          { email: { contains: query.search, mode: 'insensitive' } },
          { firstName: { contains: query.search, mode: 'insensitive' } },
          { lastName: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: orgUserSelect,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },

  async removeOrgUser(organisationId: string, requesterId: string, targetUserId: string) {
    if (requesterId === targetUserId) {
      throw ApiError.badRequest('You cannot remove your own account');
    }

    const target = await prisma.user.findFirst({
      where: { id: targetUserId, organisationId },
      select: { role: true, isActive: true },
    });
    if (!target) throw ApiError.notFound('User');
    if (target.role === Role.SUPER_ADMIN) {
      throw ApiError.forbidden('Cannot remove another SUPER_ADMIN');
    }

    await prisma.user.update({
      where: { id: targetUserId },
      data: { isActive: false, refreshTokenHash: null },
    });

    logger.info('User removed from organisation', { organisationId, targetUserId, removedBy: requesterId });
  },

  async changeOrgUserRole(
    organisationId: string,
    requesterId: string,
    targetUserId: string,
    data: ChangeOrgUserRoleInput
  ) {
    if (requesterId === targetUserId) {
      throw ApiError.badRequest('You cannot change your own role');
    }

    const target = await prisma.user.findFirst({
      where: { id: targetUserId, organisationId },
      select: { role: true },
    });
    if (!target) throw ApiError.notFound('User');

    if (data.role === Role.SUPER_ADMIN && target.role !== Role.SUPER_ADMIN) {
      throw ApiError.forbidden('Cannot elevate a user to SUPER_ADMIN');
    }
    if (target.role === Role.SUPER_ADMIN && data.role !== Role.SUPER_ADMIN) {
      throw ApiError.forbidden('Cannot demote another SUPER_ADMIN');
    }
    if (target.role === data.role) {
      throw ApiError.badRequest(`User already has role ${data.role}`);
    }

    const user = await prisma.user.update({
      where: { id: targetUserId },
      data: { role: data.role, refreshTokenHash: null },
      select: orgUserSelect,
    });

    logger.info('Org user role changed', {
      organisationId,
      targetUserId,
      from: target.role,
      to: data.role,
      changedBy: requesterId,
    });

    return user;
  },

  async createInvite(organisationId: string, createdBy: string, data: CreateInviteInput) {
    const organisation = await prisma.organisation.findUnique({
      where: { id: organisationId },
      select: { slug: true },
    });
    if (!organisation) throw ApiError.notFound('Organisation');

    const expiresAt = new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000);

    const invite = await prisma.inviteCode.create({
      data: {
        organisationId,
        role: data.role,
        createdBy,
        expiresAt,
      },
    });

    logger.info('Invite code created', { organisationId, role: data.role, createdBy, expiresAt });

    return {
      code: invite.code,
      link: `${env.WEB_APP_URL}/join?code=${invite.code}`,
      role: invite.role,
      expiresAt: invite.expiresAt,
    };
  },

  async listInviteCodes(organisationId: string, query: ListInviteCodesQuery) {
    const skip = (query.page - 1) * query.limit;

    const where: Prisma.InviteCodeWhereInput = {
      organisationId,
      ...(query.isActive !== undefined && { isActive: query.isActive }),
    };

    const [codes, total] = await Promise.all([
      prisma.inviteCode.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.inviteCode.count({ where }),
    ]);

    return {
      data: codes.map((invite) => ({
        ...invite,
        link: `${env.WEB_APP_URL}/join?code=${invite.code}`,
      })),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },
};
