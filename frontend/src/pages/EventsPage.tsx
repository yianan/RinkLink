import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarPlus2, Link2, Save, SendHorizontal, X, XCircle } from 'lucide-react';
import { api } from '../api/client';
import { Arena, ArenaRink, Event, IceBookingRequest, IceSlot, Team } from '../types';
import { useAuth } from '../context/AuthContext';
import { useSeason } from '../context/SeasonContext';
import { useTeam } from '../context/TeamContext';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import FilterPillGroup, { type FilterOption } from '../components/FilterPillGroup';
import { FilterPanel, FilterPanelTrigger } from '../components/FilterPanel';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import ScoreStepper from '../components/ScoreStepper';
import { Select } from '../components/ui/Select';
import PageHeader from '../components/PageHeader';
import SegmentedTabs from '../components/SegmentedTabs';
import TeamLogo from '../components/TeamLogo';
import { getCompetitionBadgeVariant, getCompetitionLabel } from '../lib/competition';
import { getGameStatusLabel, getGameStatusVariant } from '../lib/gameStatus';
import { accentActionClass, interactiveTitleClass, listRowButtonClass, selectableRowButtonActiveClass, selectableRowButtonClass } from '../lib/uiClasses';
import { formatShortDate, formatTimeHHMM, toLocalDateString } from '../lib/time';
import { useToast } from '../context/ToastContext';

const EVENT_TYPES: Event['event_type'][] = ['league', 'tournament', 'practice', 'showcase', 'scrimmage', 'exhibition'];

function formatPriceLabel(pricingMode: string, priceAmountCents: number | null, currency = 'USD') {
  if (pricingMode === 'call_for_pricing') {
    return 'Call for pricing';
  }
  if (priceAmountCents == null) {
    return 'Pricing TBD';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: 0,
  }).format(priceAmountCents / 100);
}

