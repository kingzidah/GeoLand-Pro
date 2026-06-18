import { logger } from '../config/logger';

// Each job module schedules its own idempotent Bull repeat job as a
// side effect of being imported (jobId-based, so re-imports are no-ops).
import { rentReminderQueue } from './rentReminder.job';
import { arrearsEscalationQueue } from './arrearsEscalation.job';
import { leaseExpiryQueue } from './leaseExpiry.job';
import { commissionCalculationQueue } from './commissionCalculation.job';
// satelliteFetch.job triggers changeDetection.job once its sweep completes.
import { satelliteFetchQueue } from './satelliteFetch.job';

export interface JobRegistryEntry {
  name: string;
  schedule: string;
  description: string;
  queue: { name: string; client: { status: string } };
}

// Master Control — Module 3 Platform Health reads this registry to report
// background job schedules and live Redis connection status per queue.
export const JOB_REGISTRY: JobRegistryEntry[] = [
  {
    name: 'Rent Reminder',
    schedule: 'Daily 08:00 Africa/Accra',
    description: 'WhatsApp reminders for rent due in 30, 7, or 1 day(s).',
    queue: rentReminderQueue,
  },
  {
    name: 'Arrears Escalation',
    schedule: 'Daily 09:00 Africa/Accra',
    description: 'Escalates overdue rent past the arrears threshold and sends demand letters.',
    queue: arrearsEscalationQueue,
  },
  {
    name: 'Lease Expiry',
    schedule: 'Daily 08:30 Africa/Accra',
    description: 'Notifies tenants and managers of leases ending in 90, 30, or 7 days.',
    queue: leaseExpiryQueue,
  },
  {
    name: 'Commission Calculation',
    schedule: 'Monthly — 1st at 00:01 Africa/Accra',
    description: 'Calculates monthly platform commission on settled transactions.',
    queue: commissionCalculationQueue,
  },
  {
    name: 'Satellite Fetch',
    schedule: 'Every 5 days at 02:00 Africa/Accra',
    description: 'Fetches satellite imagery for properties and triggers change detection.',
    queue: satelliteFetchQueue,
  },
];

export function startAllJobs(): void {
  logger.info('Background jobs initialised', {
    jobs: JOB_REGISTRY.map((job) => `${job.name} — ${job.schedule}`),
  });
}

/** Live status for each registered job's underlying Redis-backed queue. */
export function getJobStatuses() {
  return JOB_REGISTRY.map(({ queue, ...job }) => ({
    ...job,
    queueName: queue.name,
    status: queue.client.status,
  }));
}
