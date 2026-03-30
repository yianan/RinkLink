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
  const { authEnabled, isAuthenticated, loading: authLoading, me } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTeam, setActiveTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);

  const accessibleTeamsFallback: Team[] = (me?.accessible_teams || []).map((team) => ({
    id: team.id,
    association_id: team.association_id,
    name: team.name,
    age_group: team.age_group,
    level: team.level,
    manager_name: '',
    manager_email: '',
    manager_phone: '',
    logo_url: null,
    myhockey_ranking: null,
    wins: 0,
    losses: 0,
    ties: 0,
    association_name: null,
    primary_membership: null,
    memberships: [],
    created_at: '',
    updated_at: '',
  }));

  const refreshTeams = async () => {
    if (authEnabled && !isAuthenticated) {
      setTeams([]);
      setActiveTeam(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let data = await api.getTeams();
      if (data.length === 0 && accessibleTeamsFallback.length > 0) {
        data = accessibleTeamsFallback;
      }
      setTeams(data);
      const savedTeamId = window.localStorage.getItem('rinklink.activeTeamId');
      const nextActiveTeam =
        (savedTeamId ? data.find((team) => team.id === savedTeamId) : null) ??
        (activeTeam ? data.find((team) => team.id === activeTeam.id) ?? null : null) ??
        data[0] ??
        null;
      setActiveTeam(nextActiveTeam);
    } catch {
      if (accessibleTeamsFallback.length > 0) {
        setTeams(accessibleTeamsFallback);
        const savedTeamId = window.localStorage.getItem('rinklink.activeTeamId');
        const nextActiveTeam =
          (savedTeamId ? accessibleTeamsFallback.find((team) => team.id === savedTeamId) : null) ??
          (activeTeam ? accessibleTeamsFallback.find((team) => team.id === activeTeam.id) ?? null : null) ??
          accessibleTeamsFallback[0] ??
          null;
        setActiveTeam(nextActiveTeam);
      } else {
        setTeams([]);
        setActiveTeam(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) {
      return;
    }
    refreshTeams();
  }, [authLoading, isAuthenticated, me?.accessible_teams]); // eslint-disable-line react-hooks/exhaustive-deps

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
