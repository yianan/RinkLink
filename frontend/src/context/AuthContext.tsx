import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { api } from '../api/client';
import type { MeResponse } from '../types';
import { authClient, authEnabled, clearApiAccessToken } from '../lib/auth-client';
import {
  clearCachedProfile,
  clearCachedTeams,
  readCachedProfile,
  writeCachedProfile,
  writeCachedSeasons,
  writeCachedTeams,
} from '../lib/bootstrap-cache';

type SessionLike = {
  user?: {
    id?: string;
    email?: string;
  };
} | null;

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
      clearCachedTeams();
      setMe(null);
      setProfileError(null);
      return;
    }

    if (!silent) {
      setProfileLoading(true);
    }
    try {
      const data = await api.getBootstrap();
      writeCachedProfile(data.me);
      writeCachedTeams(session as SessionLike, data.teams);
      writeCachedSeasons(data.seasons);
      setMe(data.me);
      setProfileError(null);
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
