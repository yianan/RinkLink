import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Team } from '../types';
import { api } from '../api/client';
import { useAuth } from './AuthContext';

interface TeamContextType {
  teams: Team[];
  activeTeam: Team | null;
  setActiveTeam: (team: Team | null) => void;
  refreshTeams: () => Promise<void>;
  loading: boolean;
}

const TeamContext = createContext<TeamContextType>({
  teams: [],
  activeTeam: null,
  setActiveTeam: () => {},
  refreshTeams: async () => {},
  loading: true,
});

export function TeamProvider({ children }: { children: ReactNode }) {
  const { authEnabled, isAuthenticated, loading: authLoading } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTeam, setActiveTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshTeams = async () => {
    if (authEnabled && !isAuthenticated) {
      setTeams([]);
      setActiveTeam(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await api.getTeams();
      setTeams(data);
      const savedTeamId = window.localStorage.getItem('rinklink.activeTeamId');
      const nextActiveTeam =
        (savedTeamId ? data.find((team) => team.id === savedTeamId) : null) ??
        (activeTeam ? data.find((team) => team.id === activeTeam.id) ?? null : null) ??
        data[0] ??
        null;
      setActiveTeam(nextActiveTeam);
    } catch {
      setTeams([]);
      setActiveTeam(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) {
      return;
    }
    refreshTeams();
  }, [authLoading, isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTeam?.id) {
      window.localStorage.setItem('rinklink.activeTeamId', activeTeam.id);
    } else {
      window.localStorage.removeItem('rinklink.activeTeamId');
    }
  }, [activeTeam?.id]);

  return (
    <TeamContext.Provider value={{ teams, activeTeam, setActiveTeam, refreshTeams, loading }}>
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam() {
  return useContext(TeamContext);
}
