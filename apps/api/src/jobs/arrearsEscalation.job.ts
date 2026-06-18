import Bull from 'bull';
import { LeaseStatus, NotificationChannel, DocumentType, Role, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { createBullClient } from '../config/redis';
import { logger } from '../config/logger';
import { brand } from '../config/brand.config';
import { notificationService } from '../services/notification.service';
import { documentService } from '../services/document.service';
import { aiService } from '../services/ai.service';
import { GHANA_TZ, addDays, getSystemUserId, startOfUtcDay } from './shared';

const ESCALATION_THRESHOLD_DAYS = 7;
const DEMAND_LETTER_COOLDOWN_DAYS = 30;

export const arrearsEscalationQueue = new Bull('arrears-escalation', { createClient: createBullClient });

arrearsEscalationQueue.process(async () => {
  const today = startOfUtcDay(new Date());
  const systemUserId = await getSystemUserId();

  const leases = await prisma.leaseAgreement.findMany({
    where: { status: LeaseStatus.ACTIVE, arrearsGHS: { gt: 0 } },
    select: {
      id: true,
      leaseNumber: true,
      arrearsGHS: true,
      tenant: { select: { user: { select: { firstName: true, phone: true } } } },
      rentRecords: {
        orderBy: { dueDate: 'asc' },
        select: {
          dueDate: true,
          amountDueGHS: true,
          amountPaidGHS: true,
          isPaid: true,
          isArrears: true,
          paidAt: true,
        },
      },
    },
  });

  let escalated = 0;

  for (const lease of leases) {
    const overdueRecords = lease.rentRecords.filter((r) => r.isArrears && !r.isPaid);
    const oldestOverdue = overdueRecords[0];
    if (!oldestOverdue) continue;

    const daysOverdue = Math.floor(
      (today.getTime() - startOfUtcDay(oldestOverdue.dueDate).getTime()) / 86_400_000
    );
    if (daysOverdue <= ESCALATION_THRESHOLD_DAYS) continue;

    const recentDemandLetter = await prisma.document.findFirst({
      where: {
        leaseId: lease.id,
        type: DocumentType.ARREARS_NOTICE,
        createdAt: { gte: addDays(today, -DEMAND_LETTER_COOLDOWN_DAYS) },
      },
      select: { id: true },
    });

    if (!recentDemandLetter) {
      try {
        await documentService.generateDemandLetter(lease.id, systemUserId, Role.SUPER_ADMIN, null);
      } catch (err) {
        logger.error('Failed to generate demand letter', {
          leaseId: lease.id,
          error: (err as Error).message,
        });
      }

      const phone = lease.tenant.user.phone;
      if (phone) {
        const body =
          `${brand.whatsappPrefix}\n` +
          `NOTICE: Your rent account is ${daysOverdue} days overdue.\n` +
          `Total outstanding: GHS ${lease.arrearsGHS.toFixed(2)}.\n` +
          `A formal demand letter has been issued.\n` +
          `Please contact us immediately.`;

        try {
          await notificationService.send({
            to: phone,
            body,
            channel: NotificationChannel.WHATSAPP,
            leaseId: lease.id,
          });
        } catch (err) {
          logger.error('Arrears escalation WhatsApp failed', {
            leaseId: lease.id,
            error: (err as Error).message,
          });
        }
      }
    }

    // Update tenant risk score via the AI risk model
    const paidRecords = lease.rentRecords.filter((r) => r.isPaid);
    const onTimePayments = paidRecords.filter((r) => r.paidAt && r.paidAt <= r.dueDate).length;
    const lateRecords = paidRecords.filter((r) => r.paidAt && r.paidAt > r.dueDate);
    const avgDaysLate =
      lateRecords.length > 0
        ? lateRecords.reduce(
            (sum, r) => sum + (r.paidAt!.getTime() - r.dueDate.getTime()) / 86_400_000,
            0
          ) / lateRecords.length
        : 0;
    const partialPayments = lease.rentRecords.filter(
      (r) => r.amountPaidGHS > 0 && r.amountPaidGHS < r.amountDueGHS
    ).length;

    let riskScore = null;
    try {
      riskScore = await aiService.scoreTenantRisk({
        totalPayments: paidRecords.length,
        onTimePayments,
        latePayments: lateRecords.length,
        avgDaysLate,
        partialPayments,
        monthsActive: lease.rentRecords.length,
        currentArrears: lease.arrearsGHS,
      });
    } catch (err) {
      logger.error('Tenant risk scoring failed', { leaseId: lease.id, error: (err as Error).message });
    }

    await prisma.auditLog.create({
      data: {
        userId: systemUserId,
        action: 'ARREARS_ESCALATED',
        entityType: 'LeaseAgreement',
        entityId: lease.id,
        metadata: {
          leaseNumber: lease.leaseNumber,
          daysOverdue,
          arrearsGHS: lease.arrearsGHS,
          riskScore: riskScore ? (JSON.parse(JSON.stringify(riskScore)) as Prisma.JsonObject) : null,
        },
      },
    });

    escalated += 1;
  }

  logger.info('Arrears escalation job complete', { leasesChecked: leases.length, escalated });
});

arrearsEscalationQueue.on('failed', (_job, err) => {
  logger.error('Arrears escalation job failed', { error: err.message });
});

arrearsEscalationQueue
  .add(
    {},
    { repeat: { cron: '0 9 * * *', tz: GHANA_TZ }, jobId: 'daily-arrears-escalation', removeOnComplete: true }
  )
  .catch((err) => logger.error('Failed to schedule arrears escalation job', { error: (err as Error).message }));
