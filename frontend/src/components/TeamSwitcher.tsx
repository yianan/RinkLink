import { useTeam } from '../context/TeamContext';
import { Select } from './ui/Select';

export default function TeamSwitcher() {
  const { teams, activeTeam, setActiveTeam } = useTeam();

  return (
    <div className="flex items-center gap-2">
      <div className="hidden text-xs font-medium text-white/80 sm:block">Active team</div>
      <div className="w-full min-w-0 sm:w-[320px]">
        <Select
          value={activeTeam?.id || ''}
          onChange={(e) => {
            const team = teams.find((t) => t.id === e.target.value) || null;
            setActiveTeam(team);
          }}
          className="bg-white/90 text-slate-900 shadow-sm ring-1 ring-white/30 focus:border-white focus:ring-white"
        >
          <option value="">Select a team…</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.association_name})
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
