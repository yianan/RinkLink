import { useTeam } from '../context/TeamContext';
import { Select } from './ui/Select';
import { useLocation } from 'react-router-dom';
import TeamLogo from './TeamLogo';

const HIDE_TEAM_SWITCHER_PATHS = ['/associations', '/arenas', '/competitions'];

export default function TeamSwitcher() {
  const { teams, activeTeam, setActiveTeam, loading } = useTeam();
  const location = useLocation();
  const showPlaceholder = loading || teams.length === 0;
  const hideTeamSwitcher = HIDE_TEAM_SWITCHER_PATHS.some((path) => location.pathname.startsWith(path));

  if (hideTeamSwitcher) return null;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="hidden text-xs font-medium text-slate-600 sm:block dark:text-white/80">Active team</div>
      {activeTeam ? (
        <TeamLogo name={activeTeam.name} logoUrl={activeTeam.logo_url} className="hidden h-10 w-10 rounded-xl sm:inline-flex" initialsClassName="text-xs" />
      ) : null}
      <div className="w-full min-w-0 sm:w-[320px]">
        <Select
          value={activeTeam?.id || ''}
          disabled={loading}
          onChange={(e) => {
            const team = teams.find((t) => t.id === e.target.value) || null;
            setActiveTeam(team);
          }}
          className="min-h-11 w-full bg-white/80 text-slate-900 shadow-sm ring-1 ring-slate-200/80 focus:border-cyan-400 focus:ring-cyan-400 sm:min-h-10 dark:bg-slate-950/40 dark:text-slate-100 dark:ring-slate-700/60 dark:focus:border-cyan-400 dark:focus:ring-cyan-400"
        >
          {showPlaceholder && <option value="">{loading ? 'Loading teams…' : 'Select a team…'}</option>}
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
