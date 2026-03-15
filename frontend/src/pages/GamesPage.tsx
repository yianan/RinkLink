import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarPlus2, Save, SlidersHorizontal } from 'lucide-react';
import { useTeam } from '../context/TeamContext';
import { useSeason } from '../context/SeasonContext';
import { api } from '../api/client';
import { Game } from '../types';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import FilterPillGroup, { type FilterOption } from '../components/FilterPillGroup';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import PageHeader from '../components/PageHeader';
import SegmentedTabs from '../components/SegmentedTabs';
import EmptyState from '../components/EmptyState';
import { CardListSkeleton, TableSkeleton } from '../components/ui/TableSkeleton';
import { cn } from '../lib/cn';
import { getCompetitionBadgeVariant, getCompetitionLabel } from '../lib/competition';
import { getGameStatusLabel, getGameStatusVariant } from '../lib/gameStatus';
import { filterButtonClass } from '../lib/uiClasses';
import { formatShortDate, formatTimeHHMM } from '../lib/time';
import { useToast } from '../context/ToastContext';

const GAME_TYPES = [
  { value: '', label: '—' },
  { value: 'league', label: 'League' },
  { value: 'non_league', label: 'Non-League' },
  { value: 'showcase', label: 'Showcase' },
  { value: 'tournament', label: 'Tournament' },
  { value: 'state_tournament', label: 'State Tournament' },
  { value: 'district', label: 'District' },
  { value: 'scrimmage', label: 'Scrimmage' },
];

const statusColors: Record<string, 'info' | 'warning' | 'success' | 'neutral'> = {
  scheduled: 'info',
  confirmed: 'warning',
  final: 'success',
  cancelled: 'neutral',
};

function digitsOnly(value: string) {
  return value.replace(/\D+/g, '');
}

function toggleFilterValue(values: string[], nextValue: string) {
  return values.includes(nextValue)
    ? values.filter((value) => value !== nextValue)
    : [...values, nextValue];
}

