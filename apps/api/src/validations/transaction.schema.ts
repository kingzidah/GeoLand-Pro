import { z } from 'zod';
import { TransactionType, TransactionStatus } from '@prisma/client';

// ─── Transaction schemas ──────────────────────────────────────────────────────

export const recordPaymentSchema = z.object({
  leaseId: z.string().cuid({ message: 'Invalid lease ID' }),
  rentRecordId: z.string().cuid({ message: 'Invalid rent record ID' }).optional(),
  type: z.nativeEnum(TransactionType),
  amountGHS: z.number().positive({ message: 'Amount must be positive' }),
  paymentMethod: z.enum(['Mobile Money', 'Bank Transfer', 'Cash']).optional(),
  paymentReference: z.string().max(100).trim().optional(),
  notes: z.string().max(500).trim().optional(),
});

export const updateTransactionStatusSchema = z.object({
  status: z.nativeEnum(TransactionStatus),
});

export const transactionIdParamSchema = z.object({
  id: z.string().cuid({ message: 'Invalid transaction ID' }),
});

export const listTransactionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  leaseId: z.string().cuid().optional(),
  type: z.nativeEnum(TransactionType).optional(),
  status: z.nativeEnum(TransactionStatus).optional(),
});

// ─── Finance schemas ──────────────────────────────────────────────────────────

export const financeSummaryQuerySchema = z.object({
  propertyId: z.string().cuid().optional(),
});

export const listArrearsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  propertyId: z.string().cuid().optional(),
});

export const listCommissionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  isPaid: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export const commissionIdParamSchema = z.object({
  id: z.string().cuid({ message: 'Invalid commission ID' }),
});

// ─── Exported types ───────────────────────────────────────────────────────────

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type UpdateTransactionStatusInput = z.infer<typeof updateTransactionStatusSchema>;
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;
export type FinanceSummaryQuery = z.infer<typeof financeSummaryQuerySchema>;
export type ListArrearsQuery = z.infer<typeof listArrearsQuerySchema>;
export type ListCommissionsQuery = z.infer<typeof listCommissionsQuerySchema>;
