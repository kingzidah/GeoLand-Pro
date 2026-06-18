import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { Role, PlatformRole, AccessScope } from '@geolandpro/rbac';
import {
  applyImpersonationEnforcement,
  resolveAccessToken,
  enforceImpersonationCsrf,
  impersonationCookieOptions,
  IMPERSONATION_COOKIE_NAME,
  IMPERSONATION_CSRF_HEADER,
} from './impersonation';
import type { AuthenticatedRequest, ImpersonationClaim } from './impersonation';
import { ApiError } from '../utils/ApiError';

// ─── Impersonation Phase 3 — expiry/read-only/scope/tenant enforcement ────────
// Exercises applyImpersonationEnforcement directly against fake req objects,
// with no JWT/DB — mirrors the fake-req style of tenant.middleware.test.ts.

function fakeUser(overrides: Partial<AuthenticatedRequest['user']> = {}): AuthenticatedRequest['user'] {
  return {
    id: 'staff1',
    email: 'staff@geolandpro.test',
    role: Role.SUPER_ADMIN,
    organisationId: null,
    isPlatformAdmin: true,
    platformRole: PlatformRole.OPERATIONS_LEAD,
    ...overrides,
  };
}

function fakeReq(
  overrides: {
    method?: string;
    originalUrl?: string;
    user?: AuthenticatedRequest['user'];
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
  } = {}
): AuthenticatedRequest {
  return {
    method: overrides.method ?? 'GET',
    originalUrl: overrides.originalUrl ?? '/api/v1/properties',
    user: overrides.user ?? fakeUser(),
    cookies: overrides.cookies ?? {},
    headers: overrides.headers ?? {},
  } as unknown as AuthenticatedRequest;
}

function validClaim(overrides: Partial<ImpersonationClaim> = {}): ImpersonationClaim {
  return {
    requestId: 'req1',
    organisationId: 'org-target',
    grantedScopes: [AccessScope.PLOTS, AccessScope.LEASES],
    readOnly: true,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
}

function expectApiError(fn: () => void, statusCode: number, code: string): void {
  let thrown: unknown;
  try {
    fn();
  } catch (err) {
    thrown = err;
  }

  assert.ok(thrown instanceof ApiError, 'expected an ApiError to be thrown');
  assert.equal((thrown as ApiError).statusCode, statusCode);
  assert.deepEqual((thrown as ApiError).errors, { code });
}

// ─── Non-impersonation tokens: zero regression ─────────────────────────────────

test('non-impersonation token: undefined claim is a no-op', () => {
  const req = fakeReq({ user: fakeUser({ isPlatformAdmin: false, organisationId: 'org-staff' }) });

  assert.doesNotThrow(() => applyImpersonationEnforcement(req, undefined));

  assert.equal(req.organisationId, undefined);
  assert.equal(req.user.isPlatformAdmin, false);
  assert.equal(req.user.organisationId, 'org-staff');
});

// ─── (a) Expiry — checked before scope/read-only ───────────────────────────────

test('expired claim -> 401 IMPERSONATION_EXPIRED, even when method/route would also fail', () => {
  const req = fakeReq({ method: 'POST', originalUrl: '/api/v1/admin/users' });
  const claim = validClaim({ expiresAt: new Date(Date.now() - 1_000).toISOString() });

  expectApiError(() => applyImpersonationEnforcement(req, claim), 401, 'IMPERSONATION_EXPIRED');
});

// ─── (b) Read-only ──────────────────────────────────────────────────────────

test('mutating method under readOnly -> 403 IMPERSONATION_READ_ONLY', () => {
  const req = fakeReq({ method: 'PATCH', originalUrl: '/api/v1/properties/abc123' });

  expectApiError(() => applyImpersonationEnforcement(req, validClaim()), 403, 'IMPERSONATION_READ_ONLY');
});

test('GET/HEAD/OPTIONS pass through readOnly', () => {
  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    const req = fakeReq({ method, originalUrl: '/api/v1/properties' });
    assert.doesNotThrow(() => applyImpersonationEnforcement(req, validClaim()), `${method} should be allowed`);
  }
});

