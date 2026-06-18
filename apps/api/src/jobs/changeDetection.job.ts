import { AlertEventType } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { getSystemUserId } from './shared';

// Placeholder threshold — real implementation would diff imagery/NDVI rasters.
const CHANGE_SCORE_THRESHOLD = 0.3;

/**
 * Compares each property's two most recent satellite images. Invoked
 * directly by satelliteFetch.job once its sweep completes.
 */
export async function runChangeDetection(): Promise<void> {
  const systemUserId = await getSystemUserId();

  const properties = await prisma.property.findMany({
    where: { isActive: true, satelliteImages: { some: {} } },
    select: { id: true, name: true },
  });

  let comparisons = 0;
  let changesDetected = 0;

  for (const property of properties) {
    const images = await prisma.satelliteImage.findMany({
      where: { propertyId: property.id },
      orderBy: { capturedAt: 'desc' },
      take: 2,
    });

    if (images.length < 2) continue;

    const [latest, previous] = images;
    const changeDetected = latest.changeScore != null && latest.changeScore >= CHANGE_SCORE_THRESHOLD;
    comparisons += 1;

    await prisma.auditLog.create({
      data: {
        userId: systemUserId,
        action: 'satellite_change_comparison',
        entityType: 'Property',
        entityId: property.id,
        metadata: {
          latestImageId: latest.id,
          previousImageId: previous.id,
          latestCapturedAt: latest.capturedAt.toISOString(),
          previousCapturedAt: previous.capturedAt.toISOString(),
          changeScore: latest.changeScore,
          changeDetected,
        },
      },
    });

    if (!changeDetected) continue;

    changesDetected += 1;
    logger.info('change_detected', { propertyId: property.id, changeScore: latest.changeScore });

    const alert = await prisma.geofenceAlert.findFirst({
      where: { propertyId: property.id, isActive: true },
      select: { id: true, plot: { select: { centroidLat: true, centroidLng: true } } },
    });

    if (alert) {
      await prisma.alertEvent.create({
        data: {
          alertId: alert.id,
          eventType: AlertEventType.SATELLITE_CHANGE,
          triggeredLat: alert.plot.centroidLat ?? 0,
          triggeredLng: alert.plot.centroidLng ?? 0,
        },
      });
    }
  }

  logger.info('Change detection job complete', {
    propertiesChecked: properties.length,
    comparisons,
    changesDetected,
  });
}
