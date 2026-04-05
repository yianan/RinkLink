import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { api } from '../api/client';
import type { MeResponse } from '../types';
import { authClient, authEnabled, clearApiAccessToken } from '../lib/auth-client';

const PROFILE_CACHE_KEY = 'rinklink.authProfile';
const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;

type SessionLike = {
  user?: {
    id?: string;
    email?: string;
  };
} | null;

type CachedProfile = {
  authId: string | null;
  email: string | null;
  savedAt: number;
  me: MeResponse;
};

function readCachedProfile(session: SessionLike): MeResponse | null {
  if (typeof window === 'undefined' || !session?.user) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as CachedProfile;
    if (!parsed?.me || typeof parsed.savedAt !== 'number') {
      return null;
    }
    if (Date.now() - parsed.savedAt > PROFILE_CACHE_TTL_MS) {
      window.sessionStorage.removeItem(PROFILE_CACHE_KEY);
      return null;
    }

    const sessionUserId = session.user.id ?? null;
    const sessionEmail = session.user.email?.toLowerCase() ?? null;
    if (parsed.authId && sessionUserId && parsed.authId !== sessionUserId) {
      return null;
    }
    if (parsed.email && sessionEmail && parsed.email !== sessionEmail) {
      return null;
    }
    return parsed.me;
  } catch {
    return null;
  }
}

function writeCachedProfile(me: MeResponse) {
  if (typeof window === 'undefined') {
    return;
  }

  const payload: CachedProfile = {
    authId: me.user.auth_id,
    email: me.user.email.toLowerCase(),
    savedAt: Date.now(),
    me,
  };
  window.sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(payload));
}

function clearCachedProfile() {
  if (typeof window === 'undefined') {
    return;
  }
  window.sessionStorage.removeItem(PROFILE_CACHE_KEY);
}

interface AuthContextValue {
  authEnabled: boolean;
  loading: boolean;
  isAuthenticated: boolean;
  me: MeResponse | null;
  error: string | null;
  refreshProfile: (options?: { silent?: boolean }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  authEnabled,
  loading: authEnabled,
  isAuthenticated: false,
  me: null,
  error: null,
  refreshProfile: async () => {},
});

function DisabledAuthProvider({ children }: { children: ReactNode }) {
  return (
    <AuthContext.Provider
      value={{
        authEnabled: false,
        loading: false,
        isAuthenticated: true,
        me: null,
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
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const loadProfile = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!session) {
      clearApiAccessToken();
      clearCachedProfile();
      setMe(null);
      setProfileError(null);
      return;
    }

    if (!silent) {
      setProfileLoading(true);
    }
    try {
      const data = await api.getMe();
      setMe(data);
      setProfileError(null);
      writeCachedProfile(data);
    } catch (error) {
      setProfileError(String(error));
      if (!silent) {
        setMe(null);
      }
    } finally {
      if (!silent) {
        setProfileLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!session) {
      void loadProfile();
      return;
    }

    const cachedProfile = readCachedProfile(session as SessionLike);
    if (cachedProfile) {
      setMe(cachedProfile);
      setProfileError(null);
      void loadProfile({ silent: true });
      return;
    }

    void loadProfile();
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthContext.Provider
      value={{
        authEnabled: true,
        loading: isPending || (profileLoading && !me),
        isAuthenticated: !!session,
        me,
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
