import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AccessScope } from '@geolandpro/rbac';
import { approveAccessRequestSchema } from './accessRequest.schema';

// ─── Fix 3: hard-cap impersonation session duration at 60 minutes ─────────────

test('approveAccessRequestSchema accepts durationMinutes at the 60-minute cap', () => {
  assert.equal(
    approveAccessRequestSchema.safeParse({
      grantedScopes: [AccessScope.PLOTS],
      durationMinutes: 60,
    }).success,
    true
  );
});

test('approveAccessRequestSchema rejects durationMinutes above the 60-minute cap', () => {
  const result = approveAccessRequestSchema.safeParse({
    grantedScopes: [AccessScope.PLOTS],
    durationMinutes: 61,
  });
  assert.equal(result.success, false);
});

test('approveAccessRequestSchema rejects the old 1440-minute (24h) ceiling', () => {
  const result = approveAccessRequestSchema.safeParse({
    grantedScopes: [AccessScope.PLOTS],
    durationMinutes: 1440,
  });
  assert.equal(result.success, false);
});

test('approveAccessRequestSchema rejects durationMinutes below 1', () => {
  const result = approveAccessRequestSchema.safeParse({
    grantedScopes: [AccessScope.PLOTS],
    durationMinutes: 0,
  });
  assert.equal(result.success, false);
});
