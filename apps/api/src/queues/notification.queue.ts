import { prisma } from '../config/database';
import { notificationService } from '../services/notification.service';
import { logger } from '../config/logger';
import { getEmailProvider } from '../email';
import { processEmailJob } from './notification.queue.email.handler';
import { notificationQueue, arrearsQueue } from './queue.clients';

// Re-export everything external modules (alert.service, routes/index) import from here.
export { notificationQueue, arrearsQueue };
export type {
  NotificationJobData,
  AlertNotificationJob,
  RentReminderJob,
  EmailNotificationJob,
} from './queue.clients';
export type { NotificationDb } from './notification.queue.email.handler';
export { processEmailJob };

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
    case 'EMAIL':
      await processEmailJob(data, getEmailProvider(), prisma);
      break;
  }
});

notificationQueue.on('failed', (job, err) => {
  logger.error('Notification job failed', {
    jobId: job.id,
    type: job.data.type,
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
