import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Team } from '../types';
import { api } from '../api/client';

interface TeamContextType {
  teams: Team[];
  activeTeam: Team | null;
  setActiveTeam: (team: Team | null) => void;
  refreshTeams: () => Promise<void>;
}

const TeamContext = createContext<TeamContextType>({
  teams: [],
  activeTeam: null,
  setActiveTeam: () => {},
  refreshTeams: async () => {},
});

export function TeamProvider({ children }: { children: ReactNode }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTeam, setActiveTeam] = useState<Team | null>(null);

  const refreshTeams = async () => {
    const data = await api.getTeams();
    setTeams(data);
    if (!activeTeam && data.length > 0) {
      setActiveTeam(data[0]);
    }
  };

  useEffect(() => {
    refreshTeams();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <TeamContext.Provider value={{ teams, activeTeam, setActiveTeam, refreshTeams }}>
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam() {
  return useContext(TeamContext);
}
