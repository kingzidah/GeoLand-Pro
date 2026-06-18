import Bull from 'bull';
import { createBullClient } from '../config/redis';

// ─── Job type definitions ─────────────────────────────────────────────────────
// Defined here (not in notification.queue.ts) so both the queue processor and
// notification.service.ts can import them without creating a circular dependency.

export interface AlertNotificationJob {
  type: 'ALERT';
  alertId: string;
  eventId: string;
}

export interface RentReminderJob {
  type: 'RENT_REMINDER';
  leaseId: string;
}

export interface EmailNotificationJob {
  type: 'EMAIL';
  notificationId: string;
  to: string;
  subject: string;
  text: string;
}

export type NotificationJobData = AlertNotificationJob | RentReminderJob | EmailNotificationJob;

// ─── Queue instances ──────────────────────────────────────────────────────────

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