test('AI assistant (POST /ai/assistant) is blocked by IMPERSONATION_READ_ONLY, even with every scope granted', () => {
  const req = fakeReq({ method: 'POST', originalUrl: '/api/v1/ai/assistant' });
  const claim = validClaim({ grantedScopes: Object.values(AccessScope) });

  // Belt: the read-only check (mutating method) rejects this before the
  // scope check is ever reached. Suspenders: /ai is also absent from
  // ACCESS_SCOPE_ROUTES, so it would be IMPERSONATION_SCOPE_DENIED regardless
  // — see "route prefix absent from ACCESS_SCOPE_ROUTES" below. The AI
  // assistant therefore has no path to mutate or read during impersonation.
  expectApiError(() => applyImpersonationEnforcement(req, claim), 403, 'IMPERSONATION_READ_ONLY');
});

// ─── (c) Scope ──────────────────────────────────────────────────────────────

test('route prefix absent from ACCESS_SCOPE_ROUTES -> 403 IMPERSONATION_SCOPE_DENIED regardless of grantedScopes', () => {
  const req = fakeReq({ originalUrl: '/api/v1/admin/users' });
  const claim = validClaim({ grantedScopes: Object.values(AccessScope) });

  expectApiError(() => applyImpersonationEnforcement(req, claim), 403, 'IMPERSONATION_SCOPE_DENIED');
});

test('route belongs to a scope that was not granted -> 403 IMPERSONATION_SCOPE_DENIED', () => {
  const req = fakeReq({ originalUrl: '/api/v1/finance/summary' });
  const claim = validClaim({ grantedScopes: [AccessScope.PLOTS, AccessScope.LEASES] }); // FINANCE not granted

  expectApiError(() => applyImpersonationEnforcement(req, claim), 403, 'IMPERSONATION_SCOPE_DENIED');
});

test('in-scope read passes and pins req.organisationId', () => {
  const req = fakeReq({ originalUrl: '/api/v1/leases/lease123' });
  const claim = validClaim({ grantedScopes: [AccessScope.LEASES] });

  assert.doesNotThrow(() => applyImpersonationEnforcement(req, claim));
  assert.equal(req.organisationId, claim.organisationId);
});

test('valid read GET passes for a granted PLOTS-scope route', () => {
  const req = fakeReq({ method: 'GET', originalUrl: '/api/v1/properties/abc123' });
  const claim = validClaim({ grantedScopes: [AccessScope.PLOTS] });

  assert.doesNotThrow(() => applyImpersonationEnforcement(req, claim));
});

// ─── (c.1) /auth/me exemption — session-state discovery for the banner ────────
// GET /auth/me is the sole mechanism by which the frontend learns about an
// active impersonation session (org, grantedScopes, expiresAt) to render the
// ImpersonationBanner — see the AuthenticatedRequest.impersonation and
// ImpersonationSession (apps/web/src/types) doc comments. It must therefore
// be reachable regardless of grantedScopes, while the expiry and read-only
// checks (which run before the scope check) remain fully enforced.

test('GET /auth/me passes the scope check even when no granted scope covers /auth, and still pins req.organisationId/isPlatformAdmin', () => {
  const req = fakeReq({ method: 'GET', originalUrl: '/api/v1/auth/me' });
  const claim = validClaim({ organisationId: 'org-target', grantedScopes: [AccessScope.PLOTS] }); // /auth is not in PLOTS (or any scope)

  assert.doesNotThrow(() => applyImpersonationEnforcement(req, claim));
  assert.equal(req.organisationId, 'org-target');
  assert.equal(req.user.isPlatformAdmin, false);
});

test('GET /auth/me passes even with zero granted scopes', () => {
  const req = fakeReq({ method: 'GET', originalUrl: '/api/v1/auth/me' });
  const claim = validClaim({ grantedScopes: [] });

  assert.doesNotThrow(() => applyImpersonationEnforcement(req, claim));
});

test('PATCH /auth/me is still blocked by IMPERSONATION_READ_ONLY — the /auth/me exemption only covers the scope check', () => {
  const req = fakeReq({ method: 'PATCH', originalUrl: '/api/v1/auth/me' });
  const claim = validClaim({ grantedScopes: Object.values(AccessScope) });

  expectApiError(() => applyImpersonationEnforcement(req, claim), 403, 'IMPERSONATION_READ_ONLY');
});

