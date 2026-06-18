import { z } from 'zod';

export const ALLOWED_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_PHOTO_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

// multipart/form-data fields arrive as strings — coerce to numbers/dates
export const uploadPhotoSchema = z.object({
  plotId: z.string().cuid({ message: 'Invalid plot ID' }),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  altitude: z.coerce.number().optional(),
  accuracyM: z.coerce.number().nonnegative().optional(),
  takenAt: z.coerce.date(),
  caption: z.string().max(500).trim().optional(),
});

export const plotIdParamSchema = z.object({
  plotId: z.string().cuid({ message: 'Invalid plot ID' }),
});

export type UploadPhotoInput = z.infer<typeof uploadPhotoSchema>;
