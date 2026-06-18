import { test } from 'node:test';
import assert from 'node:assert/strict';
import { organisationIdParamSchema } from './organisation.schema';

// ─── Regression: "Validation failed" banner on Master Control ─────────────────
// The two seeded organisations (org_geolandpro_platform, org_accra_residential)
// have hand-assigned IDs, not Prisma-generated cuids. Every
// /platform/organisations/:id* route shares this schema, so it must accept
// both ID shapes.

test('organisationIdParamSchema accepts seeded non-cuid organisation IDs', () => {
  assert.equal(organisationIdParamSchema.safeParse({ id: 'org_accra_residential' }).success, true);
  assert.equal(organisationIdParamSchema.safeParse({ id: 'org_geolandpro_platform' }).success, true);
});

test('organisationIdParamSchema still accepts genuine cuid-format IDs', () => {
  assert.equal(organisationIdParamSchema.safeParse({ id: 'cmqbb56bp0007wg1s5k8ajqt0' }).success, true);
});

test('organisationIdParamSchema rejects an empty id', () => {
  const result = organisationIdParamSchema.safeParse({ id: '' });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.deepEqual(result.error.flatten().fieldErrors.id, ['Invalid organisation ID']);
  }
});
