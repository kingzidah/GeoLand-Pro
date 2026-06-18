import axios, { type AxiosError } from 'axios';

// Module-level token — readable by interceptors without React context
let _accessToken: string | null = null;

// Components that hold native (non-axios) connections keyed on the Bearer
// token (e.g. MapLibre's transformRequest) can subscribe here so they can
// flush their tile caches when the token is silently refreshed.
const _tokenListeners = new Set<(token: string | null) => void>();

export function onAccessTokenChange(fn: (token: string | null) => void): () => void {
  _tokenListeners.add(fn);
  return () => _tokenListeners.delete(fn);
}

export function setAccessToken(token: string | null) {
  _accessToken = token;
  _tokenListeners.forEach((fn) => fn(token));
}

export function getAccessToken(): string | null {
  return _accessToken;
}

// ─── Impersonation session state ──────────────────────────────────────────────
// Mirrors the access-token pattern above so axios interceptors (outside React)
// can attach the CSRF header required alongside the httpOnly impersonation
// cookie, and react when that cookie's session has expired server-side. The
// impersonation token itself is never read here — only the cookie's presence
// is tracked, via the request id of the active grant.

const IMPERSONATION_CSRF_HEADER = 'x-impersonation-active';
const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete']);

let _impersonationRequestId: string | null = null;
let _onImpersonationExpired: (() => void) | null = null;

export function setImpersonationActive(requestId: string | null) {
  _impersonationRequestId = requestId;
}

export function isImpersonationActive(): boolean {
  return _impersonationRequestId !== null;
}

/** Registered by AuthContext to clear session state when the server reports the impersonation cookie has expired. */
export function setImpersonationExpiredHandler(handler: (() => void) | null) {
  _onImpersonationExpired = handler;
}

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  // Required so the httpOnly impersonation_token cookie is sent/received.
  withCredentials: true,
});

// ─── Request: inject access token + impersonation CSRF header ────────────────

api.interceptors.request.use((config) => {
  if (_accessToken) {
    config.headers.Authorization = `Bearer ${_accessToken}`;
  }
  if (_impersonationRequestId && config.method && MUTATING_METHODS.has(config.method.toLowerCase())) {
    config.headers[IMPERSONATION_CSRF_HEADER] = '1';
  }
  return config;
});

// ─── Response: impersonation expiry + silent token refresh on 401 ────────────

api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const code = (err.response?.data as { errors?: { code?: string } } | undefined)?.errors?.code;

    // A stale or revoked impersonation cookie must not trigger the
    // primary-session refresh/redirect flow below — end the impersonation
    // session instead. IMPERSONATION_EXPIRED is the JWT's own claim.expiresAt
    // lapsing; IMPERSONATION_REVOKED is the server-side liveness marker being
    // gone (revoke, exit elsewhere, or a natural-expiry backstop) — both end
    // the session identically on the frontend.
    if (err.response?.status === 401 && (code === 'IMPERSONATION_EXPIRED' || code === 'IMPERSONATION_REVOKED')) {
      _onImpersonationExpired?.();
      return Promise.reject(err);
    }

    const original = err.config as typeof err.config & { _retry?: boolean };

    if (err.response?.status === 401 && original && !original._retry) {
      original._retry = true;

      // Refresh token lives in an httpOnly cookie (see ADR-AUTH-001) — never
      // read by JS. withCredentials sends it; x-refresh is the CSRF guard.
      try {
        const { data } = await axios.post(
          `${BASE_URL}/auth/refresh`,
          {},
          { withCredentials: true, headers: { 'x-refresh': '1' } }
        );
        const { accessToken: newAccess } = data.data;
        setAccessToken(newAccess);
        original.headers!['Authorization'] = `Bearer ${newAccess}`;
        return api(original);
      } catch {
        // Refresh failed — clear everything and redirect to login
        setAccessToken(null);
        window.location.href = '/login';
      }
    }

    return Promise.reject(err);
  }
);

// ─── Error extraction helpers ─────────────────────────────────────────────────

export function getApiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return (err.response?.data as { message?: string } | undefined)?.message ?? err.message;
  }
  return 'An unexpected error occurred';
}

/** Reads the backend's machine-readable error code (e.g. IMPERSONATION_READ_ONLY), when present. */
export function getApiErrorCode(err: unknown): string | undefined {
  if (axios.isAxiosError(err)) {
    return (err.response?.data as { errors?: { code?: string } } | undefined)?.errors?.code;
  }
  return undefined;
}
