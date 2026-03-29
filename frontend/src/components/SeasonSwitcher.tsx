import { useSeason } from '../context/SeasonContext';
import { Select } from './ui/Select';
import { useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { toolbarSelectClass } from '../lib/uiClasses';

const HIDE_SEASON_SWITCHER_PATHS = ['/associations', '/arenas'];
const REQUIRE_SPECIFIC_SEASON_PATHS = ['/standings', '/availability', '/search', '/schedule', '/events', '/proposals', '/roster', '/competitions'];

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
    <div className="flex min-w-0 items-center gap-2">
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
          className={toolbarSelectClass}
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
