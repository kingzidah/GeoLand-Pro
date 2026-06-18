import { z } from 'zod';

// ─── Shared ───────────────────────────────────────────────────────────────────

// z.any() output keeps Prisma's InputJsonValue happy; runtime refine ensures type field
const geoJSONSchema = z.any().refine(
  (v: unknown) => v !== null && typeof v === 'object' && typeof (v as Record<string, unknown>).type === 'string',
  { message: 'Must be a GeoJSON object with a "type" property' }
);

// ─── Property schemas ─────────────────────────────────────────────────────────

export const createPropertySchema = z.object({
  name: z.string().min(2).max(100).trim(),
  description: z.string().max(500).trim().optional(),
  address: z.string().min(5).max(200).trim(),
  region: z.string().min(2).max(100).trim(),
  district: z.string().min(2).max(100).trim(),
  totalAreaSqm: z.number().positive({ message: 'Total area must be a positive number' }),
  boundaryGeoJSON: geoJSONSchema.optional(),
});

export const updatePropertySchema = createPropertySchema.partial();

export const addManagerSchema = z.object({
  userId: z.string().cuid({ message: 'Invalid user ID' }),
});

export const propertyIdParamSchema = z.object({
  id: z.string().cuid({ message: 'Invalid property ID' }),
});

export const managerParamSchema = z.object({
  id: z.string().cuid({ message: 'Invalid property ID' }),
  managerId: z.string().cuid({ message: 'Invalid manager ID' }),
});

export const listPropertiesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  region: z.string().trim().optional(),
  search: z.string().trim().optional(),
});

// ─── Plot schemas ─────────────────────────────────────────────────────────────

export const createPlotSchema = z.object({
  plotNumber: z.string().min(1).max(50).trim(),
  areaSqm: z.number().positive({ message: 'Plot area must be a positive number' }),
  boundaryGeoJSON: geoJSONSchema,
  centroidLat: z.number().min(-90).max(90).optional(),
  centroidLng: z.number().min(-180).max(180).optional(),
  description: z.string().max(500).trim().optional(),
});

export const updatePlotSchema = createPlotSchema.partial();

export const updatePlotStatusSchema = z.object({
  status: z.enum(['VACANT', 'OCCUPIED', 'DISPUTED', 'RESERVED', 'UNDER_SURVEY']),
});

export const nestedPropertyParamSchema = z.object({
  propertyId: z.string().cuid({ message: 'Invalid property ID' }),
});

export const plotParamSchema = z.object({
  propertyId: z.string().cuid({ message: 'Invalid property ID' }),
  plotId: z.string().cuid({ message: 'Invalid plot ID' }),
});

export const plotIdParamSchema = z.object({
  plotId: z.string().cuid({ message: 'Invalid plot ID' }),
});

export const listPlotsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(['VACANT', 'OCCUPIED', 'DISPUTED', 'RESERVED', 'UNDER_SURVEY']).optional(),
});

// ─── Exported types ───────────────────────────────────────────────────────────

export type CreatePropertyInput = z.infer<typeof createPropertySchema>;
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;
export type ListPropertiesQuery = z.infer<typeof listPropertiesQuerySchema>;
export type AddManagerInput = z.infer<typeof addManagerSchema>;
export type CreatePlotInput = z.infer<typeof createPlotSchema>;
export type UpdatePlotInput = z.infer<typeof updatePlotSchema>;
export type UpdatePlotStatusInput = z.infer<typeof updatePlotStatusSchema>;
export type ListPlotsQuery = z.infer<typeof listPlotsQuerySchema>;
