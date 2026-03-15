import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Calendar, CheckCircle2, Dumbbell, Inbox, Trophy } from 'lucide-react';
import { useTeam } from '../context/TeamContext';
import { useSeason } from '../context/SeasonContext';
import { api } from '../api/client';
import { ScheduleEntry, GameProposal, Game, PracticeBooking, StandingsEntry, TeamCompetitionMembership } from '../types';
import { cn } from '../lib/cn';
import { addDays, formatContextualDate, formatDate, formatShortDate, formatTimeHHMM, toLocalDateString } from '../lib/time';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { getGameStatusLabel, getGameStatusVariant } from '../lib/gameStatus';
import { filterButtonClass } from '../lib/uiClasses';
import { useConfirmDialog } from '../context/ConfirmDialogContext';

const clickableCard =
  'cursor-pointer text-left transition-shadow transition-colors hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 dark:hover:border-slate-700 dark:focus-visible:ring-offset-slate-950';

function StatCard({ title, value, icon, color, onClick, subtitle, ariaLabel }: {
  title: string; value: number | string; icon: React.ReactNode; color: string; onClick?: () => void; subtitle?: string; ariaLabel?: string;
}) {
  return (
    <Card
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? ariaLabel ?? `${title}: ${value}` : undefined}
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
      {subtitle ? <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{subtitle}</div> : null}
    </Card>
  );
}

