import { prisma } from '../config/database';
import type { ListOrganisationsQuery } from '../validations/organisation.schema';

export const platformRevenueService = {
  async getSummary() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [revenueThisMonth, commissionThisMonth, commissionAllTime, commissionPaid, commissionOutstanding] =
      await Promise.all([
        prisma.transaction.aggregate({
          _sum: { amountGHS: true },
          where: { status: 'COMPLETED', type: { not: 'REFUND' }, paidAt: { gte: startOfMonth } },
        }),
        prisma.commission.aggregate({
          _sum: { amountGHS: true },
          where: { transaction: { status: 'COMPLETED', paidAt: { gte: startOfMonth } } },
        }),
        prisma.commission.aggregate({ _sum: { amountGHS: true } }),
        prisma.commission.aggregate({ _sum: { amountGHS: true }, where: { isPaid: true } }),
        prisma.commission.aggregate({ _sum: { amountGHS: true }, where: { isPaid: false } }),
      ]);

    return {
      revenueThisMonthGHS: revenueThisMonth._sum.amountGHS ?? 0,
      commissionThisMonthGHS: commissionThisMonth._sum.amountGHS ?? 0,
      totalCommissionEarnedGHS: commissionAllTime._sum.amountGHS ?? 0,
      commissionPaidGHS: commissionPaid._sum.amountGHS ?? 0,
      commissionOutstandingGHS: commissionOutstanding._sum.amountGHS ?? 0,
    };
  },

  async listOrganisationRevenue(query: ListOrganisationsQuery) {
    const skip = (query.page - 1) * query.limit;

    const where = {
      ...(query.isActive !== undefined && { isActive: query.isActive }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' as const } },
          { slug: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [organisations, total] = await Promise.all([
      prisma.organisation.findMany({
        where,
        select: {
          id: true,
          name: true,
          slug: true,
          subscriptionTier: true,
          commissionRate: true,
          isActive: true,
        },
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.organisation.count({ where }),
    ]);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const data = await Promise.all(
      organisations.map(async (org) => {
        let revenueThisMonthGHS = 0;
        let totalCommissionEarnedGHS = 0;
        let commissionPaidGHS = 0;
        let commissionOutstandingGHS = 0;

        const properties = await prisma.property.findMany({
          where: { organisationId: org.id },
          select: { id: true },
        });
        const propertyIds = properties.map((p) => p.id);

        if (propertyIds.length > 0) {
          const leases = await prisma.leaseAgreement.findMany({
            where: { plot: { propertyId: { in: propertyIds } } },
            select: { id: true },
          });
          const leaseIds = leases.map((l) => l.id);

          if (leaseIds.length > 0) {
            const [revenueAgg, commissionTotal, commissionPaid, commissionOutstanding] = await Promise.all([
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
              prisma.commission.aggregate({
                where: { transaction: { leaseId: { in: leaseIds } }, isPaid: true },
                _sum: { amountGHS: true },
              }),
              prisma.commission.aggregate({
                where: { transaction: { leaseId: { in: leaseIds } }, isPaid: false },
                _sum: { amountGHS: true },
              }),
            ]);

            revenueThisMonthGHS = revenueAgg._sum.amountGHS ?? 0;
            totalCommissionEarnedGHS = commissionTotal._sum.amountGHS ?? 0;
            commissionPaidGHS = commissionPaid._sum.amountGHS ?? 0;
            commissionOutstandingGHS = commissionOutstanding._sum.amountGHS ?? 0;
          }
        }

        return {
          ...org,
          revenueThisMonthGHS,
          totalCommissionEarnedGHS,
          commissionPaidGHS,
          commissionOutstandingGHS,
        };
      })
    );

    return {
      data,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },
};
