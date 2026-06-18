import Bull from 'bull';
import { LeaseStatus, NotificationChannel } from '@prisma/client';
import { prisma } from '../config/database';
import { createBullClient } from '../config/redis';
import { logger } from '../config/logger';
import { brand } from '../config/brand.config';
import { notificationService } from '../services/notification.service';
import { GHANA_TZ, addDays, isSameUtcDay, startOfUtcDay } from './shared';

// Send a WhatsApp reminder when the next unpaid rent record falls due in
// exactly 30, 7, or 1 day(s).
const REMINDER_DAYS = [30, 7, 1] as const;

export const rentReminderQueue = new Bull('rent-reminder', { createClient: createBullClient });

rentReminderQueue.process(async () => {
  const today = startOfUtcDay(new Date());

  const leases = await prisma.leaseAgreement.findMany({
    where: { status: LeaseStatus.ACTIVE },
    select: {
      id: true,
      plot: { select: { plotNumber: true } },
      tenant: {
        select: { user: { select: { firstName: true, lastName: true, phone: true } } },
      },
      rentRecords: {
        where: { isPaid: false, dueDate: { gte: today } },
        orderBy: { dueDate: 'asc' },
        take: 1,
        select: { dueDate: true, amountDueGHS: true },
      },
    },
  });

  let remindersSent = 0;

  for (const lease of leases) {
    const nextRecord = lease.rentRecords[0];
    if (!nextRecord) continue;

    const phone = lease.tenant.user.phone;
    if (!phone) continue;

    const daysUntilDue = REMINDER_DAYS.find((days) => isSameUtcDay(nextRecord.dueDate, addDays(today, days)));
    if (daysUntilDue === undefined) continue;

    const body =
      `${brand.whatsappPrefix}\n` +
      `Dear ${lease.tenant.user.firstName}, your rent of GHS ${nextRecord.amountDueGHS.toFixed(2)} ` +
      `for Plot ${lease.plot.plotNumber} is due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}.\n` +
      `Please ensure payment is made on time.`;

    try {
      await notificationService.send({
        to: phone,
        body,
        channel: NotificationChannel.WHATSAPP,
        leaseId: lease.id,
      });
      remindersSent += 1;
    } catch (err) {
      logger.error('Rent reminder send failed', {
        leaseId: lease.id,
        daysUntilDue,
        error: (err as Error).message,
      });
    }
  }

  logger.info('Rent reminder job complete', { leasesChecked: leases.length, remindersSent });
});

rentReminderQueue.on('failed', (_job, err) => {
  logger.error('Rent reminder job failed', { error: err.message });
});

rentReminderQueue
  .add(
    {},
    { repeat: { cron: '0 8 * * *', tz: GHANA_TZ }, jobId: 'daily-rent-reminder', removeOnComplete: true }
  )
  .catch((err) => logger.error('Failed to schedule rent reminder job', { error: (err as Error).message }));
