import { useSeason } from '../context/SeasonContext';
import { Select } from './ui/Select';
import { useLocation } from 'react-router-dom';
import { useEffect } from 'react';

const HIDE_SEASON_SWITCHER_PATHS = ['/associations', '/rinks'];
const REQUIRE_SPECIFIC_SEASON_PATHS = ['/standings', '/schedule', '/search', '/practice', '/proposals', '/roster', '/competitions'];

export default function SeasonSwitcher() {
  const { seasons, activeSeason, setActiveSeason, loading } = useSeason();
  const location = useLocation();
  const hideSeasonSwitcher = HIDE_SEASON_SWITCHER_PATHS.some((path) => location.pathname.startsWith(path));
  const requireSpecificSeason = REQUIRE_SPECIFIC_SEASON_PATHS.some((path) => location.pathname.startsWith(path));
  const fallbackSeason = seasons.find((season) => season.is_active) ?? seasons[0] ?? null;

  useEffect(() => {
    if (!loading && requireSpecificSeason && !activeSeason && fallbackSeason) {
      setActiveSeason(fallbackSeason);
    }
  }, [activeSeason, fallbackSeason, loading, requireSpecificSeason, setActiveSeason]);

  if (hideSeasonSwitcher || (!loading && seasons.length === 0)) return null;

  return (
    <div className="flex items-center gap-2">
      <div className="hidden text-xs font-medium text-slate-600 sm:block dark:text-white/80">Season</div>
      <div className="w-full min-w-0 sm:w-[150px]">
        <Select
          value={activeSeason?.id || ''}
          disabled={loading}
          onChange={(e) => {
            const season = seasons.find((s) => s.id === e.target.value);
            if (season) {
              setActiveSeason(season);
              return;
            }
            if (!requireSpecificSeason) setActiveSeason(null);
          }}
          className="bg-white/80 text-slate-900 shadow-sm ring-1 ring-slate-200/80 focus:border-cyan-400 focus:ring-cyan-400 dark:bg-slate-950/40 dark:text-slate-100 dark:ring-slate-700/60 dark:focus:border-cyan-400 dark:focus:ring-cyan-400"
        >
          {!requireSpecificSeason && <option value="">{loading ? 'Loading seasons…' : 'All Seasons'}</option>}
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
