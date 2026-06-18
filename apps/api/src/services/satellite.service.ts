import { Role } from '@prisma/client';
import { prisma } from '../config/database';
import { ApiError } from '../utils/ApiError';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { getPropertySatelliteInfo } from './sentinel.service';
import type { CreateSatelliteOrderInput } from '../validations/satellite.schema';

const HISTORY_LIMIT = 12;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function assertPropertyAccess(propertyId: string, userId: string, role: Role): Promise<void> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      id: true,
      isActive: true,
      managers: { select: { id: true } },
    },
  });

  if (!property || !property.isActive) {
    throw ApiError.notFound('Property');
  }

  if (role !== Role.SUPER_ADMIN) {
    const isAssigned = property.managers.some((m) => m.id === userId);
    if (!isAssigned) throw ApiError.forbidden();
  }
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const satelliteService = {
  async getLatest(propertyId: string, userId: string, role: Role) {
    await assertPropertyAccess(propertyId, userId, role);

    const image = await prisma.satelliteImage.findFirst({
      where: { propertyId },
      orderBy: { capturedAt: 'desc' },
    });

    if (!image) {
      throw ApiError.notFound('Satellite image');
    }

    return image;
  },

  async getHistory(propertyId: string, userId: string, role: Role) {
    await assertPropertyAccess(propertyId, userId, role);

    const images = await prisma.satelliteImage.findMany({
      where: { propertyId },
      orderBy: { capturedAt: 'desc' },
      take: HISTORY_LIMIT,
      select: {
        id: true,
        capturedAt: true,
        provider: true,
        tier: true,
        resolution: true,
        imageUrl: true,
        thumbnailUrl: true,
        cloudCover: true,
        ndvi: true,
        changeScore: true,
        status: true,
        createdAt: true,
      },
    });

    return { data: images };
  },

  async createOrder(propertyId: string, userId: string, role: Role, data: CreateSatelliteOrderInput) {
    await assertPropertyAccess(propertyId, userId, role);

    const order = await prisma.satelliteImage.create({
      data: {
        propertyId,
        capturedAt: new Date(),
        provider: 'tasking-order',
        tier: data.tier,
        resolution: 0,
        status: 'pending',
        metadata: {
          orderedBy: userId,
          notes: data.notes ?? null,
          requestedAt: new Date().toISOString(),
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'SATELLITE_ORDER_CREATED',
        entityType: 'SatelliteImage',
        entityId: order.id,
        metadata: { propertyId, tier: data.tier, notes: data.notes ?? null },
      },
    });

    logger.info('Satellite tasking order created', { propertyId, tier: data.tier, orderId: order.id });

    return order;
  },

  async getInfo(propertyId: string, userId: string, role: Role) {
    await assertPropertyAccess(propertyId, userId, role);
    return getPropertySatelliteInfo(propertyId);
  },

  async health() {
    return {
      tier1: true,
      apiKeyPresent: Boolean(env.GOOGLE_EARTH_ENGINE_KEY),
    };
  },
};
