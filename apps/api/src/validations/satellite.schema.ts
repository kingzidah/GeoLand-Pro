import { z } from 'zod';

export const propertyIdParamSchema = z.object({
  propertyId: z.string().cuid({ message: 'Invalid property ID' }),
});

export const createSatelliteOrderSchema = z.object({
  tier: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  notes: z.string().max(2000).trim().optional(),
});

// ─── Exported types ───────────────────────────────────────────────────────────

export type PropertyIdParam = z.infer<typeof propertyIdParamSchema>;
export type CreateSatelliteOrderInput = z.infer<typeof createSatelliteOrderSchema>;
