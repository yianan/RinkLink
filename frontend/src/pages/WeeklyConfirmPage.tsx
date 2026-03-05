import { useState, useEffect } from 'react';
import { useTeam } from '../context/TeamContext';
import { api } from '../api/client';
import { Game, Notification } from '../types';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { Switch } from '../components/ui/Switch';
import { Button } from '../components/ui/Button';
import { formatTimeHHMM } from '../lib/time';

function formatLocalDateISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function WeeklyConfirmPage() {
  const { activeTeam } = useTeam();
  const [games, setGames] = useState<Game[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    if (!activeTeam) return;
    const today = new Date();
    const day = today.getDay(); // 0=Sun
    const diff = (day + 6) % 7; // days since Monday
    const monday = new Date(today);
    monday.setDate(today.getDate() - diff);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const date_from = formatLocalDateISO(monday);
    const date_to = formatLocalDateISO(sunday);

    api.getGames(activeTeam.id, { date_from, date_to }).then(setGames);
    api.getNotifications(activeTeam.id, { unread_only: 'true' }).then(setNotifications);
  }, [activeTeam]);

  const handleToggle = async (g: Game) => {
    if (!activeTeam) return;
    const isHome = activeTeam.id === g.home_team_id;
    const myConfirmed = isHome ? g.home_weekly_confirmed : g.away_weekly_confirmed;
    const updated = await api.weeklyConfirmGame(g.id, activeTeam.id, !myConfirmed);
    setGames((prev) => prev.map((x) => (x.id === g.id ? updated : x)));
  };

  if (!activeTeam) {
    return <Alert variant="info">Select a team to confirm games.</Alert>;
  }

  const weekly = notifications.find((n) => n.notif_type === 'weekly_confirm') || null;

  return (
    <div className="space-y-4">
      <div>
        <div className="page-title">Weekly Game Confirmation</div>
        <div className="page-subtitle">Every Monday, confirm your non-league games for this week.</div>
      </div>

      {weekly && (
        <Card className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">{weekly.title}</div>
              <div className="mt-1 text-sm text-slate-700 dark:text-slate-300">{weekly.message}</div>
            </div>
            <Button type="button" variant="outline" onClick={() => api.markNotificationRead(weekly.id).then(() => setNotifications((ns) => ns.filter((n) => n.id !== weekly.id)))}>
              Dismiss
            </Button>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="divide-y divide-slate-200 bg-white md:hidden dark:divide-slate-800 dark:bg-slate-950/20">
          {games.map((g) => {
            const isHome = activeTeam.id === g.home_team_id;
            const opponent = isHome ? g.away_team_name : g.home_team_name;
            const myConfirmed = isHome ? g.home_weekly_confirmed : g.away_weekly_confirmed;
            const oppConfirmed = isHome ? g.away_weekly_confirmed : g.home_weekly_confirmed;

            return (
              <div key={g.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {new Date(g.date + 'T00:00').toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}{' '}
                      {formatTimeHHMM(g.time) || ''}
                    </div>
                    <div className="mt-1 text-sm text-slate-700 dark:text-slate-300">{opponent || 'TBD'}</div>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">You</span>
                        <Switch checked={myConfirmed} onChange={() => handleToggle(g)} />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Opponent</span>
                        <Badge variant={oppConfirmed ? 'success' : 'outline'}>{oppConfirmed ? 'Yes' : 'No'}</Badge>
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline">{g.status}</Badge>
                </div>
              </div>
            );
          })}

          {games.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
              No non-league games scheduled for this week.
            </div>
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-900/40 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Opponent</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-center">You</th>
                <th className="px-4 py-3 text-center">Opponent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/20">
              {games.map((g) => {
                const isHome = activeTeam.id === g.home_team_id;
                const opponent = isHome ? g.away_team_name : g.home_team_name;
                const myConfirmed = isHome ? g.home_weekly_confirmed : g.away_weekly_confirmed;
                const oppConfirmed = isHome ? g.away_weekly_confirmed : g.home_weekly_confirmed;

                return (
                  <tr key={g.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                    {new Date(g.date + 'T00:00').toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{formatTimeHHMM(g.time) || '-'}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{opponent || 'TBD'}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{g.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center">
                      <Switch checked={myConfirmed} onChange={() => handleToggle(g)} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={oppConfirmed ? 'success' : 'outline'}>{oppConfirmed ? 'Yes' : 'No'}</Badge>
                  </td>
                </tr>
                );
              })}

              {games.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
                    No non-league games scheduled for this week.
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