test('GET /auth/me with an expired claim still 401s IMPERSONATION_EXPIRED — the /auth/me exemption only covers the scope check', () => {
  const req = fakeReq({ method: 'GET', originalUrl: '/api/v1/auth/me' });
  const claim = validClaim({ expiresAt: new Date(Date.now() - 1_000).toISOString() });

  expectApiError(() => applyImpersonationEnforcement(req, claim), 401, 'IMPERSONATION_EXPIRED');
});

// ─── (d) Tenant scoping + platform-admin bypass removal ────────────────────────

test('impersonation pins req.organisationId from the claim, not the staff own org', () => {
  const req = fakeReq({ originalUrl: '/api/v1/properties', user: fakeUser({ organisationId: null }) });
  const claim = validClaim({ organisationId: 'org-target', grantedScopes: [AccessScope.PLOTS] });

  applyImpersonationEnforcement(req, claim);

  assert.equal(req.organisationId, 'org-target');
});

test('impersonation never escalates via isPlatformAdmin', () => {
  const req = fakeReq({
    originalUrl: '/api/v1/properties',
    user: fakeUser({ isPlatformAdmin: true, platformRole: PlatformRole.TECHNICAL_DIRECTOR }),
  });
  const claim = validClaim({ grantedScopes: [AccessScope.PLOTS] });

  applyImpersonationEnforcement(req, claim);

  assert.equal(req.user.isPlatformAdmin, false);
  assert.equal(req.organisationId, claim.organisationId);
});

// ─── Session-lifecycle exemption (enter/exit) ──────────────────────────────────

test('lifecycle route: exit succeeds under a readOnly, out-of-scope impersonation claim', () => {
  const req = fakeReq({ method: 'POST', originalUrl: '/api/v1/platform/access-requests/req1/exit' });
  const claim = validClaim({ readOnly: true, grantedScopes: [AccessScope.PLOTS] }); // /platform is not in any granted scope

  assert.doesNotThrow(() => applyImpersonationEnforcement(req, claim));

  // full no-op: the claim is not applied to lifecycle routes at all
  assert.equal(req.organisationId, undefined);
  assert.equal(req.user.isPlatformAdmin, true);
});

test('lifecycle route: exit is exempt even when the claim has already expired', () => {
  const req = fakeReq({ method: 'POST', originalUrl: '/api/v1/platform/access-requests/req1/exit' });
  const claim = validClaim({ expiresAt: new Date(Date.now() - 1_000).toISOString() });

  assert.doesNotThrow(() => applyImpersonationEnforcement(req, claim));
});

test('lifecycle route: enter is exempt even while an active impersonation claim is present', () => {
  const req = fakeReq({ method: 'POST', originalUrl: '/api/v1/platform/access-requests/req2/enter' });
  const claim = validClaim({ readOnly: true, grantedScopes: [AccessScope.LEASES] });

  assert.doesNotThrow(() => applyImpersonationEnforcement(req, claim));
  assert.equal(req.user.isPlatformAdmin, true);
});

test('lifecycle exemption does not leak to other /platform/access-requests routes', () => {
  const req = fakeReq({ method: 'GET', originalUrl: '/api/v1/platform/access-requests/mine' });
  const claim = validClaim({ grantedScopes: [AccessScope.PLOTS] }); // /platform is not in PLOTS

  expectApiError(() => applyImpersonationEnforcement(req, claim), 403, 'IMPERSONATION_SCOPE_DENIED');
});

// ─── pathInScope segment-boundary hardening ────────────────────────────────────

test('pathInScope: PLOTS grant matches /plots and /plots/123 but not /plotsxyz or /plots-internal', () => {
  const claim = validClaim({ grantedScopes: [AccessScope.PLOTS] });

  for (const url of ['/api/v1/plots', '/api/v1/plots/123']) {
    const req = fakeReq({ method: 'GET', originalUrl: url });
    assert.doesNotThrow(() => applyImpersonationEnforcement(req, claim), `${url} should be in scope`);
  }

  for (const url of ['/api/v1/plotsxyz', '/api/v1/plots-internal']) {
    const req = fakeReq({ method: 'GET', originalUrl: url });
    expectApiError(() => applyImpersonationEnforcement(req, claim), 403, 'IMPERSONATION_SCOPE_DENIED');
  }
});