function bookingRequestTitle(request: IceBookingRequest) {
  if (!request.away_team_name || request.event_type === 'practice' || request.event_type === 'scrimmage') {
    return `${request.requester_team_name} ${getCompetitionLabel(request.event_type)}`;
  }
  return `${request.requester_team_name} vs ${request.away_team_name}`;
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

const emptyForm = {
  event_type: 'league' as Event['event_type'],
  away_team_id: '',
  arena_id: '',
  arena_rink_id: '',
  ice_slot_id: '',
  date: '',
  start_time: '',
  end_time: '',
  notes: '',
  opponent_message: '',
};

export default function EventsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeTeam, teams } = useTeam();
  const { activeSeason, seasons } = useSeason();
  const { me } = useAuth();
  const pushToast = useToast();
  const [events, setEvents] = useState<Event[]>([]);
  const [bookingRequests, setBookingRequests] = useState<IceBookingRequest[]>([]);
  const [arenas, setArenas] = useState<Arena[]>([]);
  const [arenaRinks, setArenaRinks] = useState<ArenaRink[]>([]);
  const [openIceSlots, setOpenIceSlots] = useState<IceSlot[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [scoreEdits, setScoreEdits] = useState<Record<string, Partial<{ home: string; away: string }>>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedEventTypes, setSelectedEventTypes] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedArenaNames, setSelectedArenaNames] = useState<string[]>([]);

  const effectiveSeason = activeSeason ?? seasons.find((season) => season.is_active) ?? seasons[0] ?? null;
  const todayStr = toLocalDateString(new Date());
  const canManageSchedule = !!me?.capabilities.includes('team.manage_schedule');
  const canManageRequests = canManageSchedule;
  const requestedTab = searchParams.get('tab');
  const tab = requestedTab === 'past' || requestedTab === 'all' || requestedTab === 'requests' ? requestedTab : 'upcoming';
  const visibleTab = tab === 'requests' && !canManageRequests ? 'upcoming' : tab;

  const handleTabChange = (nextTab: 'upcoming' | 'past' | 'all' | 'requests') => {
    if (nextTab === 'requests' && !canManageRequests) {
      return;
    }
    const nextParams = new URLSearchParams(searchParams);
    if (nextTab === 'upcoming') {
      nextParams.delete('tab');
    } else {
      nextParams.set('tab', nextTab);
    }
    setSearchParams(nextParams, { replace: true });
  };

  useEffect(() => {
    if (!activeTeam) return;
    let cancelled = false;
    const eventParams: Record<string, string> = { limit: '500' };
    if (effectiveSeason) {
      eventParams.season_id = effectiveSeason.id;
    }
    if (visibleTab === 'upcoming') {
      eventParams.date_from = todayStr;
    } else if (visibleTab === 'past') {
      eventParams.date_to = todayStr;
    }
    Promise.all([
      api.getEvents(activeTeam.id, eventParams),
      canManageRequests ? api.getTeamIceBookingRequests(activeTeam.id) : Promise.resolve([]),
    ]).then(([eventData, requestData]) => {
      if (cancelled) return;
      setEvents(eventData);
      setBookingRequests(requestData);
      setScoreEdits({});
    }).catch(() => {
      if (cancelled) return;
      setEvents([]);
      setBookingRequests([]);
      setScoreEdits({});
    });
    return () => {
      cancelled = true;
    };
  }, [activeTeam, canManageRequests, effectiveSeason, todayStr, visibleTab]);

  useEffect(() => {
    if (!open || !canManageSchedule) return;
    api.getArenas().then(setArenas);
  }, [open, canManageSchedule]);

  useEffect(() => {
    if (!form.arena_id) return;
    api.getArenaRinks(form.arena_id).then(setArenaRinks);
  }, [form.arena_id]);

  useEffect(() => {
    if (!open || !form.date) return;
    const params: Record<string, string> = { date_from: form.date };
    if (form.arena_id) params.arena_id = form.arena_id;
    if (form.arena_rink_id) params.arena_rink_id = form.arena_rink_id;
    api.getOpenIceSlots(params).then((slots) => {
      setOpenIceSlots(slots);
      if (form.ice_slot_id && !slots.some((slot) => slot.id === form.ice_slot_id)) {
        setForm((current) => ({
          ...current,
          ice_slot_id: '',
          start_time: '',
          end_time: '',
        }));
      }
    });
  }, [open, form.date, form.arena_id, form.arena_rink_id, form.ice_slot_id]);

  const visibleOpenIceSlots = useMemo(
    () => (open && form.date ? openIceSlots : []),
    [form.date, open, openIceSlots],
  );
  const selectedSlot = useMemo(
    () => visibleOpenIceSlots.find((slot) => slot.id === form.ice_slot_id) ?? null,
    [form.ice_slot_id, visibleOpenIceSlots],
  );

  const eventTypeOptions = useMemo<FilterOption[]>(
    () => EVENT_TYPES.map((eventType) => ({ value: eventType, label: getCompetitionLabel(eventType) })),
    [],
  );

  const statusOptions = useMemo<FilterOption[]>(() => {
    const scopedEvents = events.filter((event) => !effectiveSeason || (event.date >= effectiveSeason.start_date && event.date <= effectiveSeason.end_date));
    const values = Array.from(new Set(scopedEvents.map((event) => event.status)));
    return values.map((status) => ({ value: status, label: getGameStatusLabel({ status, home_weekly_confirmed: false, away_weekly_confirmed: false }) }));
  }, [effectiveSeason, events]);

  const arenaOptions = useMemo<FilterOption[]>(() => {
    const scopedEvents = events.filter((event) => !effectiveSeason || (event.date >= effectiveSeason.start_date && event.date <= effectiveSeason.end_date));
    const values = Array.from(new Set(scopedEvents.map((event) => event.arena_name).filter(Boolean) as string[]));
    return values.sort((left, right) => left.localeCompare(right)).map((arenaName) => ({ value: arenaName, label: arenaName }));
  }, [effectiveSeason, events]);

  const activeFilterBadges = useMemo(() => {
    const labelsFor = (options: FilterOption[], selectedValues: string[]) =>
      options.filter((option) => selectedValues.includes(option.value)).map((option) => option.label);
    return [
      ...labelsFor(eventTypeOptions, selectedEventTypes),
      ...labelsFor(statusOptions, selectedStatuses),
      ...labelsFor(arenaOptions, selectedArenaNames),
    ];
  }, [arenaOptions, eventTypeOptions, selectedArenaNames, selectedEventTypes, selectedStatuses, statusOptions]);

  const clearFilters = () => {
    setSelectedEventTypes([]);
    setSelectedStatuses([]);
    setSelectedArenaNames([]);
  };

  const getEventScoreEdit = (event: Event) => ({
    home: scoreEdits[event.id]?.home ?? (event.home_score != null ? String(event.home_score) : '0'),
    away: scoreEdits[event.id]?.away ?? (event.away_score != null ? String(event.away_score) : '0'),
  });

  if (!activeTeam) {
    return <Alert variant="info">Select a team to view events.</Alert>;
  }

  const seasonEvents = events.filter((event) => !effectiveSeason || (event.date >= effectiveSeason.start_date && event.date <= effectiveSeason.end_date));
  const filtered = seasonEvents.filter((event) => {
    if (visibleTab === 'upcoming') return event.date >= todayStr;
    if (visibleTab === 'past') return event.date < todayStr;
    if (visibleTab === 'requests') return false;
    return true;
  }).filter((event) => (
    (selectedEventTypes.length === 0 || selectedEventTypes.includes(event.event_type))
    && (selectedStatuses.length === 0 || selectedStatuses.includes(event.status))
    && (selectedArenaNames.length === 0 || (event.arena_name && selectedArenaNames.includes(event.arena_name)))
  ));
  const filteredRequests = visibleTab === 'requests' ? bookingRequests : [];

  const saveBookingRequest = async () => {
    const requestMessage = [
      form.notes.trim(),
      form.event_type !== 'practice' && form.event_type !== 'scrimmage' && form.opponent_message.trim()
        ? `Message for opponent: ${form.opponent_message.trim()}`
        : '',
    ].filter(Boolean).join('\n\n');
    await api.createTeamIceBookingRequest(activeTeam.id, {
      event_type: form.event_type,
      away_team_id: form.event_type === 'practice' || form.event_type === 'scrimmage' ? null : (form.away_team_id || null),
      season_id: effectiveSeason?.id || null,
      ice_slot_id: form.ice_slot_id || undefined,
      message: requestMessage || null,
    });
    setOpen(false);
    setForm(emptyForm);
    const requests = await api.getTeamIceBookingRequests(activeTeam.id);
    setBookingRequests(requests);
    pushToast({ variant: 'success', title: 'Booking request sent' });
  };

  const saveScore = async (event: Event) => {
    const edit = getEventScoreEdit(event);
    const updated = await api.updateEvent(event.id, {
      home_score: edit.home === '' ? null : Number(edit.home),
      away_score: edit.away === '' ? null : Number(edit.away),
    });
    setEvents((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    setScoreEdits((current) => ({
      ...current,
      [event.id]: {
        home: updated.home_score != null ? String(updated.home_score) : '',
        away: updated.away_score != null ? String(updated.away_score) : '',
      },
    }));
    pushToast({ variant: 'success', title: 'Score saved' });
  };

  const copyCalendarFeed = async () => {
    const payload = await api.getTeamCalendarFeed(activeTeam.id);
    await navigator.clipboard.writeText(payload.url);
    pushToast({ variant: 'success', title: 'Calendar feed copied' });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Schedule"
        subtitle={canManageRequests ? 'Scheduled events and open-ice requests live together here.' : 'Upcoming and past team events for your selected team.'}
        actions={(
          <div className="flex flex-wrap justify-end gap-2">
            {visibleTab !== 'requests' ? (
              <FilterPanelTrigger
                count={activeFilterBadges.length}
                open={filtersOpen}
                onClick={() => setFiltersOpen((current) => !current)}
                label={<><span className="sm:hidden">Filter</span><span className="hidden sm:inline">Filters</span></>}
                openLabel={<><span className="sm:hidden">Hide</span><span className="hidden sm:inline">Hide Filters</span></>}
                className="px-2.5 sm:px-3"
              />
            ) : null}
            <Button type="button" variant="outline" onClick={copyCalendarFeed}>
              <Link2 className="h-4 w-4" />
              <span className="sm:hidden">Feed</span>
              <span className="hidden sm:inline">Calendar Feed</span>
            </Button>
            {canManageSchedule ? (
              <Button type="button" onClick={() => setOpen(true)}>
                <CalendarPlus2 className="h-4 w-4" />
                <span className="sm:hidden">Schedule</span>
                <span className="hidden sm:inline">Schedule Event</span>
              </Button>
            ) : null}
          </div>
        )}
      />

      <SegmentedTabs
        items={[
          { label: 'Upcoming', value: 'upcoming' as const },
          { label: 'Past', value: 'past' as const },
          { label: 'All', value: 'all' as const },
          ...(canManageRequests ? [{
            label: (
              <>
                <span className="sm:hidden">Requests</span>
                <span className="hidden sm:inline">Ice Requests</span>
              </>
            ),
            value: 'requests' as const,
          }] : []),
        ]}
        value={visibleTab}
        onChange={handleTabChange}
      />

      {visibleTab !== 'requests' ? (
        <FilterPanel
          title="Filter events"
          description="Narrow the list by event type, status, and arena."
          open={filtersOpen}
          badges={activeFilterBadges}
          onClear={clearFilters}
        >
          <FilterPillGroup label="Type" options={eventTypeOptions} values={selectedEventTypes} onChange={setSelectedEventTypes} tone="sky" />
          <FilterPillGroup label="Status" options={statusOptions} values={selectedStatuses} onChange={setSelectedStatuses} tone="violet" />
          <FilterPillGroup label="Arena" options={arenaOptions} values={selectedArenaNames} onChange={setSelectedArenaNames} tone="emerald" />
        </FilterPanel>
      ) : null}

      {visibleTab === 'requests' ? (
        <Card className="overflow-hidden">
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {filteredRequests.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">No ice booking requests yet.</div>
            ) : filteredRequests.map((request) => (
              <div key={request.id} className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_14rem]">
                <div className="min-w-0">
                  <div className="flex items-start gap-3">
                    <div className="flex shrink-0 items-center gap-2">
                      <TeamLogo name={request.requester_team_name || activeTeam.name} logoUrl={request.requester_team_logo_url || activeTeam.logo_url} className="h-11 w-11 rounded-xl" initialsClassName="text-xs" />
                      {request.away_team_name ? (
                        <TeamLogo name={request.away_team_name} logoUrl={request.away_team_logo_url} className="h-11 w-11 rounded-xl" initialsClassName="text-xs" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {request.event_id ? (
                          <button
                            type="button"
                            onClick={() => navigate(`/schedule/${request.event_id}`, {
                              state: {
                                backTo: '/schedule?tab=requests',
                                backLabel: 'Back to Ice Requests',
                              },
                            })}
                            className={`basis-full text-left text-sm font-semibold sm:basis-auto ${accentActionClass}`}
                            title="Open Event"
                          >
                            <span className={interactiveTitleClass}>{bookingRequestTitle(request)}</span>
                          </button>
                        ) : (
                          <div className="basis-full text-sm font-semibold text-slate-900 dark:text-slate-100 sm:basis-auto">{bookingRequestTitle(request)}</div>
                        )}
                        <Badge variant={request.final_price_amount_cents != null || request.pricing_mode === 'fixed_price' ? 'outline' : 'warning'}>
                          {formatPriceLabel(request.final_price_amount_cents != null ? 'fixed_price' : request.pricing_mode, request.final_price_amount_cents ?? request.price_amount_cents, request.final_currency || request.currency)}
                        </Badge>
                        <Badge variant={getCompetitionBadgeVariant(request.event_type)}>{getCompetitionLabel(request.event_type)}</Badge>
                        <Badge variant={request.status === 'accepted' ? 'success' : request.status === 'requested' ? 'warning' : request.status === 'rejected' ? 'danger' : 'neutral'}>
                          {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                        </Badge>
                      </div>
                      <div className="mt-2 flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <TeamLogo name={request.arena_name || 'Arena'} logoUrl={request.arena_logo_url} className="h-6 w-6 rounded-lg" initialsClassName="text-[9px]" />
                        <span className="min-w-0 break-words">
                          {request.ice_slot_date ? formatShortDate(request.ice_slot_date) : 'Date TBD'}
                          {request.ice_slot_start_time ? ` • ${formatTimeHHMM(request.ice_slot_start_time) || request.ice_slot_start_time}` : ''}
                          {request.location_label ? ` • ${request.location_label}` : ''}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {request.home_locker_room_name || request.away_locker_room_name
                          ? `Locker rooms: ${[request.home_locker_room_name, request.away_locker_room_name].filter(Boolean).join(' / ')}`
                          : ''}
                      </div>
                      {request.message ? (
                        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                          <span className="font-semibold">Booker note:</span> {request.message}
                        </div>
                      ) : null}
                      {request.response_message ? (
                        <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-100">
                          <span className="font-semibold">Arena note:</span> {request.response_message}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="flex items-stretch justify-stretch border-t border-slate-200/80 pt-3 dark:border-slate-800/80 lg:items-center lg:justify-end lg:border-t-0 lg:pt-0">
                  {(request.status === 'requested' || request.status === 'accepted') ? (
                    <Button type="button" size="sm" variant="destructive" className="w-full lg:w-auto" onClick={async () => {
                      const updated = await api.cancelTeamIceBookingRequest(activeTeam.id, request.id);
                      setBookingRequests((current) => current.map((item) => (item.id === updated.id ? updated : item)));
                      if (request.event_id) {
                        const updatedEvents = await api.getEvents(activeTeam.id, { limit: '500' });
                        setEvents(updatedEvents);
                      }
                      pushToast({ variant: 'success', title: 'Booking request cancelled' });
                    }}>
                      <XCircle className="h-3.5 w-3.5" />
                      Cancel Request
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">No scheduled items in this view.</div>
          ) : filtered.map((event) => {
            const edit = getEventScoreEdit(event);
            const isSingleTeamEvent = !event.away_team_id;
            const isFuture = event.date > todayStr;
            const canScore = !!event.away_team_id && event.status !== 'cancelled' && !isFuture;
            const hasSavedScore = event.home_score != null || event.away_score != null;
            const hasCompleteScoreDraft = edit.home !== '' && edit.away !== '';
            return (
              <div key={event.id} className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
                <button
                  type="button"
                  onClick={() => navigate(`/schedule/${event.id}`, {
                    state: {
                      backTo: '/schedule',
                      backLabel: 'Back to Schedule',
                    },
                  })}
                  className={listRowButtonClass}
                  title="Open Event"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex shrink-0 items-center gap-2">
                      <TeamLogo name={event.home_team_name || 'Home'} logoUrl={event.home_team_logo_url} className="h-11 w-11 rounded-xl" initialsClassName="text-xs" />
                      {event.away_team_name ? (
                        <TeamLogo name={event.away_team_name} logoUrl={event.away_team_logo_url} className="h-11 w-11 rounded-xl" initialsClassName="text-xs" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className={`text-sm font-medium text-[color:var(--app-accent-link)] dark:text-[color:var(--app-accent-link)] ${interactiveTitleClass}`}>
                          {event.away_team_name ? `${event.home_team_name} vs ${event.away_team_name}` : `${event.home_team_name} ${getCompetitionLabel(event.event_type)}`}
                        </div>
                        <Badge variant={getCompetitionBadgeVariant(event.event_type)}>{getCompetitionLabel(event.event_type)}</Badge>
                        <Badge variant={getGameStatusVariant(event)}>{getGameStatusLabel(event)}</Badge>
                        {hasSavedScore ? (
                          <Badge variant="outline">{event.home_score ?? 0}-{event.away_score ?? 0}</Badge>
                        ) : null}
                      </div>
                      <div className="mt-2 flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <TeamLogo name={event.arena_name || 'Arena'} logoUrl={event.arena_logo_url} className="h-6 w-6 rounded-lg" initialsClassName="text-[9px]" />
                        <span className="min-w-0 break-words">
                          {formatShortDate(event.date)}
                          {event.start_time ? ` • ${formatTimeHHMM(event.start_time) || event.start_time}` : ''}
                          {event.location_label ? ` • ${event.location_label}` : ''}
                        </span>
                      </div>
                      {event.home_locker_room_name || event.away_locker_room_name ? (
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Locker Rooms: {[event.home_locker_room_name, event.away_locker_room_name].filter(Boolean).join(' / ')}
                        </div>
                      ) : null}
                      {attendanceSummaryLabel(event) ? (
                        <div className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                          {attendanceSummaryLabel(event)}
                        </div>
                      ) : null}
                      {event.schedule_warnings?.length ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {event.schedule_warnings.map((warning) => (
                            <Badge key={warning} variant="warning">{warning}</Badge>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </button>

                {canScore ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/35">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Score</div>
                    <div className="mt-2 flex items-end gap-3">
                      <div className="min-w-0 flex-1">
                        <ScoreStepper label="Home" value={edit.home} onChange={(value) => setScoreEdits((current) => ({ ...current, [event.id]: { ...edit, home: value } }))} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <ScoreStepper label="Away" value={edit.away} onChange={(value) => setScoreEdits((current) => ({ ...current, [event.id]: { ...edit, away: value } }))} />
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => saveScore(event)}
                        disabled={!hasCompleteScoreDraft}
                        aria-label={hasSavedScore ? 'Update score' : 'Save score'}
                        title={hasSavedScore ? 'Update score' : 'Save score'}
                        className="mb-0.5 shrink-0"
                      >
                        <Save className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/35">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                      {isSingleTeamEvent ? `${getCompetitionLabel(event.event_type)} Logistics` : 'Upcoming Matchup'}
                    </div>
                    <div className="mt-2 space-y-1 text-slate-700 dark:text-slate-300">
                      <div className="flex items-center gap-2">
                        <TeamLogo name={event.arena_name || 'Arena'} logoUrl={event.arena_logo_url} className="h-6 w-6 rounded-lg" initialsClassName="text-[9px]" />
                        <div>{event.arena_rink_name || event.arena_name || 'Venue TBD'}</div>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {event.home_locker_room_name ? `Home: ${event.home_locker_room_name}` : 'Home locker room TBD'}
                        {!isSingleTeamEvent && event.away_locker_room_name ? ` • Away: ${event.away_locker_room_name}` : ''}
                      </div>
                      {!isSingleTeamEvent ? (
                        <div className="text-xs text-slate-500 dark:text-slate-400">Score entry opens on event day.</div>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
      )}

      <Modal
        open={open}
        onClose={() => { setOpen(false); setForm(emptyForm); }}
        title="Schedule Event"
        footer={(
          <>
            <Button
              type="button"
              onClick={saveBookingRequest}
              disabled={!form.date || !form.ice_slot_id || ((form.event_type !== 'practice' && form.event_type !== 'scrimmage') && !form.away_team_id)}
            >
              <SendHorizontal className="h-4 w-4" />
              Send Booking Request
            </Button>
            <Button type="button" variant="outline" onClick={() => { setOpen(false); setForm(emptyForm); }}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
          </>
        )}
      >
        <div className="grid grid-cols-1 gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Type</label>
              <Select
                value={form.event_type}
                onChange={(e) => setForm((current) => ({
                  ...current,
                  event_type: e.target.value as Event['event_type'],
                  away_team_id: e.target.value === 'practice' || e.target.value === 'scrimmage' ? '' : current.away_team_id,
                }))}
              >
                {EVENT_TYPES.map((eventType) => <option key={eventType} value={eventType}>{getCompetitionLabel(eventType)}</option>)}
              </Select>
            </div>
            {form.event_type !== 'practice' && form.event_type !== 'scrimmage' ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Away Team</label>
                <Select value={form.away_team_id} onChange={(e) => setForm((current) => ({ ...current, away_team_id: e.target.value }))}>
                  <option value="">Select opponent…</option>
                  {teams.filter((team) => team.id !== activeTeam.id).map((team: Team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </Select>
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Date</label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm((current) => ({
                  ...current,
                  date: e.target.value,
                  ice_slot_id: '',
                  start_time: '',
                  end_time: '',
                }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Scheduled Time</label>
              <div className="flex min-h-10 items-center rounded-lg border border-[color:var(--app-border-subtle)] bg-[var(--app-surface-strong)] px-3 py-2 text-sm text-slate-700 dark:text-slate-200">
                {selectedSlot
                  ? `${formatTimeHHMM(selectedSlot.start_time) || selectedSlot.start_time}${selectedSlot.end_time ? `-${formatTimeHHMM(selectedSlot.end_time) || selectedSlot.end_time}` : ''}`
                  : 'TBD'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Arena Filter</label>
              <Select
                value={form.arena_id}
                onChange={(e) => setForm((current) => ({
                  ...current,
                  arena_id: e.target.value,
                  arena_rink_id: '',
                  ice_slot_id: '',
                  start_time: '',
                  end_time: '',
                }))}
              >
                <option value="">All arenas</option>
                {arenas.map((arena) => <option key={arena.id} value={arena.id}>{arena.name}</option>)}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Rink Filter</label>
              <Select
                value={form.arena_rink_id}
                onChange={(e) => setForm((current) => ({
                  ...current,
                  arena_rink_id: e.target.value,
                  ice_slot_id: '',
                  start_time: '',
                  end_time: '',
                }))}
                disabled={!form.arena_id}
              >
                <option value="">{!form.arena_id ? 'Select arena first' : 'All rinks'}</option>
                {(form.arena_id ? arenaRinks : []).map((arenaRink) => <option key={arenaRink.id} value={arenaRink.id}>{arenaRink.name}</option>)}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Open Ice</label>
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/30">
                {!form.date ? (
                  <div className="px-3 py-3 text-sm text-slate-600 dark:text-slate-400">Choose a date to browse open ice across all arenas.</div>
                ) : openIceSlots.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-slate-600 dark:text-slate-400">
                    No open ice slots found.
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800">
                    {visibleOpenIceSlots.map((slot) => {
                      const selected = slot.id === form.ice_slot_id;
                      return (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => setForm((current) => ({
                            ...current,
                            ice_slot_id: slot.id,
                            arena_id: slot.arena_id || current.arena_id,
                            arena_rink_id: slot.arena_rink_id,
                            start_time: slot.start_time,
                            end_time: slot.end_time || '',
                          }))}
                          className={`flex items-start justify-between gap-3 ${selectableRowButtonClass} ${selected ? selectableRowButtonActiveClass : ''}`}
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {slot.arena_name || 'Arena TBD'}{slot.arena_rink_name ? ` · ${slot.arena_rink_name}` : ''}
                            </div>
                            <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                              {formatShortDate(slot.date)} · {formatTimeHHMM(slot.start_time) || slot.start_time}
                              {slot.end_time ? `-${formatTimeHHMM(slot.end_time) || slot.end_time}` : ''}
                            </div>
                            {slot.notes ? (
                              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{slot.notes}</div>
                            ) : null}
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950/30 dark:text-slate-100">
                              {formatPriceLabel(slot.pricing_mode, slot.price_amount_cents, slot.currency)}
                            </div>
                            {selected ? <Badge variant="info" className="mt-2">Selected</Badge> : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <Input placeholder="Message for arena" value={form.notes} onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))} />
          {form.event_type !== 'practice' && form.event_type !== 'scrimmage' ? (
            <Input
              placeholder="Message for opponent"
              value={form.opponent_message}
              onChange={(e) => setForm((current) => ({ ...current, opponent_message: e.target.value }))}
            />
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
