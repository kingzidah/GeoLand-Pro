import 'dotenv/config';
import './src/config/env.validation';
import http from 'http';
import app from './src/app';
import { env } from './src/config/env';
import { logger } from './src/config/logger';
import { prisma } from './src/config/database';
import { redis } from './src/config/redis';

const server = http.createServer(app);

async function bootstrap(): Promise<void> {
  try {
    await prisma.$connect();
    logger.info('PostgreSQL connection established');

    await redis.connect();

    server.listen(env.PORT, () => {
      logger.info(`GeoLand Pro API  |  port ${env.PORT}  |  env: ${env.NODE_ENV}`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(async () => {
    await prisma.$disconnect();
    redis.disconnect();
    logger.info('All connections closed. Goodbye.');
    process.exit(0);
  });

  // Force kill if graceful shutdown takes too long
  setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception — process will exit', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled Promise Rejection — process will exit', { reason });
  process.exit(1);
});

bootstrap();
