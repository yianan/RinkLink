import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { api } from '../api/client';
import type { MeResponse } from '../types';
import { authClient, authEnabled, clearApiAccessToken } from '../lib/auth-client';

interface AuthContextValue {
  authEnabled: boolean;
  loading: boolean;
  isAuthenticated: boolean;
  me: MeResponse | null;
  error: string | null;
  refreshProfile: () => Promise<void>;
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

  const refreshProfile = async () => {
    if (!session) {
      clearApiAccessToken();
      setMe(null);
      setProfileError(null);
      return;
    }

    setProfileLoading(true);
    try {
      const data = await api.getMe();
      setMe(data);
      setProfileError(null);
    } catch (error) {
      setMe(null);
      setProfileError(String(error));
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    refreshProfile();
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthContext.Provider
      value={{
        authEnabled: true,
        loading: isPending || profileLoading,
        isAuthenticated: !!session,
        me,
        error: profileError ?? sessionError?.message ?? null,
        refreshProfile: async () => {
          await refetch();
          await refreshProfile();
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
