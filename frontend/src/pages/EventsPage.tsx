import { api as minimalApi } from "../api/minimal";
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarCheck2, CalendarPlus2, Save, SendHorizontal, X } from 'lucide-react';
import { api, isAbortError, type ListMeta } from '../api/client';
import { Arena, ArenaRink, Event, IceBookingRequest } from '../types';
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
import { interactiveTitleClass, listRowButtonClass } from '../lib/uiClasses';
import { formatShortDate, formatTimeHHMM, todayLocalDateString, toLocalDateString } from '../lib/time';
import { useToast } from '../context/ToastContext';

const EVENT_TYPES: Event['event_type'][] = ['league', 'practice', 'showcase', 'scrimmage', 'exhibition'];
const LIST_LIMIT = 100;

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

function emptyEventForm(date = todayLocalDateString()) {
  return {
    event_type: 'league' as Event['event_type'],
    away_team_id: '',
    opponent_name: '',
    arena_id: '',
    arena_rink_id: '',
    ice_slot_id: '',
    date,
    start_time: '',
    end_time: '',
    notes: '',
    opponent_message: '',
  };
}

export default function EventsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeTeam } = useTeam();
  const { activeSeason, seasons } = useSeason();
  const { authEnabled, me } = useAuth();
  const pushToast = useToast();
  const [events, setEvents] = useState<Event[]>([]);
  const [bookingRequests, setBookingRequests] = useState<IceBookingRequest[]>([]);
  const [eventsMeta, setEventsMeta] = useState<ListMeta>({ total: 0, limit: LIST_LIMIT, offset: 0 });
  const [requestsMeta, setRequestsMeta] = useState<ListMeta>({ total: 0, limit: LIST_LIMIT, offset: 0 });
  const [arenas, setArenas] = useState<Arena[]>([]);
  const [arenaRinks, setArenaRinks] = useState<ArenaRink[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(() => emptyEventForm());
  const [scoreEdits, setScoreEdits] = useState<Record<string, Partial<{ home: string; away: string }>>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedEventTypes, setSelectedEventTypes] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedArenaNames, setSelectedArenaNames] = useState<string[]>([]);
  const [pageOffset, setPageOffset] = useState(0);
  const [calendarBusy, setCalendarBusy] = useState(false);

  const effectiveSeason = activeSeason ?? seasons.find((season) => season.is_active) ?? seasons[0] ?? null;
  const todayStr = toLocalDateString(new Date());
  const canManageSchedule = !authEnabled || !!me?.capabilities.includes('team.manage_schedule');
  const canManageRequests = false;
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
    setPageOffset(0);
  }, [activeTeam?.id, effectiveSeason?.id, visibleTab]);

  useEffect(() => {
    if (!activeTeam) return;
    const controller = new AbortController();
    const eventParams: Record<string, string> = { limit: String(LIST_LIMIT), offset: String(pageOffset), include_total: 'false' };
    if (effectiveSeason) {
      eventParams.season_id = effectiveSeason.id;
    }
    if (visibleTab === 'upcoming') {
      eventParams.date_from = todayStr;
    } else if (visibleTab === 'past') {
      eventParams.date_to = todayStr;
    }
    const requestParams: Record<string, string> = { limit: String(LIST_LIMIT), offset: String(pageOffset) };
    Promise.all([
      visibleTab === 'requests'
        ? Promise.resolve({ data: [], meta: { total: 0, limit: LIST_LIMIT, offset: 0 } })
        : api.getEventsList(activeTeam.id, eventParams, { signal: controller.signal }),
      canManageRequests && visibleTab === 'requests'
        ? api.getTeamIceBookingRequestsList(activeTeam.id, requestParams, { signal: controller.signal })
        : Promise.resolve({ data: [], meta: { total: 0, limit: LIST_LIMIT, offset: 0 } }),
    ]).then(([eventResult, requestResult]) => {
      setEvents(eventResult.data);
      setEventsMeta(eventResult.meta);
      setBookingRequests(requestResult.data);
      setRequestsMeta(requestResult.meta);
      setScoreEdits({});
    }).catch((error) => {
      if (isAbortError(error)) return;
      setEvents([]);
      setBookingRequests([]);
      setEventsMeta({ total: 0, limit: LIST_LIMIT, offset: 0 });
      setRequestsMeta({ total: 0, limit: LIST_LIMIT, offset: 0 });
      setScoreEdits({});
    });
    return () => {
      controller.abort();
    };
  }, [activeTeam, canManageRequests, effectiveSeason, pageOffset, todayStr, visibleTab]);

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

  }, [open, form.date, form.arena_id, form.arena_rink_id, form.ice_slot_id]);

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

  const editEventId = searchParams.get('edit_event');
  useEffect(() => {
    if (!editEventId || !canManageSchedule || !events.length) return;
    const event = events.find(row => row.id === editEventId);
    if (!event || event.proposal_id || event.status === 'cancelled') return;
    setEditingId(event.id); setOpen(true);
    setForm({ ...emptyEventForm(event.date), event_type: event.event_type, opponent_name: event.away_team_name || '', arena_id: event.arena_id || '', arena_rink_id: event.arena_rink_id || '', start_time: event.start_time?.slice(0,5) || '', end_time: event.end_time?.slice(0,5) || '', notes: event.notes || '' });
    const next = new URLSearchParams(searchParams); next.delete('edit_event'); setSearchParams(next, { replace: true });
  }, [editEventId, canManageSchedule, events, searchParams, setSearchParams]);

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
  const activeMeta = visibleTab === 'requests' ? requestsMeta : eventsMeta;
  const activeLoadedCount = visibleTab === 'requests' ? bookingRequests.length : events.length;
  const rangeStart = activeMeta.total === 0 ? 0 : activeMeta.offset + 1;
  const rangeEnd = Math.min(activeMeta.offset + activeLoadedCount, activeMeta.total);
  const canGoPrevious = activeMeta.offset > 0;
  const canGoNext = activeMeta.offset + activeMeta.limit < activeMeta.total;
  const paginationControls = activeMeta.total > activeMeta.limit ? (
    <div className="flex flex-col gap-2 border-t border-slate-200 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
      <div>{rangeStart}-{rangeEnd} of {activeMeta.total}</div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" disabled={!canGoPrevious} onClick={() => setPageOffset(Math.max(0, activeMeta.offset - activeMeta.limit))}>
          Previous
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={!canGoNext} onClick={() => setPageOffset(activeMeta.offset + activeMeta.limit)}>
          Next
        </Button>
      </div>
    </div>
  ) : null;

  const saveBookingRequest = async () => {
    try {
      const payload = {
        event_type: form.event_type,
        opponent_name: form.event_type === 'practice' ? null : form.opponent_name,
        season_id: effectiveSeason?.id || null,
        date: form.date, start_time: form.start_time, end_time: form.end_time,
        arena_id: form.arena_id, arena_rink_id: form.arena_rink_id,
        notes: form.notes || null,
      };
      if (editingId) await minimalApi.put(`/events/${editingId}`, payload);
      else await minimalApi.post(`/teams/${activeTeam.id}/events`, payload);
      setEditingId(null); setOpen(false); setForm(emptyEventForm());
      const result = await api.getEventsList(activeTeam.id, effectiveSeason ? { season_id: effectiveSeason.id } : undefined);
      setEvents(result.data); setEventsMeta(result.meta);
      pushToast({ variant: 'success', title: editingId ? 'Event updated' : 'Event scheduled' });
    } catch (error) { pushToast({variant: 'error', title: 'Unable to schedule event', description: String(error)}); }
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
    if (!activeTeam || calendarBusy) {
      return;
    }

    setCalendarBusy(true);
    try {
      const payload = await api.getTeamCalendarFeed(activeTeam.id);
      await navigator.clipboard.writeText(payload.url);
      pushToast({
        variant: 'success',
        title: 'Calendar link copied',
        description: 'Paste it into your calendar app once. Updates from RinkLink will stay in sync automatically.',
      });
    } catch {
      pushToast({
        variant: 'error',
        title: 'Unable to copy calendar link',
        description: 'Try again in a moment. If it still fails, ask an admin to check calendar feed configuration.',
      });
    } finally {
      setCalendarBusy(false);
    }
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
            <Button
              type="button"
              variant="outline"
              className="h-10 border-emerald-300 bg-emerald-50 px-4 text-emerald-800 hover:border-emerald-400 hover:bg-emerald-100 hover:text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:border-emerald-600 dark:hover:bg-emerald-900/60"
              onClick={copyCalendarFeed}
              disabled={!activeTeam || calendarBusy}
            >
              <CalendarCheck2 className="h-4 w-4" />
              <span className="sm:hidden">Calendar</span>
              <span className="hidden sm:inline">{calendarBusy ? 'Copying...' : 'Add to Calendar'}</span>
            </Button>
            {canManageSchedule ? (
              <Button type="button" className="h-10 px-4" onClick={() => {
                setForm(emptyEventForm(todayStr));
                setOpen(true);
              }}>
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



<Card className="overflow-hidden">
        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">No scheduled items in this view.</div>
          ) : filtered.map((event) => {
            const edit = getEventScoreEdit(event);
            const isSingleTeamEvent = event.event_type === 'practice';

            const canScore = false;
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


                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {paginationControls}
      </Card>

      <Modal
        open={open}
        onClose={() => { setEditingId(null); setOpen(false); setForm(emptyEventForm()); }}
        title={editingId ? "Edit Event" : "Schedule Event"}
        footer={(
          <>
            <Button
              type="button"
              onClick={saveBookingRequest}
              disabled={!form.date || !form.start_time || !form.end_time || !form.arena_id || !form.arena_rink_id || (form.event_type !== 'practice' && !form.opponent_name)}
            >
              <SendHorizontal className="h-4 w-4" />
              Save Event
            </Button>
            <Button type="button" variant="outline" onClick={() => { setOpen(false); setForm(emptyEventForm()); }}>
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
            {form.event_type !== 'practice' ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Away Team</label>
                <Input value={form.opponent_name} onChange={e => setForm(current => ({...current, opponent_name:e.target.value}))} placeholder="Opponent name" />
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
                {form.start_time && form.end_time ? `${formatTimeHHMM(form.start_time)}-${formatTimeHHMM(form.end_time)}` : 'TBD'}
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

          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Start Time</label><Input type="time" value={form.start_time} onChange={e => setForm(current => ({...current,start_time:e.target.value}))} /></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">End Time</label><Input type="time" value={form.end_time} onChange={e => setForm(current => ({...current,end_time:e.target.value}))} /></div>
          </div>
          <Input placeholder="Notes" value={form.notes} onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))} />

        </div>
      </Modal>
    </div>
  );
}