export default function GamesPage() {
  const { activeTeam } = useTeam();
  const { activeSeason } = useSeason();
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const [games, setGames] = useState<Game[]>([]);
  const [scoreEdits, setScoreEdits] = useState<Record<string, { home: string; away: string }>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedVenues, setSelectedVenues] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const pushToast = useToast();

  useEffect(() => {
    if (!activeTeam) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const gs = await api.getGames(activeTeam.id);
        if (cancelled) return;
        setGames(gs);
        const edits: Record<string, { home: string; away: string }> = {};
        gs.forEach((g) => {
          edits[g.id] = {
            home: g.home_score != null ? String(g.home_score) : '',
            away: g.away_score != null ? String(g.away_score) : '',
          };
        });
        setScoreEdits(edits);
      } catch (e) {
        if (cancelled) return;
        setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [activeTeam, activeSeason]);

  const handleTypeChange = async (gameId: string, game_type: string) => {
    const updated = await api.updateGame(gameId, { game_type: (game_type || null) as Game['game_type'] });
    setGames((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
    pushToast({ variant: 'success', title: 'Game type updated' });
  };

  const handleSaveScore = async (gameId: string) => {
    const edit = scoreEdits[gameId];
    if (!edit) return;
    const home_score = edit.home === '' ? null : Number(edit.home);
    const away_score = edit.away === '' ? null : Number(edit.away);
    const updated = await api.updateGame(gameId, { home_score, away_score });
    setGames((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
    pushToast({ variant: 'success', title: 'Score saved' });
  };

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const seasonScopedGames = useMemo(() => {
    if (!activeSeason) return games;
    return games.filter((g) => g.date >= activeSeason.start_date && g.date <= activeSeason.end_date);
  }, [activeSeason, games]);

  const typeOptions = useMemo<FilterOption[]>(() => {
    const values = Array.from(new Set(seasonScopedGames.map((game) => game.game_type || '__unset__')));
    return values.map((value) => ({
      value,
      label: value === '__unset__' ? 'Unassigned' : getCompetitionLabel(value),
    }));
  }, [seasonScopedGames]);

  const statusOptions = useMemo<FilterOption[]>(() => {
    const values = Array.from(new Set(seasonScopedGames.map((game) => getGameStatusLabel(game))));
    const order = ['Scheduled', 'Home confirmed', 'Away confirmed', 'Both confirmed', 'Final', 'Cancelled'];
    return values
      .sort((left, right) => order.indexOf(left) - order.indexOf(right))
      .map((value) => ({ value, label: value }));
  }, [seasonScopedGames]);

  const venueOptions = useMemo<FilterOption[]>(() => {
    if (!activeTeam) return [];
    const values = Array.from(
      new Set(seasonScopedGames.map((game) => (game.home_team_id === activeTeam.id ? 'Home' : 'Away'))),
    );
    return values.map((value) => ({ value, label: value }));
  }, [activeTeam, seasonScopedGames]);

  const filteredByOptionsGames = useMemo(() => {
    if (!activeTeam) return seasonScopedGames;
    return seasonScopedGames.filter((game) => {
      const gameType = game.game_type || '__unset__';
      const status = getGameStatusLabel(game);
      const venue = game.home_team_id === activeTeam.id ? 'Home' : 'Away';
      return (selectedTypes.length === 0 || selectedTypes.includes(gameType))
        && (selectedStatuses.length === 0 || selectedStatuses.includes(status))
        && (selectedVenues.length === 0 || selectedVenues.includes(venue));
    });
  }, [activeTeam, seasonScopedGames, selectedStatuses, selectedTypes, selectedVenues]);

  const activeFilterBadges = useMemo(() => {
    const labelsFor = (options: FilterOption[], selectedValues: string[]) =>
      options.filter((option) => selectedValues.includes(option.value)).map((option) => option.label);
    return [
      ...labelsFor(typeOptions, selectedTypes),
      ...labelsFor(statusOptions, selectedStatuses),
      ...labelsFor(venueOptions, selectedVenues),
    ];
  }, [selectedStatuses, selectedTypes, selectedVenues, statusOptions, typeOptions, venueOptions]);

  const hasActiveFilters = activeFilterBadges.length > 0;

  const clearFilters = () => {
    setSelectedTypes([]);
    setSelectedStatuses([]);
    setSelectedVenues([]);
  };

  const counts = useMemo(() => {
    const upcoming = filteredByOptionsGames.filter((g) => g.date >= todayStr).length;
    const past = filteredByOptionsGames.filter((g) => g.date < todayStr).length;
    return { upcoming, past, all: filteredByOptionsGames.length };
  }, [filteredByOptionsGames, todayStr]);

  const filtered = useMemo(() => {
    if (tab === 2) return filteredByOptionsGames;
    if (tab === 0) return filteredByOptionsGames.filter((g) => g.date >= todayStr);
    return filteredByOptionsGames.filter((g) => g.date < todayStr);
  }, [filteredByOptionsGames, tab, todayStr]);

  if (!activeTeam) {
    return <Alert variant="info">Select a team to view games.</Alert>;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Games"
        subtitle="League, showcase, and non-league games with scoresheets and weekly confirmation."
        actions={(
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFiltersOpen((open) => !open)}
            className={filterButtonClass}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {hasActiveFilters ? ` (${activeFilterBadges.length})` : ''}
          </Button>
        )}
      />

      {hasActiveFilters && !filtersOpen ? (
        <div className="flex flex-wrap items-center gap-2">
          {activeFilterBadges.map((label, index) => (
            <Badge key={`${label}:${index}`} variant="outline" className="bg-white/80 dark:bg-slate-950/35">
              {label}
            </Badge>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
            Clear all
          </Button>
        </div>
      ) : null}

      {filtersOpen ? (
        <Card className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Filter games</div>
              <div className="text-sm text-slate-600 dark:text-slate-400">
                Narrow the list by game type, status, and whether the game is home or away.
              </div>
            </div>
            {hasActiveFilters ? (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                Clear all
              </Button>
            ) : null}
          </div>

          {hasActiveFilters ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {activeFilterBadges.map((label, index) => (
                <Badge key={`${label}:${index}`} variant="outline" className="bg-white/80 dark:bg-slate-950/35">
                  {label}
                </Badge>
              ))}
            </div>
          ) : null}

          <div className="mt-4 grid gap-4 border-t border-[color:var(--app-border-subtle)] pt-4 xl:grid-cols-3">
            <FilterPillGroup
              label="Type"
              options={typeOptions}
              values={selectedTypes}
              onToggle={(value) => setSelectedTypes((current) => toggleFilterValue(current, value))}
              tone="sky"
            />
            <FilterPillGroup
              label="Status"
              options={statusOptions}
              values={selectedStatuses}
              onToggle={(value) => setSelectedStatuses((current) => toggleFilterValue(current, value))}
              tone="violet"
            />
            <FilterPillGroup
              label="Venue"
              options={venueOptions}
              values={selectedVenues}
              onToggle={(value) => setSelectedVenues((current) => toggleFilterValue(current, value))}
              tone="emerald"
            />
          </div>
        </Card>
      ) : null}


      <SegmentedTabs
        items={[
          { label: `Upcoming (${counts.upcoming})`, value: 0 },
          { label: `Past (${counts.past})`, value: 1 },
          { label: `All (${counts.all})`, value: 2 },
        ]}
        value={tab}
        onChange={setTab}
      />

      {error && <Alert variant="error">{error}</Alert>}

      <Card className="overflow-hidden">
        <div className="divide-y divide-slate-200 bg-white md:hidden dark:divide-slate-800 dark:bg-slate-950/20">
          {loading && <CardListSkeleton count={3} />}

          {!loading && filtered.map((g) => {
            const isHome = activeTeam.id === g.home_team_id;
            const opponent = isHome ? g.away_team_name : g.home_team_name;
            const edit = scoreEdits[g.id] || { home: '', away: '' };
            const statusLabel = getGameStatusLabel(g);

            return (
              <div key={g.id} className="px-4 py-4">
                <div
                  className="cursor-pointer"
                  onClick={() => navigate(`/games/${g.id}`)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{formatShortDate(g.date) || g.date}</div>
                      <div className="mt-0.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {formatTimeHHMM(g.time) || 'Time TBD'}
                      </div>
                    </div>
                    <Badge variant={getGameStatusVariant(g)}>
                      {statusLabel}
                    </Badge>
                  </div>
                  <div className="mt-3 text-base font-semibold text-slate-900 dark:text-slate-100">{opponent || '—'}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant={isHome ? 'success' : 'info'}>{isHome ? 'Home' : 'Away'}</Badge>
                    {g.game_type && <Badge variant={getCompetitionBadgeVariant(g.game_type)}>{getCompetitionLabel(g.game_type)}</Badge>}
                  </div>
                  {g.competition_short_name && g.division_name && (
                    <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      {g.competition_short_name} • {g.division_name}
                    </div>
                  )}
                  <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    {g.rink_name
                      ? `${g.rink_name}${g.rink_city ? ` • ${g.rink_city}, ${g.rink_state}` : ''}`
                      : g.location_label || 'No location yet'}
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Score</span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="w-14 text-center text-sm"
                    value={edit.home}
                    placeholder="H"
                    onChange={(e) => setScoreEdits((s) => ({ ...s, [g.id]: { ...edit, home: digitsOnly(e.target.value) } }))}
                  />
                  <span className="text-slate-500">–</span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="w-14 text-center text-sm"
                    value={edit.away}
                    placeholder="A"
                    onChange={(e) => setScoreEdits((s) => ({ ...s, [g.id]: { ...edit, away: digitsOnly(e.target.value) } }))}
                  />
                  <Button type="button" size="sm" variant="ghost" onClick={() => handleSaveScore(g.id)} title="Save score">
                    <Save className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}

          {!loading && filtered.length === 0 && (
            <div className="p-4">
              <EmptyState
                icon={<CalendarPlus2 className="h-5 w-5" />}
                title="No games to show"
                description={tab === 0 ? 'Add or confirm games from the Schedule page.' : 'There are no games in this view yet.'}
                actions={tab === 0 ? (
                  <Button type="button" size="sm" onClick={() => navigate('/schedule')}>
                    Open Schedule
                  </Button>
                ) : undefined}
                className="border-0 shadow-none"
              />
            </div>
          )}
        </div>

        <div className="hidden md:block">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-900/40 dark:text-slate-400">
              <tr>
                <th className="w-20 px-3 py-3">Date</th>
                <th className="w-24 px-3 py-3">Time</th>
                <th className="w-[24%] px-3 py-3">Opponent</th>
                <th className="w-[18%] px-3 py-3">Rink</th>
                <th className="w-44 px-3 py-3">Score</th>
                <th className="w-44 px-3 py-3">Type</th>
                <th className="w-32 px-3 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/20">
              {loading && (
                <tr>
                  <td colSpan={7} className="p-0">
                    <TableSkeleton columns={7} rows={4} compact />
                  </td>
                </tr>
              )}

              {!loading && filtered.map((g) => {
                const isHome = activeTeam.id === g.home_team_id;
                const opponent = isHome ? g.away_team_name : g.home_team_name;
                const edit = scoreEdits[g.id] || { home: '', away: '' };
                const statusLabel = getGameStatusLabel(g);

                return (
                  <tr
                    key={g.id}
                    className="cursor-pointer hover:bg-slate-50/60 dark:hover:bg-slate-900/40"
                    onClick={() => navigate(`/games/${g.id}`)}
                    title="Open game details"
                  >
                    <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-900 dark:text-slate-100">
                      {formatShortDate(g.date) || g.date}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-700 dark:text-slate-300">
                      {formatTimeHHMM(g.time) || '—'}
                    </td>
                    <td className="px-3 py-3 text-slate-700 dark:text-slate-300">
                      <div className="break-words font-medium text-slate-900 dark:text-slate-100">{opponent || '—'}</div>
                      <div className="mt-1">
                        <Badge variant={isHome ? 'success' : 'info'}>{isHome ? 'Home' : 'Away'}</Badge>
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top text-slate-700 dark:text-slate-300">
                      {g.rink_name ? (
                        <div>
                          <div className="break-words font-medium text-slate-900 dark:text-slate-100">{g.rink_name}</div>
                          <div className="mt-0.5 break-words text-xs leading-5 text-slate-500 dark:text-slate-400">
                            {g.rink_city}, {g.rink_state}
                          </div>
                        </div>
                      ) : g.location_label ? (
                        <div className="break-words text-slate-700 dark:text-slate-300" title={g.location_label}>
                          {g.location_label}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <Input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          className="w-14 text-center text-sm"
                          value={edit.home}
                          placeholder="H"
                          onChange={(e) => setScoreEdits((s) => ({ ...s, [g.id]: { ...edit, home: digitsOnly(e.target.value) } }))}
                        />
                        <span className="text-slate-500">–</span>
                        <Input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          className="w-14 text-center text-sm"
                          value={edit.away}
                          placeholder="A"
                          onChange={(e) => setScoreEdits((s) => ({ ...s, [g.id]: { ...edit, away: digitsOnly(e.target.value) } }))}
                        />
                        <Button type="button" size="sm" variant="ghost" onClick={() => handleSaveScore(g.id)} title="Save score">
                          <Save className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="space-y-1.5">
                        <Select
                          value={g.game_type ?? ''}
                          onChange={(e) => handleTypeChange(g.id, e.target.value)}
                          className="w-full"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {GAME_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </Select>
                        {g.competition_short_name && g.division_name && (
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {g.competition_short_name} • {g.division_name}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Badge
                        variant={getGameStatusVariant(g)}
                        className="px-2 py-0.5 text-[11px]"
                      >
                        {statusLabel}
                      </Badge>
                    </td>
                  </tr>
                );
              })}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6">
                    <EmptyState
                      icon={<CalendarPlus2 className="h-5 w-5" />}
                      title="No games to show"
                      description={tab === 0 ? 'Add or confirm games from the Schedule page.' : 'There are no games in this view yet.'}
                      actions={tab === 0 ? (
                        <Button type="button" size="sm" onClick={() => navigate('/schedule')}>
                          Open Schedule
                        </Button>
                      ) : undefined}
                      className="border-0 shadow-none"
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