// ─── Phase 4 — impersonation cookie transport: precedence, CSRF, expiry ────────
// resolveAccessToken / enforceImpersonationCsrf / impersonationCookieOptions
// live in ./impersonation alongside applyImpersonationEnforcement for the
// same reason: pure functions, no env/prisma imports, safe under node --test.

const TEST_SECRET = 'unit-test-jwt-secret-do-not-use-in-prod';

function primaryPayload(overrides: Record<string, unknown> = {}) {
  return { sub: 'staff1', email: 'staff@geolandpro.test', role: Role.SUPER_ADMIN, ...overrides };
}

// ─── Baseline: header-only flow is unchanged ───────────────────────────────────

test('resolveAccessToken: no impersonation cookie -> falls back to Authorization: Bearer header', () => {
  const token = jwt.sign(primaryPayload(), TEST_SECRET);
  const req = fakeReq({ headers: { authorization: `Bearer ${token}` } });

  const { payload, isImpersonationCookie } = resolveAccessToken<{ sub: string }>(req, TEST_SECRET);

  assert.equal(isImpersonationCookie, false);
  assert.equal(payload.sub, 'staff1');
});

test('resolveAccessToken: no cookie and no/malformed Authorization header -> 401', () => {
  const req = fakeReq({ headers: {} });

  let thrown: unknown;
  try {
    resolveAccessToken(req, TEST_SECRET);
  } catch (err) {
    thrown = err;
  }

  assert.ok(thrown instanceof ApiError);
  assert.equal((thrown as ApiError).statusCode, 401);
});

// ─── (1) Precedence: an impersonation cookie governs unconditionally ──────────

test('resolveAccessToken: impersonation cookie governs even when a valid primary Bearer header is also present', () => {
  const claim = validClaim();
  const cookieToken = jwt.sign(
    { sub: 'staff1', email: 'staff@geolandpro.test', role: Role.SUPER_ADMIN, impersonation: claim },
    TEST_SECRET
  );
  const headerToken = jwt.sign(primaryPayload(), TEST_SECRET);

  const req = fakeReq({
    cookies: { [IMPERSONATION_COOKIE_NAME]: cookieToken },
    headers: { authorization: `Bearer ${headerToken}` },
  });

  const { payload, isImpersonationCookie } = resolveAccessToken<{ impersonation?: ImpersonationClaim }>(
    req,
    TEST_SECRET
  );

  assert.equal(isImpersonationCookie, true);
  assert.deepEqual(payload.impersonation, claim);
});

test('resolveAccessToken: an invalid impersonation cookie -> 401 IMPERSONATION_INVALID, NOT a fallback to the primary Bearer header', () => {
  const headerToken = jwt.sign(primaryPayload(), TEST_SECRET);
  const req = fakeReq({
    cookies: { [IMPERSONATION_COOKIE_NAME]: 'not-a-valid-jwt' },
    headers: { authorization: `Bearer ${headerToken}` },
  });

  expectApiError(() => resolveAccessToken(req, TEST_SECRET), 401, 'IMPERSONATION_INVALID');
});

test('resolveAccessToken: an impersonation cookie signed with the wrong secret -> 401 IMPERSONATION_INVALID', () => {
  const cookieToken = jwt.sign({ sub: 'staff1', impersonation: validClaim() }, 'a-totally-different-secret');
  const req = fakeReq({ cookies: { [IMPERSONATION_COOKIE_NAME]: cookieToken } });

  expectApiError(() => resolveAccessToken(req, TEST_SECRET), 401, 'IMPERSONATION_INVALID');
});

// ─── ignoreExpiration: the outer JWT exp is not the expiry authority ──────────

test('resolveAccessToken: impersonation cookie resolves even when its own JWT exp has already passed (claim.expiresAt remains authoritative)', () => {
  const claim = validClaim();
  const cookieToken = jwt.sign(
    { sub: 'staff1', email: 'staff@geolandpro.test', role: Role.SUPER_ADMIN, impersonation: claim },
    TEST_SECRET,
    { expiresIn: -10 }
  );
  const req = fakeReq({ cookies: { [IMPERSONATION_COOKIE_NAME]: cookieToken } });

  const { payload, isImpersonationCookie } = resolveAccessToken<{ impersonation?: ImpersonationClaim }>(
    req,
    TEST_SECRET
  );

  assert.equal(isImpersonationCookie, true);
  assert.deepEqual(payload.impersonation, claim);
});

