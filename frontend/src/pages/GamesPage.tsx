import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTeam } from '../context/TeamContext';
import { api } from '../api/client';
import { Game } from '../types';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Select } from '../components/ui/Select';
import { cn } from '../lib/cn';
import { formatTimeHHMM } from '../lib/time';

const GAME_TYPES = [
  { value: '', label: '—' },
  { value: 'league', label: 'League' },
  { value: 'non_league', label: 'Non-League' },
  { value: 'tournament', label: 'Tournament' },
];

const gameTypeColors: Record<string, 'info' | 'success' | 'warning' | 'neutral'> = {
  league: 'info',
  non_league: 'neutral',
  tournament: 'success',
};

const statusColors: Record<string, 'info' | 'warning' | 'success' | 'neutral'> = {
  scheduled: 'info',
  confirmed: 'warning',
  final: 'success',
  cancelled: 'neutral',
};

function formatDateLabel(d: string) {
  return new Date(d + 'T00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function GamesPage() {
  const { activeTeam } = useTeam();
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const [games, setGames] = useState<Game[]>([]);

  useEffect(() => {
    if (!activeTeam) return;
    api.getGames(activeTeam.id).then(setGames);
  }, [activeTeam]);

  const handleTypeChange = async (gameId: string, game_type: string) => {
    const updated = await api.updateGame(gameId, { game_type: game_type || null });
    setGames((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
  };

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const counts = useMemo(() => {
    const upcoming = games.filter((g) => g.date >= todayStr).length;
    const past = games.filter((g) => g.date < todayStr).length;
    return { upcoming, past, all: games.length };
  }, [games, todayStr]);

  const filtered = useMemo(() => {
    if (tab === 2) return games;
    if (tab === 0) return games.filter((g) => g.date >= todayStr);
    return games.filter((g) => g.date < todayStr);
  }, [games, tab, todayStr]);

  if (!activeTeam) {
    return <Alert variant="info">Select a team to view games.</Alert>;
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="page-title">Games</div>
        <div className="page-subtitle">Accepted non-league games with scoresheets and weekly confirmation.</div>
      </div>

      <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-900/50 dark:ring-1 dark:ring-slate-800/60">
        {[
          { label: `Upcoming (${counts.upcoming})`, value: 0 },
          { label: `Past (${counts.past})`, value: 1 },
          { label: `All (${counts.all})`, value: 2 },
        ].map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              tab === t.value
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950/40 dark:text-slate-100 dark:shadow-none dark:ring-1 dark:ring-slate-800/70'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="divide-y divide-slate-200 bg-white md:hidden dark:divide-slate-800 dark:bg-slate-950/20">
          {filtered.map((g) => {
            const isHome = activeTeam.id === g.home_team_id;
            const opponent = isHome ? g.away_team_name : g.home_team_name;
            const myConfirmed = isHome ? g.home_weekly_confirmed : g.away_weekly_confirmed;
            const oppConfirmed = isHome ? g.away_weekly_confirmed : g.home_weekly_confirmed;
            const score =
              g.home_score != null && g.away_score != null
                ? `${g.home_score}-${g.away_score}`
                : '—';

            return (
              <button
                key={g.id}
                type="button"
                className="w-full px-4 py-4 text-left transition-colors hover:bg-slate-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 dark:hover:bg-slate-900/40 dark:focus-visible:ring-offset-slate-950"
                onClick={() => navigate(`/games/${g.id}`)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {formatDateLabel(g.date)} {formatTimeHHMM(g.time) || ''}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                      <span className="font-medium text-slate-900 dark:text-slate-100">{opponent || '—'}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{isHome ? 'Home' : 'Away'}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {g.rink_name
                        ? `${g.rink_name}${g.rink_city ? ` • ${g.rink_city}, ${g.rink_state}` : ''}`
                        : g.location_label || 'No location yet'}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge variant={statusColors[g.status] || 'neutral'}>{g.status}</Badge>
                      {g.game_type && (
                        <Badge variant={gameTypeColors[g.game_type] || 'neutral'}>
                          {GAME_TYPES.find((t) => t.value === g.game_type)?.label ?? g.game_type}
                        </Badge>
                      )}
                      <Badge variant="outline">Score: {score}</Badge>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Weekly: You {myConfirmed ? 'Yes' : 'No'} • Opp {oppConfirmed ? 'Yes' : 'No'}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}

          {filtered.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
              No games to show.
            </div>
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-900/40 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Opponent</th>
                <th className="px-4 py-3">Rink</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Type</th>
                <th
                  className="px-4 py-3"
                  title="Weekly confirm is an in-app check-in (typically on Mondays) for games in the current week. Update yours on the Weekly Confirm page."
                >
                  Weekly Confirm
                </th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/20">
              {filtered.map((g) => {
                const isHome = activeTeam.id === g.home_team_id;
                const opponent = isHome ? g.away_team_name : g.home_team_name;
                const myConfirmed = isHome ? g.home_weekly_confirmed : g.away_weekly_confirmed;
                const oppConfirmed = isHome ? g.away_weekly_confirmed : g.home_weekly_confirmed;
                const score =
                  g.home_score != null && g.away_score != null
                    ? `${g.home_score}-${g.away_score}`
                    : '—';

                return (
                  <tr key={g.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                      {formatDateLabel(g.date)} {formatTimeHHMM(g.time) || ''}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{opponent || '—'}</div>
                      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{isHome ? 'Home' : 'Away'}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      {g.rink_name ? (
                        <div>
                          <div className="font-medium text-slate-900 dark:text-slate-100">{g.rink_name}</div>
                          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            {g.rink_city}, {g.rink_state}
                          </div>
                        </div>
                      ) : g.location_label ? (
                        <div className="max-w-[360px] truncate text-slate-700 dark:text-slate-300" title={g.location_label}>
                          {g.location_label}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{score}</td>
                    <td className="px-4 py-3">
                      <Select
                        value={g.game_type ?? ''}
                        onChange={(e) => handleTypeChange(g.id, e.target.value)}
                        className="w-36"
                      >
                        {GAME_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={myConfirmed ? 'success' : 'outline'}>You: {myConfirmed ? 'Yes' : 'No'}</Badge>
                        <Badge variant={oppConfirmed ? 'success' : 'outline'}>Opp: {oppConfirmed ? 'Yes' : 'No'}</Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusColors[g.status] || 'neutral'}>{g.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <Button type="button" size="sm" variant="outline" onClick={() => navigate(`/games/${g.id}`)}>
                          Open
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
                    No games to show.
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
