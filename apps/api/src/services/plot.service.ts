import { Role, PlotStatus, LeaseStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { ApiError } from '../utils/ApiError';
import { logger } from '../config/logger';
import type {
  CreatePlotInput,
  UpdatePlotInput,
  UpdatePlotStatusInput,
  ListPlotsQuery,
} from '../validations/property.schema';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const plotSelect = {
  id: true,
  plotNumber: true,
  propertyId: true,
  status: true,
  areaSqm: true,
  centroidLat: true,
  centroidLng: true,
  boundaryGeoJSON: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  createdBy: {
    select: { id: true, firstName: true, lastName: true },
  },
  _count: {
    select: { leaseAgreements: true, geotaggedPhotos: true },
  },
} as const;

const plotDetailSelect = {
  ...plotSelect,
  property: {
    select: { id: true, name: true, address: true, region: true },
  },
  leaseAgreements: {
    where: { status: LeaseStatus.ACTIVE },
    take: 1,
    orderBy: { createdAt: 'desc' as const },
    select: {
      id: true,
      leaseNumber: true,
      status: true,
      startDate: true,
      endDate: true,
      monthlyRentGHS: true,
      arrearsGHS: true,
      tenant: {
        select: { user: { select: { firstName: true, lastName: true, phone: true } } },
      },
    },
  },
} as const;

export async function assertPropertyAccess(
  propertyId: string,
  userId: string,
  role: Role,
  organisationId: string | null
) {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true, isActive: true, organisationId: true, managers: { select: { id: true } } },
  });

  if (!property || !property.isActive) throw ApiError.notFound('Property');

  if (organisationId && property.organisationId !== organisationId) {
    throw ApiError.notFound('Property');
  }

  if (role !== Role.SUPER_ADMIN) {
    const isAssigned = property.managers.some((m) => m.id === userId);
    if (!isAssigned) throw ApiError.forbidden();
  }
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const plotService = {
  async list(
    propertyId: string,
    userId: string,
    role: Role,
    query: ListPlotsQuery,
    organisationId: string | null
  ) {
    await assertPropertyAccess(propertyId, userId, role, organisationId);

    const skip = (query.page - 1) * query.limit;
    const where = {
      propertyId,
      ...(query.status && { status: query.status }),
    };

    const [plots, total] = await Promise.all([
      prisma.plot.findMany({
        where,
        select: plotSelect,
        skip,
        take: query.limit,
        orderBy: { plotNumber: 'asc' },
      }),
      prisma.plot.count({ where }),
    ]);

    return {
      data: plots,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },

  /**
   * Unpaginated, minimal-field plot listing for rendering an entire estate on
   * a map in one request. Skips relations/counts that the paginated `list`
   * includes — those aren't needed for map rendering and are expensive at scale.
   */
  async forMap(propertyId: string, userId: string, role: Role, organisationId: string | null) {
    await assertPropertyAccess(propertyId, userId, role, organisationId);

    const plots = await prisma.plot.findMany({
      where: { propertyId },
      select: {
        id: true,
        plotNumber: true,
        status: true,
        areaSqm: true,
        centroidLat: true,
        centroidLng: true,
        boundaryGeoJSON: true,
      },
      orderBy: { plotNumber: 'asc' },
      take: 10_000,
    });

    return { data: plots, meta: { total: plots.length } };
  },

  async getById(
    propertyId: string,
    plotId: string,
    userId: string,
    role: Role,
    organisationId: string | null
  ) {
    await assertPropertyAccess(propertyId, userId, role, organisationId);

    const plot = await prisma.plot.findUnique({
      where: { id: plotId, propertyId },
      select: plotSelect,
    });

    if (!plot) throw ApiError.notFound('Plot');
    return plot;
  },

  /**
   * Looks up a plot by ID alone (no propertyId in the URL), resolving its
   * property for the access check. Used by the standalone /plots/:plotId
   * detail page reached from the map.
   */
  async getByIdGlobal(plotId: string, userId: string, role: Role, organisationId: string | null) {
    const plot = await prisma.plot.findUnique({
      where: { id: plotId },
      select: plotDetailSelect,
    });

    if (!plot) throw ApiError.notFound('Plot');

    // Tenants may only view the plot tied to their own lease (PLOT_VIEW_OWN) —
    // they are not property managers, so assertPropertyAccess does not apply.
    if (role === Role.TENANT) {
      const ownsLease = await prisma.leaseAgreement.findFirst({
        where: { plotId, tenant: { userId } },
        select: { id: true },
      });
      if (!ownsLease) throw ApiError.forbidden();
      return plot;
    }

    await assertPropertyAccess(plot.propertyId, userId, role, organisationId);

    return plot;
  },

  async create(
    propertyId: string,
    userId: string,
    role: Role,
    data: CreatePlotInput,
    organisationId: string | null
  ) {
    await assertPropertyAccess(propertyId, userId, role, organisationId);

    const existing = await prisma.plot.findUnique({
      where: { propertyId_plotNumber: { propertyId, plotNumber: data.plotNumber } },
    });

    if (existing) {
      throw ApiError.conflict(
        `Plot number "${data.plotNumber}" already exists in this property`
      );
    }

    const plot = await prisma.plot.create({
      data: {
        ...data,
        // Explicit override: Prisma requires boundaryGeoJSON (non-optional Json),
        // but z.any() spreads as optional — reassign to pin the required type.
        boundaryGeoJSON: data.boundaryGeoJSON as unknown as Prisma.InputJsonValue,
        propertyId,
        createdById: userId,
      },
      select: plotSelect,
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'PLOT_CREATED',
        entityType: 'Plot',
        entityId: plot.id,
        metadata: { plotNumber: plot.plotNumber, propertyId },
      },
    });

    logger.info('Plot created', { plotId: plot.id, propertyId, createdBy: userId });
    return plot;
  },

  async update(
    propertyId: string,
    plotId: string,
    userId: string,
    role: Role,
    data: UpdatePlotInput,
    organisationId: string | null
  ) {
    await this.getById(propertyId, plotId, userId, role, organisationId);

    const plot = await prisma.plot.update({
      where: { id: plotId },
      data,
      select: plotSelect,
    });

    logger.info('Plot updated', { plotId, updatedBy: userId });
    return plot;
  },

  async updateStatus(
    propertyId: string,
    plotId: string,
    userId: string,
    role: Role,
    data: UpdatePlotStatusInput,
    organisationId: string | null
  ) {
    const existing = await this.getById(propertyId, plotId, userId, role, organisationId);

    // OCCUPIED is set automatically by the lease activation flow, not manually
    if (data.status === PlotStatus.OCCUPIED) {
      throw ApiError.badRequest(
        'Plot status OCCUPIED is set automatically when a lease is activated'
      );
    }

    if (existing.status === PlotStatus.OCCUPIED) {
      throw ApiError.badRequest(
        'An occupied plot status is managed by the lease lifecycle — terminate the lease first'
      );
    }

    const plot = await prisma.plot.update({
      where: { id: plotId },
      data: { status: data.status },
      select: plotSelect,
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'PLOT_STATUS_CHANGED',
        entityType: 'Plot',
        entityId: plotId,
        metadata: { from: existing.status, to: data.status },
      },
    });

    logger.info('Plot status updated', {
      plotId,
      from: existing.status,
      to: data.status,
      by: userId,
    });
    return plot;
  },

  async delete(
    propertyId: string,
    plotId: string,
    userId: string,
    role: Role,
    organisationId: string | null
  ) {
    const existing = await this.getById(propertyId, plotId, userId, role, organisationId);

    if (existing.status === PlotStatus.OCCUPIED) {
      throw ApiError.badRequest(
        'Cannot delete an occupied plot — terminate the active lease first'
      );
    }

    if (existing._count.leaseAgreements > 0) {
      throw ApiError.badRequest(
        'Cannot delete a plot with associated lease records'
      );
    }

    await prisma.plot.delete({ where: { id: plotId } });

    logger.info('Plot deleted', { plotId, propertyId, deletedBy: userId });
  },
};
