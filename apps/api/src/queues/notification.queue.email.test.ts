import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { processEmailJob } from './notification.queue.email.handler';
import type { NotificationDb } from './notification.queue.email.handler';
import type { EmailProvider } from '../email/EmailProvider';
import type { EmailNotificationJob } from './queue.clients';

// ─── Fakes ────────────────────────────────────────────────────────────────────

function createFakeDb(): { db: NotificationDb; updates: any[] } {
  const updates: any[] = [];
  const db: NotificationDb = {
    notification: {
      async update(args: any) {
        updates.push(args);
        return {};
      },
    },
  };
  return { db, updates };
}

function createMockProvider(shouldFail: boolean): EmailProvider {
  return {
    async send() {
      if (shouldFail) throw new Error('SMTP connection refused');
    },
  };
}

const job: EmailNotificationJob = {
  type: 'EMAIL',
  notificationId: 'notif-abc123',
  to: 'tenant@example.com',
  subject: '[GLP] Reset your password',
  text: 'Hi Alice,\n\nClick the link below to reset.',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EMAIL queue processor', () => {
  test('marks notification SENT when provider succeeds', async () => {
    const { db, updates } = createFakeDb();
    const provider = createMockProvider(false);

    await processEmailJob(job, provider, db);

    assert.equal(updates.length, 1, 'exactly one DB update');
    assert.equal(updates[0].where.id, job.notificationId);
    assert.equal(updates[0].data.status, 'SENT');
    assert.ok(updates[0].data.sentAt instanceof Date, 'sentAt is a Date');
  });

  test('marks notification FAILED when provider throws', async () => {
    const { db, updates } = createFakeDb();
    const provider = createMockProvider(true);

    await assert.rejects(
      () => processEmailJob(job, provider, db),
      /SMTP connection refused/,
    );

    assert.equal(updates.length, 1, 'exactly one DB update');
    assert.equal(updates[0].where.id, job.notificationId);
    assert.equal(updates[0].data.status, 'FAILED');
    assert.equal(updates[0].data.failureReason, 'SMTP connection refused');
    assert.deepEqual(updates[0].data.retryCount, { increment: 1 });
  });

  test('re-throws provider error so Bull can schedule retries', async () => {
    const { db } = createFakeDb();
    const provider = createMockProvider(true);

    await assert.rejects(() => processEmailJob(job, provider, db), Error);
  });
});
