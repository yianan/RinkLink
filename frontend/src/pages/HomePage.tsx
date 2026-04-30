import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, CheckCircle2, Inbox, RotateCcw, Trophy } from 'lucide-react';
import { api } from '../api/client';
import { Arena, Event, IceBookingRequest, Proposal, StandingsEntry, TeamCompetitionMembership, AvailabilityWindow } from '../types';
import { useAuth } from '../context/AuthContext';
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
import { interactiveTitleClass, listRowButtonClass } from '../lib/uiClasses';

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

function attendanceSummaryLabel(event: Event) {
  const summary = event.attendance_summary;
  if (!summary || summary.total_players === 0) return null;
  const parts = [
    summary.attending_count > 0 ? `${summary.attending_count} Attending` : null,
    summary.tentative_count > 0 ? `${summary.tentative_count} Tentative` : null,
    summary.absent_count > 0 ? `${summary.absent_count} Out` : null,
    summary.unknown_count > 0 ? `${summary.unknown_count} Unknown` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export default function HomePage() {
  const navigate = useNavigate();
  const { activeTeam, teams } = useTeam();
  const { activeSeason, seasons } = useSeason();
  const { me } = useAuth();
  const confirm = useConfirmDialog();

  const [availability, setAvailability] = useState<AvailabilityWindow[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [bookingRequests, setBookingRequests] = useState<IceBookingRequest[]>([]);
  const [assignedArenas, setAssignedArenas] = useState<Arena[]>([]);
  const [record, setRecord] = useState<StandingsEntry | null>(null);
  const [competitionRecord, setCompetitionRecord] = useState<StandingsEntry | null>(null);
  const [primaryMembership, setPrimaryMembership] = useState<TeamCompetitionMembership | null>(null);
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedError, setSeedError] = useState('');

  const effectiveSeason = activeSeason ?? seasons.find((season) => season.is_active) ?? seasons[0] ?? null;
  const today = new Date();
  const todayStr = toLocalDateString(today);
  const weekEndStr = toLocalDateString(addDays(today, 7));
  const canManageSchedule = !!me?.capabilities.includes('team.manage_schedule');
  const canManageProposals = !!me?.capabilities.includes('team.manage_proposals');
  const canViewPrivateRoster = !!me?.capabilities.includes('team.view_private');
  const canSeedDemoData = !me || me.user.is_platform_admin;
  const canViewAvailabilitySummary = canManageSchedule;
  const canViewProposalSummary = canManageProposals;
  const canViewIceRequestSummary = canManageSchedule;
  const familyMode = !canManageSchedule && !canManageProposals && !canViewPrivateRoster && (me?.linked_players.length || 0) > 0;
  const arenaOnlyMode = !activeTeam && (me?.arenas.length || 0) > 0 && (me?.accessible_teams.length || 0) === 0 && !familyMode;
  const linkedPlayersForActiveTeam = (me?.linked_players || []).filter((player) => player.team_id === activeTeam?.id);

  useEffect(() => {
    if (!activeTeam) return;
    let cancelled = false;

    Promise.all([
      canViewAvailabilitySummary ? api.getAvailability(activeTeam.id, { limit: '200' }) : Promise.resolve([]),
      api.getEvents(activeTeam.id, { date_from: todayStr, limit: '200' }),
      canViewProposalSummary ? api.getProposals(activeTeam.id, { direction: 'incoming', status: 'proposed', limit: '100' }) : Promise.resolve([]),
      canViewIceRequestSummary ? api.getTeamIceBookingRequests(activeTeam.id, { status: 'requested' }) : Promise.resolve([]),
      familyMode || !effectiveSeason ? Promise.resolve([]) : api.getStandings(effectiveSeason.id),
      familyMode || !effectiveSeason ? Promise.resolve([]) : api.getTeamCompetitionMemberships(activeTeam.id, { season_id: effectiveSeason.id }),
    ]).then(async ([availabilityData, eventData, proposalData, requestData, standings, memberships]) => {
      if (cancelled) return;
      setAvailability(availabilityData);
      setEvents(eventData);
      setProposals(proposalData);
      setBookingRequests(requestData);
      setRecord(standings.find((entry) => entry.team_id === activeTeam.id) || null);

      const primary = memberships.find((membership) => membership.is_primary) ?? memberships[0] ?? null;
      setPrimaryMembership(primary);

      const standingsMembership =
        memberships.find((membership) => membership.is_primary && membership.standings_enabled)
        ?? memberships.find((membership) => membership.standings_enabled)
        ?? null;

      if (familyMode || !standingsMembership) {
        setCompetitionRecord(null);
        return;
      }

      const divisionStandings = await api.getCompetitionDivisionStandings(standingsMembership.competition_division_id);
      if (cancelled) return;
      setCompetitionRecord(divisionStandings.find((entry) => entry.team_id === activeTeam.id) || null);
    }).catch(() => {
      if (cancelled) return;
      setAvailability([]);
      setEvents([]);
      setProposals([]);
      setBookingRequests([]);
      setRecord(null);
      setCompetitionRecord(null);
    });
    return () => {
      cancelled = true;
    };
  }, [activeTeam, canViewAvailabilitySummary, canViewIceRequestSummary, canViewProposalSummary, effectiveSeason, familyMode, todayStr]);

  useEffect(() => {
    if (!arenaOnlyMode || !me) {
      setAssignedArenas([]);
      return;
    }
    let cancelled = false;
    api.getArenas().then((allArenas) => {
      if (cancelled) {
        return;
      }
      const arenaIds = new Set(me.arenas.map((arena) => arena.arena_id));
      setAssignedArenas(allArenas.filter((arena) => arenaIds.has(arena.id)));
    }).catch(() => {
      if (!cancelled) {
        setAssignedArenas([]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [arenaOnlyMode, me]);

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
  const upcomingEventsAll = seasonEvents.filter((event) => event.date >= todayStr && event.status !== 'cancelled');
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
  const linkedPlayerLabel = linkedPlayersForActiveTeam.length === 1
    ? `${linkedPlayersForActiveTeam[0].first_name} ${linkedPlayersForActiveTeam[0].last_name}`
    : `${linkedPlayersForActiveTeam.length} linked players`;

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
    if (arenaOnlyMode) {
      return (
        <div className="space-y-6">
          <PageHeader
            title="Arena Operations"
            subtitle="Review assigned arenas and jump into rink, locker-room, and booking workflows."
          />
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard
              title="Assigned Arenas"
              value={assignedArenas.length}
              subtitle="Arena records in your operational scope"
              icon={<Calendar className="h-4 w-4 text-cyan-700 dark:text-cyan-200" />}
              color="bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-100"
            />
          </div>
          <Card className="p-6">
            <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">Assigned Arenas</div>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Open an assigned arena to manage slots, locker rooms, and booking responses.
            </div>
            <div className="mt-5 space-y-3">
              {assignedArenas.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300/80 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  No assigned arenas are available yet.
                </div>
              ) : assignedArenas.map((arena) => (
                <button
                  key={arena.id}
                  type="button"
                  onClick={() => navigate(`/arenas/${arena.id}`)}
                  className={cn('w-full rounded-2xl border border-slate-200/80 bg-slate-50/90 p-4 text-left dark:border-slate-800 dark:bg-slate-900/60', clickableCard)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-slate-900 dark:text-slate-100">{arena.name}</div>
                      <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                        {[arena.city, arena.state].filter(Boolean).join(', ') || 'Location unavailable'}
                      </div>
                    </div>
                    <Badge variant="outline">{arena.rink_count} rink{arena.rink_count === 1 ? '' : 's'}</Badge>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </div>
      );
    }
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
          {teams.length === 0 && canSeedDemoData ? (
            <div className="mt-5">
              <Button type="button" disabled={seedLoading} onClick={resetDemoData}>
                <RotateCcw className="h-4 w-4" />
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
            <span>{familyMode ? `${activeTeam.name} Family Dashboard` : `${activeTeam.name} Dashboard`}</span>
          </span>
        )}
        subtitle={
          familyMode
            ? linkedPlayersForActiveTeam.length > 0
              ? `Attendance and event view for ${linkedPlayerLabel}`
              : 'Attendance and schedule view for your linked players'
            : effectiveSeason
            ? primaryMembership
              ? `${effectiveSeason.name} Season • ${primaryMembership.competition_short_name} ${primaryMembership.division_name}`
              : `${effectiveSeason.name} Season`
            : 'All Seasons'
        }
        actions={(
          !familyMode && canSeedDemoData ? (
            <Button type="button" variant="outline" disabled={seedLoading} onClick={resetDemoData}>
              <RotateCcw className="h-4 w-4" />
              {seedLoading ? 'Seeding…' : 'Reset Demo Data'}
            </Button>
          ) : null
        )}
      />

      {seedError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-100">
          {seedError}
        </div>
      ) : null}

      <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2', familyMode ? 'xl:grid-cols-3' : snapshotRecord ? 'xl:grid-cols-5' : 'xl:grid-cols-4')}>
        {familyMode ? (
          <StatCard
            title="Linked Players"
            value={linkedPlayersForActiveTeam.length}
            subtitle={linkedPlayersForActiveTeam.length > 0 ? linkedPlayerLabel : 'No linked players on this team'}
            icon={<Trophy className="h-4 w-4" />}
            color="bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/40 dark:text-fuchsia-400"
          />
        ) : null}
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
        {!familyMode && canViewAvailabilitySummary ? (
          <StatCard
            title="Open Availability"
            value={openDates.length}
            subtitle={`${openDates.filter((window) => window.date <= weekEndStr).length} this week`}
            onClick={() => navigate('/availability')}
            icon={<Calendar className="h-4 w-4" />}
            color="bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-400"
          />
        ) : null}
        {!familyMode && canViewProposalSummary ? (
          <StatCard
            title="Incoming Proposals"
            value={proposals.length}
            onClick={() => navigate('/proposals')}
            icon={<Inbox className="h-4 w-4" />}
            color="bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
          />
        ) : null}
        {!familyMode && canViewIceRequestSummary ? (
          <StatCard
            title="Pending Ice Requests"
            value={bookingRequests.length}
            subtitle={bookingRequests.length > 0 ? 'Awaiting arena response' : 'No pending requests'}
            onClick={bookingRequests.length > 0 ? () => navigate('/schedule?tab=requests') : undefined}
            icon={<Inbox className="h-4 w-4" />}
            color="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
          />
        ) : null}
      </div>

      <div className={cn('grid gap-3', familyMode || canViewProposalSummary ? 'xl:grid-cols-[1.35fr_0.95fr]' : 'xl:grid-cols-1')}>
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
                  <div className="mt-1">
                    {familyMode
                      ? 'Upcoming practices and games for your linked players will appear here.'
                      : 'Schedule a practice or accept a proposal to populate the next event block.'}
                  </div>
                  <div className="mt-3">
                    <Button type="button" size="sm" variant="outline" onClick={() => navigate('/schedule')}>
                      <Calendar className="h-4 w-4" />
                      Open Schedule
                    </Button>
                  </div>
                </div>
              </div>
            ) : upcomingEvents.map((event) => (
              <button
                type="button"
                key={event.id}
                onClick={() => navigate(`/schedule/${event.id}`, {
                  state: {
                    backTo: '/',
                    backLabel: 'Back to Dashboard',
                  },
                })}
                className={cn(listRowButtonClass, 'px-4 py-4')}
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
                        {attendanceSummaryLabel(event) ? (
                          <div className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                            {attendanceSummaryLabel(event)}
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

        {familyMode || canViewProposalSummary ? (
          <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-200 bg-white/85 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/30">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {familyMode ? 'Linked Players' : 'Incoming Proposals'}
                </div>
                <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  {familyMode ? 'Players you can respond for from this account.' : 'Requests waiting on your response.'}
                </div>
              </div>
              {!familyMode && canViewProposalSummary ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => navigate('/proposals')}>
                  Open Proposals
                </Button>
              ) : null}
            </div>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {familyMode ? (
              linkedPlayersForActiveTeam.length === 0 ? (
                <div className="px-4 py-4">
                  <div className="rounded-xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
                    <div className="font-medium text-slate-900 dark:text-slate-100">No linked players on this team</div>
                    <div className="mt-1">Switch teams or accept a player or guardian invite to see attendance here.</div>
                  </div>
                </div>
              ) : linkedPlayersForActiveTeam.map((player) => (
                <button
                  type="button"
                  key={player.player_id}
                  onClick={() => navigate('/schedule')}
                  className={cn(listRowButtonClass, 'px-4 py-3')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className={cn('truncate text-sm font-semibold text-slate-900 dark:text-slate-100', interactiveTitleClass)}>
                        {player.first_name} {player.last_name}
                      </div>
                      <div className="mt-1 truncate text-sm text-slate-600 dark:text-slate-400">
                        {player.link_type === 'player' ? 'Self-managed player access' : 'Parent/guardian access'}
                      </div>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {player.link_type === 'player' ? 'Player' : 'Guardian'}
                    </Badge>
                  </div>
                </button>
              ))
            ) : incomingProposals.length === 0 ? (
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
                className={cn(listRowButtonClass, 'px-4 py-3')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-3">
                      <div className="flex shrink-0 items-center gap-2">
                        <TeamLogo name={proposal.home_team_name || 'Home'} logoUrl={proposal.home_team_logo_url} className="h-9 w-9 rounded-xl" initialsClassName="text-[11px]" />
                        <TeamLogo name={proposal.away_team_name || 'Away'} logoUrl={proposal.away_team_logo_url} className="h-9 w-9 rounded-xl" initialsClassName="text-[11px]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className={cn('truncate text-sm font-semibold text-slate-900 dark:text-slate-100', interactiveTitleClass)}>
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
        ) : null}
      </div>
    </div>
  );
}
