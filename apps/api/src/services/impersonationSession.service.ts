import { redis } from '../config/redis';
import { logger } from '../config/logger';
import { ApiError } from '../utils/ApiError';

/**
 * Minimal Redis surface needed to track impersonation-session liveness. Lets
 * tests pass an in-memory fake (Map-backed) that exercises the exact same
 * branches as production, with no new dependency (no ioredis-mock). `client`
 * is omitted in production, where these functions call the real `redis`
 * singleton directly.
 */
export interface ImpersonationRedisClient {
  setex(key: string, ttlSeconds: number, value: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
  exists(key: string): Promise<number>;
}

function sessionKey(requestId: string): string {
  return `impersonation:session:${requestId}`;
}

async function setLive(key: string, ttlSeconds: number, client?: ImpersonationRedisClient): Promise<void> {
  if (client) {
    await client.setex(key, ttlSeconds, '1');
  } else {
    await redis.setex(key, ttlSeconds, '1');
  }
}

async function clearLive(key: string, client?: ImpersonationRedisClient): Promise<void> {
  if (client) {
    await client.del(key);
  } else {
    await redis.del(key);
  }
}

async function isLive(key: string, client?: ImpersonationRedisClient): Promise<boolean> {
  const count = client ? await client.exists(key) : await redis.exists(key);
  return count === 1;
}

/**
 * Marks an impersonation session as live for `ttlSeconds` — the SAME ttl
 * used to mint the session's JWT (accessRequestService.enter), so the
 * liveness marker and `claim.expiresAt` expire in lockstep with zero extra
 * expiry bookkeeping. Allowed to throw: a Redis failure here fails enter()
 * before the OrgAccessRequest is flipped to ACTIVE, so the request stays
 * APPROVED and retryable rather than stuck ACTIVE with no liveness marker.
 */
export async function markImpersonationSessionActive(
  requestId: string,
  ttlSeconds: number,
  client?: ImpersonationRedisClient
): Promise<void> {
  await setLive(sessionKey(requestId), ttlSeconds, client);
}

/**
 * Clears the liveness marker on exit/revoke, so the session is unusable on
 * the VERY NEXT request regardless of the JWT's remaining lifetime. Errors
 * are logged, not thrown — the OrgAccessRequest status transition (the
 * audit-of-record) must not be blocked by a transient Redis error. DEL on an
 * already-cleared or never-marked key is a harmless no-op.
 */
export async function markImpersonationSessionEnded(
  requestId: string,
  client?: ImpersonationRedisClient
): Promise<void> {
  try {
    await clearLive(sessionKey(requestId), client);
  } catch (err) {
    logger.error('Failed to clear impersonation session liveness marker', {
      requestId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Validates an impersonation session against authoritative server-side
 * state. Fails CLOSED: a Redis error during the liveness check is treated as
 * "not live" -> 401 IMPERSONATION_REVOKED, same as an explicit revoke/exit.
 * Only impersonation-cookie traffic reaches this (see authenticate.ts) —
 * ordinary requests never call this and pay zero added latency.
 */
export async function assertImpersonationSessionLive(
  requestId: string,
  client?: ImpersonationRedisClient
): Promise<void> {
  let live: boolean;
  try {
    live = await isLive(sessionKey(requestId), client);
  } catch (err) {
    logger.error('Impersonation liveness check failed; failing closed', {
      requestId,
      message: err instanceof Error ? err.message : String(err),
    });
    live = false;
  }

  if (!live) {
    throw new ApiError(401, 'Impersonation session has been ended', true, { code: 'IMPERSONATION_REVOKED' });
  }
}
