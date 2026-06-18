import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { authApi } from '@/api/auth';
import { setAccessToken } from '@/api/client';
import type { User } from '@/types';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount: attempt silent re-authentication via the httpOnly refresh_token
  // cookie (ADR-AUTH-001). A 401 here just means "not logged in".
  useEffect(() => {
    async function tryRestore() {
      try {
        const tokens = await authApi.refresh();
        setAccessToken(tokens.accessToken);
        const me = await authApi.getMe();
        setUser(me);
      } catch {
        setAccessToken(null);
      } finally {
        setIsLoading(false);
      }
    }
    tryRestore();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login(email, password);
    if (!result.user.platformRole) {
      throw new Error('Master Control is for platform staff only. Please use the staff app to sign in.');
    }
    setAccessToken(result.accessToken);
    setUser(result.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
