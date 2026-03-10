import { useSeason } from '../context/SeasonContext';
import { Select } from './ui/Select';

export default function SeasonSwitcher() {
  const { seasons, activeSeason, setActiveSeason, loading } = useSeason();

  if (!loading && seasons.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <div className="hidden text-xs font-medium text-slate-600 sm:block dark:text-white/80">Season</div>
      <div className="w-full min-w-0 sm:w-[200px]">
        <Select
          value={activeSeason?.id || ''}
          disabled={loading}
          onChange={(e) => {
            const season = seasons.find((s) => s.id === e.target.value) || null;
            setActiveSeason(season);
          }}
          className="bg-white/80 text-slate-900 shadow-sm ring-1 ring-slate-200/80 focus:border-cyan-400 focus:ring-cyan-400 dark:bg-slate-950/40 dark:text-slate-100 dark:ring-slate-700/60 dark:focus:border-cyan-400 dark:focus:ring-cyan-400"
        >
          <option value="">{loading ? 'Loading seasons…' : 'All Seasons'}</option>
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
