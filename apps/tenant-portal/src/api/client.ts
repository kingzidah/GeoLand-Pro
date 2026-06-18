import axios, { type AxiosError } from 'axios';

// Module-level token — readable by interceptors without React context
let _accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  _accessToken = token;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  // Required so the httpOnly refresh_token cookie is sent/received (ADR-AUTH-001).
  withCredentials: true,
});

// ─── Request: inject access token ─────────────────────────────────────────────

api.interceptors.request.use((config) => {
  if (_accessToken) {
    config.headers.Authorization = `Bearer ${_accessToken}`;
  }
  return config;
});

// ─── Response: silent token refresh on 401 ────────────────────────────────────

api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const original = err.config as typeof err.config & { _retry?: boolean };

    if (err.response?.status === 401 && original && !original._retry) {
      original._retry = true;

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
        setAccessToken(null);
        window.location.href = '/login';
      }
    }

    return Promise.reject(err);
  }
);

// ─── Error extraction helper ──────────────────────────────────────────────────

export function getApiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return (
      (err.response?.data as { message?: string })?.message ??
      err.message
    );
  }
  return 'An unexpected error occurred';
}
