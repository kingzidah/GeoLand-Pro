import { Role, NotificationChannel, NotificationStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { twilioClient } from '../config/twilio';
import { env } from '../config/env';
import { brand } from '../config/brand.config';
import { logger } from '../config/logger';
import { notificationQueue } from '../queues/queue.clients';
import type { ListNotificationsQuery } from '../validations/alert.schema';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SendOptions {
  to: string;
  body: string;
  channel: NotificationChannel;
  userId?: string;
  leaseId?: string;
}

interface QueueEmailOptions {
  to: string;
  subject: string;
  body: string;
  userId?: string;
  leaseId?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const notificationSelect = {
  id: true,
  channel: true,
  status: true,
  recipient: true,
  subject: true,
  body: true,
  externalId: true,
  sentAt: true,
  failureReason: true,
  retryCount: true,
  leaseId: true,
  createdAt: true,
} as const;

// ─── Service ─────────────────────────────────────────────────────────────────

export const notificationService = {
  /**
   * Create a DB record, attempt Twilio delivery, and update the record status.
   * Re-throws on failure so Bull can handle retries.
   */
  async send(opts: SendOptions): Promise<string> {
    const record = await prisma.notification.create({
      data: {
        recipient: opts.to,
        body: opts.body,
        channel: opts.channel,
        status: NotificationStatus.QUEUED,
        userId: opts.userId ?? null,
        leaseId: opts.leaseId ?? null,
      },
      select: { id: true },
    });

    try {
      let sid: string;

      if (opts.channel === NotificationChannel.SMS) {
        const msg = await twilioClient.messages.create({
          body: opts.body,
          from: env.TWILIO_PHONE_NUMBER,
          to: opts.to,
        });
        sid = msg.sid;
      } else if (opts.channel === NotificationChannel.WHATSAPP) {
        const waTo = opts.to.startsWith('whatsapp:') ? opts.to : `whatsapp:${opts.to}`;
        const msg = await twilioClient.messages.create({
          body: opts.body,
          from: `whatsapp:${env.TWILIO_WHATSAPP_NUMBER}`,
          to: waTo,
        });
        sid = msg.sid;
      } else {
        throw new Error(`Channel ${opts.channel} is not supported`);
      }

      await prisma.notification.update({
        where: { id: record.id },
        data: { status: NotificationStatus.SENT, externalId: sid, sentAt: new Date() },
      });

      logger.info('Notification sent', { notificationId: record.id, channel: opts.channel, sid });
      return record.id;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await prisma.notification.update({
        where: { id: record.id },
        data: {
          status: NotificationStatus.FAILED,
          failureReason: reason,
          retryCount: { increment: 1 },
        },
      });
      logger.error('Notification failed', { notificationId: record.id, channel: opts.channel, reason });
      throw err;
    }
  },

  /**
   * Send geofence crossing alerts to all registered phone numbers.
   * Idempotent: skips if the event is already marked notified.
   */
  async sendAlertNotification(alertId: string, eventId: string): Promise<void> {
    const event = await prisma.alertEvent.findUnique({
      where: { id: eventId },
      select: {
        notified: true,
        triggeredLat: true,
        triggeredLng: true,
        triggeredAt: true,
        deviceId: true,
        alert: {
          select: {
            name: true,
            notifyPhones: true,
            notifyViaWhatsApp: true,
            notifyViaSMS: true,
            plot: { select: { plotNumber: true } },
            property: { select: { name: true } },
          },
        },
      },
    });

    if (!event) {
      logger.warn('Alert event not found for notification dispatch', { eventId });
      return;
    }

    // Idempotency guard — prevents duplicate sends on Bull retry
    if (event.notified) return;

    const { alert } = event;
    const body =
      `${brand.name} Alert: "${alert.name}" triggered!\n` +
      `Plot ${alert.plot.plotNumber} — ${alert.property.name}\n` +
      `Location: ${event.triggeredLat.toFixed(6)}, ${event.triggeredLng.toFixed(6)}\n` +
      `Time: ${event.triggeredAt.toLocaleString('en-GB', { timeZone: 'Africa/Accra' })}` +
      (event.deviceId ? `\nDevice: ${event.deviceId}` : '');

    const sends: Promise<string>[] = [];
    for (const phone of alert.notifyPhones) {
      if (alert.notifyViaSMS) {
        sends.push(this.send({ to: phone, body, channel: NotificationChannel.SMS }));
      }
      if (alert.notifyViaWhatsApp) {
        sends.push(this.send({ to: phone, body, channel: NotificationChannel.WHATSAPP }));
      }
    }

    const results = await Promise.allSettled(sends);
    const allFailed = results.length > 0 && results.every((r) => r.status === 'rejected');

    if (allFailed) {
      const firstErr = (results[0] as PromiseRejectedResult).reason;
      throw firstErr instanceof Error ? firstErr : new Error(String(firstErr));
    }

    await prisma.alertEvent.update({ where: { id: eventId }, data: { notified: true } });
    logger.info('Alert notifications dispatched', {
      eventId,
      alertId,
      phones: alert.notifyPhones.length,
      succeeded: results.filter((r) => r.status === 'fulfilled').length,
    });
  },

  async sendRentReminder(leaseId: string): Promise<void> {
    const lease = await prisma.leaseAgreement.findUnique({
      where: { id: leaseId },
      select: {
        leaseNumber: true,
        tenant: { select: { user: { select: { phone: true, firstName: true } } } },
        rentRecords: {
          where: { isPaid: false, dueDate: { gte: new Date() } },
          orderBy: { dueDate: 'asc' },
          take: 1,
          select: { dueDate: true, amountDueGHS: true },
        },
      },
    });

    if (!lease?.tenant.user.phone) return;
    const nextRecord = lease.rentRecords[0];
    if (!nextRecord) return;

    const dueDate = nextRecord.dueDate.toLocaleDateString('en-GB', { timeZone: 'Africa/Accra' });
    const body =
      `Dear ${lease.tenant.user.firstName}, your rent of GHS ${nextRecord.amountDueGHS.toFixed(2)} ` +
      `for lease ${lease.leaseNumber} is due on ${dueDate}. ` +
      `Please pay on time to avoid arrears. — ${brand.name}`;

    await this.send({ to: lease.tenant.user.phone, body, channel: NotificationChannel.SMS, leaseId });
  },

  async queueEmail(opts: QueueEmailOptions): Promise<string> {
    const record = await prisma.notification.create({
      data: {
        recipient: opts.to,
        subject: opts.subject,
        body: opts.body,
        channel: NotificationChannel.EMAIL,
        status: NotificationStatus.QUEUED,
        userId: opts.userId ?? null,
        leaseId: opts.leaseId ?? null,
      },
      select: { id: true },
    });

    await notificationQueue.add({
      type: 'EMAIL',
      notificationId: record.id,
      to: opts.to,
      subject: opts.subject,
      text: opts.body,
    });

    logger.info('Email queued for delivery', {
      notificationId: record.id,
      to: opts.to,
      subject: opts.subject,
    });

    return record.id;
  },

  async list(userId: string, role: Role, query: ListNotificationsQuery) {
    const skip = (query.page - 1) * query.limit;

    let where: Prisma.NotificationWhereInput;
    if (role === Role.SUPER_ADMIN) {
      where = {};
    } else if (role === Role.TENANT) {
      const profile = await prisma.tenantProfile.findUnique({
        where: { userId },
        select: { leaseAgreements: { select: { id: true } } },
      });
      const leaseIds = profile?.leaseAgreements.map((l) => l.id) ?? [];
      where = {
        OR: [
          { userId },
          ...(leaseIds.length > 0 ? [{ leaseId: { in: leaseIds } }] : []),
        ],
      };
    } else {
      where = { userId };
    }

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        select: notificationSelect,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where }),
    ]);

    return {
      data: notifications,
      meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
    };
  },
};
