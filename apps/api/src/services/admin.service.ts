import { Role, TransactionStatus, LeaseStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { ApiError } from '../utils/ApiError';
import { logger } from '../config/logger';
import type { ListUsersQuery, ChangeRoleInput, ListAuditLogsQuery } from '../validations/admin.schema';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const adminUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  phone: true,
  isActive: true,
  isEmailVerified: true,
  avatarUrl: true,
  lastLoginAt: true,
  createdAt: true,
  _count: { select: { managedProperties: true, auditLogs: true } },
  tenantProfile: { select: { id: true, nationalIdType: true, nationalIdNumber: true } },
} as const;

// ─── Service ─────────────────────────────────────────────────────────────────

export const adminService = {
  async listUsers(query: ListUsersQuery, organisationId: string | null) {
    const skip = (query.page - 1) * query.limit;

    const where: Prisma.UserWhereInput = {
      organisationId,
      isPlatformAdmin: false,
      ...(query.role && { role: query.role }),
      ...(query.isActive !== undefined && { isActive: query.isActive }),
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
        select: adminUserSelect,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
    };
  },

  async getUserById(targetId: string) {
    const user = await prisma.user.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        phone: true,
        isActive: true,
        isEmailVerified: true,
        avatarUrl: true,
        lastLoginAt: true,
        createdAt: true,
        tenantProfile: { select: { id: true, nationalIdType: true, nationalIdNumber: true } },
        managedProperties: { select: { id: true, name: true, isActive: true } },
        _count: { select: { auditLogs: true } },
      },
    });

    if (!user) throw ApiError.notFound('User');
    return user;
  },

  async suspendUser(requesterId: string, targetId: string) {
    if (requesterId === targetId) {
      throw ApiError.badRequest('You cannot suspend your own account');
    }

    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: { role: true, isActive: true },
    });
    if (!target) throw ApiError.notFound('User');
    if (target.role === Role.SUPER_ADMIN) {
      throw ApiError.forbidden('SUPER_ADMIN accounts cannot be suspended');
    }
    if (!target.isActive) throw ApiError.badRequest('User is already suspended');

    // Clear refresh token to immediately invalidate their active session
    await prisma.user.update({
      where: { id: targetId },
      data: { isActive: false, refreshTokenHash: null },
    });

    logger.info('User suspended', { targetId, suspendedBy: requesterId });
  },

  async activateUser(requesterId: string, targetId: string) {
    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: { isActive: true },
    });
    if (!target) throw ApiError.notFound('User');
    if (target.isActive) throw ApiError.badRequest('User is already active');

    await prisma.user.update({ where: { id: targetId }, data: { isActive: true } });
    logger.info('User activated', { targetId, activatedBy: requesterId });
  },

  async changeRole(requesterId: string, targetId: string, data: ChangeRoleInput) {
    if (requesterId === targetId) {
      throw ApiError.badRequest('You cannot change your own role');
    }

    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: { role: true },
    });
    if (!target) throw ApiError.notFound('User');
    if (target.role === Role.SUPER_ADMIN) {
      throw ApiError.forbidden('Cannot change the role of another SUPER_ADMIN');
    }
    if (target.role === data.role) {
      throw ApiError.badRequest(`User already has role ${data.role}`);
    }

    // Role is embedded in JWT — revoke session so next request forces re-login with new role
    await prisma.user.update({
      where: { id: targetId },
      data: { role: data.role, refreshTokenHash: null },
    });

    logger.info('User role changed', {
      targetId,
      from: target.role,
      to: data.role,
      changedBy: requesterId,
    });
  },

  async listAuditLogs(query: ListAuditLogsQuery) {
    const skip = (query.page - 1) * query.limit;

    const where: Prisma.AuditLogWhereInput = {
      ...(query.userId && { userId: query.userId }),
      ...(query.entityType && { entityType: query.entityType }),
      ...(query.entityId && { entityId: query.entityId }),
      ...((query.from || query.to) && {
        createdAt: {
          ...(query.from && { gte: query.from }),
          ...(query.to && { lte: query.to }),
        },
      }),
    };

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          metadata: true,
          ipAddress: true,
          createdAt: true,
          user: {
            select: { id: true, firstName: true, lastName: true, email: true, role: true },
          },
        },
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
    };
  },

  async getStats(requesterId: string, requesterRole: Role, organisationId: string | null) {
    const isSuperAdmin = requesterRole === Role.SUPER_ADMIN;

    // SUPER_ADMIN is scoped to every active property in their org; ADMIN/MANAGER
    // are scoped to the properties they personally manage. Only platform admins
    // can have a null organisationId, and /admin/* is org-only, so the cast is safe.
    const propertyWhere = isSuperAdmin
      ? { organisationId: organisationId as string, isActive: true }
      : { managers: { some: { id: requesterId } }, isActive: true };

    const scopedProps = await prisma.property.findMany({
      where: propertyWhere,
      select: { id: true },
    });
    const propertyIds = scopedProps.map((p) => p.id);

    const scopedLeases = await prisma.leaseAgreement.findMany({
      where: { plot: { propertyId: { in: propertyIds } } },
      select: { id: true },
    });
    const leaseIds = scopedLeases.map((l) => l.id);

    const propWhere = { id: { in: propertyIds } };
    const plotWhere = { propertyId: { in: propertyIds } };
    const leaseIdFilter = { id: { in: leaseIds } };
    const txLeaseFilter = { leaseId: { in: leaseIds } };

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      usersByRole,
      activePropertyCount,
      plotsByStatus,
      leasesByStatus,
      revenueThisMonth,
      activeArrears,
      pendingTxCount,
      unpaidCommissions,
    ] = await Promise.all([
      isSuperAdmin
        ? prisma.user.groupBy({
            by: ['role'],
            _count: { id: true },
            where: { organisationId, isPlatformAdmin: false },
          })
        : Promise.resolve([] as { role: Role; _count: { id: number } }[]),

      prisma.property.count({ where: { ...propWhere, isActive: true } }),

      prisma.plot.groupBy({
        by: ['status'],
        _count: { id: true },
        where: plotWhere,
      }),

      prisma.leaseAgreement.groupBy({
        by: ['status'],
        _count: { id: true },
        where: leaseIdFilter,
      }),

      prisma.transaction.aggregate({
        _sum: { amountGHS: true },
        where: {
          ...txLeaseFilter,
          status: TransactionStatus.COMPLETED,
          paidAt: { gte: startOfMonth },
        },
      }),

      prisma.leaseAgreement.aggregate({
        _sum: { arrearsGHS: true },
        where: { ...leaseIdFilter, status: LeaseStatus.ACTIVE },
      }),

      prisma.transaction.count({
        where: { ...txLeaseFilter, status: TransactionStatus.PENDING },
      }),

      isSuperAdmin
        ? prisma.commission.aggregate({
            _sum: { amountGHS: true },
            where: { isPaid: false, transaction: { leaseId: { in: leaseIds } } },
          })
        : Promise.resolve({ _sum: { amountGHS: null as number | null } }),
    ]);

    return {
      ...(isSuperAdmin && {
        users: Object.fromEntries(usersByRole.map((r) => [r.role, r._count.id])),
      }),
      properties: { active: activePropertyCount },
      plots: Object.fromEntries(plotsByStatus.map((p) => [p.status, p._count.id])),
      leases: Object.fromEntries(leasesByStatus.map((l) => [l.status, l._count.id])),
      revenue: { thisMonthGHS: revenueThisMonth._sum.amountGHS ?? 0 },
      arrears: { totalGHS: activeArrears._sum.arrearsGHS ?? 0 },
      pendingTransactions: pendingTxCount,
      ...(isSuperAdmin && {
        commissionsUnpaidGHS: unpaidCommissions._sum.amountGHS ?? 0,
      }),
    };
  },
};
