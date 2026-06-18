import { Role } from '@prisma/client';
import { prisma } from '../config/database';

// Africa/Accra is UTC+0 with no DST, so UTC timestamps are Ghana local time.
export const GHANA_TZ = 'Africa/Accra';

let cachedSystemUserId: string | null = null;

/**
 * Background jobs run without an authenticated user, but AuditLog/Document
 * records require an actor. Use the earliest-created SUPER_ADMIN as the
 * system actor for all job-created records.
 */
export async function getSystemUserId(): Promise<string> {
  if (cachedSystemUserId) return cachedSystemUserId;

  const systemUser = await prisma.user.findFirst({
    where: { role: Role.SUPER_ADMIN },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  if (!systemUser) {
    throw new Error('No SUPER_ADMIN user found to act as the system user for background jobs');
  }

  cachedSystemUserId = systemUser.id;
  return cachedSystemUserId;
}

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function isSameUtcDay(a: Date, b: Date): boolean {
  return startOfUtcDay(a).getTime() === startOfUtcDay(b).getTime();
}
