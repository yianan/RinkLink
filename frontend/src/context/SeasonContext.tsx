import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Season } from '../types';
import { api } from '../api/client';

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

export function SeasonProvider({ children }: { children: ReactNode }) {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSeasons = async () => {
    setLoading(true);
    try {
      const data = await api.getSeasons();
      setSeasons(data);
      const savedSeasonId = window.localStorage.getItem('rinklink.activeSeasonId');
      const nextActiveSeason =
        (savedSeasonId ? data.find((season) => season.id === savedSeasonId) : null) ??
        (activeSeason ? data.find((season) => season.id === activeSeason.id) ?? null : null) ??
        data.find((season) => season.is_active) ??
        data[0] ??
        null;
      setActiveSeason(nextActiveSeason);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshSeasons();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
