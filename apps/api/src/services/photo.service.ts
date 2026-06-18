import { Role } from '@prisma/client';
import { prisma } from '../config/database';
import { s3Service } from './s3.service';
import { ApiError } from '../utils/ApiError';
import { logger } from '../config/logger';
import type { UploadPhotoInput } from '../validations/photo.schema';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const photoSelect = {
  id: true,
  plotId: true,
  s3Key: true,
  s3Url: true,
  lat: true,
  lng: true,
  altitude: true,
  accuracyM: true,
  takenAt: true,
  caption: true,
  uploadedAt: true,
} as const;

async function assertPlotAccess(plotId: string, userId: string, role: Role) {
  const plot = await prisma.plot.findUnique({
    where: { id: plotId },
    select: {
      id: true,
      propertyId: true,
      property: { select: { isActive: true, managers: { select: { id: true } } } },
    },
  });

  if (!plot || !plot.property.isActive) throw ApiError.notFound('Plot');

  if (role !== Role.SUPER_ADMIN) {
    const isAssigned = plot.property.managers.some((m) => m.id === userId);
    if (!isAssigned) throw ApiError.forbidden();
  }

  return plot;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const photoService = {
  async upload(
    userId: string,
    role: Role,
    file: { buffer: Buffer; mimetype: string },
    data: UploadPhotoInput
  ) {
    const plot = await assertPlotAccess(data.plotId, userId, role);

    const ext = s3Service.extensionForMime(file.mimetype);
    const s3Key = `photos/${plot.propertyId}/${plot.id}/${Date.now()}.${ext}`;
    const s3Url = await s3Service.uploadBuffer(s3Key, file.buffer, file.mimetype);

    const photo = await prisma.geotaggedPhoto.create({
      data: {
        plotId: plot.id,
        s3Key,
        s3Url,
        lat: data.lat,
        lng: data.lng,
        altitude: data.altitude ?? null,
        accuracyM: data.accuracyM ?? null,
        takenAt: data.takenAt,
        caption: data.caption ?? null,
      },
      select: photoSelect,
    });

    logger.info('Geotagged photo uploaded', { photoId: photo.id, plotId: plot.id, uploadedBy: userId });
    return photo;
  },

  async listByPlot(plotId: string, userId: string, role: Role) {
    await assertPlotAccess(plotId, userId, role);

    const photos = await prisma.geotaggedPhoto.findMany({
      where: { plotId },
      select: photoSelect,
      orderBy: { takenAt: 'desc' },
    });

    return Promise.all(
      photos.map(async (photo) => ({
        ...photo,
        viewUrl: await s3Service.getPresignedDownloadUrl(photo.s3Key),
      }))
    );
  },
};
