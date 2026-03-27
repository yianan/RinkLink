import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save } from 'lucide-react';
import { api } from '../api/client';
import { Arena, ArenaRink, Event, IceSlot, LockerRoom, Team } from '../types';
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
import { formatShortDate, formatTimeHHMM, toLocalDateString } from '../lib/time';
import { useToast } from '../context/ToastContext';

const EVENT_TYPES: Event['event_type'][] = ['league', 'tournament', 'practice', 'showcase', 'scrimmage', 'exhibition'];

function attendanceSummaryLabel(event: Event) {
  const summary = event.attendance_summary;
  if (!summary || summary.total_players === 0) return null;
  const parts = [
    summary.attending_count > 0 ? `${summary.attending_count} Attending` : null,
    summary.tentative_count > 0 ? `${summary.tentative_count} Tentative` : null,
    summary.absent_count > 0 ? `${summary.absent_count} Absent` : null,
    summary.unknown_count > 0 ? `${summary.unknown_count} Unknown` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

const emptyForm = {
  event_type: 'practice' as Event['event_type'],
  away_team_id: '',
  arena_id: '',
  arena_rink_id: '',
  ice_slot_id: '',
  home_locker_room_id: '',
  away_locker_room_id: '',
  date: '',
  start_time: '',
  end_time: '',
  notes: '',
};

export default function EventsPage() {
  const navigate = useNavigate();
  const { activeTeam, teams } = useTeam();
  const { activeSeason, seasons } = useSeason();
  const pushToast = useToast();
  const [tab, setTab] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [events, setEvents] = useState<Event[]>([]);
  const [arenas, setArenas] = useState<Arena[]>([]);
  const [arenaRinks, setArenaRinks] = useState<ArenaRink[]>([]);
  const [lockerRooms, setLockerRooms] = useState<LockerRoom[]>([]);
  const [slots, setSlots] = useState<IceSlot[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [scoreEdits, setScoreEdits] = useState<Record<string, Partial<{ home: string; away: string }>>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedEventTypes, setSelectedEventTypes] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedArenaNames, setSelectedArenaNames] = useState<string[]>([]);

  const effectiveSeason = activeSeason ?? seasons.find((season) => season.is_active) ?? seasons[0] ?? null;
  const todayStr = toLocalDateString(new Date());

  useEffect(() => {
    if (!activeTeam) return;
    api.getEvents(activeTeam.id).then((data) => {
      setEvents(data);
      setScoreEdits({});
    });
  }, [activeTeam?.id]);

  useEffect(() => {
    if (!open) return;
    api.getArenas().then(setArenas);
  }, [open]);

  useEffect(() => {
    if (!form.arena_id) {
      setArenaRinks([]);
      return;
    }
    api.getArenaRinks(form.arena_id).then(setArenaRinks);
  }, [form.arena_id]);

  useEffect(() => {
    if (!form.arena_rink_id) {
      setLockerRooms([]);
      setSlots([]);
      return;
    }
    api.getLockerRooms(form.arena_rink_id).then(setLockerRooms);
    if (form.date) {
      api.getAvailableIceSlots(form.arena_rink_id, form.date).then(setSlots);
    } else {
      setSlots([]);
    }
  }, [form.arena_rink_id, form.date]);

  const selectedSlot = useMemo(
    () => slots.find((slot) => slot.id === form.ice_slot_id) ?? null,
    [form.ice_slot_id, slots],
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

  if (!activeTeam) {
    return <Alert variant="info">Select a team to view events.</Alert>;
  }

  const seasonEvents = events.filter((event) => !effectiveSeason || (event.date >= effectiveSeason.start_date && event.date <= effectiveSeason.end_date));
  const filtered = seasonEvents.filter((event) => {
    if (tab === 'upcoming') return event.date >= todayStr;
    if (tab === 'past') return event.date < todayStr;
    return true;
  }).filter((event) => (
    (selectedEventTypes.length === 0 || selectedEventTypes.includes(event.event_type))
    && (selectedStatuses.length === 0 || selectedStatuses.includes(event.status))
    && (selectedArenaNames.length === 0 || (event.arena_name && selectedArenaNames.includes(event.arena_name)))
  ));

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

  const saveEvent = async () => {
    await api.createEvent(activeTeam.id, {
      event_type: form.event_type,
      away_team_id: form.event_type === 'practice' ? null : (form.away_team_id || null),
      season_id: effectiveSeason?.id || null,
      arena_id: form.arena_id,
      arena_rink_id: form.arena_rink_id,
      ice_slot_id: form.ice_slot_id || null,
      home_locker_room_id: form.home_locker_room_id || null,
      away_locker_room_id: form.event_type === 'practice' ? null : (form.away_locker_room_id || null),
      date: form.date,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      notes: form.notes || null,
    });
    setOpen(false);
    setForm(emptyForm);
    const data = await api.getEvents(activeTeam.id);
    setEvents(data);
    pushToast({ variant: 'success', title: 'Event created' });
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

  return (
    <div className="space-y-4">
      <PageHeader
        title="Schedule"
        subtitle="Practices and scheduled matchups share one schedule."
        actions={(
          <>
            <FilterPanelTrigger count={activeFilterBadges.length} open={filtersOpen} onClick={() => setFiltersOpen((current) => !current)} />
            <Button type="button" onClick={() => setOpen(true)}>Schedule Event</Button>
          </>
        )}
      />

      <SegmentedTabs
        items={[
          { label: 'Upcoming', value: 'upcoming' as const },
          { label: 'Past', value: 'past' as const },
          { label: 'All', value: 'all' as const },
        ]}
        value={tab}
        onChange={setTab}
      />

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
                  onClick={() => navigate(`/schedule/${event.id}`)}
                  className="cursor-pointer text-left"
                  title="Open schedule details"
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
                        <div className="text-sm font-medium text-sky-700 underline decoration-sky-300 underline-offset-2 transition-colors hover:text-sky-800 dark:text-sky-300 dark:decoration-sky-700 dark:hover:text-sky-200">
                          {event.away_team_name ? `${event.home_team_name} vs ${event.away_team_name}` : `${event.home_team_name} ${getCompetitionLabel(event.event_type)}`}
                        </div>
                        <Badge variant={getCompetitionBadgeVariant(event.event_type)}>{getCompetitionLabel(event.event_type)}</Badge>
                        <Badge variant={getGameStatusVariant(event)}>{getGameStatusLabel(event)}</Badge>
                        {hasSavedScore ? (
                          <Badge variant="outline">{event.home_score ?? 0}-{event.away_score ?? 0}</Badge>
                        ) : null}
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <TeamLogo name={event.arena_name || 'Arena'} logoUrl={event.arena_logo_url} className="h-6 w-6 rounded-lg" initialsClassName="text-[9px]" />
                        <span className="truncate">
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

      <Modal
        open={open}
        onClose={() => { setOpen(false); setForm(emptyForm); }}
        title="Create Event"
        footer={(
          <>
            <Button type="button" onClick={saveEvent} disabled={!form.date || !form.arena_id || !form.arena_rink_id || !form.ice_slot_id}>
              Save
            </Button>
            <Button type="button" variant="outline" onClick={() => { setOpen(false); setForm(emptyForm); }}>
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
                  away_team_id: e.target.value === 'practice' ? '' : current.away_team_id,
                  away_locker_room_id: e.target.value === 'practice' ? '' : current.away_locker_room_id,
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
                onChange={(e) => setForm((current) => ({ ...current, date: e.target.value, ice_slot_id: '', start_time: '', end_time: '' }))}
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
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Arena</label>
              <Select
                value={form.arena_id}
                onChange={(e) => setForm((current) => ({
                  ...current,
                  arena_id: e.target.value,
                  arena_rink_id: '',
                  ice_slot_id: '',
                  home_locker_room_id: '',
                  away_locker_room_id: '',
                }))}
              >
                <option value="">Select arena…</option>
                {arenas.map((arena) => <option key={arena.id} value={arena.id}>{arena.name}</option>)}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Arena Rink</label>
              <Select
                value={form.arena_rink_id}
                onChange={(e) => setForm((current) => ({
                  ...current,
                  arena_rink_id: e.target.value,
                  ice_slot_id: '',
                  home_locker_room_id: '',
                  away_locker_room_id: '',
                }))}
                disabled={!form.arena_id}
              >
                <option value="">{!form.arena_id ? 'Select arena first' : 'Select rink…'}</option>
                {arenaRinks.map((arenaRink) => <option key={arenaRink.id} value={arenaRink.id}>{arenaRink.name}</option>)}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Ice Slot</label>
              <Select
                value={form.ice_slot_id}
                onChange={(e) => {
                  const nextSlot = slots.find((slot) => slot.id === e.target.value);
                  setForm((current) => ({
                    ...current,
                    ice_slot_id: e.target.value,
                    start_time: nextSlot?.start_time || current.start_time,
                    end_time: nextSlot?.end_time || current.end_time,
                  }));
                }}
                disabled={!form.arena_rink_id || !form.date}
              >
                <option value="">
                  {!form.arena_rink_id ? 'Select rink first' : !form.date ? 'Select date first' : slots.length === 0 ? 'No available slots' : 'Select slot…'}
                </option>
                {slots.map((slot) => (
                  <option key={slot.id} value={slot.id}>
                    {formatTimeHHMM(slot.start_time) || slot.start_time}
                    {slot.end_time ? `-${formatTimeHHMM(slot.end_time) || slot.end_time}` : ''}
                  </option>
                ))}
              </Select>
            </div>

            <div className={`grid grid-cols-1 gap-3 ${form.event_type !== 'practice' && form.event_type !== 'scrimmage' ? 'sm:grid-cols-2' : ''}`}>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Home Locker Room</label>
                <Select
                  value={form.home_locker_room_id}
                  onChange={(e) => setForm((current) => ({ ...current, home_locker_room_id: e.target.value }))}
                  disabled={!form.arena_rink_id}
                >
                  <option value="">{!form.arena_rink_id ? 'Select rink first' : lockerRooms.length === 0 ? 'No locker rooms configured' : 'Select room…'}</option>
                  {lockerRooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
                </Select>
              </div>

              {form.event_type !== 'practice' && form.event_type !== 'scrimmage' ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Away Locker Room</label>
                  <Select
                    value={form.away_locker_room_id}
                    onChange={(e) => setForm((current) => ({ ...current, away_locker_room_id: e.target.value }))}
                    disabled={!form.arena_rink_id}
                  >
                    <option value="">{!form.arena_rink_id ? 'Select rink first' : lockerRooms.length === 0 ? 'No locker rooms configured' : 'Select room…'}</option>
                    {lockerRooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
                  </Select>
                </div>
              ) : null}
            </div>
          </div>

          <Input placeholder="Notes" value={form.notes} onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))} />
        </div>
      </Modal>
    </div>
  );
}
