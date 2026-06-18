import { Role, LeaseStatus, PlotStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { ApiError } from '../utils/ApiError';
import { logger } from '../config/logger';
import type {
  CreateLeaseInput,
  UpdateLeaseInput,
  SignLeaseInput,
  TerminateLeaseInput,
  ListLeasesQuery,
} from '../validations/tenant.schema';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const leaseSelect = {
  id: true,
  leaseNumber: true,
  status: true,
  startDate: true,
  endDate: true,
  monthlyRentGHS: true,
  depositAmountGHS: true,
  plotCentroidLat: true,
  plotCentroidLng: true,
  plotBoundaryGeoJSON: true,
  tenantSignatureUrl: true,
  adminSignatureUrl: true,
  signedAt: true,
  totalPaidGHS: true,
  arrearsGHS: true,
  lastPaymentDate: true,
  notes: true,
  terminatedAt: true,
  terminationReason: true,
  createdAt: true,
  updatedAt: true,
  plot: {
    select: {
      id: true,
      plotNumber: true,
      areaSqm: true,
      status: true,
      property: { select: { id: true, name: true, address: true, region: true, organisationId: true } },
    },
  },
  tenant: {
    select: {
      id: true,
      user: {
        select: { id: true, firstName: true, lastName: true, email: true, phone: true },
      },
    },
  },
} as const;

async function generateLeaseNumber(tx: Prisma.TransactionClient): Promise<string> {
  const year = new Date().getFullYear();
  const count = await tx.leaseAgreement.count({
    where: { leaseNumber: { startsWith: `LEASE-${year}-` } },
  });
  return `LEASE-${year}-${String(count + 1).padStart(4, '0')}`;
}

function buildRentRecords(
  leaseId: string,
  startDate: Date,
  endDate: Date,
  monthlyRentGHS: number
): Prisma.RentRecordCreateManyInput[] {
  const records: Prisma.RentRecordCreateManyInput[] = [];
  const cursor = new Date(startDate);
  cursor.setDate(1); // Normalize to first of month

  while (cursor <= endDate) {
    records.push({
      leaseId,
      periodYear: cursor.getFullYear(),
      periodMonth: cursor.getMonth() + 1,
      dueDate: new Date(cursor),
      amountDueGHS: monthlyRentGHS,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return records;
}

async function assertLeaseAccess(
  lease: { plot: { property: { id: string; organisationId: string } } },
  userId: string,
  role: Role,
  organisationId: string | null
) {
  if (organisationId && lease.plot.property.organisationId !== organisationId) {
    throw ApiError.notFound('Lease');
  }

  if (role === Role.SUPER_ADMIN) return;

  const propertyId = lease.plot.property.id;
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { managers: { select: { id: true } } },
  });

  const isAssigned = property?.managers.some((m) => m.id === userId);
  if (!isAssigned) throw ApiError.forbidden();
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const leaseService = {
  async list(userId: string, role: Role, query: ListLeasesQuery, organisationId: string | null) {
    const skip = (query.page - 1) * query.limit;
    let where: Prisma.LeaseAgreementWhereInput = {};

    if (role === Role.TENANT) {
      const profile = await prisma.tenantProfile.findUnique({
        where: { userId },
        select: { id: true },
      });
      // Tenant with no profile has no leases
      if (!profile) {
        return { data: [], meta: { total: 0, page: query.page, limit: query.limit, totalPages: 0 } };
      }
      where.tenantProfileId = profile.id;
    } else if (role !== Role.SUPER_ADMIN) {
      const managedProperties = await prisma.property.findMany({
        where: {
          managers: { some: { id: userId } },
          isActive: true,
          ...(organisationId && { organisationId }),
        },
        select: { id: true },
      });
      const propertyIds = managedProperties.map((p) => p.id);
      where.plot = { propertyId: { in: propertyIds } };
    }

    if (organisationId) {
      where.plot = { ...(where.plot as Prisma.PlotWhereInput | undefined), property: { organisationId } };
    }

    if (query.status) where.status = query.status;
    if (query.plotId) where.plotId = query.plotId;

    const [leases, total] = await Promise.all([
      prisma.leaseAgreement.findMany({
        where,
        select: leaseSelect,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.leaseAgreement.count({ where }),
    ]);

    return {
      data: leases,
      meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
    };
  },

  async getById(leaseId: string, userId: string, role: Role, organisationId: string | null) {
    const lease = await prisma.leaseAgreement.findUnique({
      where: { id: leaseId },
      select: leaseSelect,
    });

    if (!lease) throw ApiError.notFound('Lease');

    if (organisationId && lease.plot.property.organisationId !== organisationId) {
      throw ApiError.notFound('Lease');
    }

    if (role === Role.TENANT) {
      // Tenant can only see their own lease
      if (lease.tenant.user.id !== userId) throw ApiError.forbidden();
    } else {
      await assertLeaseAccess(lease, userId, role, organisationId);
    }

    return lease;
  },

  async create(userId: string, role: Role, data: CreateLeaseInput, organisationId: string | null) {
    // Fetch and validate the plot
    const plot = await prisma.plot.findUnique({
      where: { id: data.plotId },
      select: {
        id: true,
        status: true,
        centroidLat: true,
        centroidLng: true,
        boundaryGeoJSON: true,
        property: { select: { id: true, organisationId: true, managers: { select: { id: true } } } },
      },
    });

    if (!plot) throw ApiError.notFound('Plot');

    if (organisationId && plot.property.organisationId !== organisationId) {
      throw ApiError.notFound('Plot');
    }

    if (role !== Role.SUPER_ADMIN) {
      const isAssigned = plot.property.managers.some((m) => m.id === userId);
      if (!isAssigned) throw ApiError.forbidden();
    }

    if (plot.status !== PlotStatus.VACANT) {
      throw ApiError.badRequest(
        `Plot is currently ${plot.status.toLowerCase()} and cannot be leased`
      );
    }

    // Fetch and validate the tenant
    const tenantProfile = await prisma.tenantProfile.findUnique({
      where: { userId: data.tenantUserId },
      select: { id: true, user: { select: { role: true, isActive: true, organisationId: true } } },
    });

    if (!tenantProfile || !tenantProfile.user.isActive) {
      throw ApiError.badRequest(
        'Tenant not found or has no KYC profile — the tenant must complete their profile before a lease can be created'
      );
    }

    if (tenantProfile.user.role !== Role.TENANT) {
      throw ApiError.badRequest('The specified user does not have the TENANT role');
    }

    if (organisationId && tenantProfile.user.organisationId !== organisationId) {
      throw ApiError.badRequest('The specified user does not have the TENANT role');
    }

    // Use a transaction so lease + number generation are atomic
    const lease = await prisma.$transaction(async (tx) => {
      const leaseNumber = await generateLeaseNumber(tx);

      return tx.leaseAgreement.create({
        data: {
          leaseNumber,
          plotId: data.plotId,
          tenantProfileId: tenantProfile.id,
          startDate: data.startDate,
          endDate: data.endDate,
          monthlyRentGHS: data.monthlyRentGHS,
          depositAmountGHS: data.depositAmountGHS,
          notes: data.notes,
          // Immutable GPS snapshot at the time of signing
          plotCentroidLat: plot.centroidLat ?? 0,
          plotCentroidLng: plot.centroidLng ?? 0,
          plotBoundaryGeoJSON: (plot.boundaryGeoJSON ?? {}) as never,
        },
        select: leaseSelect,
      });
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'LEASE_CREATED',
        entityType: 'LeaseAgreement',
        entityId: lease.id,
        metadata: { leaseNumber: lease.leaseNumber, plotId: data.plotId },
      },
    });

    logger.info('Lease created', { leaseId: lease.id, leaseNumber: lease.leaseNumber });
    return lease;
  },

  async update(
    leaseId: string,
    userId: string,
    role: Role,
    data: UpdateLeaseInput,
    organisationId: string | null
  ) {
    const lease = await this.getById(leaseId, userId, role, organisationId);

    if (lease.status !== LeaseStatus.PENDING_SIGNATURE) {
      throw ApiError.badRequest(
        'Lease terms can only be modified while the lease is pending signature'
      );
    }

    const updated = await prisma.leaseAgreement.update({
      where: { id: leaseId },
      data,
      select: leaseSelect,
    });

    logger.info('Lease updated', { leaseId, updatedBy: userId });
    return updated;
  },

  async sign(leaseId: string, userId: string, role: Role, data: SignLeaseInput, organisationId: string | null) {
    const lease = await prisma.leaseAgreement.findUnique({
      where: { id: leaseId },
      select: {
        ...leaseSelect,
        tenantSignatureUrl: true,
        adminSignatureUrl: true,
        status: true,
      },
    });

    if (!lease) throw ApiError.notFound('Lease');

    if (organisationId && lease.plot.property.organisationId !== organisationId) {
      throw ApiError.notFound('Lease');
    }

    if (lease.status !== LeaseStatus.PENDING_SIGNATURE) {
      throw ApiError.badRequest('Only leases pending signature can be signed');
    }

    const isTenant = role === Role.TENANT;

    if (isTenant) {
      // Tenant may only sign their own lease
      if (lease.tenant.user.id !== userId) throw ApiError.forbidden();
      if (lease.tenantSignatureUrl) {
        throw ApiError.conflict('Tenant has already signed this lease');
      }
    } else {
      await assertLeaseAccess(lease, userId, role, organisationId);
      if (lease.adminSignatureUrl) {
        throw ApiError.conflict('Admin has already signed this lease');
      }
    }

    const updateData: Prisma.LeaseAgreementUpdateInput = isTenant
      ? { tenantSignatureUrl: data.signatureUrl }
      : { adminSignatureUrl: data.signatureUrl };

    const updated = await prisma.leaseAgreement.update({
      where: { id: leaseId },
      data: updateData,
      select: leaseSelect,
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: isTenant ? 'LEASE_SIGNED_BY_TENANT' : 'LEASE_SIGNED_BY_ADMIN',
        entityType: 'LeaseAgreement',
        entityId: leaseId,
        metadata: { role },
      },
    });

    logger.info('Lease signed', { leaseId, signedBy: userId, role });
    return updated;
  },

  async activate(leaseId: string, userId: string, role: Role, organisationId: string | null) {
    const lease = await prisma.leaseAgreement.findUnique({
      where: { id: leaseId },
      select: {
        id: true,
        status: true,
        startDate: true,
        endDate: true,
        monthlyRentGHS: true,
        tenantSignatureUrl: true,
        adminSignatureUrl: true,
        plotId: true,
        plot: {
          select: {
            property: { select: { id: true, organisationId: true, managers: { select: { id: true } } } },
          },
        },
      },
    });

    if (!lease) throw ApiError.notFound('Lease');

    if (organisationId && lease.plot.property.organisationId !== organisationId) {
      throw ApiError.notFound('Lease');
    }

    if (role !== Role.SUPER_ADMIN) {
      const isAssigned = lease.plot.property.managers.some((m) => m.id === userId);
      if (!isAssigned) throw ApiError.forbidden();
    }

    if (lease.status !== LeaseStatus.PENDING_SIGNATURE) {
      throw ApiError.badRequest(`Lease is already ${lease.status.toLowerCase().replace('_', ' ')}`);
    }

    if (!lease.tenantSignatureUrl || !lease.adminSignatureUrl) {
      const missing = !lease.tenantSignatureUrl ? 'tenant' : 'admin';
      throw ApiError.badRequest(
        `Cannot activate — waiting for ${missing} signature`
      );
    }

    const rentRecords = buildRentRecords(
      lease.id,
      lease.startDate,
      lease.endDate,
      lease.monthlyRentGHS
    );

    // Atomic: activate lease + mark plot occupied + seed rent records
    await prisma.$transaction([
      prisma.leaseAgreement.update({
        where: { id: leaseId },
        data: { status: LeaseStatus.ACTIVE, signedAt: new Date() },
      }),
      prisma.plot.update({
        where: { id: lease.plotId },
        data: { status: PlotStatus.OCCUPIED },
      }),
      prisma.rentRecord.createMany({ data: rentRecords }),
    ]);

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'LEASE_ACTIVATED',
        entityType: 'LeaseAgreement',
        entityId: leaseId,
        metadata: { rentRecordsGenerated: rentRecords.length },
      },
    });

    logger.info('Lease activated', {
      leaseId,
      plotId: lease.plotId,
      rentRecords: rentRecords.length,
      activatedBy: userId,
    });

    // Return the fresh lease state
    return prisma.leaseAgreement.findUnique({ where: { id: leaseId }, select: leaseSelect });
  },

  async terminate(
    leaseId: string,
    userId: string,
    role: Role,
    data: TerminateLeaseInput,
    organisationId: string | null
  ) {
    const lease = await prisma.leaseAgreement.findUnique({
      where: { id: leaseId },
      select: {
        id: true,
        status: true,
        plotId: true,
        plot: {
          select: {
            property: { select: { id: true, organisationId: true, managers: { select: { id: true } } } },
          },
        },
      },
    });

    if (!lease) throw ApiError.notFound('Lease');

    if (organisationId && lease.plot.property.organisationId !== organisationId) {
      throw ApiError.notFound('Lease');
    }

    if (role !== Role.SUPER_ADMIN) {
      const isAssigned = lease.plot.property.managers.some((m) => m.id === userId);
      if (!isAssigned) throw ApiError.forbidden();
    }

    if (
      lease.status !== LeaseStatus.ACTIVE &&
      lease.status !== LeaseStatus.PENDING_SIGNATURE
    ) {
      throw ApiError.badRequest(
        `Cannot terminate a lease that is already ${lease.status.toLowerCase().replace('_', ' ')}`
      );
    }

    await prisma.$transaction([
      prisma.leaseAgreement.update({
        where: { id: leaseId },
        data: {
          status: LeaseStatus.TERMINATED,
          terminatedAt: new Date(),
          terminationReason: data.terminationReason,
        },
      }),
      // Only free up the plot if it was actively occupied
      ...(lease.status === LeaseStatus.ACTIVE
        ? [prisma.plot.update({ where: { id: lease.plotId }, data: { status: PlotStatus.VACANT } })]
        : []),
    ]);

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'LEASE_TERMINATED',
        entityType: 'LeaseAgreement',
        entityId: leaseId,
        metadata: { reason: data.terminationReason, previousStatus: lease.status },
      },
    });

    logger.info('Lease terminated', { leaseId, plotId: lease.plotId, terminatedBy: userId });

    return prisma.leaseAgreement.findUnique({ where: { id: leaseId }, select: leaseSelect });
  },

  async getRentRecords(leaseId: string, userId: string, role: Role, organisationId: string | null) {
    // Verify access first via getById
    await this.getById(leaseId, userId, role, organisationId);

    return prisma.rentRecord.findMany({
      where: { leaseId },
      select: {
        id: true,
        periodYear: true,
        periodMonth: true,
        dueDate: true,
        amountDueGHS: true,
        amountPaidGHS: true,
        paidAt: true,
        isPaid: true,
        isArrears: true,
        notes: true,
        createdAt: true,
      },
      orderBy: [{ periodYear: 'asc' }, { periodMonth: 'asc' }],
    });
  },
};
