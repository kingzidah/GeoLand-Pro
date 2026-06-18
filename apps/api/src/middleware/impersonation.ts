import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import type { Role, PlatformRole } from '@prisma/client';
import { ACCESS_SCOPE_ROUTES, type AccessScope } from '@geolandpro/rbac';
import { ApiError } from '../utils/ApiError';

// ─── Augment Express Request with the authenticated user ─────────────────────
export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: Role;
    organisationId: string | null;
    isPlatformAdmin: boolean;
    platformRole: PlatformRole | null;
  };
  organisationId?: string;
  // Present when this request's access token carries an impersonation claim
  // (cookie- or header-borne) — set by authenticate.ts before
  // applyImpersonationEnforcement runs. Lets /auth/me surface session state
  // for the impersonation banner.
  impersonation?: ImpersonationClaim;
}

// ─── Consent-gated scoped impersonation (Phase 3 enforcement) ─────────────────
// Minted by accessRequestService.enter() (apps/api/src/services/accessRequest.service.ts)
// when platform staff enters an approved OrgAccessRequest.
export interface ImpersonationClaim {
  requestId: string;
  organisationId: string;
  grantedScopes: string[];
  readOnly: boolean;
  expiresAt: string; // ISO date string
}

const API_PREFIX = '/api/v1';
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const ALL_ACCESS_SCOPES = Object.keys(ACCESS_SCOPE_ROUTES) as AccessScope[];

// ─── Cookie-based impersonation transport (Phase 4) ────────────────────────────
// httpOnly+SameSite=Strict cookie carrying the impersonation JWT, scoped to
// the API mount path only — see resolveAccessToken/impersonationCookieOptions
// below. The primary session's access token remains Authorization: Bearer +
// in-memory; its refresh token lives in its own httpOnly cookie, scoped to
// /api/v1/auth — see REFRESH_TOKEN_COOKIE_NAME in services/auth.service.ts
// (ADR-AUTH-001).
export const IMPERSONATION_COOKIE_NAME = 'impersonation_token';
export const IMPERSONATION_CSRF_HEADER = 'x-impersonation-active';
const IMPERSONATION_COOKIE_PATH = '/api/v1';

// Strip the /api/v1 mount prefix so the result lines up with the route
// prefixes in ACCESS_SCOPE_ROUTES (e.g. '/properties', '/leases').
function routePath(req: Request): string {
  const fullPath = req.originalUrl.split('?')[0];
  return fullPath.startsWith(API_PREFIX) ? fullPath.slice(API_PREFIX.length) || '/' : fullPath;
}

function pathInScope(path: string, scope: AccessScope): boolean {
  // Segment-aware: prefix '/plots' matches '/plots' and '/plots/123', but NOT
  // '/plotsxyz' or '/plots-internal' — the trailing '/' on the second branch
  // enforces a path-segment boundary instead of a raw string prefix match.
  return ACCESS_SCOPE_ROUTES[scope].some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

// ─── Session-lifecycle exemption ───────────────────────────────────────────
// enter/exit (apps/api/src/routes/organisation.routes.ts) act on the CALLER's
// OWN OrgAccessRequest — looked up by requestId + req.user.id, i.e. the
// claim's own sub — never on tenant data, and that row's status/expiresAt are
// the authoritative gate for them (accessRequest.service.ts). A staff member
// must always be able to end (or switch) their session, even mid-grant while
// it's read-only, out of scope, or technically past expiresAt — so these two
// routes skip impersonation enforcement entirely rather than being added to
// the scope allow-list.
const IMPERSONATION_LIFECYCLE_ROUTES: readonly RegExp[] = [
  /^\/platform\/access-requests\/[^/]+\/enter$/,
  /^\/platform\/access-requests\/[^/]+\/exit$/,
];

export function isImpersonationLifecycleRoute(req: Request): boolean {
  return IMPERSONATION_LIFECYCLE_ROUTES.some((pattern) => pattern.test(routePath(req)));
}

// ─── Access-token resolution: cookie vs. header precedence (Phase 4) ──────────
export interface ResolvedAccessToken<TPayload> {
  payload: TPayload;
  isImpersonationCookie: boolean;
}

/**
 * PRECEDENCE RULE: if the `impersonation_token` httpOnly cookie is present,
 * it GOVERNS this request UNCONDITIONALLY:
 *   - its payload (not the header's) becomes req.user / the claim passed to
 *     applyImpersonationEnforcement;
 *   - the `Authorization` header, if also present, is IGNORED ENTIRELY — not
 *     inspected, not verified, never used as a fallback — even if the
 *     cookie's JWT is invalid or its claim.expiresAt has already passed. A
 *     bad/expired impersonation cookie therefore fails closed
 *     (IMPERSONATION_INVALID / IMPERSONATION_EXPIRED) rather than silently
 *     granting the primary session's access under the impersonated org.
 *
 * Only when NO impersonation cookie is present does this fall back to the
 * existing `Authorization: Bearer <token>` flow for the primary session.
 *
 * The cookie's JWT is verified with `ignoreExpiration: true` — the signature
 * is still checked (a bad signature -> 401 IMPERSONATION_INVALID), but the
 * outer JWT `exp` is NOT enforced here. This is deliberate: `claim.expiresAt`,
 * inside the *signed* payload, is the sole expiry authority for impersonation
 * sessions, enforced by applyImpersonationEnforcement — which also grants the
 * enter/exit lifecycle exemption past expiry (Phase 3). Enforcing the outer
 * JWT `exp` here would reject an expired session with a generic 401 before
 * either the IMPERSONATION_EXPIRED code or the lifecycle exemption is ever
 * reached, re-breaking "exit must work past expiry".
 */
export function resolveAccessToken<TPayload>(req: Request, secret: string): ResolvedAccessToken<TPayload> {
  const cookieToken = req.cookies?.[IMPERSONATION_COOKIE_NAME];

  if (typeof cookieToken === 'string' && cookieToken.length > 0) {
    try {
      const payload = jwt.verify(cookieToken, secret, { ignoreExpiration: true }) as unknown as TPayload;
      return { payload, isImpersonationCookie: true };
    } catch {
      throw new ApiError(401, 'Impersonation session is invalid', true, { code: 'IMPERSONATION_INVALID' });
    }
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Missing or malformed Authorization header');
  }

  const token = authHeader.slice(7); // Strip 'Bearer '
  try {
    const payload = jwt.verify(token, secret) as unknown as TPayload;
    return { payload, isImpersonationCookie: false };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw ApiError.unauthorized('Access token has expired — please refresh');
    }
    throw ApiError.unauthorized('Invalid access token');
  }
}

