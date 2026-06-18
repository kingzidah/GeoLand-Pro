import Redis from 'ioredis';
import { env } from './env';
import { logger } from './logger';

// Shared Upstash instance only supports db 0 — isolate via key prefix instead of SELECT
//
// Upstash requires TLS. If REDIS_URL is ever misconfigured as redis:// instead of
// rediss://, ioredis sends a plaintext handshake to a TLS-only port and the socket
// is reset with no protocol-level error ("Connection is closed."). Force TLS in
// that case so a scheme typo doesn't fail silently.
const usesTls = env.REDIS_URL.startsWith('rediss://');

export const redis = new Redis(env.REDIS_URL, {
  keyPrefix: 'geolandpro:',
  lazyConnect: true,
  ...(usesTls ? {} : { tls: {} }),
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => {
    if (times > 5) {
      logger.error('Redis: max reconnection attempts reached');
      return null; // Stop retrying
    }
    const delay = Math.min(times * 300, 3000);
    logger.warn(`Redis: reconnecting in ${delay}ms (attempt ${times})`);
    return delay;
  },
  enableReadyCheck: true,
});

redis.on('connect', () => logger.info('Redis connected'));
redis.on('ready', () => logger.info('Redis ready'));
redis.on('error', (err: Error) => logger.error('Redis error', { message: err.message }));
redis.on('close', () => logger.warn('Redis connection closed'));
redis.on('reconnecting', () => logger.warn('Redis reconnecting...'));

// ─── Shared Bull connections ──────────────────────────────────────────────
//
// Classic Bull opens up to 3 connections per queue (client/subscriber/bclient).
// With 7 queues across the app that's ~21 connections — over Upstash's
// free-tier concurrent-connection cap (~20). Pass createBullClient as
// `createClient` to every `new Bull(name, { createClient, ... })` so all
// queues share just 3 extra connections total:
//  - 'client'     -> one shared duplicate, reused across all queues
//  - 'subscriber' -> one shared duplicate, reused across all queues
//  - 'bclient'    -> a fresh duplicate per queue (blocking commands need their own)
//
// 'client' is a duplicate of `redis` rather than `redis` itself: Bull issues an
// `INFO` command on the client at construction time (redis version check), which
// would implicitly connect a lazyConnect `redis` before bootstrap()'s explicit
// `await redis.connect()` runs — ioredis then rejects that call with "Redis is
// already connecting/connected". Using a separate duplicate avoids that race.
//
// Bull computes its own key prefix (this.keyPrefix = opts.prefix || 'bull') and
// passes full key strings into its Lua scripts; ioredis applies keyPrefix on top
// of every key argument (including defineCommand/EVAL keys), so dropping the old
// `prefix: 'geolandpro:bull'` Bull option and relying on these duplicates'
// inherited keyPrefix: 'geolandpro:' + Bull's default prefix 'bull' reproduces
// the exact same wire keys (geolandpro:bull:<queue>:<key>) as before.
//
// 'bclient'/'subscriber' must NOT inherit enableReadyCheck/maxRetriesPerRequest
// from the shared client — Bull throws MISSING_REDIS_OPTS if they do.
let bullClient: Redis | undefined;
let bullSubscriber: Redis | undefined;

export function createBullClient(type: 'client' | 'subscriber' | 'bclient'): Redis {
  switch (type) {
    case 'client':
      if (!bullClient) {
        bullClient = redis.duplicate();
        // Shared across all 7 queues: Bull's per-queue initCallback plus
        // isRedisReady's temporary once-listeners (added while this client is
        // still connecting at module-load time, and self-removed once it's
        // ready) easily exceed Node's default cap of 10 — expected, not a leak.
        bullClient.setMaxListeners(20);
        bullClient.on('error', (err: Error) =>
          logger.error('Redis (bull client) error', { message: err.message })
        );
      }
      return bullClient;
    case 'subscriber':
      if (!bullSubscriber) {
        bullSubscriber = redis.duplicate({ enableReadyCheck: false, maxRetriesPerRequest: null });
        bullSubscriber.setMaxListeners(20);
        bullSubscriber.on('error', (err: Error) =>
          logger.error('Redis (bull subscriber) error', { message: err.message })
        );
      }
      return bullSubscriber;
    case 'bclient':
    default: {
      const bclient = redis.duplicate({ enableReadyCheck: false, maxRetriesPerRequest: null });
      bclient.on('error', (err: Error) =>
        logger.error('Redis (bull bclient) error', { message: err.message })
      );
      return bclient;
    }
  }
}
