import Bull from 'bull';
import { TransactionStatus, Role } from '@prisma/client';
import { prisma } from '../config/database';
import { createBullClient } from '../config/redis';
import { logger } from '../config/logger';
import { notificationService } from '../services/notification.service';
import { GHANA_TZ, getSystemUserId } from './shared';

// Monthly platform commission rate, separate from the per-transaction
// COMMISSION_RATE_PERCENT applied at payment time (transaction.service.ts).
const MONTHLY_COMMISSION_RATE = 0.1;

export const commissionCalculationQueue = new Bull('commission-calculation', {
  createClient: createBullClient,
});

commissionCalculationQueue.process(async () => {
  const systemUserId = await getSystemUserId();
  const now = new Date();

  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodLabel = `${periodStart.getUTCFullYear()}-${String(periodStart.getUTCMonth() + 1).padStart(2, '0')}`;

  const properties = await prisma.property.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  const summaryLines: string[] = [];
  let totalRevenueAllProperties = 0;
  let totalCommissionAllProperties = 0;

  for (const property of properties) {
    const transactions = await prisma.transaction.findMany({
      where: {
        status: TransactionStatus.COMPLETED,
        paidAt: { gte: periodStart, lt: periodEnd },
        rentRecord: { lease: { plot: { propertyId: property.id } } },
      },
      select: { id: true, amountGHS: true, commission: { select: { id: true } } },
    });

    const totalRevenueGHS = transactions.reduce((sum, t) => sum + t.amountGHS, 0);
    const commissionGHS = totalRevenueGHS * MONTHLY_COMMISSION_RATE;

    // Only create Commission rows for transactions that don't already have
    // one (Commission.transactionId is unique — the per-payment ~4% rate is
    // created at transaction completion time).
    const transactionsWithoutCommission = transactions.filter((t) => !t.commission);
    await Promise.all(
      transactionsWithoutCommission.map((t) =>
        prisma.commission.create({
          data: {
            transactionId: t.id,
            ratePercent: MONTHLY_COMMISSION_RATE * 100,
            amountGHS: t.amountGHS * MONTHLY_COMMISSION_RATE,
          },
        })
      )
    );

    await prisma.auditLog.create({
      data: {
        userId: systemUserId,
        action: 'MONTHLY_COMMISSION_CALCULATED',
        entityType: 'Property',
        entityId: property.id,
        metadata: {
          period: periodLabel,
          totalRevenueGHS,
          commissionGHS,
          transactionCount: transactions.length,
          newCommissionRecords: transactionsWithoutCommission.length,
        },
      },
    });

    totalRevenueAllProperties += totalRevenueGHS;
    totalCommissionAllProperties += commissionGHS;

    if (transactions.length > 0) {
      summaryLines.push(
        `${property.name}: revenue GHS ${totalRevenueGHS.toFixed(2)}, commission (10%) GHS ${commissionGHS.toFixed(2)} ` +
          `across ${transactions.length} transaction(s)`
      );
    }
  }

  const superAdmins = await prisma.user.findMany({
    where: { role: Role.SUPER_ADMIN },
    select: { id: true, email: true },
  });

  const emailBody =
    `Monthly commission summary for ${periodLabel}\n\n` +
    (summaryLines.length > 0 ? summaryLines.join('\n') : 'No completed transactions recorded for this period.') +
    `\n\nTotal revenue: GHS ${totalRevenueAllProperties.toFixed(2)}` +
    `\nTotal commission (10%): GHS ${totalCommissionAllProperties.toFixed(2)}`;

  for (const admin of superAdmins) {
    await notificationService.queueEmail({
      to: admin.email,
      subject: `Monthly Commission Summary — ${periodLabel}`,
      body: emailBody,
      userId: admin.id,
    });
  }

  logger.info('Commission calculation job complete', {
    period: periodLabel,
    propertiesProcessed: properties.length,
    totalRevenueAllProperties,
    totalCommissionAllProperties,
  });
});

commissionCalculationQueue.on('failed', (_job, err) => {
  logger.error('Commission calculation job failed', { error: err.message });
});

commissionCalculationQueue
  .add(
    {},
    {
      repeat: { cron: '1 0 1 * *', tz: GHANA_TZ },
      jobId: 'monthly-commission-calculation',
      removeOnComplete: true,
    }
  )
  .catch((err) => logger.error('Failed to schedule commission calculation job', { error: (err as Error).message }));
