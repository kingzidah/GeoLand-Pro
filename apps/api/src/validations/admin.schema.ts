import { z } from 'zod';
import { Role } from '@prisma/client';

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: z.nativeEnum(Role).optional(),
  isActive: z
    .string()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined))
    .optional(),
  search: z.string().max(100).trim().optional(),
});

export const userIdParamSchema = z.object({
  id: z.string().cuid({ message: 'Invalid user ID' }),
});

export const changeRoleSchema = z.object({
  role: z.nativeEnum(Role).refine((r) => r !== Role.SUPER_ADMIN, {
    message: 'Cannot assign SUPER_ADMIN role via this endpoint',
  }),
});

export const listAuditLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  userId: z.string().cuid().optional(),
  entityType: z.string().max(100).optional(),
  entityId: z.string().max(100).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

// ─── Exported types ───────────────────────────────────────────────────────────

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type ChangeRoleInput = z.infer<typeof changeRoleSchema>;
export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
