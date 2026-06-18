import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Role, PlatformRole, PlatformCapability } from '@geolandpro/rbac';
import { requirePlatformAdmin, requirePlatformCapability, platformIpAllowList } from './tenant.middleware';
import type { AuthenticatedRequest } from './authenticate';
import type { Request, Response, NextFunction } from 'express';

// ─── Sprint 7 Phase 5 — B1/B2 layer-isolation + platform-role-matrix proof ─────
// These tests exercise the actual exported middleware against fake req/res
// objects, with no database — they prove the gate logic itself, independent
// of any seeded account.

function fakeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

function fakeReq(user: Partial<AuthenticatedRequest['user']> | undefined): Request {
  return { user } as unknown as Request;
}

function nextSpy() {
  let called = false;
  const next = (() => {
    called = true;
  }) as NextFunction;
  return { next, wasCalled: () => called };
}

// ─── B1.1 / B1.2 — non-platform tokens get 404, not 403 ────────────────────────

test('B1.1: a client (Super Admin, non-platform) token hits /platform/* and gets 404', () => {
  const req = fakeReq({ id: 'u1', email: 'admin@org.test', role: Role.SUPER_ADMIN, organisationId: 'org1', isPlatformAdmin: false, platformRole: null });
  const res = fakeRes();
  const { next, wasCalled } = nextSpy();

  requirePlatformAdmin(req, res, next);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Not found' });
  assert.equal(wasCalled(), false);
});

test('B1.2: a tenant (non-platform) token hits /platform/* and gets 404', () => {
  const req = fakeReq({ id: 'u2', email: 'tenant@org.test', role: Role.TENANT, organisationId: 'org1', isPlatformAdmin: false, platformRole: null });
  const res = fakeRes();
  const { next, wasCalled } = nextSpy();

  requirePlatformAdmin(req, res, next);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Not found' });
  assert.equal(wasCalled(), false);
});

test('requirePlatformCapability also returns 404 (not 403) for non-platform users', () => {
  const req = fakeReq({ id: 'u1', email: 'admin@org.test', role: Role.SUPER_ADMIN, organisationId: 'org1', isPlatformAdmin: false, platformRole: null });
  const res = fakeRes();
  const { next, wasCalled } = nextSpy();

  requirePlatformCapability(PlatformCapability.ORG_VIEW)(req, res, next);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Not found' });
  assert.equal(wasCalled(), false);
});

test('a platform admin passes requirePlatformAdmin and reaches next()', () => {
  const req = fakeReq({ id: 'p1', email: 'td@geolandpro.test', role: Role.SUPER_ADMIN, organisationId: null, isPlatformAdmin: true, platformRole: PlatformRole.TECHNICAL_DIRECTOR });
  const res = fakeRes();
  const { next, wasCalled } = nextSpy();

  requirePlatformAdmin(req, res, next);

  assert.equal(wasCalled(), true);
  assert.equal(res.statusCode, 0);
});

// ─── A2 — IP allow-list hook is a documented no-op ─────────────────────────────

test('A2: platformIpAllowList is a passthrough no-op (no behaviour change yet)', () => {
  const req = fakeReq({ id: 'p1', email: 'td@geolandpro.test', role: Role.SUPER_ADMIN, organisationId: null, isPlatformAdmin: true, platformRole: PlatformRole.TECHNICAL_DIRECTOR });
  const res = fakeRes();
  const { next, wasCalled } = nextSpy();

  platformIpAllowList(req, res, next);

  assert.equal(wasCalled(), true);
  assert.equal(res.statusCode, 0);
});

// ─── B2 — platform role matrix, exercised through the real route gate ─────────

function platformUser(platformRole: PlatformRole) {
  return { id: 'p1', email: 'staff@geolandpro.test', role: Role.SUPER_ADMIN, organisationId: null, isPlatformAdmin: true, platformRole };
}

