import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  markImpersonationSessionActive,
  markImpersonationSessionEnded,
  assertImpersonationSessionLive,
  type ImpersonationRedisClient,
} from './impersonationSession.service';
import { ApiError } from '../utils/ApiError';

// ─── Fix 1: Redis-backed liveness marker ───────────────────────────────────
// In-memory fake exercising the exact same branches as the real `redis`
// singleton, with no new dependency (no ioredis-mock).

function createFakeRedis(): ImpersonationRedisClient {
  const store = new Map<string, string>();
  return {
    async setex(key, ttlSeconds, value) {
      if (ttlSeconds <= 0) {
        // Mirrors a marker whose TTL has already elapsed by the time of the
        // next request — exists() must report it gone, exactly like an
        // explicit revoke/exit DEL.
        store.delete(key);
      } else {
        store.set(key, value);
      }
      return 'OK';
    },
    async del(key) {
      return store.delete(key) ? 1 : 0;
    },
    async exists(key) {
      return store.has(key) ? 1 : 0;
    },
  };
}

async function expectRevoked(fn: () => Promise<void>): Promise<void> {
  await assert.rejects(fn, (err: unknown) => {
    assert.ok(err instanceof ApiError, 'expected an ApiError to be thrown');
    assert.equal(err.statusCode, 401);
    assert.deepEqual(err.errors, { code: 'IMPERSONATION_REVOKED' });
    return true;
  });
}

test('a session marked active by enter() is live', async () => {
  const client = createFakeRedis();
  await markImpersonationSessionActive('req1', 60, client);
  await assert.doesNotReject(() => assertImpersonationSessionLive('req1', client));
});

test('a session that was never entered is not live -> 401 IMPERSONATION_REVOKED', async () => {
  const client = createFakeRedis();
  await expectRevoked(() => assertImpersonationSessionLive('never-entered', client));
});

test('revoke (markImpersonationSessionEnded) invalidates an active session on the next check', async () => {
  const client = createFakeRedis();
  await markImpersonationSessionActive('req1', 60, client);
  await assert.doesNotReject(() => assertImpersonationSessionLive('req1', client));

  await markImpersonationSessionEnded('req1', client);

  await expectRevoked(() => assertImpersonationSessionLive('req1', client));
});

test('exit (markImpersonationSessionEnded) invalidates an active session on the next check', async () => {
  const client = createFakeRedis();
  await markImpersonationSessionActive('req2', 60, client);

  await markImpersonationSessionEnded('req2', client);

  await expectRevoked(() => assertImpersonationSessionLive('req2', client));
});

test('a marker set with an already-elapsed TTL is not live (natural expiry, same mechanism as revoke/exit)', async () => {
  const client = createFakeRedis();
  await markImpersonationSessionActive('req3', 0, client);

  await expectRevoked(() => assertImpersonationSessionLive('req3', client));
});

test('markImpersonationSessionEnded does not throw for an already-cleared or never-entered session', async () => {
  const client = createFakeRedis();
  await assert.doesNotReject(() => markImpersonationSessionEnded('never-entered', client));
});

test('a Redis error during the liveness check fails closed -> 401 IMPERSONATION_REVOKED', async () => {
  const client: ImpersonationRedisClient = {
    setex: async () => 'OK',
    del: async () => 1,
    exists: async () => {
      throw new Error('connection lost');
    },
  };

  await expectRevoked(() => assertImpersonationSessionLive('req1', client));
});
