import { z } from 'zod';

const PLOT_STATUS_VALUES = ['VACANT', 'OCCUPIED', 'DISPUTED', 'RESERVED', 'UNDER_SURVEY'] as const;

// z.any() output keeps Prisma's InputJsonValue happy; runtime refine ensures shape
const geoJSONSchema = z.any().refine(
  (v: unknown) => v !== null && typeof v === 'object' && typeof (v as Record<string, unknown>).type === 'string',
  { message: 'Must be a GeoJSON object with a "type" property' }
);

// ─── Survey import ──────────────────────────────────────────────────────────

const manualSurveyPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  elev: z.number().optional(),
});

const manualPlotSchema = z.object({
  plotLabel: z.string().min(1).max(50).trim().optional(),
  points: z.array(manualSurveyPointSchema).min(3, 'A plot boundary needs at least 3 points'),
  status: z.enum(PLOT_STATUS_VALUES).optional(),
  notes: z.string().max(500).trim().optional(),
});

export const surveyImportSchema = z.discriminatedUnion('format', [
  z.object({ format: z.literal('GEOJSON'), data: geoJSONSchema }),
  z.object({ format: z.literal('CSV'), data: z.string().min(1, 'CSV data is required') }),
  z.object({ format: z.literal('MANUAL'), data: manualPlotSchema }),
]);

export const surveyValidateSchema = surveyImportSchema;

// ─── GPS point capture ──────────────────────────────────────────────────────

export const surveyPointCaptureSchema = z.object({
  sessionId: z.string().min(1).max(100).trim(),
  pointIndex: z.number().int().min(0),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  elevation: z.number().optional(),
  accuracy: z.number().nonnegative().optional(),
  timestamp: z.string().datetime().optional(),
  label: z.string().max(100).trim().optional(),
  notes: z.string().max(500).trim().optional(),
});

export const surveySessionParamSchema = z.object({
  propertyId: z.string().cuid({ message: 'Invalid property ID' }),
  sessionId: z.string().min(1).max(100),
});

export const surveySessionCloseSchema = z.object({
  plotLabel: z.string().min(1).max(50).trim().optional(),
  status: z.enum(PLOT_STATUS_VALUES).optional(),
  notes: z.string().max(500).trim().optional(),
});

// ─── Property boundary ───────────────────────────────────────────────────────

export const updatePropertyBoundarySchema = z.object({
  boundaryGeoJSON: geoJSONSchema,
  totalAreaHa: z.number().positive().optional(),
});

// ─── Exported types ───────────────────────────────────────────────────────────

export type SurveyImportInput = z.infer<typeof surveyImportSchema>;
export type SurveyValidateInput = z.infer<typeof surveyValidateSchema>;
export type SurveyPointCaptureInput = z.infer<typeof surveyPointCaptureSchema>;
export type SurveySessionCloseInput = z.infer<typeof surveySessionCloseSchema>;
export type UpdatePropertyBoundaryInput = z.infer<typeof updatePropertyBoundarySchema>;
