import Bull from 'bull';
import { LeaseStatus, NotificationChannel, Role } from '@prisma/client';
import { prisma } from '../config/database';
import { createBullClient } from '../config/redis';
import { logger } from '../config/logger';
import { brand } from '../config/brand.config';
import { notificationService } from '../services/notification.service';
import { GHANA_TZ, addDays, isSameUtcDay, startOfUtcDay } from './shared';

// Notify at 90, 30, and 7 days before a lease's end date.
const EXPIRY_MILESTONES = [90, 30, 7] as const;

export const leaseExpiryQueue = new Bull('lease-expiry', { createClient: createBullClient });

leaseExpiryQueue.process(async () => {
  const today = startOfUtcDay(new Date());

  const leases = await prisma.leaseAgreement.findMany({
    where: { status: LeaseStatus.ACTIVE },
    select: {
      id: true,
      leaseNumber: true,
      endDate: true,
      tenant: {
        select: { user: { select: { firstName: true, lastName: true, phone: true } } },
      },
      plot: {
        select: {
          plotNumber: true,
          property: {
            select: {
              name: true,
              managers: { select: { id: true, email: true, role: true } },
            },
          },
        },
      },
    },
  });

  let notified = 0;

  for (const lease of leases) {
    const milestone = EXPIRY_MILESTONES.find((days) => isSameUtcDay(lease.endDate, addDays(today, days)));
    if (!milestone) continue;

    const { managers } = lease.plot.property;
    const managerUsers = managers.filter((m) => m.role === Role.MANAGER);
    const adminUsers = managers.filter((m) => m.role === Role.ADMIN);
    const tenant = lease.tenant.user;
    const endDateLabel = lease.endDate.toLocaleDateString('en-GB', { timeZone: GHANA_TZ });

    if (milestone === 90) {
      for (const manager of managerUsers) {
        await notificationService.queueEmail({
          to: manager.email,
          subject: `Lease ${lease.leaseNumber} expires in 90 days`,
          body:
            `Lease ${lease.leaseNumber} for Plot ${lease.plot.plotNumber} at ${lease.plot.property.name} ` +
            `expires on ${endDateLabel} (90 days from today). Please plan ahead for renewal or vacating.`,
          userId: manager.id,
          leaseId: lease.id,
        });
        notified += 1;
      }
    } else if (milestone === 30) {
      for (const manager of managerUsers) {
        await notificationService.queueEmail({
          to: manager.email,
          subject: `Lease ${lease.leaseNumber} expires in 30 days`,
          body:
            `Lease ${lease.leaseNumber} for Plot ${lease.plot.plotNumber} at ${lease.plot.property.name} ` +
            `expires on ${endDateLabel} (30 days from today). Please follow up with the tenant regarding renewal.`,
          userId: manager.id,
          leaseId: lease.id,
        });
        notified += 1;
      }

      if (tenant.phone) {
        const body =
          `${brand.whatsappPrefix}\n` +
          `Dear ${tenant.firstName}, your lease ${lease.leaseNumber} for Plot ${lease.plot.plotNumber} ` +
          `expires in 30 days on ${endDateLabel}.\nPlease contact us to discuss renewal.`;

        await notificationService.send({
          to: tenant.phone,
          body,
          channel: NotificationChannel.WHATSAPP,
          leaseId: lease.id,
        });
        notified += 1;
      }
    } else {
      // milestone === 7
      for (const recipient of [...adminUsers, ...managerUsers]) {
        await notificationService.queueEmail({
          to: recipient.email,
          subject: `URGENT: Lease ${lease.leaseNumber} expires in 7 days`,
          body:
            `Lease ${lease.leaseNumber} for Plot ${lease.plot.plotNumber} at ${lease.plot.property.name} ` +
            `expires on ${endDateLabel} (7 days from today). ` +
            `Immediate action required — contact the tenant regarding renewal or vacating.`,
          userId: recipient.id,
          leaseId: lease.id,
        });
        notified += 1;
      }

      if (tenant.phone) {
        const body =
          `${brand.whatsappPrefix}\n` +
          `Dear ${tenant.firstName}, your lease ${lease.leaseNumber} for Plot ${lease.plot.plotNumber} ` +
          `expires in 7 days on ${endDateLabel}.\n` +
          `To renew, please contact ${brand.companyName} (${brand.supportEmail}` +
          `${brand.phone ? `, ${brand.phone}` : ''}) before your lease ends.`;

        await notificationService.send({
          to: tenant.phone,
          body,
          channel: NotificationChannel.WHATSAPP,
          leaseId: lease.id,
        });
        notified += 1;
      }
    }
  }

  logger.info('Lease expiry job complete', { leasesChecked: leases.length, notificationsSent: notified });
});

leaseExpiryQueue.on('failed', (_job, err) => {
  logger.error('Lease expiry job failed', { error: err.message });
});

leaseExpiryQueue
  .add(
    {},
    { repeat: { cron: '30 8 * * *', tz: GHANA_TZ }, jobId: 'daily-lease-expiry', removeOnComplete: true }
  )
  .catch((err) => logger.error('Failed to schedule lease expiry job', { error: (err as Error).message }));
