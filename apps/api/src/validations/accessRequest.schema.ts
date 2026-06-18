import { z } from 'zod';
import { AccessRequestStatus } from '@prisma/client';
import { AccessScope } from '@geolandpro/rbac';

// ─── Params ─────────────────────────────────────────────────────────────────

export const accessRequestIdParamSchema = z.object({
  id: z.string().cuid({ message: 'Invalid access request ID' }),
});

// ─── Platform staff: create + list own requests ────────────────────────────────

export const createAccessRequestSchema = z.object({
  reason: z.string().max(500).trim().optional(),
  requestedScopes: z
    .array(z.nativeEnum(AccessScope))
    .min(1, { message: 'Select at least one section to request' }),
});

export const listAccessRequestsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(AccessRequestStatus).optional(),
});

// ─── Org SUPER_ADMIN: approve ──────────────────────────────────────────────────

export const approveAccessRequestSchema = z.object({
  grantedScopes: z.array(z.nativeEnum(AccessScope)),
  durationMinutes: z.coerce.number().int().min(1).max(60),
});

// ─── Exported types ─────────────────────────────────────────────────────────────

export type CreateAccessRequestInput = z.infer<typeof createAccessRequestSchema>;
export type ListAccessRequestsQuery = z.infer<typeof listAccessRequestsQuerySchema>;
export type ApproveAccessRequestInput = z.infer<typeof approveAccessRequestSchema>;
