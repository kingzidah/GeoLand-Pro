import { z } from 'zod';
import { LeaseStatus } from '@prisma/client';

// ─── Shared params ────────────────────────────────────────────────────────────

export const userIdParamSchema = z.object({
  userId: z.string().cuid({ message: 'Invalid user ID' }),
});

export const listTenantsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
});

// ─── Tenant KYC profile ───────────────────────────────────────────────────────

const emergencyContactSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  phone: z
    .string()
    .regex(/^\+?[0-9]{8,20}$/, 'Emergency contact phone must be 8–20 digits'),
  relationship: z.string().min(2).max(50).trim(),
});

export const createTenantProfileSchema = z.object({
  nationalIdType: z.enum(['Ghana Card', 'Passport', 'Voter ID']),
  nationalIdNumber: z.string().min(5).max(50).trim(),
  dateOfBirth: z.coerce.date().optional(),
  occupation: z.string().max(100).trim().optional(),
  emergencyContact: emergencyContactSchema.optional(),
});

export const updateTenantProfileSchema = createTenantProfileSchema.partial();

// ─── Lease schemas ────────────────────────────────────────────────────────────

export const createLeaseSchema = z
  .object({
    plotId: z.string().cuid({ message: 'Invalid plot ID' }),
    tenantUserId: z.string().cuid({ message: 'Invalid tenant user ID' }),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    monthlyRentGHS: z.number().positive({ message: 'Monthly rent must be positive' }),
    depositAmountGHS: z.number().min(0).default(0),
    notes: z.string().max(1000).trim().optional(),
  })
  .refine((d) => d.endDate > d.startDate, {
    message: 'End date must be after start date',
    path: ['endDate'],
  });

export const updateLeaseSchema = z
  .object({
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    monthlyRentGHS: z.number().positive().optional(),
    depositAmountGHS: z.number().min(0).optional(),
    notes: z.string().max(1000).trim().optional(),
  })
  .refine(
    (d) => {
      if (d.startDate && d.endDate) return d.endDate > d.startDate;
      return true;
    },
    { message: 'End date must be after start date', path: ['endDate'] }
  );

export const signLeaseSchema = z.object({
  signatureUrl: z.string().url({ message: 'Signature URL must be a valid URL' }),
});

export const terminateLeaseSchema = z.object({
  terminationReason: z
    .string()
    .min(10, 'Termination reason must be at least 10 characters')
    .max(500)
    .trim(),
});

export const leaseIdParamSchema = z.object({
  id: z.string().cuid({ message: 'Invalid lease ID' }),
});

export const listLeasesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(LeaseStatus).optional(),
  plotId: z.string().cuid().optional(),
});

// ─── Exported types ───────────────────────────────────────────────────────────

export type CreateTenantProfileInput = z.infer<typeof createTenantProfileSchema>;
export type UpdateTenantProfileInput = z.infer<typeof updateTenantProfileSchema>;
export type CreateLeaseInput = z.infer<typeof createLeaseSchema>;
export type UpdateLeaseInput = z.infer<typeof updateLeaseSchema>;
export type SignLeaseInput = z.infer<typeof signLeaseSchema>;
export type TerminateLeaseInput = z.infer<typeof terminateLeaseSchema>;
export type ListLeasesQuery = z.infer<typeof listLeasesQuerySchema>;
export type ListTenantsQuery = z.infer<typeof listTenantsQuerySchema>;
