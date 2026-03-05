import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, CheckCircle2, Dumbbell, Inbox } from 'lucide-react';
import { useTeam } from '../context/TeamContext';
import { api } from '../api/client';
import { ScheduleEntry, GameProposal, Game, Notification, PracticeBooking } from '../types';
import { cn } from '../lib/cn';
import { formatTimeHHMM } from '../lib/time';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

const clickableCard =
  'cursor-pointer text-left transition-shadow transition-colors hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 dark:hover:border-slate-700 dark:focus-visible:ring-offset-slate-950';

function StatCard({ title, value, icon, color, onClick }: {
  title: string; value: number | string; icon: React.ReactNode; color: string; onClick?: () => void;
}) {
  return (
    <Card
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === 'Enter') onClick();
        if (e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        'p-4 text-left transition-shadow',
        onClick && clickableCard,
      )}
    >
      <div className="flex items-center gap-2">
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-900/50', color)}>
          {icon}
        </div>
        <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{title}</div>
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{value}</div>
    </Card>
  );
}

export default function HomePage() {
  const { activeTeam } = useTeam();
  const navigate = useNavigate();
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [proposals, setProposals] = useState<GameProposal[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [practices, setPractices] = useState<PracticeBooking[]>([]);
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedError, setSeedError] = useState('');

  useEffect(() => {
    if (!activeTeam) return;
    api.getSchedule(activeTeam.id).then(setSchedule);
    api.getProposals(activeTeam.id, { direction: 'incoming', status: 'proposed' }).then(setProposals);
    const todayStr = new Date().toISOString().slice(0, 10);
    api.getGames(activeTeam.id, { date_from: todayStr }).then(setGames);
    api.getNotifications(activeTeam.id, { unread_only: 'true' }).then(setNotifications);
    api.getPracticeBookings(activeTeam.id, { status: 'active' }).then(setPractices);
  }, [activeTeam]);

  const today = new Date().toISOString().slice(0, 10);
  const openDates = schedule.filter((e) => e.status === 'open');
  const upcomingPractices = practices.filter((p) => p.slot_date && p.slot_date >= today);
  const upcoming = games
    .slice()
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
    .slice(0, 5);
  const weekly = notifications.find((n) => n.notif_type === 'weekly_confirm') || null;

  if (!activeTeam) {
    return (
      <div className="mx-auto max-w-2xl pt-12">
        <Card className="p-6">
          <div className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">Welcome to RinkLink</div>
          <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Select a team from the dropdown above, or seed demo data to get started.
          </div>
          <div className="mt-5">
            <Button
              type="button"
              disabled={seedLoading}
              onClick={async () => {
                setSeedError('');
                setSeedLoading(true);
                try {
                  await api.seed();
                  window.location.reload();
                } catch (e) {
                  setSeedError(String(e));
                } finally {
                  setSeedLoading(false);
                }
              }}
            >
              {seedLoading ? 'Seeding…' : 'Seed Demo Data'}
            </Button>
          </div>
          {seedError && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-100">
              {seedError}
            </div>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="page-title">{activeTeam.name} Dashboard</div>
          <div className="page-subtitle">Quick stats and what needs your attention.</div>
        </div>
        <Button
          type="button"
          disabled={seedLoading}
          onClick={async () => {
            if (!confirm('Reset demo data? This will wipe your local database and re-seed everything.')) return;
            setSeedError('');
            setSeedLoading(true);
            try {
              await api.seed();
              window.location.reload();
            } catch (e) {
              setSeedError(String(e));
            } finally {
              setSeedLoading(false);
            }
          }}
        >
          {seedLoading ? 'Seeding…' : 'Reset Demo Data'}
        </Button>
      </div>

      {seedError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-100">
          {seedError}
        </div>
      )}

      {weekly && (
        <Card className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">{weekly.title}</div>
              <div className="mt-1 text-sm text-slate-700 dark:text-slate-300">{weekly.message}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" onClick={() => navigate('/confirm')}>
                Confirm Games
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => api.markNotificationRead(weekly.id).then(() => setNotifications((ns) => ns.filter((n) => n.id !== weekly.id)))}
              >
                Dismiss
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Open Dates"
          value={openDates.length}
          icon={<Calendar className="h-4 w-4" />}
          color="text-emerald-700"
          onClick={() => navigate('/schedule')}
        />
        <StatCard
          title="Pending Proposals"
          value={proposals.length}
          icon={<Inbox className="h-4 w-4" />}
          color="text-amber-700"
          onClick={() => navigate('/proposals')}
        />
        <StatCard
          title="Upcoming Games"
          value={upcoming.length}
          icon={<CheckCircle2 className="h-4 w-4" />}
          color="text-sky-700"
          onClick={() => navigate('/games')}
        />
        <StatCard
          title="Upcoming Practices"
          value={upcomingPractices.length}
          icon={<Dumbbell className="h-4 w-4" />}
          color="text-violet-700"
          onClick={() => navigate('/practice')}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          role="button"
          tabIndex={0}
          onClick={() => navigate('/games')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') navigate('/games');
            if (e.key === ' ') {
              e.preventDefault();
              navigate('/games');
            }
          }}
          className={cn('p-4', clickableCard)}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-sky-700 dark:bg-slate-900/50">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="text-sm font-medium text-slate-700 dark:text-slate-200">Upcoming Games</div>
            </div>
          </div>

          {upcoming.length === 0 ? (
            <div className="mt-3 text-sm text-slate-600 dark:text-slate-400">No upcoming scheduled games.</div>
          ) : (
            <ul className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
              {upcoming.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-3 px-2 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {g.date} {formatTimeHHMM(g.time) || ''} — {g.home_team_name} vs {g.away_team_name}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{g.rink_name || g.location_label || 'No location yet'}</div>
                  </div>
                  <Badge variant="outline">{g.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          role="button"
          tabIndex={0}
          onClick={() => navigate('/proposals')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') navigate('/proposals');
            if (e.key === ' ') {
              e.preventDefault();
              navigate('/proposals');
            }
          }}
          className={cn('p-4', clickableCard)}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-amber-700 dark:bg-slate-900/50">
                <Inbox className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="text-sm font-medium text-slate-700 dark:text-slate-200">Pending Proposals</div>
            </div>
          </div>

          {proposals.length === 0 ? (
            <div className="mt-3 text-sm text-slate-600 dark:text-slate-400">No pending proposals.</div>
          ) : (
            <ul className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
              {proposals.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-3 px-2 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {p.proposed_date} — {p.home_team_name} vs {p.away_team_name}
                    </div>
                    <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{p.message || '—'}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
