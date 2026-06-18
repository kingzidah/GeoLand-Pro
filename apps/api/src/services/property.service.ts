import { Role, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { ApiError } from '../utils/ApiError';
import { logger } from '../config/logger';
import type {
  CreatePropertyInput,
  UpdatePropertyInput,
  ListPropertiesQuery,
  AddManagerInput,
} from '../validations/property.schema';
import type { UpdatePropertyBoundaryInput } from '../validations/survey.schema';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const propertySelect = {
  id: true,
  name: true,
  description: true,
  address: true,
  region: true,
  district: true,
  totalAreaSqm: true,
  totalAreaHa: true,
  boundaryGeoJSON: true,
  isActive: true,
  organisationId: true,
  createdAt: true,
  updatedAt: true,
  managers: {
    select: { id: true, firstName: true, lastName: true, email: true, role: true },
  },
  _count: { select: { plots: true } },
} as const;

function buildWhereForRole(userId: string, role: Role, organisationId: string | null) {
  const orgFilter = organisationId ? { organisationId } : {};
  if (role === Role.SUPER_ADMIN) return { ...orgFilter, isActive: true };
  // All other roles can only see properties they are explicitly assigned to
  return { ...orgFilter, isActive: true, managers: { some: { id: userId } } };
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const propertyService = {
  async list(userId: string, role: Role, query: ListPropertiesQuery, organisationId: string | null) {
    const skip = (query.page - 1) * query.limit;
    const base = buildWhereForRole(userId, role, organisationId);

    const where = {
      ...base,
      ...(query.region && {
        region: { contains: query.region, mode: 'insensitive' as const },
      }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' as const } },
          { address: { contains: query.search, mode: 'insensitive' as const } },
          { district: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [properties, total] = await Promise.all([
      prisma.property.findMany({
        where,
        select: propertySelect,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.property.count({ where }),
    ]);

    return {
      data: properties,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },

  async getById(propertyId: string, userId: string, role: Role, organisationId: string | null) {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: propertySelect,
    });

    if (!property || !property.isActive) {
      throw ApiError.notFound('Property');
    }

    if (organisationId && property.organisationId !== organisationId) {
      throw ApiError.notFound('Property');
    }

    if (role !== Role.SUPER_ADMIN) {
      const isAssigned = property.managers.some((m) => m.id === userId);
      if (!isAssigned) throw ApiError.forbidden();
    }

    return property;
  },

  async create(userId: string, data: CreatePropertyInput, organisationId: string | null) {
    if (!organisationId) {
      throw ApiError.badRequest('Organisation context required to create a property');
    }

    const property = await prisma.property.create({
      data: {
        ...data,
        organisation: { connect: { id: organisationId } },
        managers: { connect: { id: userId } },
      },
      select: propertySelect,
    });

    logger.info('Property created', { propertyId: property.id, createdBy: userId });
    return property;
  },

  async update(
    propertyId: string,
    userId: string,
    role: Role,
    data: UpdatePropertyInput,
    organisationId: string | null
  ) {
    await this.getById(propertyId, userId, role, organisationId);

    const updated = await prisma.property.update({
      where: { id: propertyId },
      data,
      select: propertySelect,
    });

    logger.info('Property updated', { propertyId, updatedBy: userId });
    return updated;
  },

  async updateBoundary(
    propertyId: string,
    userId: string,
    role: Role,
    data: UpdatePropertyBoundaryInput,
    organisationId: string | null
  ) {
    await this.getById(propertyId, userId, role, organisationId);

    const updated = await prisma.property.update({
      where: { id: propertyId },
      data: {
        boundaryGeoJSON: data.boundaryGeoJSON as unknown as Prisma.InputJsonValue,
        ...(data.totalAreaHa !== undefined && {
          totalAreaHa: data.totalAreaHa,
          totalAreaSqm: data.totalAreaHa * 10_000,
        }),
      },
      select: propertySelect,
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'PROPERTY_BOUNDARY_UPDATED',
        entityType: 'Property',
        entityId: propertyId,
        metadata: { totalAreaHa: data.totalAreaHa ?? null },
      },
    });

    logger.info('Property boundary updated', { propertyId, updatedBy: userId });
    return updated;
  },

  async deactivate(propertyId: string, userId: string, role: Role, organisationId: string | null) {
    await this.getById(propertyId, userId, role, organisationId);

    await prisma.property.update({
      where: { id: propertyId },
      data: { isActive: false },
    });

    logger.info('Property deactivated', { propertyId, deactivatedBy: userId });
  },

  async addManager(
    propertyId: string,
    requesterId: string,
    role: Role,
    data: AddManagerInput,
    organisationId: string | null
  ) {
    const property = await this.getById(propertyId, requesterId, role, organisationId);

    const alreadyAssigned = property.managers.some((m) => m.id === data.userId);
    if (alreadyAssigned) {
      throw ApiError.conflict('This user is already a manager of this property');
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: data.userId, isActive: true },
      select: { id: true, role: true },
    });

    if (!targetUser) throw ApiError.notFound('User');

    if (targetUser.role === Role.TENANT) {
      throw ApiError.badRequest('Tenants cannot be assigned as property managers');
    }

    await prisma.property.update({
      where: { id: propertyId },
      data: { managers: { connect: { id: data.userId } } },
    });

    logger.info('Manager added to property', {
      propertyId,
      managerId: data.userId,
      addedBy: requesterId,
    });
  },

  async removeManager(
    propertyId: string,
    requesterId: string,
    role: Role,
    managerId: string,
    organisationId: string | null
  ) {
    const property = await this.getById(propertyId, requesterId, role, organisationId);

    const isMember = property.managers.some((m) => m.id === managerId);
    if (!isMember) throw ApiError.notFound('Manager');

    if (property.managers.length === 1) {
      throw ApiError.badRequest('Cannot remove the last manager from a property');
    }

    await prisma.property.update({
      where: { id: propertyId },
      data: { managers: { disconnect: { id: managerId } } },
    });

    logger.info('Manager removed from property', {
      propertyId,
      managerId,
      removedBy: requesterId,
    });
  },
};
