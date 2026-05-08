/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { api } from '../api/client';
import type { AppBootstrap, MeResponse } from '../types';
import { authClient, authEnabled, clearApiAccessToken } from '../lib/auth-client';

const bootstrapStorageKey = 'rinklink.appBootstrap';
const bootstrapCacheTtlMs = 60_000;

interface AuthContextValue {
  authEnabled: boolean;
  loading: boolean;
  isAuthenticated: boolean;
  me: MeResponse | null;
  bootstrap: AppBootstrap | null;
  error: string | null;
  refreshProfile: (options?: { silent?: boolean }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  authEnabled,
  loading: authEnabled,
  isAuthenticated: false,
  me: null,
  bootstrap: null,
  error: null,
  refreshProfile: async () => {},
});

function sessionEmail(session: unknown): string | null {
  if (!session || typeof session !== 'object') return null;
  const user = (session as { user?: unknown }).user;
  if (!user || typeof user !== 'object') return null;
  const email = (user as { email?: unknown }).email;
  return typeof email === 'string' ? email : null;
}

function loadStoredBootstrap(email: string | null): AppBootstrap | null {
  try {
    const stored = window.sessionStorage.getItem(bootstrapStorageKey);
    if (!stored) return null;
    const payload = JSON.parse(stored) as { email?: string | null; expiresAt?: number; bootstrap?: AppBootstrap };
    if (!payload.bootstrap || !payload.expiresAt || payload.expiresAt <= Date.now()) {
      window.sessionStorage.removeItem(bootstrapStorageKey);
      return null;
    }
    if (email && payload.email && payload.email !== email) {
      return null;
    }
    return payload.bootstrap;
  } catch {
    return null;
  }
}

function storeBootstrap(bootstrap: AppBootstrap, email: string | null) {
  try {
    window.sessionStorage.setItem(bootstrapStorageKey, JSON.stringify({
      email,
      expiresAt: Date.now() + bootstrapCacheTtlMs,
      bootstrap,
    }));
  } catch {
    // Session storage is only a startup optimization.
  }
}

function clearStoredBootstrap() {
  try {
    window.sessionStorage.removeItem(bootstrapStorageKey);
  } catch {
    // Ignore storage availability failures.
  }
}

function DisabledAuthProvider({ children }: { children: ReactNode }) {
  return (
    <AuthContext.Provider
      value={{
        authEnabled: false,
        loading: false,
        isAuthenticated: true,
        me: null,
        bootstrap: null,
        error: null,
        refreshProfile: async () => {},
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function EnabledAuthProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending, error: sessionError, refetch } = authClient.useSession();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [bootstrap, setBootstrap] = useState<AppBootstrap | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const loadProfile = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!session) {
      clearApiAccessToken();
      clearStoredBootstrap();
      setMe(null);
      setBootstrap(null);
      setProfileError(null);
      return;
    }

    const email = sessionEmail(session);
    const cachedBootstrap = silent ? null : loadStoredBootstrap(email);
    if (cachedBootstrap) {
      setBootstrap(cachedBootstrap);
      setMe(cachedBootstrap.me);
      setProfileError(null);
      setProfileLoading(false);
    } else if (!silent) {
      setProfileLoading(true);
    }
    try {
      const data = await api.getAppBootstrap();
      setBootstrap(data);
      setMe(data.me);
      storeBootstrap(data, email);
      setProfileError(null);
    } catch (error) {
      if (!cachedBootstrap && !silent) {
        setMe(null);
        setBootstrap(null);
      }
      setProfileError(String(error));
    } finally {
      if (!silent) {
        setProfileLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadProfile();
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthContext.Provider
      value={{
        authEnabled: true,
        loading: isPending || profileLoading,
        isAuthenticated: !!session,
        me,
        bootstrap,
        error: profileError ?? sessionError?.message ?? null,
        refreshProfile: async (options) => {
          if (options?.silent) {
            await loadProfile({ silent: true });
            return;
          }
          await refetch();
          await loadProfile();
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  if (!authEnabled) {
    return <DisabledAuthProvider>{children}</DisabledAuthProvider>;
  }
  return <EnabledAuthProvider>{children}</EnabledAuthProvider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
