import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, CheckCircle2, Inbox, Trophy } from 'lucide-react';
import { api } from '../api/client';
import { Event, Proposal, StandingsEntry, TeamCompetitionMembership, AvailabilityWindow } from '../types';
import { useSeason } from '../context/SeasonContext';
import { useTeam } from '../context/TeamContext';
import { addDays, formatShortDate, formatTimeHHMM, toLocalDateString } from '../lib/time';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import PageHeader from '../components/PageHeader';
import TeamLogo from '../components/TeamLogo';
import { cn } from '../lib/cn';
import { useConfirmDialog } from '../context/ConfirmDialogContext';
import { getCompetitionBadgeVariant, getCompetitionLabel } from '../lib/competition';

const clickableCard =
  'cursor-pointer text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-300/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 dark:hover:border-cyan-700/50 dark:hover:shadow-[0_8px_30px_rgba(34,211,238,0.08)] dark:focus-visible:ring-offset-slate-950';

function StatCard({
  title,
  value,
  subtitle,
  onClick,
  icon,
  color,
  ariaLabel,
}: {
  title: string;
  value: number | string;
  subtitle?: string;
  onClick?: () => void;
  icon: ReactNode;
  color: string;
  ariaLabel?: string;
}) {
  return (
    <Card
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? ariaLabel ?? `${title}: ${value}` : undefined}
      onClick={onClick}
      onKeyDown={(event) => {
        if (!onClick) return;
        if (event.key === 'Enter') onClick();
        if (event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
      className={cn('p-4 text-left transition-shadow', onClick && clickableCard)}
    >
      <div className="flex items-center gap-2">
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-xl', color)}>
          {icon}
        </div>
        <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{title}</div>
      </div>
      <div className="mt-3 font-display text-3xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-100">
        {value}
      </div>
      {subtitle ? <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{subtitle}</div> : null}
    </Card>
  );
}

function eventTitle(event: Event) {
  if (event.event_type === 'practice' || !event.away_team_name) {
    return `${event.home_team_name} Practice`;
  }
  return `${event.home_team_name} vs ${event.away_team_name}`;
}

function eventVenue(event: Event) {
  return [event.arena_name, event.arena_rink_name].filter(Boolean).join(' • ') || event.location_label || 'Venue TBD';
}

export default function HomePage() {
  const navigate = useNavigate();
  const { activeTeam, teams } = useTeam();
  const { activeSeason, seasons } = useSeason();
  const confirm = useConfirmDialog();

  const [availability, setAvailability] = useState<AvailabilityWindow[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [record, setRecord] = useState<StandingsEntry | null>(null);
  const [competitionRecord, setCompetitionRecord] = useState<StandingsEntry | null>(null);
  const [primaryMembership, setPrimaryMembership] = useState<TeamCompetitionMembership | null>(null);
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedError, setSeedError] = useState('');

  const effectiveSeason = activeSeason ?? seasons.find((season) => season.is_active) ?? seasons[0] ?? null;
  const today = new Date();
  const todayStr = toLocalDateString(today);
  const weekEndStr = toLocalDateString(addDays(today, 7));

  useEffect(() => {
    if (!activeTeam) return;

    Promise.all([
      api.getAvailability(activeTeam.id),
      api.getEvents(activeTeam.id, { date_from: todayStr }),
      api.getProposals(activeTeam.id, { direction: 'incoming', status: 'proposed' }),
      effectiveSeason ? api.getStandings(effectiveSeason.id) : Promise.resolve([]),
      effectiveSeason ? api.getTeamCompetitionMemberships(activeTeam.id, { season_id: effectiveSeason.id }) : Promise.resolve([]),
    ]).then(async ([availabilityData, eventData, proposalData, standings, memberships]) => {
      setAvailability(availabilityData);
      setEvents(eventData);
      setProposals(proposalData);
      setRecord(standings.find((entry) => entry.team_id === activeTeam.id) || null);

      const primary = memberships.find((membership) => membership.is_primary) ?? memberships[0] ?? null;
      setPrimaryMembership(primary);

      const standingsMembership =
        memberships.find((membership) => membership.is_primary && membership.standings_enabled)
        ?? memberships.find((membership) => membership.standings_enabled)
        ?? null;

      if (!standingsMembership) {
        setCompetitionRecord(null);
        return;
      }

      const divisionStandings = await api.getCompetitionDivisionStandings(standingsMembership.competition_division_id);
      setCompetitionRecord(divisionStandings.find((entry) => entry.team_id === activeTeam.id) || null);
    });
  }, [activeTeam, effectiveSeason, todayStr]);

  const seasonAvailability = useMemo(
    () =>
      availability.filter((window) =>
        !effectiveSeason || (window.date >= effectiveSeason.start_date && window.date <= effectiveSeason.end_date),
      ),
    [availability, effectiveSeason],
  );

  const seasonEvents = useMemo(
    () =>
      events.filter((event) =>
        !effectiveSeason || (event.date >= effectiveSeason.start_date && event.date <= effectiveSeason.end_date),
      ),
    [events, effectiveSeason],
  );

  const openDates = seasonAvailability.filter((window) => window.status === 'open' && !window.blocked);
  const upcomingEventsAll = seasonEvents.filter((event) => event.date >= todayStr);
  const gamesThisWeek = upcomingEventsAll.filter((event) => event.event_type !== 'practice' && event.date <= weekEndStr);
  const practicesThisWeek = seasonEvents.filter(
    (event) => event.event_type === 'practice' && event.date >= todayStr && event.date <= weekEndStr,
  );
  const eventsThisWeek = upcomingEventsAll.filter((event) => event.date <= weekEndStr);
  const upcomingEvents = useMemo(
    () =>
      upcomingEventsAll
        .sort((left, right) => (left.date + (left.start_time || '')).localeCompare(right.date + (right.start_time || '')))
        .slice(0, 5),
    [upcomingEventsAll],
  );
  const incomingProposals = useMemo(
    () =>
      [...proposals]
        .sort((left, right) => (left.proposed_date + (left.proposed_start_time || '')).localeCompare(right.proposed_date + (right.proposed_start_time || '')))
        .slice(0, 4),
    [proposals],
  );

  const snapshotRecord = competitionRecord || record;

  const resetDemoData = async () => {
    const shouldReset = await confirm({
      title: 'Reset demo data?',
      description: 'This wipes the current demo database and reloads the seeded dataset.',
      confirmLabel: 'Reset demo data',
      confirmVariant: 'destructive',
    });
    if (!shouldReset) return;
    setSeedError('');
    setSeedLoading(true);
    try {
      await api.seed();
      window.location.reload();
    } catch (error) {
      setSeedError(String(error));
    } finally {
      setSeedLoading(false);
    }
  };

  if (!activeTeam) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Dashboard"
          subtitle={teams.length > 0 ? 'Choose an active team to view schedule, proposals, and season context.' : 'Select a team or seed demo data to begin.'}
        />
        <Card className="mx-auto max-w-2xl p-6">
          <div className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {teams.length > 0 ? 'No active team selected' : 'Welcome to RinkLink'}
          </div>
          <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {teams.length > 0
              ? 'Use the team switcher in the header to load a team workspace.'
              : 'Seed the demo dataset to restore the sample associations, teams, arenas, and events.'}
          </div>
          {teams.length === 0 ? (
            <div className="mt-5">
              <Button type="button" disabled={seedLoading} onClick={resetDemoData}>
                {seedLoading ? 'Seeding…' : 'Seed Demo Data'}
              </Button>
            </div>
          ) : null}
          {seedError ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-100">
              {seedError}
            </div>
          ) : null}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={(
          <span className="inline-flex items-center gap-3">
            <TeamLogo name={activeTeam.name} logoUrl={activeTeam.logo_url} className="h-10 w-10 rounded-xl" initialsClassName="text-xs" />
            <span>{activeTeam.name} Dashboard</span>
          </span>
        )}
        subtitle={
          effectiveSeason
            ? primaryMembership
              ? `${effectiveSeason.name} Season • ${primaryMembership.competition_short_name} ${primaryMembership.division_name}`
              : `${effectiveSeason.name} Season`
            : 'All Seasons'
        }
        actions={(
          <Button type="button" disabled={seedLoading} onClick={resetDemoData}>
            {seedLoading ? 'Seeding…' : 'Reset Demo Data'}
          </Button>
        )}
      />

      {seedError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-100">
          {seedError}
        </div>
      ) : null}

      <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2', snapshotRecord ? 'xl:grid-cols-4' : 'xl:grid-cols-3')}>
        {snapshotRecord ? (
          <StatCard
            title={competitionRecord ? 'League Record' : effectiveSeason ? 'Season Record' : 'Overall Record'}
            value={`${snapshotRecord.wins}-${snapshotRecord.losses}-${snapshotRecord.ties}`}
            subtitle={`${snapshotRecord.points} points`}
            onClick={competitionRecord ? () => navigate('/standings') : undefined}
            icon={<Trophy className="h-4 w-4" />}
            color="bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/40 dark:text-fuchsia-400"
          />
        ) : null}
        <StatCard
          title="Upcoming Schedule"
          value={upcomingEventsAll.length}
          subtitle={
            eventsThisWeek.length > 0
              ? `${gamesThisWeek.length} game${gamesThisWeek.length === 1 ? '' : 's'} • ${practicesThisWeek.length} practice${practicesThisWeek.length === 1 ? '' : 's'} this week`
              : 'No events this week'
          }
          onClick={() => navigate('/schedule')}
          icon={<CheckCircle2 className="h-4 w-4" />}
          color="bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400"
        />
        <StatCard
          title="Open Availability"
          value={openDates.length}
          subtitle={`${openDates.filter((window) => window.date <= weekEndStr).length} this week`}
          onClick={() => navigate('/availability')}
          icon={<Calendar className="h-4 w-4" />}
          color="bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-400"
        />
        <StatCard
          title="Incoming Proposals"
          value={proposals.length}
          onClick={() => navigate('/proposals')}
          icon={<Inbox className="h-4 w-4" />}
          color="bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.35fr_0.95fr]">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-200 bg-white/85 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/30">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Upcoming Schedule</div>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Confirmed games, scrimmages, and practices for the next few dates.
            </div>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {upcomingEvents.length === 0 ? (
              <div className="px-4 py-4">
                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
                  <div className="font-medium text-slate-900 dark:text-slate-100">No upcoming events</div>
                  <div className="mt-1">Schedule a practice or accept a proposal to populate the next event block.</div>
                  <div className="mt-3">
                    <Button type="button" size="sm" onClick={() => navigate('/schedule')}>Open Schedule</Button>
                  </div>
                </div>
              </div>
            ) : upcomingEvents.map((event) => (
              <button
                type="button"
                key={event.id}
                onClick={() => navigate(`/schedule/${event.id}`)}
                className="group w-full px-4 py-4 text-left transition hover:bg-slate-50/70 dark:hover:bg-slate-900/40"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-3">
                      <div className="flex shrink-0 items-center gap-2">
                        <TeamLogo name={event.home_team_name || 'Home'} logoUrl={event.home_team_logo_url} className="h-10 w-10 rounded-xl" initialsClassName="text-xs" />
                        {event.away_team_name ? (
                          <TeamLogo name={event.away_team_name} logoUrl={event.away_team_logo_url} className="h-10 w-10 rounded-xl" initialsClassName="text-xs" />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {eventTitle(event)}
                          </div>
                          {event.competition_short_name ? (
                            <Badge variant="outline" className="shrink-0">
                              {event.competition_short_name}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="mt-1 flex items-center gap-2 truncate text-sm text-slate-600 dark:text-slate-400">
                          <TeamLogo name={event.arena_name || 'Arena'} logoUrl={event.arena_logo_url} className="h-6 w-6 rounded-lg" initialsClassName="text-[9px]" />
                          <span className="truncate">{eventVenue(event)}</span>
                        </div>
                        {(event.home_locker_room_name || event.away_locker_room_name) ? (
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            Locker rooms: {[event.home_locker_room_name, event.away_locker_room_name].filter(Boolean).join(' / ')}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2 md:items-end">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {formatShortDate(event.date)}
                      {event.start_time ? ` • ${formatTimeHHMM(event.start_time) || event.start_time}` : ''}
                    </div>
                    <Badge variant={getCompetitionBadgeVariant(event.event_type)} className="w-fit">
                      {getCompetitionLabel(event.event_type)}
                    </Badge>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-200 bg-white/85 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/30">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Incoming Proposals</div>
                <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Requests waiting on your response.
                </div>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => navigate('/proposals')}>
                Open Proposals
              </Button>
            </div>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {incomingProposals.length === 0 ? (
              <div className="px-4 py-4">
                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
                  <div className="font-medium text-slate-900 dark:text-slate-100">No incoming proposals</div>
                  <div className="mt-1">New matchup requests will appear here when other teams send them.</div>
                </div>
              </div>
            ) : incomingProposals.map((proposal) => (
              <button
                type="button"
                key={proposal.id}
                onClick={() => navigate('/proposals')}
                className="group w-full px-4 py-3 text-left transition hover:bg-slate-50/70 dark:hover:bg-slate-900/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-3">
                      <div className="flex shrink-0 items-center gap-2">
                        <TeamLogo name={proposal.home_team_name || 'Home'} logoUrl={proposal.home_team_logo_url} className="h-9 w-9 rounded-xl" initialsClassName="text-[11px]" />
                        <TeamLogo name={proposal.away_team_name || 'Away'} logoUrl={proposal.away_team_logo_url} className="h-9 w-9 rounded-xl" initialsClassName="text-[11px]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-900 group-hover:text-cyan-700 dark:text-slate-100 dark:group-hover:text-cyan-300">
                          {proposal.home_team_name} vs {proposal.away_team_name}
                        </div>
                        <div className="mt-1 truncate text-sm text-slate-600 dark:text-slate-400">
                          {[proposal.arena_name, proposal.arena_rink_name].filter(Boolean).join(' • ') || 'Venue TBD'}
                        </div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {formatShortDate(proposal.proposed_date)}
                          {proposal.proposed_start_time ? ` • ${formatTimeHHMM(proposal.proposed_start_time) || proposal.proposed_start_time}` : ''}
                        </div>
                      </div>
                    </div>
                  </div>
                  <Badge variant={getCompetitionBadgeVariant(proposal.event_type)} className="shrink-0">
                    {getCompetitionLabel(proposal.event_type)}
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
