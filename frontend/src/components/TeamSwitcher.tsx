import { useTeam } from '../context/TeamContext';
import { Select } from './ui/Select';

export default function TeamSwitcher() {
  const { teams, activeTeam, setActiveTeam, loading } = useTeam();
  const showPlaceholder = loading || teams.length === 0;

  return (
    <div className="flex items-center gap-2">
      <div className="hidden text-xs font-medium text-slate-600 sm:block dark:text-white/80">Active team</div>
      <div className="w-full min-w-0 sm:w-[320px]">
        <Select
          value={activeTeam?.id || ''}
          disabled={loading}
          onChange={(e) => {
            const team = teams.find((t) => t.id === e.target.value) || null;
            setActiveTeam(team);
          }}
          className="bg-white/80 text-slate-900 shadow-sm ring-1 ring-slate-200/80 focus:border-cyan-400 focus:ring-cyan-400 dark:bg-slate-950/40 dark:text-slate-100 dark:ring-slate-700/60 dark:focus:border-cyan-400 dark:focus:ring-cyan-400"
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
