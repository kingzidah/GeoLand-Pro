import { Role, AlertEventType, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { ApiError } from '../utils/ApiError';
import { logger } from '../config/logger';
import { notificationQueue } from '../queues/notification.queue';
import type {
  CreateAlertInput,
  UpdateAlertInput,
  ListAlertsQuery,
  TriggerCheckInput,
  ListAlertEventsQuery,
} from '../validations/alert.schema';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TriggeredAlertRow {
  id: string;
  name: string;
  notifyPhones: string[];
  notifyViaWhatsApp: boolean;
  notifyViaSMS: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const alertSelect = {
  id: true,
  name: true,
  plotId: true,
  propertyId: true,
  bufferMetres: true,
  isActive: true,
  notifyPhones: true,
  notifyViaWhatsApp: true,
  notifyViaSMS: true,
  createdAt: true,
  updatedAt: true,
  plot: { select: { plotNumber: true } },
  property: { select: { name: true } },
  _count: { select: { events: true } },
} as const;

function buildAlertWhereForRole(
  userId: string,
  role: Role,
  organisationId: string | null
): Prisma.GeofenceAlertWhereInput {
  const propertyFilter: Prisma.PropertyWhereInput = {
    ...(organisationId && { organisationId }),
    ...(role !== Role.SUPER_ADMIN && { managers: { some: { id: userId } } }),
  };

  return Object.keys(propertyFilter).length > 0 ? { property: propertyFilter } : {};
}

async function assertAlertAccess(
  alertId: string,
  userId: string,
  role: Role,
  organisationId: string | null
) {
  const alert = await prisma.geofenceAlert.findUnique({
    where: { id: alertId },
    select: {
      id: true,
      property: { select: { organisationId: true, managers: { select: { id: true } } } },
    },
  });

  if (!alert) throw ApiError.notFound('GeofenceAlert');

  if (organisationId && alert.property.organisationId !== organisationId) {
    throw ApiError.notFound('GeofenceAlert');
  }

  if (role !== Role.SUPER_ADMIN) {
    if (!alert.property.managers.some((m) => m.id === userId)) throw ApiError.forbidden();
  }

  return alert;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const alertService = {
  async list(userId: string, role: Role, query: ListAlertsQuery, organisationId: string | null) {
    const skip = (query.page - 1) * query.limit;
    const baseWhere = buildAlertWhereForRole(userId, role, organisationId);

    const where: Prisma.GeofenceAlertWhereInput = {
      ...baseWhere,
      ...(query.propertyId && { propertyId: query.propertyId }),
      ...(query.plotId && { plotId: query.plotId }),
      ...(query.isActive !== undefined && { isActive: query.isActive }),
    };

    const [alerts, total] = await Promise.all([
      prisma.geofenceAlert.findMany({
        where,
        select: alertSelect,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.geofenceAlert.count({ where }),
    ]);

    return {
      data: alerts,
      meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
    };
  },

  async getById(alertId: string, userId: string, role: Role, organisationId: string | null) {
    await assertAlertAccess(alertId, userId, role, organisationId);
    const alert = await prisma.geofenceAlert.findUnique({ where: { id: alertId }, select: alertSelect });
    return alert!;
  },

  async create(userId: string, role: Role, data: CreateAlertInput, organisationId: string | null) {
    const property = await prisma.property.findUnique({
      where: { id: data.propertyId },
      select: { organisationId: true, managers: { select: { id: true } } },
    });
    if (!property) throw ApiError.notFound('Property');

    if (organisationId && property.organisationId !== organisationId) {
      throw ApiError.notFound('Property');
    }

    if (role !== Role.SUPER_ADMIN) {
      if (!property.managers.some((m) => m.id === userId)) throw ApiError.forbidden();
    }

    const plot = await prisma.plot.findUnique({
      where: { id: data.plotId },
      select: { propertyId: true },
    });
    if (!plot || plot.propertyId !== data.propertyId) {
      throw ApiError.badRequest('Plot does not belong to the specified property');
    }

    const alert = await prisma.geofenceAlert.create({
      data: {
        plotId: data.plotId,
        propertyId: data.propertyId,
        name: data.name,
        bufferMetres: data.bufferMetres,
        boundaryGeoJSON: data.boundaryGeoJSON,
        notifyPhones: data.notifyPhones,
        notifyViaWhatsApp: data.notifyViaWhatsApp,
        notifyViaSMS: data.notifyViaSMS,
      },
      select: alertSelect,
    });

    logger.info('GeofenceAlert created', { alertId: alert.id, plotId: data.plotId });
    return alert;
  },

  async update(alertId: string, userId: string, role: Role, data: UpdateAlertInput, organisationId: string | null) {
    await assertAlertAccess(alertId, userId, role, organisationId);

    return prisma.geofenceAlert.update({
      where: { id: alertId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.bufferMetres !== undefined && { bufferMetres: data.bufferMetres }),
        ...(data.boundaryGeoJSON !== undefined && { boundaryGeoJSON: data.boundaryGeoJSON }),
        ...(data.notifyPhones !== undefined && { notifyPhones: data.notifyPhones }),
        ...(data.notifyViaWhatsApp !== undefined && { notifyViaWhatsApp: data.notifyViaWhatsApp }),
        ...(data.notifyViaSMS !== undefined && { notifyViaSMS: data.notifyViaSMS }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
      select: alertSelect,
    });
  },

  async delete(alertId: string, userId: string, role: Role, organisationId: string | null) {
    await assertAlertAccess(alertId, userId, role, organisationId);
    await prisma.geofenceAlert.delete({ where: { id: alertId } });
    logger.info('GeofenceAlert deleted', { alertId, deletedBy: userId });
  },

  async listEvents(
    alertId: string,
    userId: string,
    role: Role,
    query: ListAlertEventsQuery,
    organisationId: string | null
  ) {
    await assertAlertAccess(alertId, userId, role, organisationId);
    const skip = (query.page - 1) * query.limit;
    const where = {
      alertId,
      ...(query.eventType && { eventType: query.eventType }),
    };

    const [events, total] = await Promise.all([
      prisma.alertEvent.findMany({
        where,
        select: {
          id: true,
          eventType: true,
          triggeredLat: true,
          triggeredLng: true,
          triggeredAt: true,
          deviceId: true,
          notified: true,
        },
        skip,
        take: query.limit,
        orderBy: { triggeredAt: 'desc' },
      }),
      prisma.alertEvent.count({ where }),
    ]);

    return {
      data: events,
      meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
    };
  },

  /**
   * Called by the mobile client to report a GPS position.
   * Uses PostGIS ST_DWithin to find all active alerts whose boundary (plus optional
   * bufferMetres) contains the reported point, then records an AlertEvent and
   * enqueues a notification job for each match.
   *
   * bufferMetres=0 → ST_DWithin with distance 0 checks strict containment.
   * bufferMetres>0 → expands the alert zone by that many metres (metre-accurate via ::geography).
   */
  async triggerCheck(userId: string, data: TriggerCheckInput, organisationId: string | null) {
    const { lat, lng, propertyId, plotId, deviceId } = data;

    const pId = propertyId ?? null;
    const plId = plotId ?? null;
    const orgId = organisationId ?? null;

    const triggered = await prisma.$queryRaw<TriggeredAlertRow[]>(
      Prisma.sql`
        SELECT
          ga.id,
          ga.name,
          ga."notifyPhones",
          ga."notifyViaWhatsApp",
          ga."notifyViaSMS"
        FROM geofence_alerts ga
        JOIN properties p ON p.id = ga."propertyId"
        WHERE ga."isActive" = true
          AND (${orgId}::text IS NULL OR p."organisationId" = ${orgId})
          AND (${pId}::text IS NULL OR ga."propertyId" = ${pId})
          AND (${plId}::text IS NULL OR ga."plotId" = ${plId})
          AND ST_DWithin(
            ST_GeomFromGeoJSON(ga."boundaryGeoJSON"::text)::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ga."bufferMetres"
          )
      `
    );

    if (triggered.length === 0) return { triggered: false, events: [] };

    const createdEvents = await Promise.all(
      triggered.map(async (alert) => {
        const event = await prisma.alertEvent.create({
          data: {
            alertId: alert.id,
            eventType: AlertEventType.BOUNDARY_CROSSED,
            triggeredLat: lat,
            triggeredLng: lng,
            deviceId: deviceId ?? null,
          },
          select: { id: true, alertId: true, eventType: true, triggeredAt: true },
        });

        await notificationQueue.add({ type: 'ALERT', alertId: alert.id, eventId: event.id });
        return event;
      })
    );

    logger.info('Geofence boundary crossed', {
      triggeredCount: triggered.length,
      lat,
      lng,
      deviceId,
      triggeredBy: userId,
    });

    return { triggered: true, events: createdEvents };
  },
};
