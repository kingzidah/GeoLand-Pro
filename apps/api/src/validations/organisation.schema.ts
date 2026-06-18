import { z } from 'zod';
import { Role, TicketStatus } from '@prisma/client';

// ─── Shared ───────────────────────────────────────────────────────────────────

export const organisationIdParamSchema = z.object({
  id: z.string().min(1, { message: 'Invalid organisation ID' }),
});

export const orgUserIdParamSchema = z.object({
  userId: z.string().cuid({ message: 'Invalid user ID' }),
});

// ─── Platform admin: organisations ─────────────────────────────────────────────

export const listOrganisationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(100).trim().optional(),
  isActive: z
    .string()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined))
    .optional(),
});

export const createOrganisationSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers, and hyphens')
    .optional(),
  logoUrl: z.string().url().optional(),
  country: z.string().min(2).max(60).default('Ghana'),
  currency: z.string().min(3).max(3).default('GHS'),
  timezone: z.string().min(2).max(60).default('Africa/Accra'),
  subscriptionTier: z.string().min(2).max(40).default('STANDARD'),
  commissionRate: z.coerce.number().min(0).max(1).optional(),
  maxProperties: z.coerce.number().int().min(1).default(10),
  maxUsers: z.coerce.number().int().min(1).default(50),
  // First SUPER_ADMIN user for the new organisation
  adminEmail: z.string().email(),
  adminFirstName: z.string().min(1).max(60),
  adminLastName: z.string().min(1).max(60),
  adminPhone: z.string().max(20).optional(),
});

export const deleteOrganisationSchema = z.object({
  confirmationToken: z.string().min(1).optional(),
});

export const updateOrganisationSchema = z
  .object({
    name: z.string().min(2).max(120).optional(),
    slug: z
      .string()
      .min(2)
      .max(60)
      .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers, and hyphens')
      .optional(),
    logoUrl: z.string().url().optional(),
    country: z.string().min(2).max(60).optional(),
    currency: z.string().min(3).max(3).optional(),
    timezone: z.string().min(2).max(60).optional(),
    isActive: z.boolean().optional(),
    subscriptionTier: z.string().min(2).max(40).optional(),
    commissionRate: z.coerce.number().min(0).max(1).optional(),
    maxProperties: z.coerce.number().int().min(1).optional(),
    maxUsers: z.coerce.number().int().min(1).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' });

// ─── Org admin: settings ───────────────────────────────────────────────────────

export const updateOrgSettingsSchema = z
  .object({
    name: z.string().min(2).max(120).optional(),
    logoUrl: z.string().url().optional(),
    country: z.string().min(2).max(60).optional(),
    currency: z.string().min(3).max(3).optional(),
    timezone: z.string().min(2).max(60).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' });

// ─── Org admin: users ───────────────────────────────────────────────────────────

export const listOrgUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: z.nativeEnum(Role).optional(),
  search: z.string().max(100).trim().optional(),
});

export const changeOrgUserRoleSchema = z.object({
  role: z.nativeEnum(Role),
});

// ─── Org admin: invite codes ───────────────────────────────────────────────────

export const createInviteSchema = z.object({
  role: z.nativeEnum(Role).refine((r) => r !== Role.SUPER_ADMIN, {
    message: 'Cannot generate an invite code for the SUPER_ADMIN role',
  }),
  expiresInDays: z.coerce.number().int().min(1).max(90).default(7),
});

export const listInviteCodesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  isActive: z
    .string()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined))
    .optional(),
});

// ─── Platform admin: audit & security (Module 5) ───────────────────────────────

export const listPlatformAuditLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  organisationId: z.string().cuid().optional(),
  actor: z.string().max(100).trim().optional(),
  action: z.string().max(100).trim().optional(),
  entityType: z.string().max(100).trim().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

// ─── Platform admin: onboarding pipeline (Module 4) ────────────────────────────

export const updateOnboardingStageSchema = z.object({
  stage: z.coerce.number().int().min(1).max(6),
});

// ─── Platform admin: settings (Module 7) ───────────────────────────────────────

export const updatePlatformSettingsSchema = z
  .object({
    defaultCommissionRate: z.coerce.number().min(0).max(1).optional(),
    maintenanceMode: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' });

// ─── Platform admin: support centre (Module 6) ─────────────────────────────────

export const listSupportTicketsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(TicketStatus).optional(),
  organisationId: z.string().cuid().optional(),
});

export const supportTicketIdParamSchema = z.object({
  id: z.string().cuid({ message: 'Invalid ticket ID' }),
});

export const replySupportTicketSchema = z.object({
  message: z.string().min(1).max(2000),
});

// ─── Exported types ─────────────────────────────────────────────────────────────

export type ListOrganisationsQuery = z.infer<typeof listOrganisationsQuerySchema>;
export type CreateOrganisationInput = z.infer<typeof createOrganisationSchema>;
export type UpdateOrganisationInput = z.infer<typeof updateOrganisationSchema>;
export type DeleteOrganisationInput = z.infer<typeof deleteOrganisationSchema>;
export type UpdateOrgSettingsInput = z.infer<typeof updateOrgSettingsSchema>;
export type ListOrgUsersQuery = z.infer<typeof listOrgUsersQuerySchema>;
export type ChangeOrgUserRoleInput = z.infer<typeof changeOrgUserRoleSchema>;
export type CreateInviteInput = z.infer<typeof createInviteSchema>;
export type ListInviteCodesQuery = z.infer<typeof listInviteCodesQuerySchema>;
export type ListPlatformAuditLogsQuery = z.infer<typeof listPlatformAuditLogsQuerySchema>;
export type UpdatePlatformSettingsInput = z.infer<typeof updatePlatformSettingsSchema>;
export type UpdateOnboardingStageInput = z.infer<typeof updateOnboardingStageSchema>;
export type ListSupportTicketsQuery = z.infer<typeof listSupportTicketsQuerySchema>;
export type ReplySupportTicketInput = z.infer<typeof replySupportTicketSchema>;
