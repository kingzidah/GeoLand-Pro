import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '@/api/auth';
import { accessRequestsApi } from '@/api/accessRequests';
import { setAccessToken, setImpersonationActive, setImpersonationExpiredHandler } from '@/api/client';
import type { ImpersonationSession, User } from '@/types';

interface AuthContextValue {
  user: User | null;
  impersonation: ImpersonationSession | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-fetches /auth/me, refreshing both the user profile and impersonation session state. */
  refreshSession: () => Promise<void>;
  /** Ends the active impersonation session and returns to the staff member's normal context. Safe to call past expiry. */
  exitImpersonation: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [impersonation, setImpersonation] = useState<ImpersonationSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  // Kept in sync with `impersonation` state so the expiry handler (registered
  // once, outside React's render cycle) always sees the current request id.
  const impersonationRef = useRef<ImpersonationSession | null>(null);

  const applyMe = useCallback((me: User & { impersonation: ImpersonationSession | null }) => {
    const { impersonation: session, ...userData } = me;
    setUser(userData);
    setImpersonation(session);
    impersonationRef.current = session;
    setImpersonationActive(session?.requestId ?? null);
  }, []);

  const endImpersonation = useCallback(() => {
    setImpersonation(null);
    impersonationRef.current = null;
    setImpersonationActive(null);
  }, []);

  // On mount: attempt silent re-authentication via the httpOnly refresh_token
  // cookie (ADR-AUTH-001). A 401 here just means "not logged in".
  useEffect(() => {
    async function tryRestore() {
      try {
        const tokens = await authApi.refresh();
        setAccessToken(tokens.accessToken);
        const me = await authApi.getMe();
        applyMe(me);
      } catch {
        setAccessToken(null);
      } finally {
        setIsLoading(false);
      }
    }
    tryRestore();
  }, [applyMe]);

  // If the server reports the impersonation cookie has expired (401
  // IMPERSONATION_EXPIRED on any request), end the session locally and send
  // the staff member back to their access-request list.
  useEffect(() => {
    setImpersonationExpiredHandler(() => {
      const requestId = impersonationRef.current?.requestId;
      endImpersonation();
      navigate('/access-requests');
      if (requestId) {
        // Best-effort: transitions the request to ENDED and clears the
        // cookie server-side. Already-exempt from expiry checks (lifecycle route).
        accessRequestsApi.exit(requestId).catch(() => undefined);
      }
    });
    return () => setImpersonationExpiredHandler(null);
  }, [endImpersonation, navigate]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login(email, password);
    setAccessToken(result.accessToken);
    setUser(result.user);
    endImpersonation();
  }, [endImpersonation]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setAccessToken(null);
      setUser(null);
      endImpersonation();
    }
  }, [endImpersonation]);

  const refreshSession = useCallback(async () => {
    const me = await authApi.getMe();
    applyMe(me);
  }, [applyMe]);

  const exitImpersonation = useCallback(async () => {
    const requestId = impersonationRef.current?.requestId;
    try {
      if (requestId) {
        await accessRequestsApi.exit(requestId);
      }
    } finally {
      endImpersonation();
    }
  }, [endImpersonation]);

  return (
    <AuthContext.Provider
      value={{
        user,
        impersonation,
        isLoading,
        login,
        logout,
        refreshSession,
        exitImpersonation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
