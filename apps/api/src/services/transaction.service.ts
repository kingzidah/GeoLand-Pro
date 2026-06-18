import { Role, TransactionType, TransactionStatus, LeaseStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';
import { logger } from '../config/logger';
import type {
  RecordPaymentInput,
  UpdateTransactionStatusInput,
  ListTransactionsQuery,
} from '../validations/transaction.schema';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// NOTE: Transaction.leaseId has no @relation in schema — it is a plain stored field.
// All filtering goes through leaseId directly, not through a Prisma relation.

const transactionSelect = {
  id: true,
  rentRecordId: true,
  leaseId: true,
  type: true,
  status: true,
  amountGHS: true,
  paymentMethod: true,
  paymentReference: true,
  paidAt: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  commission: {
    select: {
      id: true,
      ratePercent: true,
      amountGHS: true,
      isPaid: true,
      paidAt: true,
    },
  },
} as const;

async function getAccessibleLeaseIds(
  userId: string,
  role: Role,
  organisationId: string | null
): Promise<string[] | undefined> {
  if (role === Role.SUPER_ADMIN) {
    if (!organisationId) return undefined; // platform admin = no filter

    const leases = await prisma.leaseAgreement.findMany({
      where: { plot: { property: { organisationId } } },
      select: { id: true },
    });
    return leases.map((l) => l.id);
  }

  const properties = await prisma.property.findMany({
    where: {
      managers: { some: { id: userId } },
      isActive: true,
      ...(organisationId && { organisationId }),
    },
    select: { id: true },
  });

  const propertyIds = properties.map((p) => p.id);

  if (propertyIds.length === 0) return [];

  const leases = await prisma.leaseAgreement.findMany({
    where: { plot: { propertyId: { in: propertyIds } } },
    select: { id: true },
  });

  return leases.map((l) => l.id);
}

async function assertLeaseAccess(
  leaseId: string,
  userId: string,
  role: Role,
  organisationId: string | null
) {
  const leaseIds = await getAccessibleLeaseIds(userId, role, organisationId);
  if (leaseIds && !leaseIds.includes(leaseId)) throw ApiError.forbidden();
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const transactionService = {
  async list(userId: string, role: Role, query: ListTransactionsQuery, organisationId: string | null) {
    const skip = (query.page - 1) * query.limit;
    const accessibleLeaseIds = await getAccessibleLeaseIds(userId, role, organisationId);

    const where: Prisma.TransactionWhereInput = {
      ...(accessibleLeaseIds !== undefined && { leaseId: { in: accessibleLeaseIds } }),
      ...(query.leaseId && { leaseId: query.leaseId }),
      ...(query.type && { type: query.type }),
      ...(query.status && { status: query.status }),
    };

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        select: transactionSelect,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.transaction.count({ where }),
    ]);

    return {
      data: transactions,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },

  async getById(transactionId: string, userId: string, role: Role, organisationId: string | null) {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      select: transactionSelect,
    });

    if (!transaction) throw ApiError.notFound('Transaction');

    if (transaction.leaseId) {
      await assertLeaseAccess(transaction.leaseId, userId, role, organisationId);
    }

    return transaction;
  },

  async recordPayment(userId: string, role: Role, data: RecordPaymentInput, organisationId: string | null) {
    // ── 1. Fetch + validate the lease ──────────────────────────────────────
    const lease = await prisma.leaseAgreement.findUnique({
      where: { id: data.leaseId },
      select: {
        id: true,
        status: true,
        plot: {
          select: {
            property: {
              select: { organisationId: true, managers: { select: { id: true } } },
            },
          },
        },
      },
    });

    if (!lease) throw ApiError.notFound('Lease');

    if (organisationId && lease.plot.property.organisationId !== organisationId) {
      throw ApiError.notFound('Lease');
    }

    if (role !== Role.SUPER_ADMIN) {
      const isAssigned = lease.plot.property.managers.some((m) => m.id === userId);
      if (!isAssigned) throw ApiError.forbidden();
    }

    if (lease.status !== LeaseStatus.ACTIVE) {
      throw ApiError.badRequest('Payments can only be recorded against active leases');
    }

    // ── 2. Rent record validation (RENT_PAYMENT / ARREARS_PAYMENT) ─────────
    let rentRecord: {
      id: string;
      leaseId: string;
      amountDueGHS: number;
      amountPaidGHS: number;
      isPaid: boolean;
    } | null = null;

    if (
      data.type === TransactionType.RENT_PAYMENT ||
      data.type === TransactionType.ARREARS_PAYMENT
    ) {
      if (!data.rentRecordId) {
        throw ApiError.badRequest(
          'rentRecordId is required for RENT_PAYMENT and ARREARS_PAYMENT'
        );
      }

      rentRecord = await prisma.rentRecord.findUnique({
        where: { id: data.rentRecordId },
        select: { id: true, leaseId: true, amountDueGHS: true, amountPaidGHS: true, isPaid: true },
      });

      if (!rentRecord) throw ApiError.notFound('Rent record');

      if (rentRecord.leaseId !== data.leaseId) {
        throw ApiError.badRequest('Rent record does not belong to this lease');
      }

      if (rentRecord.isPaid) {
        throw ApiError.conflict('This rent period is already fully paid');
      }

      const outstanding = rentRecord.amountDueGHS - rentRecord.amountPaidGHS;
      if (data.amountGHS > outstanding + 0.001) {
        throw ApiError.badRequest(
          `Payment GHS ${data.amountGHS.toFixed(2)} exceeds outstanding balance of GHS ${outstanding.toFixed(2)}`
        );
      }
    }

    // ── 3. Atomic transaction ──────────────────────────────────────────────
    const newTransaction = await prisma.$transaction(async (tx) => {
      const created = await tx.transaction.create({
        data: {
          leaseId: data.leaseId,
          rentRecordId: data.rentRecordId ?? null,
          type: data.type,
          status: TransactionStatus.COMPLETED,
          amountGHS: data.amountGHS,
          paymentMethod: data.paymentMethod ?? null,
          paymentReference: data.paymentReference ?? null,
          notes: data.notes ?? null,
          paidAt: new Date(),
        },
        select: transactionSelect,
      });

      // Update rent record payment progress
      if (rentRecord) {
        const newAmountPaid = rentRecord.amountPaidGHS + data.amountGHS;
        const isPaid = newAmountPaid >= rentRecord.amountDueGHS - 0.001;

        await tx.rentRecord.update({
          where: { id: rentRecord.id },
          data: {
            amountPaidGHS: newAmountPaid,
            isPaid,
            isArrears: false,
            paidAt: isPaid ? new Date() : null,
          },
        });
      }

      // Recalculate lease-level totals from all rent records
      const allRecords = await tx.rentRecord.findMany({
        where: { leaseId: data.leaseId },
        select: { amountDueGHS: true, amountPaidGHS: true, isPaid: true, dueDate: true },
      });

      const now = new Date();
      const totalPaidGHS = allRecords.reduce((sum, r) => sum + r.amountPaidGHS, 0);
      const arrearsGHS = allRecords.reduce((sum, r) => {
        if (!r.isPaid && r.dueDate < now) {
          return sum + (r.amountDueGHS - r.amountPaidGHS);
        }
        return sum;
      }, 0);

      await tx.leaseAgreement.update({
        where: { id: data.leaseId },
        data: {
          totalPaidGHS: parseFloat(totalPaidGHS.toFixed(2)),
          arrearsGHS: parseFloat(arrearsGHS.toFixed(2)),
          lastPaymentDate: new Date(),
        },
      });

      // Commission is earned on all payment types except REFUND
      if (data.type !== TransactionType.REFUND) {
        const commissionAmount = parseFloat(
          ((data.amountGHS * env.COMMISSION_RATE_PERCENT) / 100).toFixed(2)
        );
        await tx.commission.create({
          data: {
            transactionId: created.id,
            ratePercent: env.COMMISSION_RATE_PERCENT,
            amountGHS: commissionAmount,
          },
        });
      }

      return created;
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'PAYMENT_RECORDED',
        entityType: 'Transaction',
        entityId: newTransaction.id,
        metadata: {
          leaseId: data.leaseId,
          type: data.type,
          amountGHS: data.amountGHS,
        },
      },
    });

    logger.info('Payment recorded', {
      transactionId: newTransaction.id,
      leaseId: data.leaseId,
      type: data.type,
      amountGHS: data.amountGHS,
      by: userId,
    });

    // Re-fetch with commission populated (just created inside tx)
    return prisma.transaction.findUnique({
      where: { id: newTransaction.id },
      select: transactionSelect,
    });
  },

  async updateStatus(
    transactionId: string,
    userId: string,
    role: Role,
    data: UpdateTransactionStatusInput,
    organisationId: string | null
  ) {
    const transaction = await this.getById(transactionId, userId, role, organisationId);

    const validTransitions: Partial<Record<TransactionStatus, TransactionStatus[]>> = {
      [TransactionStatus.PENDING]: [TransactionStatus.COMPLETED, TransactionStatus.FAILED],
      [TransactionStatus.COMPLETED]: [TransactionStatus.REVERSED],
    };

    const allowed = validTransitions[transaction.status as TransactionStatus] ?? [];
    if (!allowed.includes(data.status)) {
      throw ApiError.badRequest(
        `Cannot transition from ${transaction.status} to ${data.status}`
      );
    }

    const updated = await prisma.transaction.update({
      where: { id: transactionId },
      data: { status: data.status },
      select: transactionSelect,
    });

    logger.info('Transaction status updated', {
      transactionId,
      from: transaction.status,
      to: data.status,
      by: userId,
    });

    return updated;
  },
};