function expectGate(platformRole: PlatformRole, capability: PlatformCapability, expected: 'allow' | 'deny') {
  const req = fakeReq(platformUser(platformRole));
  const res = fakeRes();
  const { next, wasCalled } = nextSpy();

  requirePlatformCapability(capability)(req, res, next);

  if (expected === 'allow') {
    assert.equal(wasCalled(), true, `${platformRole} should pass ${capability}`);
  } else {
    assert.equal(wasCalled(), false, `${platformRole} should be denied ${capability}`);
    assert.equal(res.statusCode, 403, `${platformRole} denied ${capability} should be 403, not 404`);
  }
}

test('B2 Technical Director: full access, including health detail and settings manage', () => {
  expectGate(PlatformRole.TECHNICAL_DIRECTOR, PlatformCapability.HEALTH_VIEW_DETAIL, 'allow');
  expectGate(PlatformRole.TECHNICAL_DIRECTOR, PlatformCapability.SETTINGS_MANAGE, 'allow');
  expectGate(PlatformRole.TECHNICAL_DIRECTOR, PlatformCapability.ORG_DELETE, 'allow');
});

test('B2 Managing Director: health summary only, no raw health detail or settings manage', () => {
  expectGate(PlatformRole.MANAGING_DIRECTOR, PlatformCapability.HEALTH_VIEW_SUMMARY, 'allow');
  expectGate(PlatformRole.MANAGING_DIRECTOR, PlatformCapability.HEALTH_VIEW_DETAIL, 'deny');
  expectGate(PlatformRole.MANAGING_DIRECTOR, PlatformCapability.SETTINGS_MANAGE, 'deny');
  expectGate(PlatformRole.MANAGING_DIRECTOR, PlatformCapability.ORG_DELETE, 'allow');
});

test('B2 Finance Controller: revenue full, org create/manage/delete/impersonate and settings denied', () => {
  expectGate(PlatformRole.FINANCE_CONTROLLER, PlatformCapability.REVENUE_VIEW, 'allow');
  expectGate(PlatformRole.FINANCE_CONTROLLER, PlatformCapability.REVENUE_MANAGE, 'allow');
  expectGate(PlatformRole.FINANCE_CONTROLLER, PlatformCapability.ORG_CREATE, 'deny');
  expectGate(PlatformRole.FINANCE_CONTROLLER, PlatformCapability.ORG_MANAGE, 'deny');
  expectGate(PlatformRole.FINANCE_CONTROLLER, PlatformCapability.ORG_DELETE, 'deny');
  expectGate(PlatformRole.FINANCE_CONTROLLER, PlatformCapability.ORG_IMPERSONATE, 'deny');
  expectGate(PlatformRole.FINANCE_CONTROLLER, PlatformCapability.HEALTH_VIEW_DETAIL, 'deny');
  expectGate(PlatformRole.FINANCE_CONTROLLER, PlatformCapability.SETTINGS_MANAGE, 'deny');
  expectGate(PlatformRole.FINANCE_CONTROLLER, PlatformCapability.SUPPORT_MANAGE, 'deny');
});

test('B2 Operations Lead: onboarding + support full, create org + impersonate allowed, manage/delete existing orgs denied', () => {
  expectGate(PlatformRole.OPERATIONS_LEAD, PlatformCapability.ONBOARDING_MANAGE, 'allow');
  expectGate(PlatformRole.OPERATIONS_LEAD, PlatformCapability.SUPPORT_MANAGE, 'allow');
  expectGate(PlatformRole.OPERATIONS_LEAD, PlatformCapability.ORG_CREATE, 'allow');
  expectGate(PlatformRole.OPERATIONS_LEAD, PlatformCapability.ORG_IMPERSONATE, 'allow');
  expectGate(PlatformRole.OPERATIONS_LEAD, PlatformCapability.ORG_MANAGE, 'deny');
  expectGate(PlatformRole.OPERATIONS_LEAD, PlatformCapability.REVENUE_MANAGE, 'deny');
  expectGate(PlatformRole.OPERATIONS_LEAD, PlatformCapability.AUDIT_EXPORT, 'deny');
  expectGate(PlatformRole.OPERATIONS_LEAD, PlatformCapability.SETTINGS_MANAGE, 'deny');
  expectGate(PlatformRole.OPERATIONS_LEAD, PlatformCapability.ORG_DELETE, 'deny');
});

