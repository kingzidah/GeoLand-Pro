import { NotificationStatus } from '@prisma/client';
import { logger } from '../config/logger';
import type { EmailProvider } from '../email/EmailProvider';
import type { EmailNotificationJob } from './queue.clients';

// Narrow injectable DB interface — keeps tests free of a real Prisma client.
export interface NotificationDb {
  notification: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update(args: any): Promise<any>;
  };
}

export async function processEmailJob(
  data: EmailNotificationJob,
  provider: EmailProvider,
  db: NotificationDb,
): Promise<void> {
  try {
    await provider.send({ to: data.to, subject: data.subject, text: data.text });
    await db.notification.update({
      where: { id: data.notificationId },
      data: { status: NotificationStatus.SENT, sentAt: new Date() },
    });
    logger.info('Email notification sent', { notificationId: data.notificationId });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await db.notification.update({
      where: { id: data.notificationId },
      data: {
        status: NotificationStatus.FAILED,
        failureReason: reason,
        retryCount: { increment: 1 },
      },
    });
    logger.error('Email notification failed', { notificationId: data.notificationId, reason });
    throw err;
  }
}