/**
 * CSRF guard for the impersonation cookie transport. Callers must only
 * invoke this when resolveAccessToken returned `isImpersonationCookie: true`
 * — the primary Bearer/localStorage routes are not cookie-borne and so are
 * not CSRF-exposed; they never call this guard.
 *
 * For mutating methods, requires the `x-impersonation-active: 1` header (set
 * by the frontend only while an impersonation session is active), as
 * defence-in-depth alongside the cookie's own SameSite=Strict attribute.
 */
export function enforceImpersonationCsrf(req: Request): void {
  if (!MUTATING_METHODS.has(req.method)) return;
  if (req.headers[IMPERSONATION_CSRF_HEADER] !== '1') {
    throw new ApiError(403, 'Missing impersonation CSRF header', true, { code: 'IMPERSONATION_CSRF_MISSING' });
  }
}

/**
 * Cookie attributes for `impersonation_token`. `secure` is supplied by the
 * caller (reads env.NODE_ENV) so this module keeps its dependency-free,
 * `node --test`-safe shape. Scoped to `/api/v1`, SameSite=Strict (first line
 * of CSRF defence; enforceImpersonationCsrf is the second).
 */
export function impersonationCookieOptions(secure: boolean, maxAgeMs?: number) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'strict' as const,
    path: IMPERSONATION_COOKIE_PATH,
    ...(maxAgeMs !== undefined ? { maxAge: maxAgeMs } : {}),
  };
}

/**
 * Enforces the `impersonation` claim minted by accessRequestService.enter().
 * No-op for ordinary tokens (claim undefined) and for session-lifecycle
 * routes (enter/exit — see IMPERSONATION_LIFECYCLE_ROUTES) — zero change to
 * the normal auth path for either. Otherwise checks run in this order so a
 * failure can't leak which scopes exist, and so an expired session is
 * rejected before anything else:
 *   1. expiry    -> 401 IMPERSONATION_EXPIRED (independent of the JWT's own exp)
 *   2. read-only -> 403 IMPERSONATION_READ_ONLY for mutating methods
 *   3. scope     -> 403 IMPERSONATION_SCOPE_DENIED unless the route falls
 *                    under one of the granted scopes' route prefixes
 *                    (ACCESS_SCOPE_ROUTES is treated as an allow-list — any
 *                    route prefix absent from it is hard-blocked), with a
 *                    single fixed exemption for GET /auth/me (the session's
 *                    own identity + claim metadata, used by the banner)
 *   4. tenant    -> pins req.organisationId to the granted org and clears
 *                    isPlatformAdmin, so an impersonation session is always
 *                    scoped and never escalates via the platform-admin bypass
 */
export function applyImpersonationEnforcement(
  req: AuthenticatedRequest,
  claim: ImpersonationClaim | undefined
): void {
  if (!claim) return;
  if (isImpersonationLifecycleRoute(req)) return;

  if (Date.now() >= new Date(claim.expiresAt).getTime()) {
    throw new ApiError(401, 'Impersonation session has expired', true, { code: 'IMPERSONATION_EXPIRED' });
  }

  if (claim.readOnly && MUTATING_METHODS.has(req.method)) {
    throw new ApiError(403, 'Impersonation sessions are read-only', true, { code: 'IMPERSONATION_READ_ONLY' });
  }

  const path = routePath(req);
  const grantedScopes = new Set(claim.grantedScopes);
  // /auth/me is exempt from the scope allow-list: it's the sole mechanism by
  // which the frontend discovers the impersonation session itself (org,
  // grantedScopes, expiresAt) to render the banner — see the
  // `AuthenticatedRequest.impersonation` and `ImpersonationSession` (web
  // types) doc comments, which already document this as the intended
  // behaviour. It returns the impersonating staff member's own identity plus
  // claim metadata, never tenant data, so exempting it doesn't widen the
  // session's access. PATCH /auth/me still 403s IMPERSONATION_READ_ONLY (the
  // read-only check above runs first), and an expired claim still 401s
  // IMPERSONATION_EXPIRED (the expiry check above also runs first).
  const inGrantedScope =
    path === '/auth/me' || ALL_ACCESS_SCOPES.some((scope) => grantedScopes.has(scope) && pathInScope(path, scope));
  if (!inGrantedScope) {
    throw new ApiError(403, 'This section is not included in the current access grant', true, {
      code: 'IMPERSONATION_SCOPE_DENIED',
    });
  }

  req.organisationId = claim.organisationId;
  req.user.isPlatformAdmin = false;
}
