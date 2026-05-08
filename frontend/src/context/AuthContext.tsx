/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { api, ApiError } from '../api/client';
import type { AppBootstrap, MeResponse } from '../types';
import { authEnabled, clearApiAccessToken, getApiAccessToken } from '../lib/auth-client';

const bootstrapStorageKey = 'rinklink.appBootstrap';
const bootstrapCacheTtlMs = 60_000;

interface AuthContextValue {
  authEnabled: boolean;
  loading: boolean;
  isAuthenticated: boolean;
  me: MeResponse | null;
  bootstrap: AppBootstrap | null;
  error: string | null;
  clearProfile: () => void;
  refreshProfile: (options?: { assumeAuthenticated?: boolean; silent?: boolean }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  authEnabled,
  loading: authEnabled,
  isAuthenticated: false,
  me: null,
  bootstrap: null,
  error: null,
  clearProfile: () => {},
  refreshProfile: async () => {},
});

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
        clearProfile: () => {},
        refreshProfile: async () => {},
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function isPublicAuthPath(pathname: string) {
  return (
    pathname === '/login'
    || pathname === '/auth/sign-in'
    || pathname === '/auth/sign-up'
    || pathname === '/auth/check-email'
    || pathname === '/auth/forgot-password'
    || pathname === '/auth/reset-password'
  );
}

function EnabledAuthProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [bootstrap, setBootstrap] = useState<AppBootstrap | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const clearProfile = useCallback(() => {
    clearApiAccessToken();
    clearStoredBootstrap();
    setAuthenticated(false);
    setMe(null);
    setBootstrap(null);
    setProfileError(null);
    setProfileLoading(false);
    setInitializing(false);
  }, []);

  const loadProfile = useCallback(async ({
    assumeAuthenticated = false,
    silent = false,
    requireValidToken = false,
  }: {
    assumeAuthenticated?: boolean;
    silent?: boolean;
    requireValidToken?: boolean;
  } = {}) => {
    if (assumeAuthenticated) {
      clearApiAccessToken();
      clearStoredBootstrap();
    }

    if (requireValidToken && !assumeAuthenticated) {
      const token = await getApiAccessToken();
      if (!token) {
        clearProfile();
        return;
      }
    }

    const email = me?.user.email ?? null;
    const cachedBootstrap = silent ? null : loadStoredBootstrap(email);
    if (cachedBootstrap) {
      setBootstrap(cachedBootstrap);
      setMe(cachedBootstrap.me);
      setAuthenticated(true);
      setProfileError(null);
      setProfileLoading(false);
    } else if (!silent) {
      setProfileLoading(true);
    }
    try {
      const data = await api.getAppBootstrap();
      setAuthenticated(true);
      setBootstrap(data);
      setMe(data.me);
      storeBootstrap(data, data.me.user.email);
      setProfileError(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearProfile();
        return;
      }
      if (!cachedBootstrap && !silent) {
        setMe(null);
        setBootstrap(null);
      }
      if (assumeAuthenticated || requireValidToken || authenticated) {
        setAuthenticated(true);
      }
      setProfileError(String(error));
    } finally {
      if (!silent) {
        setProfileLoading(false);
      }
      setInitializing(false);
    }
  }, [authenticated, clearProfile, me?.user.email]);

  useEffect(() => {
    if (authenticated && bootstrap) {
      setInitializing(false);
      return;
    }
    if (isPublicAuthPath(location.pathname)) {
      setInitializing(false);
      return;
    }
    void loadProfile({ requireValidToken: true });
  }, [authenticated, bootstrap, loadProfile, location.pathname]);

  return (
    <AuthContext.Provider
      value={{
        authEnabled: true,
        loading: initializing || profileLoading,
        isAuthenticated: authenticated,
        me,
        bootstrap,
        error: profileError,
        clearProfile,
        refreshProfile: async (options) => {
          if (options?.silent) {
            await loadProfile({ silent: true });
            return;
          }
          if (options?.assumeAuthenticated) {
            await loadProfile({ assumeAuthenticated: true });
            return;
          }
          await loadProfile({ requireValidToken: true });
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
