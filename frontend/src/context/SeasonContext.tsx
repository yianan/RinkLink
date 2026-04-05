import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Season } from '../types';
import { api } from '../api/client';
import { useAuth } from './AuthContext';
import { readCachedSeasons, writeCachedSeasons } from '../lib/bootstrap-cache';

interface SeasonContextType {
  seasons: Season[];
  activeSeason: Season | null;
  setActiveSeason: (season: Season | null) => void;
  refreshSeasons: () => Promise<void>;
  loading: boolean;
}

const SeasonContext = createContext<SeasonContextType>({
  seasons: [],
  activeSeason: null,
  setActiveSeason: () => {},
  refreshSeasons: async () => {},
  loading: true,
});

function pickActiveSeason(data: Season[], previousActiveSeason: Season | null): Season | null {
  const savedSeasonId = window.localStorage.getItem('rinklink.activeSeasonId');
  return (
    (savedSeasonId ? data.find((season) => season.id === savedSeasonId) : null) ??
    (previousActiveSeason ? data.find((season) => season.id === previousActiveSeason.id) ?? null : null) ??
    data.find((season) => season.is_active) ??
    data[0] ??
    null
  );
}

export function SeasonProvider({ children }: { children: ReactNode }) {
  const { authEnabled, isAuthenticated, loading: authLoading, me } = useAuth();
  const [seasons, setSeasons] = useState<Season[]>(() => readCachedSeasons());
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);
  const [loading, setLoading] = useState(seasons.length === 0);
  const appAccessReady = !authEnabled || (
    isAuthenticated
    && !!me
    && (me.user.is_platform_admin || me.user.status === 'active')
  );

  const applySeasons = (nextSeasons: Season[]) => {
    setSeasons(nextSeasons);
    setActiveSeason((previousActiveSeason) => pickActiveSeason(nextSeasons, previousActiveSeason));
  };

  const refreshSeasons = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!appAccessReady) {
      setSeasons([]);
      setActiveSeason(null);
      setLoading(false);
      return;
    }

    if (!silent) {
      setLoading(true);
    }
    try {
      const data = await api.getSeasons();
      writeCachedSeasons(data);
      applySeasons(data);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (appAccessReady && seasons.length > 0) {
      setActiveSeason((previousActiveSeason) => pickActiveSeason(seasons, previousActiveSeason));
      setLoading(false);
      void refreshSeasons({ silent: true });
      return;
    }

    void refreshSeasons();
  }, [appAccessReady, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeSeason?.id) {
      window.localStorage.setItem('rinklink.activeSeasonId', activeSeason.id);
    } else {
      window.localStorage.removeItem('rinklink.activeSeasonId');
    }
  }, [activeSeason?.id]);

  return (
    <SeasonContext.Provider value={{ seasons, activeSeason, setActiveSeason, refreshSeasons, loading }}>
      {children}
    </SeasonContext.Provider>
  );
}

export function useSeason() {
  return useContext(SeasonContext);
}
