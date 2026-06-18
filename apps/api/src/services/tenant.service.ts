import { Role } from '@prisma/client';
import { prisma } from '../config/database';
import { ApiError } from '../utils/ApiError';
import { logger } from '../config/logger';
import type {
  CreateTenantProfileInput,
  UpdateTenantProfileInput,
  ListTenantsQuery,
} from '../validations/tenant.schema';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const tenantProfileInclude = {
  user: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  },
} as const;

// ─── Service ─────────────────────────────────────────────────────────────────

export const tenantService = {
  async list(query: ListTenantsQuery, organisationId: string | null) {
    const skip = (query.page - 1) * query.limit;

    const where = {
      user: {
        role: Role.TENANT,
        isActive: true,
        ...(organisationId && { organisationId }),
        ...(query.search && {
          OR: [
            { firstName: { contains: query.search, mode: 'insensitive' as const } },
            { lastName: { contains: query.search, mode: 'insensitive' as const } },
            { email: { contains: query.search, mode: 'insensitive' as const } },
            { phone: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }),
      },
    };

    const [tenants, total] = await Promise.all([
      prisma.tenantProfile.findMany({
        where,
        include: tenantProfileInclude,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.tenantProfile.count({ where }),
    ]);

    return {
      data: tenants,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },

  async getByUserId(
    targetUserId: string,
    requesterId: string,
    role: Role,
    organisationId: string | null
  ) {
    // TENANT can only view themselves
    if (role === Role.TENANT && requesterId !== targetUserId) {
      throw ApiError.forbidden();
    }

    const profile = await prisma.tenantProfile.findFirst({
      where: {
        userId: targetUserId,
        user: {
          role: Role.TENANT,
          isActive: true,
          ...(organisationId && { organisationId }),
        },
      },
      include: tenantProfileInclude,
    });

    if (!profile) throw ApiError.notFound('Tenant');
    return profile;
  },

  async createProfile(
    targetUserId: string,
    requesterId: string,
    role: Role,
    data: CreateTenantProfileInput,
    organisationId: string | null
  ) {
    // TENANT may only create their own profile
    if (role === Role.TENANT && requesterId !== targetUserId) {
      throw ApiError.forbidden();
    }

    const user = await prisma.user.findUnique({
      where: { id: targetUserId, isActive: true },
      select: { id: true, role: true, organisationId: true },
    });

    if (!user) throw ApiError.notFound('User');

    if (organisationId && user.organisationId !== organisationId) {
      throw ApiError.notFound('User');
    }

    if (user.role !== Role.TENANT) {
      throw ApiError.badRequest('KYC profiles can only be created for users with the TENANT role');
    }

    const existing = await prisma.tenantProfile.findUnique({
      where: { userId: targetUserId },
    });

    if (existing) {
      throw ApiError.conflict('A KYC profile already exists for this tenant — use PATCH to update it');
    }

    const profile = await prisma.tenantProfile.create({
      data: {
        userId: targetUserId,
        ...data,
        emergencyContact: data.emergencyContact ?? undefined,
      },
      include: tenantProfileInclude,
    });

    logger.info('Tenant profile created', { profileId: profile.id, userId: targetUserId });
    return profile;
  },

  async updateProfile(
    targetUserId: string,
    requesterId: string,
    role: Role,
    data: UpdateTenantProfileInput,
    organisationId: string | null
  ) {
    // TENANT may only update their own profile
    if (role === Role.TENANT && requesterId !== targetUserId) {
      throw ApiError.forbidden();
    }

    const profile = await prisma.tenantProfile.findUnique({
      where: { userId: targetUserId },
      include: { user: { select: { organisationId: true } } },
    });

    if (!profile) {
      throw ApiError.notFound('Tenant profile');
    }

    if (organisationId && profile.user.organisationId !== organisationId) {
      throw ApiError.notFound('Tenant profile');
    }

    // nationalIdNumber is sensitive — only MANAGER+ can change it after creation
    if (role === Role.TENANT && data.nationalIdNumber !== undefined) {
      throw ApiError.forbidden('Tenants cannot change their national ID number after submission');
    }

    const updated = await prisma.tenantProfile.update({
      where: { userId: targetUserId },
      data: {
        ...data,
        emergencyContact: data.emergencyContact ?? undefined,
      },
      include: tenantProfileInclude,
    });

    logger.info('Tenant profile updated', { profileId: updated.id, updatedBy: requesterId });
    return updated;
  },

  async getLeases(
    targetUserId: string,
    requesterId: string,
    role: Role,
    organisationId: string | null
  ) {
    if (role === Role.TENANT && requesterId !== targetUserId) {
      throw ApiError.forbidden();
    }

    const profile = await prisma.tenantProfile.findUnique({
      where: { userId: targetUserId },
      select: { id: true, user: { select: { organisationId: true } } },
    });

    if (!profile) throw ApiError.notFound('Tenant profile');

    if (organisationId && profile.user.organisationId !== organisationId) {
      throw ApiError.notFound('Tenant profile');
    }

    return prisma.leaseAgreement.findMany({
      where: { tenantProfileId: profile.id },
      select: {
        id: true,
        leaseNumber: true,
        status: true,
        startDate: true,
        endDate: true,
        monthlyRentGHS: true,
        depositAmountGHS: true,
        totalPaidGHS: true,
        arrearsGHS: true,
        signedAt: true,
        createdAt: true,
        plot: {
          select: {
            id: true,
            plotNumber: true,
            areaSqm: true,
            property: { select: { id: true, name: true, address: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  },
};
