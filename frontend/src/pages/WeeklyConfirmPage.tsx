import { useState, useEffect } from 'react';
import { useTeam } from '../context/TeamContext';
import { api } from '../api/client';
import { Game, Notification } from '../types';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { Switch } from '../components/ui/Switch';
import { Button } from '../components/ui/Button';

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
              <div className="text-sm font-semibold tracking-tight text-slate-900">{weekly.title}</div>
              <div className="mt-1 text-sm text-slate-700">{weekly.message}</div>
            </div>
            <Button type="button" variant="outline" onClick={() => api.markNotificationRead(weekly.id).then(() => setNotifications((ns) => ns.filter((n) => n.id !== weekly.id)))}>
              Dismiss
            </Button>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Opponent</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-center">You</th>
                <th className="px-4 py-3 text-center">Opponent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {games.map((g) => {
                const isHome = activeTeam.id === g.home_team_id;
                const opponent = isHome ? g.away_team_name : g.home_team_name;
                const myConfirmed = isHome ? g.home_weekly_confirmed : g.away_weekly_confirmed;
                const oppConfirmed = isHome ? g.away_weekly_confirmed : g.home_weekly_confirmed;

                return (
                  <tr key={g.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {new Date(g.date + 'T00:00').toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{g.time || '-'}</td>
                  <td className="px-4 py-3 text-slate-700">{opponent || 'TBD'}</td>
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
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-600">
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
