import { prisma } from '../config/database';
import { redis } from '../config/redis';
import { getJobStatuses } from '../jobs';

export const platformHealthService = {
  async getSummary() {
    const [databaseStatus, redisStatus] = await Promise.all([
      prisma
        .$queryRaw`SELECT 1`
        .then(() => 'connected' as const)
        .catch(() => 'disconnected' as const),
      redis
        .ping()
        .then(() => 'connected' as const)
        .catch(() => 'disconnected' as const),
    ]);

    return {
      api: {
        status: 'ok' as const,
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      },
      database: { status: databaseStatus },
      redis: { status: redisStatus },
      jobs: getJobStatuses(),
    };
  },
};
