import Bull from 'bull';
import { centroid as turfCentroid } from '@turf/turf';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { createBullClient } from '../config/redis';
import { logger } from '../config/logger';
import { GHANA_TZ, getSystemUserId } from './shared';
import { runChangeDetection } from './changeDetection.job';

export const satelliteFetchQueue = new Bull('satellite-fetch', { createClient: createBullClient });

satelliteFetchQueue.process(async () => {
  const systemUserId = await getSystemUserId();
  const apiKeyPresent = Boolean(env.GOOGLE_EARTH_ENGINE_KEY);

  const properties = await prisma.property.findMany({
    where: { isActive: true },
    select: { id: true, name: true, boundaryGeoJSON: true },
  });

  for (const property of properties) {
    await prisma.auditLog.create({
      data: {
        userId: systemUserId,
        action: 'satellite_fetch_scheduled',
        entityType: 'Property',
        entityId: property.id,
        metadata: { propertyId: property.id, timestamp: new Date().toISOString() },
      },
    });

    if (!apiKeyPresent) {
      await prisma.auditLog.create({
        data: {
          userId: systemUserId,
          action: 'satellite_pending_api_key',
          entityType: 'Property',
          entityId: property.id,
          metadata: {
            propertyId: property.id,
            note: 'Satellite fetch job is ready but waiting for GOOGLE_EARTH_ENGINE_KEY to be configured',
          },
        },
      });
      continue;
    }

    try {
      let centerLat: number | undefined;
      let centerLng: number | undefined;
      if (property.boundaryGeoJSON) {
        const center = turfCentroid(property.boundaryGeoJSON as unknown as GeoJSON.Geometry);
        [centerLng, centerLat] = center.geometry.coordinates as [number, number];
      }

      // Sentinel-2 fetch via Google Earth Engine — recorded as pending until processed.
      await prisma.satelliteImage.create({
        data: {
          propertyId: property.id,
          capturedAt: new Date(),
          provider: 'sentinel2',
          tier: 1,
          resolution: 10,
          status: 'pending',
          centerLat,
          centerLng,
          metadata: { source: 'google-earth-engine' },
        },
      });
      logger.info('Satellite fetch initiated', { propertyId: property.id, provider: 'sentinel2' });
    } catch (err) {
      logger.error('Satellite fetch failed', { propertyId: property.id, error: (err as Error).message });
    }
  }

  logger.info('Satellite fetch job complete', { propertiesProcessed: properties.length, apiKeyPresent });

  await runChangeDetection();
});

satelliteFetchQueue.on('failed', (_job, err) => {
  logger.error('Satellite fetch job failed', { error: err.message });
});

satelliteFetchQueue
  .add(
    {},
    {
      repeat: { cron: '0 2 */5 * *', tz: GHANA_TZ },
      jobId: 'satellite-fetch-every-5-days',
      removeOnComplete: true,
    }
  )
  .catch((err) => logger.error('Failed to schedule satellite fetch job', { error: (err as Error).message }));
