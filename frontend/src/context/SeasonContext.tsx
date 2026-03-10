import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Season } from '../types';
import { api } from '../api/client';
import { useTeam } from './TeamContext';

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
  const { activeTeam, loading: teamLoading } = useTeam();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSeasons = async () => {
    if (teamLoading) return;
    if (!activeTeam) {
      setSeasons([]);
      setActiveSeason(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await api.getSeasons({ association_id: activeTeam.association_id });
      setSeasons(data);
      const storageKey = `rinklink.activeSeasonId:${activeTeam.association_id}`;
      const savedSeasonId = window.localStorage.getItem(storageKey);
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
    if (teamLoading) return;
    refreshSeasons();
  }, [activeTeam?.association_id, teamLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeTeam) return;
    const storageKey = `rinklink.activeSeasonId:${activeTeam.association_id}`;
    if (activeSeason?.id) {
      window.localStorage.setItem(storageKey, activeSeason.id);
    } else {
      window.localStorage.removeItem(storageKey);
    }
  }, [activeSeason?.id, activeTeam?.association_id]);

  return (
    <SeasonContext.Provider value={{ seasons, activeSeason, setActiveSeason, refreshSeasons, loading }}>
      {children}
    </SeasonContext.Provider>
  );
}

export function useSeason() {
  return useContext(SeasonContext);
}
