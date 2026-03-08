import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Season } from '../types';
import { api } from '../api/client';
import { useTeam } from './TeamContext';

interface SeasonContextType {
  seasons: Season[];
  activeSeason: Season | null;
  setActiveSeason: (season: Season | null) => void;
  refreshSeasons: () => Promise<void>;
}

const SeasonContext = createContext<SeasonContextType>({
  seasons: [],
  activeSeason: null,
  setActiveSeason: () => {},
  refreshSeasons: async () => {},
});

export function SeasonProvider({ children }: { children: ReactNode }) {
  const { activeTeam } = useTeam();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);

  const refreshSeasons = async () => {
    if (!activeTeam) {
      setSeasons([]);
      setActiveSeason(null);
      return;
    }
    const data = await api.getSeasons({ association_id: activeTeam.association_id });
    setSeasons(data);
    // Default to the active season
    const active = data.find((s) => s.is_active) || null;
    setActiveSeason(active);
  };

  useEffect(() => {
    refreshSeasons();
  }, [activeTeam?.association_id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SeasonContext.Provider value={{ seasons, activeSeason, setActiveSeason, refreshSeasons }}>
      {children}
    </SeasonContext.Provider>
  );
}

export function useSeason() {
  return useContext(SeasonContext);
}