test('B2 Board Observer: view-only, every manage/delete/impersonate/reply denied', () => {
  expectGate(PlatformRole.BOARD_OBSERVER, PlatformCapability.ORG_VIEW, 'allow');
  expectGate(PlatformRole.BOARD_OBSERVER, PlatformCapability.REVENUE_VIEW, 'allow');
  for (const denied of [
    PlatformCapability.ORG_MANAGE,
    PlatformCapability.ORG_DELETE,
    PlatformCapability.ORG_IMPERSONATE,
    PlatformCapability.REVENUE_MANAGE,
    PlatformCapability.SUPPORT_MANAGE,
    PlatformCapability.SETTINGS_MANAGE,
    PlatformCapability.AUDIT_EXPORT,
    PlatformCapability.ONBOARDING_MANAGE,
    PlatformCapability.HEALTH_VIEW_DETAIL,
  ] as const) {
    expectGate(PlatformRole.BOARD_OBSERVER, denied, 'deny');
  }
});

// ─── B3 — "design for 5, deploy 2": a new seat needs zero code changes ────────
// Seeding `platformRole = FINANCE_CONTROLLER` on a User row is the only change
// required to grant the FIN view below — proven by exercising the same route
// gate used by every /platform/* route with no FIN-specific code anywhere.

test('B3: seeding platformRole = FINANCE_CONTROLLER yields the documented FIN view with zero code changes', () => {
  // FIN's documented view is exactly two modules: Client Management (view-only) + Revenue (full)
  expectGate(PlatformRole.FINANCE_CONTROLLER, PlatformCapability.ORG_VIEW, 'allow');
  expectGate(PlatformRole.FINANCE_CONTROLLER, PlatformCapability.REVENUE_VIEW, 'allow');
  expectGate(PlatformRole.FINANCE_CONTROLLER, PlatformCapability.REVENUE_MANAGE, 'allow');
  expectGate(PlatformRole.FINANCE_CONTROLLER, PlatformCapability.ORG_CREATE, 'deny');
  expectGate(PlatformRole.FINANCE_CONTROLLER, PlatformCapability.ORG_MANAGE, 'deny');
  expectGate(PlatformRole.FINANCE_CONTROLLER, PlatformCapability.ORG_DELETE, 'deny');
  expectGate(PlatformRole.FINANCE_CONTROLLER, PlatformCapability.ORG_IMPERSONATE, 'deny');
  expectGate(PlatformRole.FINANCE_CONTROLLER, PlatformCapability.HEALTH_VIEW_SUMMARY, 'deny');
  expectGate(PlatformRole.FINANCE_CONTROLLER, PlatformCapability.HEALTH_VIEW_DETAIL, 'deny');
  expectGate(PlatformRole.FINANCE_CONTROLLER, PlatformCapability.ONBOARDING_VIEW, 'deny');
  expectGate(PlatformRole.FINANCE_CONTROLLER, PlatformCapability.ONBOARDING_MANAGE, 'deny');
  expectGate(PlatformRole.FINANCE_CONTROLLER, PlatformCapability.AUDIT_VIEW, 'deny');
  expectGate(PlatformRole.FINANCE_CONTROLLER, PlatformCapability.AUDIT_EXPORT, 'deny');
  expectGate(PlatformRole.FINANCE_CONTROLLER, PlatformCapability.SUPPORT_VIEW, 'deny');
  expectGate(PlatformRole.FINANCE_CONTROLLER, PlatformCapability.SUPPORT_MANAGE, 'deny');
  expectGate(PlatformRole.FINANCE_CONTROLLER, PlatformCapability.SETTINGS_VIEW, 'deny');
  expectGate(PlatformRole.FINANCE_CONTROLLER, PlatformCapability.SETTINGS_MANAGE, 'deny');
});
