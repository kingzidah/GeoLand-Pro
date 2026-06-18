import { z } from 'zod';

const geoJsonSchema = z.any().refine(
  (v: unknown) => v !== null && typeof v === 'object' && typeof (v as Record<string, unknown>).type === 'string',
  { message: 'Must be a GeoJSON object with a "type" property' }
);

export const createAlertSchema = z.object({
  plotId: z.string().cuid(),
  propertyId: z.string().cuid(),
  name: z.string().min(1).max(200).trim(),
  bufferMetres: z.number().min(0).max(10_000).default(0),
  boundaryGeoJSON: geoJsonSchema,
  notifyPhones: z.array(z.string().min(7).max(20)).min(1).max(20),
  notifyViaWhatsApp: z.boolean().default(true),
  notifyViaSMS: z.boolean().default(true),
});

export const updateAlertSchema = z.object({
  name: z.string().min(1).max(200).trim().optional(),
  bufferMetres: z.number().min(0).max(10_000).optional(),
  boundaryGeoJSON: geoJsonSchema.optional(),
  notifyPhones: z.array(z.string().min(7).max(20)).min(1).max(20).optional(),
  notifyViaWhatsApp: z.boolean().optional(),
  notifyViaSMS: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const alertIdParamSchema = z.object({
  id: z.string().cuid({ message: 'Invalid alert ID' }),
});

export const listAlertsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  propertyId: z.string().cuid().optional(),
  plotId: z.string().cuid().optional(),
  isActive: z
    .string()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined))
    .optional(),
});

export const triggerCheckSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  propertyId: z.string().cuid().optional(),
  plotId: z.string().cuid().optional(),
  deviceId: z.string().max(200).optional(),
});

export const listAlertEventsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  eventType: z.enum(['BOUNDARY_CROSSED', 'BOUNDARY_EXITED', 'SATELLITE_CHANGE']).optional(),
});

export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── Exported types ───────────────────────────────────────────────────────────

export type CreateAlertInput = z.infer<typeof createAlertSchema>;
export type UpdateAlertInput = z.infer<typeof updateAlertSchema>;
export type ListAlertsQuery = z.infer<typeof listAlertsQuerySchema>;
export type TriggerCheckInput = z.infer<typeof triggerCheckSchema>;
export type ListAlertEventsQuery = z.infer<typeof listAlertEventsQuerySchema>;
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