export default function HomePage() {
  const { activeTeam, teams } = useTeam();
  const { activeSeason, seasons } = useSeason();
  const navigate = useNavigate();
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [proposals, setProposals] = useState<GameProposal[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [practices, setPractices] = useState<PracticeBooking[]>([]);
  const [record, setRecord] = useState<StandingsEntry | null>(null);
  const [competitionRecord, setCompetitionRecord] = useState<StandingsEntry | null>(null);
  const [primaryMembership, setPrimaryMembership] = useState<TeamCompetitionMembership | null>(null);
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedError, setSeedError] = useState('');
  const confirm = useConfirmDialog();
  const today = new Date();
  const todayStr = toLocalDateString(today);

  useEffect(() => {
    if (!activeTeam) return;
    const schedParams: Record<string, string> = {};
    if (activeSeason) schedParams.season_id = activeSeason.id;
    api.getSchedule(activeTeam.id, schedParams).then(setSchedule);
    Promise.all([
      api.getProposals(activeTeam.id, { direction: 'incoming', status: 'proposed' }),
      api.getProposals(activeTeam.id, { direction: 'outgoing', status: 'proposed' }),
    ]).then(([incoming, outgoing]) => {
      const merged = [...incoming, ...outgoing]
        .filter((proposal, index, all) => all.findIndex((candidate) => candidate.id === proposal.id) === index)
        .sort((a, b) => (a.proposed_date + (a.proposed_time || '')).localeCompare(b.proposed_date + (b.proposed_time || '')));
      setProposals(merged);
    });
    api.getGames(activeTeam.id, { date_from: todayStr }).then(setGames);
    api.getPracticeBookings(activeTeam.id, { status: 'active' }).then(setPractices);

    if (activeSeason) {
      Promise.all([
        api.getStandings(activeSeason.id),
        api.getTeamCompetitionMemberships(activeTeam.id, { season_id: activeSeason.id }),
      ]).then(async ([standings, memberships]) => {
        const myRecord = standings.find((s) => s.team_id === activeTeam.id) || null;
        const primary = memberships.find((membership) => membership.is_primary) ?? memberships[0] ?? null;
        const standingsMembership =
          memberships.find((membership) => membership.is_primary && membership.standings_enabled)
          ?? memberships.find((membership) => membership.standings_enabled)
          ?? null;

        setRecord(myRecord);
        setPrimaryMembership(primary);

        if (!standingsMembership) {
          setCompetitionRecord(null);
          return;
        }

        const divisionStandings = await api.getCompetitionDivisionStandings(standingsMembership.competition_division_id);
        setCompetitionRecord(divisionStandings.find((entry) => entry.team_id === activeTeam.id) || null);
      });
      return;
    }

    setCompetitionRecord(null);
    setPrimaryMembership(null);
    if (seasons.length === 0) {
      setRecord(null);
      return;
    }

    Promise.all(seasons.map((season) => api.getStandings(season.id))).then((seasonStandings) => {
      const aggregate = seasonStandings.reduce(
        (totals, standings) => {
          const myRecord = standings.find((entry) => entry.team_id === activeTeam.id);
          if (!myRecord) return totals;
          totals.wins += myRecord.wins;
          totals.losses += myRecord.losses;
          totals.ties += myRecord.ties;
          return totals;
        },
        { wins: 0, losses: 0, ties: 0 },
      );
      setRecord({
        team_id: activeTeam.id,
        team_name: activeTeam.name,
        association_name: activeTeam.association_name,
        age_group: activeTeam.age_group,
        level: activeTeam.level,
        wins: aggregate.wins,
        losses: aggregate.losses,
        ties: aggregate.ties,
        points: 2 * aggregate.wins + aggregate.ties,
        games_played: aggregate.wins + aggregate.losses + aggregate.ties,
      });
    });
  }, [activeTeam, activeSeason, seasons]);

  const seasonScopedGames = games.filter((g) => {
    if (!activeSeason) return true;
    return g.date >= activeSeason.start_date && g.date <= activeSeason.end_date;
  });
  const openDates = schedule.filter((e) => e.status === 'open');
  const upcomingPractices = practices.filter((p) => p.slot_date && p.slot_date >= todayStr);
  const weekEndStr = toLocalDateString(addDays(today, 7));
  const gamesThisWeek = seasonScopedGames.filter((g) => g.date >= todayStr && g.date <= weekEndStr).length;
  const proposalsIncoming = proposals.filter((proposal) => proposal.proposed_by_team_id !== activeTeam?.id).length;
  const practicesThisWeek = upcomingPractices.filter((practice) => (practice.slot_date || '') <= weekEndStr).length;
  const openDatesWithTimes = openDates.filter((entry) => !!entry.time).length;
  const openDatesMissingTime = openDates.filter((entry) => !entry.time).length;
  const unconfirmedGamesThisWeek = schedule.filter((entry) =>
    !!entry.game_id
    && entry.date >= todayStr
    && entry.date <= weekEndStr
    && !entry.weekly_confirmed,
  );
  const upcoming = seasonScopedGames
    .slice()
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
    .slice(0, 5);
  if (!activeTeam) {
    if (teams.length > 0) {
      return (
        <div className="space-y-6">
          <PageHeader title="Dashboard" subtitle="Choose an active team to view its schedule, games, proposals, and practices." />
          <Card className="mx-auto max-w-2xl p-6">
            <div className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">No active team selected</div>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Use the team dropdown in the header to choose which team you want to manage.
            </div>
          </Card>
        </div>
      );
    }

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
      <PageHeader
        title={`${activeTeam.name} Dashboard`}
        subtitle={
          activeSeason
            ? primaryMembership
              ? `${activeSeason.name} Season • ${primaryMembership.competition_short_name} ${primaryMembership.division_name}`
              : `${activeSeason.name} Season`
            : 'All Seasons'
        }
        actions={(
          <Button
            type="button"
            disabled={seedLoading}
            onClick={async () => {
              const shouldReset = await confirm({
                title: 'Reset demo data?',
                description: 'This wipes the database and reloads the current demo dataset.',
                confirmLabel: 'Reset demo data',
                confirmVariant: 'destructive',
              });
              if (!shouldReset) return;
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
        )}
      />

      {seedError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-100">
          {seedError}
        </div>
      )}

      {(proposalsIncoming > 0 || unconfirmedGamesThisWeek.length > 0 || openDatesMissingTime > 0) ? (
        <Card className="border-amber-200/70 bg-amber-50/85 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-1 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-300" />
              <span>Needs Attention</span>
            </div>
            {proposalsIncoming > 0 ? (
              <Button type="button" size="sm" variant="outline" className={filterButtonClass} onClick={() => navigate('/proposals')}>
                {proposalsIncoming} incoming proposal{proposalsIncoming === 1 ? '' : 's'}
              </Button>
            ) : null}
            {unconfirmedGamesThisWeek.length > 0 ? (
              <Button type="button" size="sm" variant="outline" className={filterButtonClass} onClick={() => navigate('/schedule')}>
                {unconfirmedGamesThisWeek.length} game{unconfirmedGamesThisWeek.length === 1 ? '' : 's'} to confirm
              </Button>
            ) : null}
            {openDatesMissingTime > 0 ? (
              <Button type="button" size="sm" variant="outline" className={filterButtonClass} onClick={() => navigate('/schedule')}>
                {openDatesMissingTime} open date{openDatesMissingTime === 1 ? '' : 's'} missing time
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}

      <div className={cn(
        'grid grid-cols-1 gap-3 sm:grid-cols-2',
        record ? 'lg:grid-cols-5' : 'lg:grid-cols-4',
      )}>
        {(competitionRecord || record) && (
          <StatCard
            title={activeSeason && competitionRecord ? 'League Record' : activeSeason ? 'Season Record' : 'Overall Record'}
            value={`${(competitionRecord || record)!.wins}-${(competitionRecord || record)!.losses}-${(competitionRecord || record)!.ties}`}
            icon={<Trophy className="h-4 w-4" />}
            color="text-fuchsia-700"
            subtitle={`${(competitionRecord || record)!.points} points`}
            ariaLabel={`${activeSeason && competitionRecord ? 'League' : activeSeason ? 'Season' : 'Overall'} record ${(competitionRecord || record)!.wins} wins, ${(competitionRecord || record)!.losses} losses, ${(competitionRecord || record)!.ties} ties`}
            onClick={activeSeason && competitionRecord ? () => navigate('/standings') : undefined}
          />
        )}
        <StatCard
          title="Upcoming Games"
          value={upcoming.length}
          icon={<CheckCircle2 className="h-4 w-4" />}
          color="text-sky-700"
          subtitle={gamesThisWeek > 0 ? `${gamesThisWeek} this week` : undefined}
          ariaLabel={`${upcoming.length} upcoming games`}
          onClick={() => navigate('/games')}
        />
        <StatCard
          title="Open Dates"
          value={openDates.length}
          icon={<Calendar className="h-4 w-4" />}
          color="text-emerald-700"
          subtitle={openDatesMissingTime > 0 ? `${openDatesMissingTime} missing time` : undefined}
          ariaLabel={`${openDates.length} open dates`}
          onClick={() => navigate('/schedule')}
        />
        <StatCard
          title="Pending Proposals"
          value={proposals.length}
          icon={<Inbox className="h-4 w-4" />}
          color="text-amber-700"
          subtitle={proposalsIncoming > 0 ? `${proposalsIncoming} incoming` : undefined}
          ariaLabel={`${proposals.length} pending proposals`}
          onClick={() => navigate('/proposals')}
        />
        <StatCard
          title="Upcoming Practices"
          value={upcomingPractices.length}
          icon={<Dumbbell className="h-4 w-4" />}
          color="text-violet-700"
          subtitle={practicesThisWeek > 0 ? `${practicesThisWeek} this week` : undefined}
          ariaLabel={`${upcomingPractices.length} upcoming practices`}
          onClick={() => navigate('/practice')}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          role="button"
          tabIndex={0}
          aria-label="Open Games page"
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
            <EmptyState
              className="mt-3 border-0 bg-transparent px-0 py-4 shadow-none"
              icon={<CheckCircle2 className="h-5 w-5" />}
              title="No upcoming scheduled games"
              description="Open schedule dates or find an opponent to put the next game on the calendar."
              actions={(
                <>
                  <Button type="button" size="sm" onClick={(e) => { e.stopPropagation(); navigate('/schedule'); }}>
                    Open Schedule
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); navigate('/search'); }}>
                    Find Opponents
                  </Button>
                </>
              )}
            />
          ) : (
            <ul className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
              {upcoming.map((g) => (
                <li key={g.id} className="flex items-start justify-between gap-3 px-2 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {formatContextualDate(g.date)}{g.time ? ` • ${formatTimeHHMM(g.time) || g.time}` : ''}
                    </div>
                    <div className="mt-1 truncate text-sm text-slate-700 dark:text-slate-300">
                      {g.home_team_name} vs {g.away_team_name}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {formatShortDate(g.date)}{g.time ? ` • ${formatTimeHHMM(g.time) || g.time}` : ''} • {g.rink_name || g.location_label || 'No location yet'}
                    </div>
                  </div>
                  <Badge variant={getGameStatusVariant(g)}>{getGameStatusLabel(g)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          role="button"
          tabIndex={0}
          aria-label="Open Proposals page"
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
            <EmptyState
              className="mt-3 border-0 bg-transparent px-0 py-4 shadow-none"
              icon={<Inbox className="h-5 w-5" />}
              title="No pending proposals"
              description="Send a new proposal from Find Opponents when you want to schedule the next game."
              actions={(
                <Button type="button" size="sm" onClick={(e) => { e.stopPropagation(); navigate('/search'); }}>
                  Find Opponents
                </Button>
              )}
            />
          ) : (
            <ul className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
              {proposals.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-3 px-2 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {formatContextualDate(p.proposed_date)} — {p.home_team_name} vs {p.away_team_name}
                    </div>
                    <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                      {formatShortDate(p.proposed_date)}{p.proposed_time ? ` • ${formatTimeHHMM(p.proposed_time) || p.proposed_time}` : ''} • {p.message || 'No message'}
                    </div>
                  </div>
                  <Badge variant={p.proposed_by_team_id === activeTeam.id ? 'info' : 'warning'}>
                    {p.proposed_by_team_id === activeTeam.id ? 'Sent' : 'Received'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
