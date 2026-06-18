import Bull from 'bull';
import { prisma } from '../config/database';
import { notificationService } from '../services/notification.service';
import { createBullClient } from '../config/redis';
import { logger } from '../config/logger';

// ─── Job types ────────────────────────────────────────────────────────────────

export interface AlertNotificationJob {
  type: 'ALERT';
  alertId: string;
  eventId: string;
}

export interface RentReminderJob {
  type: 'RENT_REMINDER';
  leaseId: string;
}

export type NotificationJobData = AlertNotificationJob | RentReminderJob;

// ─── Queues ───────────────────────────────────────────────────────────────────

export const notificationQueue = new Bull<NotificationJobData>('notifications', {
  createClient: createBullClient,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

export const arrearsQueue = new Bull('arrears', { createClient: createBullClient });

// ─── Notification processor ───────────────────────────────────────────────────

notificationQueue.process(async (job) => {
  const data = job.data;

  switch (data.type) {
    case 'ALERT':
      await notificationService.sendAlertNotification(data.alertId, data.eventId);
      break;
    case 'RENT_REMINDER':
      await notificationService.sendRentReminder(data.leaseId);
      break;
  }
});

notificationQueue.on('failed', (job, err) => {
  logger.error('Notification job failed', {
    jobId: job.id,
    type: (job.data as NotificationJobData).type,
    attempt: job.attemptsMade,
    error: err.message,
  });
});

// ─── Arrears sweep processor ──────────────────────────────────────────────────

arrearsQueue.process(async () => {
  const now = new Date();

  const { count } = await prisma.rentRecord.updateMany({
    where: { isPaid: false, isArrears: false, dueDate: { lt: now } },
    data: { isArrears: true },
  });

  if (count === 0) return;

  // Recalculate arrearsGHS on every affected lease
  const overdueRecords = await prisma.rentRecord.findMany({
    where: { isArrears: true, isPaid: false },
    select: { leaseId: true, amountDueGHS: true, amountPaidGHS: true },
  });

  const arrearsByLease = new Map<string, number>();
  for (const r of overdueRecords) {
    const outstanding = r.amountDueGHS - r.amountPaidGHS;
    arrearsByLease.set(r.leaseId, (arrearsByLease.get(r.leaseId) ?? 0) + outstanding);
  }

  await Promise.all(
    Array.from(arrearsByLease.entries()).map(([leaseId, arrearsGHS]) =>
      prisma.leaseAgreement.update({ where: { id: leaseId }, data: { arrearsGHS } })
    )
  );

  logger.info('Arrears sweep complete', { markedCount: count, leasesUpdated: arrearsByLease.size });
});

arrearsQueue.on('failed', (_job, err) => {
  logger.error('Arrears sweep failed', { error: err.message });
});

// ─── Schedule nightly arrears sweep (idempotent via jobId) ────────────────────

arrearsQueue
  .add({}, {
    repeat: { cron: '0 0 * * *' },
    jobId: 'nightly-arrears-sweep',
    removeOnComplete: true,
  })
  .catch((err) =>
    logger.error('Failed to schedule nightly arrears sweep', { error: (err as Error).message })
  );
