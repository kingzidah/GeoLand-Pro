import { Role, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { ApiError } from '../utils/ApiError';
import { logger } from '../config/logger';
import type {
  FinanceSummaryQuery,
  ListArrearsQuery,
  ListCommissionsQuery,
} from '../validations/transaction.schema';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Returns undefined (no filter) for the platform admin (no org); an array of accessible IDs otherwise.
async function getAccessiblePropertyIds(
  userId: string,
  role: Role,
  organisationId: string | null,
  specificPropertyId?: string
): Promise<string[] | undefined> {
  if (role === Role.SUPER_ADMIN && !organisationId && !specificPropertyId) return undefined;

  const where: Prisma.PropertyWhereInput = {
    isActive: true,
    ...(organisationId && { organisationId }),
    ...(role !== Role.SUPER_ADMIN && { managers: { some: { id: userId } } }),
    ...(specificPropertyId && { id: specificPropertyId }),
  };

  if (specificPropertyId && (role !== Role.SUPER_ADMIN || organisationId)) {
    const accessible = await prisma.property.findFirst({ where, select: { id: true } });
    if (!accessible) {
      throw role !== Role.SUPER_ADMIN ? ApiError.forbidden() : ApiError.notFound('Property');
    }
  }

  const properties = await prisma.property.findMany({ where, select: { id: true } });
  return properties.map((p) => p.id);
}

async function getAccessibleLeaseIds(
  userId: string,
  role: Role,
  organisationId: string | null,
  specificPropertyId?: string
): Promise<string[] | undefined> {
  const propertyIds = await getAccessiblePropertyIds(userId, role, organisationId, specificPropertyId);
  if (propertyIds === undefined) return undefined; // platform admin, no filter

  if (propertyIds.length === 0) return [];

  const leases = await prisma.leaseAgreement.findMany({
    where: { plot: { propertyId: { in: propertyIds } } },
    select: { id: true },
  });

  return leases.map((l) => l.id);
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const financeService = {
  async getSummary(userId: string, role: Role, query: FinanceSummaryQuery, organisationId: string | null) {
    // Resolve accessible scopes in parallel
    const [propertyIds, leaseIds] = await Promise.all([
      getAccessiblePropertyIds(userId, role, organisationId, query.propertyId),
      getAccessibleLeaseIds(userId, role, organisationId, query.propertyId),
    ]);

    // Short-circuit if the user has no accessible leases
    if (leaseIds !== undefined && leaseIds.length === 0) {
      return {
        totalRentCollectedGHS: 0,
        totalArrearsGHS: 0,
        totalCommissionEarnedGHS: 0,
        commissionsPendingGHS: 0,
        activeLeasesCount: 0,
        pendingSignatureCount: 0,
        vacantPlotsCount: 0,
        occupiedPlotsCount: 0,
      };
    }

    // Build reusable filter fragments
    const txnWhere: Prisma.TransactionWhereInput =
      leaseIds !== undefined ? { leaseId: { in: leaseIds } } : {};

    const leaseWhere: Prisma.LeaseAgreementWhereInput =
      leaseIds !== undefined ? { id: { in: leaseIds } } : {};

    const plotWhere: Prisma.PlotWhereInput =
      propertyIds !== undefined ? { propertyId: { in: propertyIds } } : {};

    const [
      rentAgg,
      commissionAgg,
      pendingCommissionAgg,
      arrearsAgg,
      activeLeasesCount,
      pendingSignatureCount,
      vacantPlotsCount,
      occupiedPlotsCount,
    ] = await Promise.all([
      prisma.transaction.aggregate({
        where: { ...txnWhere, status: 'COMPLETED', type: { not: 'REFUND' } },
        _sum: { amountGHS: true },
      }),
      // Commission.transaction IS a proper Prisma relation — nested filtering works
      prisma.commission.aggregate({
        where: leaseIds !== undefined
          ? { transaction: { leaseId: { in: leaseIds } } }
          : {},
        _sum: { amountGHS: true },
      }),
      prisma.commission.aggregate({
        where: {
          isPaid: false,
          ...(leaseIds !== undefined && { transaction: { leaseId: { in: leaseIds } } }),
        },
        _sum: { amountGHS: true },
      }),
      prisma.leaseAgreement.aggregate({
        where: { ...leaseWhere, status: 'ACTIVE', arrearsGHS: { gt: 0 } },
        _sum: { arrearsGHS: true },
      }),
      prisma.leaseAgreement.count({ where: { ...leaseWhere, status: 'ACTIVE' } }),
      prisma.leaseAgreement.count({ where: { ...leaseWhere, status: 'PENDING_SIGNATURE' } }),
      prisma.plot.count({ where: { ...plotWhere, status: 'VACANT' } }),
      prisma.plot.count({ where: { ...plotWhere, status: 'OCCUPIED' } }),
    ]);

    return {
      totalRentCollectedGHS: rentAgg._sum.amountGHS ?? 0,
      totalArrearsGHS: arrearsAgg._sum.arrearsGHS ?? 0,
      totalCommissionEarnedGHS: commissionAgg._sum.amountGHS ?? 0,
      commissionsPendingGHS: pendingCommissionAgg._sum.amountGHS ?? 0,
      activeLeasesCount,
      pendingSignatureCount,
      vacantPlotsCount,
      occupiedPlotsCount,
    };
  },

  async getArrears(userId: string, role: Role, query: ListArrearsQuery, organisationId: string | null) {
    const leaseIds = await getAccessibleLeaseIds(userId, role, organisationId, query.propertyId);

    if (leaseIds !== undefined && leaseIds.length === 0) {
      return { data: [], meta: { total: 0, page: query.page, limit: query.limit, totalPages: 0 } };
    }

    const skip = (query.page - 1) * query.limit;

    const where: Prisma.LeaseAgreementWhereInput = {
      status: 'ACTIVE',
      arrearsGHS: { gt: 0 },
      ...(leaseIds !== undefined && { id: { in: leaseIds } }),
    };

    const [leases, total] = await Promise.all([
      prisma.leaseAgreement.findMany({
        where,
        select: {
          id: true,
          leaseNumber: true,
          monthlyRentGHS: true,
          arrearsGHS: true,
          totalPaidGHS: true,
          lastPaymentDate: true,
          startDate: true,
          endDate: true,
          tenant: {
            select: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  phone: true,
                },
              },
            },
          },
          plot: {
            select: {
              id: true,
              plotNumber: true,
              property: { select: { id: true, name: true, address: true } },
            },
          },
          rentRecords: {
            where: { isPaid: false, dueDate: { lt: new Date() } },
            select: {
              id: true,
              periodYear: true,
              periodMonth: true,
              dueDate: true,
              amountDueGHS: true,
              amountPaidGHS: true,
            },
            orderBy: [{ periodYear: 'asc' }, { periodMonth: 'asc' }],
          },
        },
        skip,
        take: query.limit,
        orderBy: { arrearsGHS: 'desc' },
      }),
      prisma.leaseAgreement.count({ where }),
    ]);

    return {
      data: leases,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },

  async getCommissions(userId: string, role: Role, query: ListCommissionsQuery, organisationId: string | null) {
    const leaseIds = await getAccessibleLeaseIds(userId, role, organisationId);

    if (leaseIds !== undefined && leaseIds.length === 0) {
      return { data: [], meta: { total: 0, page: query.page, limit: query.limit, totalPages: 0 } };
    }

    const skip = (query.page - 1) * query.limit;

    const where: Prisma.CommissionWhereInput = {
      ...(query.isPaid !== undefined && { isPaid: query.isPaid }),
      ...(leaseIds !== undefined && { transaction: { leaseId: { in: leaseIds } } }),
    };

    const [commissions, total] = await Promise.all([
      prisma.commission.findMany({
        where,
        select: {
          id: true,
          ratePercent: true,
          amountGHS: true,
          isPaid: true,
          paidAt: true,
          createdAt: true,
          transaction: {
            select: {
              id: true,
              type: true,
              amountGHS: true,
              paymentMethod: true,
              paidAt: true,
              leaseId: true,
            },
          },
        },
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.commission.count({ where }),
    ]);

    return {
      data: commissions,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },

  async markCommissionPaid(commissionId: string, userId: string, organisationId: string | null) {
    const commission = await prisma.commission.findUnique({
      where: { id: commissionId },
      include: {
        transaction: {
          select: {
            leaseId: true,
          },
        },
      },
    });

    if (!commission) throw ApiError.notFound('Commission');

    if (organisationId && commission.transaction.leaseId) {
      const lease = await prisma.leaseAgreement.findUnique({
        where: { id: commission.transaction.leaseId },
        select: { plot: { select: { property: { select: { organisationId: true } } } } },
      });
      if (lease?.plot.property.organisationId !== organisationId) throw ApiError.notFound('Commission');
    }

    if (commission.isPaid) throw ApiError.conflict('Commission is already marked as paid');

    const updated = await prisma.commission.update({
      where: { id: commissionId },
      data: { isPaid: true, paidAt: new Date() },
    });

    logger.info('Commission marked as paid', { commissionId, markedBy: userId });
    return updated;
  },
};
