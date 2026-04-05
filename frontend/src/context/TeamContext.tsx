import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Team } from '../types';
import { api } from '../api/client';
import { useAuth } from './AuthContext';
import { readCachedTeams, writeCachedTeams } from '../lib/bootstrap-cache';

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

function pickActiveTeam(data: Team[], previousActiveTeam: Team | null): Team | null {
  const savedTeamId = window.localStorage.getItem('rinklink.activeTeamId');
  return (
    (savedTeamId ? data.find((team) => team.id === savedTeamId) : null) ??
    (previousActiveTeam ? data.find((team) => team.id === previousActiveTeam.id) ?? null : null) ??
    data[0] ??
    null
  );
}

export function TeamProvider({ children }: { children: ReactNode }) {
  const { authEnabled, isAuthenticated, loading: authLoading, me } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTeam, setActiveTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const appAccessReady = !authEnabled || (
    isAuthenticated
    && !!me
    && (me.user.is_platform_admin || me.user.status === 'active')
  );

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

  const applyTeams = (nextTeams: Team[]) => {
    setTeams(nextTeams);
    setActiveTeam((previousActiveTeam) => pickActiveTeam(nextTeams, previousActiveTeam));
  };

  const refreshTeams = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!appAccessReady) {
      setTeams([]);
      setActiveTeam(null);
      setLoading(false);
      return;
    }

    if (!silent) {
      setLoading(true);
    }
    try {
      let data = await api.getTeams();
      if (data.length === 0 && accessibleTeamsFallback.length > 0) {
        data = accessibleTeamsFallback;
      }
      writeCachedTeams({ user: { id: me?.user.auth_id, email: me?.user.email } }, data);
      applyTeams(data);
    } catch {
      if (accessibleTeamsFallback.length > 0) {
        applyTeams(accessibleTeamsFallback);
      } else {
        setTeams([]);
        setActiveTeam(null);
      }
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

    if (appAccessReady && accessibleTeamsFallback.length > 0) {
      const cachedTeams = readCachedTeams({ user: { id: me?.user.auth_id, email: me?.user.email } });
      applyTeams(cachedTeams.length > 0 ? cachedTeams : accessibleTeamsFallback);
      setLoading(false);
      void refreshTeams({ silent: true });
      return;
    }

    void refreshTeams();
  }, [appAccessReady, authLoading, me?.accessible_teams]); // eslint-disable-line react-hooks/exhaustive-deps

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
