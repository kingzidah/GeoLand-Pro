import { ACCESS_SCOPE_ROUTES, type AccessScope } from '@geolandpro/rbac';

/**
 * Frontend page roots that correspond 1:1 with an ACCESS_SCOPE_ROUTES entry.
 * Filters out API-only sub-resource routes (e.g. PLOTS' `/photos`) and scopes
 * with no dedicated frontend page during impersonation (SATELLITE — map UI is
 * out of scope for this phase).
 */
const FRONTEND_ROUTE_ROOTS = new Set(['/properties', '/plots', '/leases', '/tenants', '/finance', '/documents']);

/** Always reachable during impersonation, regardless of granted scopes — hosts the staff-side Exit control. */
export const IMPERSONATION_SAFE_ROUTE = '/access-requests';

/** Frontend route prefixes unlocked by the given granted scopes. */
export function frontendRoutesForScopes(grantedScopes: AccessScope[]): string[] {
  return grantedScopes
    .flatMap((scope) => ACCESS_SCOPE_ROUTES[scope] ?? [])
    .filter((route) => FRONTEND_ROUTE_ROOTS.has(route));
}

/** Whether `pathname` is covered by the granted scopes (or is the always-safe access-requests route). */
export function isRouteInScope(pathname: string, grantedScopes: AccessScope[]): boolean {
  if (pathname === IMPERSONATION_SAFE_ROUTE || pathname.startsWith(`${IMPERSONATION_SAFE_ROUTE}/`)) {
    return true;
  }
  return frontendRoutesForScopes(grantedScopes).some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/** First in-scope landing route, falling back to the always-safe access-requests route. */
export function firstGrantedRoute(grantedScopes: AccessScope[]): string {
  return frontendRoutesForScopes(grantedScopes)[0] ?? IMPERSONATION_SAFE_ROUTE;
}
