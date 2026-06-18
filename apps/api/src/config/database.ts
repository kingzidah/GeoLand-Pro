import { PrismaClient, Prisma } from '@prisma/client';
import { env } from './env';
import { logger } from './logger';

// Prevent multiple PrismaClient instances in development (hot-reload)
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

// Explicit U generic tells TypeScript which $on event types are available.
// Without it, Prisma 5 infers U=never when the log array is a variable.
type LoggingPrismaClient = PrismaClient<
  Prisma.PrismaClientOptions,
  'query' | 'warn' | 'error'
>;

const createPrismaClient = (): LoggingPrismaClient =>
  new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'error' },
    ],
  }) as LoggingPrismaClient;

const loggingPrisma = (globalForPrisma.prisma as LoggingPrismaClient | undefined) ?? createPrismaClient();

loggingPrisma.$on('query', (e) => {
  if (env.NODE_ENV === 'development') {
    logger.debug('DB Query', { query: e.query, params: e.params, duration: `${e.duration}ms` });
  }
});

if (env.NODE_ENV === 'development') {
  globalForPrisma.prisma = loggingPrisma as unknown as PrismaClient;
}

loggingPrisma.$on('warn',  (e) => logger.warn('Prisma warning', { message: e.message }));
loggingPrisma.$on('error', (e) => logger.error('Prisma error',  { message: e.message }));

export const prisma: PrismaClient = loggingPrisma as unknown as PrismaClient;