// ─── (3) Stale impersonation cookie: 401 IMPERSONATION_EXPIRED, never falls back ──

test('an expired impersonation cookie -> 401 IMPERSONATION_EXPIRED even with a valid primary Bearer header present, and never pins the impersonated org', () => {
  const expiredClaim = validClaim({ expiresAt: new Date(Date.now() - 1_000).toISOString() });
  const cookieToken = jwt.sign(
    { sub: 'staff1', email: 'staff@geolandpro.test', role: Role.SUPER_ADMIN, impersonation: expiredClaim },
    TEST_SECRET
  );
  const headerToken = jwt.sign(primaryPayload(), TEST_SECRET);

  const req = fakeReq({
    method: 'GET',
    originalUrl: '/api/v1/properties',
    cookies: { [IMPERSONATION_COOKIE_NAME]: cookieToken },
    headers: { authorization: `Bearer ${headerToken}` },
  });

  const { payload, isImpersonationCookie } = resolveAccessToken<{ impersonation?: ImpersonationClaim }>(
    req,
    TEST_SECRET
  );
  assert.equal(isImpersonationCookie, true);

  expectApiError(() => applyImpersonationEnforcement(req, payload.impersonation), 401, 'IMPERSONATION_EXPIRED');

  // No silent fallback to primary-session access under the impersonated org:
  assert.equal(req.organisationId, undefined);
  assert.equal(req.user.isPlatformAdmin, true);
});

// ─── (2) Exit transition: cleared cookie -> clean fallback, zero enforcement ───

test('resolveAccessToken: once the impersonation cookie is cleared, falls back to the primary Bearer token with zero impersonation enforcement', () => {
  const token = jwt.sign(primaryPayload(), TEST_SECRET); // no `impersonation` claim
  const req = fakeReq({ cookies: {}, headers: { authorization: `Bearer ${token}` } });

  const { payload, isImpersonationCookie } = resolveAccessToken<{ impersonation?: ImpersonationClaim }>(
    req,
    TEST_SECRET
  );

  assert.equal(isImpersonationCookie, false);
  assert.equal(payload.impersonation, undefined);
  assert.doesNotThrow(() => applyImpersonationEnforcement(req, payload.impersonation));
  assert.equal(req.organisationId, undefined);
});

// ─── (4) CSRF guard on the impersonation cookie transport ─────────────────────

test('enforceImpersonationCsrf: mutating method without the CSRF header -> 403 IMPERSONATION_CSRF_MISSING', () => {
  const req = fakeReq({ method: 'PATCH', headers: {} });
  expectApiError(() => enforceImpersonationCsrf(req), 403, 'IMPERSONATION_CSRF_MISSING');
});

test('enforceImpersonationCsrf: mutating method with x-impersonation-active: "1" passes', () => {
  const req = fakeReq({ method: 'POST', headers: { [IMPERSONATION_CSRF_HEADER]: '1' } });
  assert.doesNotThrow(() => enforceImpersonationCsrf(req));
});

test('enforceImpersonationCsrf: GET/HEAD/OPTIONS pass regardless of the header', () => {
  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    const req = fakeReq({ method, headers: {} });
    assert.doesNotThrow(() => enforceImpersonationCsrf(req), `${method} should not require the CSRF header`);
  }
});

// ─── impersonationCookieOptions shape ──────────────────────────────────────────

test('impersonationCookieOptions: httpOnly + SameSite=Strict, scoped to /api/v1, secure passed through', () => {
  assert.deepEqual(impersonationCookieOptions(true), {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/api/v1',
  });
  assert.deepEqual(impersonationCookieOptions(false), {
    httpOnly: true,
    secure: false,
    sameSite: 'strict',
    path: '/api/v1',
  });
});

test('impersonationCookieOptions: maxAge is included only when provided', () => {
  assert.equal(impersonationCookieOptions(true, 60_000).maxAge, 60_000);
  assert.ok(!('maxAge' in impersonationCookieOptions(true)));
});
