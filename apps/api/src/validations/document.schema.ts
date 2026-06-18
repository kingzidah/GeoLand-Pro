import { z } from 'zod';
import { DocumentType } from '@prisma/client';

const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;

export const presignedUploadSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  type: z.nativeEnum(DocumentType),
  mimeType: z.enum(ALLOWED_MIME_TYPES),
  plotId: z.string().cuid().optional(),
  leaseId: z.string().cuid().optional(),
});

export const confirmUploadSchema = z.object({
  s3Key: z.string().min(1, 'S3 key is required'),
  title: z.string().min(1).max(200).trim(),
  type: z.nativeEnum(DocumentType),
  mimeType: z.enum(ALLOWED_MIME_TYPES),
  sizeBytes: z.number().int().positive().optional(),
  plotId: z.string().cuid().optional(),
  leaseId: z.string().cuid().optional(),
});

export const documentIdParamSchema = z.object({
  id: z.string().cuid({ message: 'Invalid document ID' }),
});

export const listDocumentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  plotId: z.string().cuid().optional(),
  leaseId: z.string().cuid().optional(),
  type: z.nativeEnum(DocumentType).optional(),
});

export const generateLeaseDocParamSchema = z.object({
  id: z.string().cuid({ message: 'Invalid lease ID' }),
});

export const generateReceiptDocParamSchema = z.object({
  id: z.string().cuid({ message: 'Invalid transaction ID' }),
});

export const generatePlotDocParamSchema = z.object({
  plotId: z.string().cuid({ message: 'Invalid plot ID' }),
});

export const generateLeaseDemandParamSchema = z.object({
  leaseId: z.string().cuid({ message: 'Invalid lease ID' }),
});

export const generatePropertyDocParamSchema = z.object({
  propertyId: z.string().cuid({ message: 'Invalid property ID' }),
});

export const generateAnnualReportQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

// ─── Exported types ───────────────────────────────────────────────────────────

export type PresignedUploadInput = z.infer<typeof presignedUploadSchema>;
export type ConfirmUploadInput = z.infer<typeof confirmUploadSchema>;
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;
export type GenerateAnnualReportQuery = z.infer<typeof generateAnnualReportQuerySchema>;
