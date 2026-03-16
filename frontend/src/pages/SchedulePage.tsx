import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, CalendarPlus2, CheckCircle2, Eye, Search, SlidersHorizontal, Trash2, XCircle } from 'lucide-react';
import { useTeam } from '../context/TeamContext';
import { useSeason } from '../context/SeasonContext';
import { api } from '../api/client';
import { ScheduleEntry } from '../types';
import CsvUploader from '../components/CsvUploader';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import FilterPillGroup, { type FilterOption } from '../components/FilterPillGroup';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import PageHeader from '../components/PageHeader';
import SegmentedTabs from '../components/SegmentedTabs';
import { CardListSkeleton, TableSkeleton } from '../components/ui/TableSkeleton';
import EmptyState from '../components/EmptyState';
import { useConfirmDialog } from '../context/ConfirmDialogContext';
import { useToast } from '../context/ToastContext';
import { useNavBadgeRefresh } from '../context/NavBadgeContext';
import { cn } from '../lib/cn';
import { filterButtonClass, tableActionButtonClass } from '../lib/uiClasses';
import { addDays, formatMonthYear, formatShortDate, formatTimeHHMM, formatWeekdayDate, parseLocalDate, toLocalDateString } from '../lib/time';

const statusColors: Record<string, 'success' | 'info' | 'warning' | 'neutral'> = {
  open: 'success',
  scheduled: 'info',
  confirmed: 'warning',
};

function toggleFilterValue(values: string[], nextValue: string) {
  return values.includes(nextValue)
    ? values.filter((value) => value !== nextValue)
    : [...values, nextValue];
}

function getEntryStatusLabel(entry: ScheduleEntry) {
  if (entry.blocked) return 'Blocked';
  if (entry.status === 'confirmed') return 'Confirmed';
  if (entry.status === 'scheduled') return 'Scheduled';
  return 'Open';
}

export default function SchedulePage() {
  const { activeTeam } = useTeam();
  const { activeSeason, seasons } = useSeason();
  const effectiveSeason = activeSeason ?? seasons.find((season) => season.is_active) ?? seasons[0] ?? null;
  const navigate = useNavigate();
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'upcoming' | 'past' | 'calendar' | 'upload'>('upcoming');
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ date: '', time: '', entry_type: 'home' });
  const [selectedEntryTypes, setSelectedEntryTypes] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const confirm = useConfirmDialog();
  const pushToast = useToast();
  const refreshNavBadges = useNavBadgeRefresh();

  const load = () => {
    if (!activeTeam) return;
    let cancelled = false;
    const params: Record<string, string> = {};
    if (effectiveSeason) params.season_id = effectiveSeason.id;
    setLoading(true);
    api.getSchedule(activeTeam.id, params).then((data) => {
      if (!cancelled) setEntries(data);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  };
  useEffect(() => load(), [activeTeam, effectiveSeason]); // eslint-disable-line

  const handleAdd = async () => {
    if (!activeTeam) return;
    await api.createScheduleEntry(activeTeam.id, {
      date: addForm.date,
      time: addForm.time || null,
      entry_type: addForm.entry_type as 'home' | 'away',
    });
    setAddOpen(false);
    setAddForm({ date: '', time: '', entry_type: 'home' });
    load();
    pushToast({ variant: 'success', title: 'Schedule entry added' });
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirm({
      title: 'Remove date?',
      description: 'This removes the date from the team schedule entirely.',
      confirmLabel: 'Remove date',
      confirmVariant: 'destructive',
    });
    if (!confirmed) return;
    await api.deleteScheduleEntry(id);
    load();
    pushToast({ variant: 'success', title: 'Schedule entry deleted' });
  };

  const findOpponents = (entryId: string) => {
    navigate(`/search?entry=${entryId}`);
  };

  const handleConfirm = async (e: ScheduleEntry) => {
    if (!activeTeam || !e.game_id) return;
    await api.confirmGame(e.game_id, activeTeam.id, true);
    load();
    refreshNavBadges();
    pushToast({ variant: 'success', title: 'Game confirmed' });
  };

  const handleCancelGame = async (e: ScheduleEntry) => {
    if (!e.game_id) return;
    const confirmed = await confirm({
      title: 'Remove matchup?',
      description: `Remove the scheduled matchup vs ${e.opponent_name || 'opponent'} and return this date to the schedule?`,
      confirmLabel: 'Remove matchup',
      confirmVariant: 'destructive',
    });
    if (!confirmed) return;
    await api.cancelGame(e.game_id);
    load();
    refreshNavBadges();
    pushToast({ variant: 'success', title: 'Game cancelled' });
  };

  const toggleBlocked = async (e: ScheduleEntry) => {
    await api.updateScheduleEntry(e.id, { blocked: !e.blocked });
    load();
    pushToast({ variant: 'info', title: e.blocked ? 'Date reopened' : 'Date blocked' });
  };

  if (!activeTeam) {
    return <Alert variant="info">Select a team to view the schedule.</Alert>;
  }
  if (!effectiveSeason) {
    return <Alert variant="info">No season is available yet.</Alert>;
  }

  const todayLocal = new Date();
  const todayStr = toLocalDateString(todayLocal);

  const sortedEntries = [...entries].sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    return (a.time || '').localeCompare(b.time || '');
  });
  const entryTypeOptions = useMemo<FilterOption[]>(() => {
    const values = Array.from(new Set(sortedEntries.map((entry) => entry.entry_type)));
    return values.map((value) => ({ value, label: value === 'home' ? 'Home' : 'Away' }));
  }, [sortedEntries]);

  const statusOptions = useMemo<FilterOption[]>(() => {
    const values = Array.from(new Set(sortedEntries.map((entry) => getEntryStatusLabel(entry))));
    const order = ['Open', 'Scheduled', 'Confirmed', 'Blocked'];
    return values
      .sort((left, right) => order.indexOf(left) - order.indexOf(right))
      .map((value) => ({ value, label: value }));
  }, [sortedEntries]);

  const filteredEntries = useMemo(() => sortedEntries.filter((entry) => {
    const statusLabel = getEntryStatusLabel(entry);
    return (selectedEntryTypes.length === 0 || selectedEntryTypes.includes(entry.entry_type))
      && (selectedStatuses.length === 0 || selectedStatuses.includes(statusLabel));
  }), [selectedEntryTypes, selectedStatuses, sortedEntries]);

  const activeFilterBadges = useMemo(() => {
    const labelsFor = (options: FilterOption[], selectedValues: string[]) =>
      options.filter((option) => selectedValues.includes(option.value)).map((option) => option.label);
    return [
      ...labelsFor(entryTypeOptions, selectedEntryTypes),
      ...labelsFor(statusOptions, selectedStatuses),
    ];
  }, [entryTypeOptions, selectedEntryTypes, selectedStatuses, statusOptions]);

  const hasActiveFilters = activeFilterBadges.length > 0;

  const clearFilters = () => {
    setSelectedEntryTypes([]);
    setSelectedStatuses([]);
  };

  const upcomingEntries = filteredEntries.filter((entry) => entry.date >= todayStr);
  const pastEntries = [...filteredEntries.filter((entry) => entry.date < todayStr)].reverse();
  const displayedEntries = tab === 'past' ? pastEntries : upcomingEntries;

  // Calendar view: group by month
  const entriesByDate = useMemo(() => {
    const byDate: Record<string, ScheduleEntry[]> = {};
    filteredEntries.forEach((entry) => {
      (byDate[entry.date] ??= []).push(entry);
    });
    return byDate;
  }, [filteredEntries]);

  const calendarMonths = useMemo(() => {
    const seasonStart = parseLocalDate(effectiveSeason.start_date);
    const seasonEnd = parseLocalDate(effectiveSeason.end_date);
    if (!seasonStart || !seasonEnd) return [];

    const months: Array<{
      key: string;
      label: string;
      days: Array<{ date: string; inMonth: boolean }>;
    }> = [];

    let cursor = new Date(seasonStart.getFullYear(), seasonStart.getMonth(), 1);
    const endCursor = new Date(seasonEnd.getFullYear(), seasonEnd.getMonth(), 1);

    while (cursor <= endCursor) {
      const firstDayOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const lastDayOfMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      const startOffset = (firstDayOfMonth.getDay() + 6) % 7;
      const gridStart = addDays(firstDayOfMonth, -startOffset);
      const endOffset = 6 - ((lastDayOfMonth.getDay() + 6) % 7);
      const gridEnd = addDays(lastDayOfMonth, endOffset);

      const days: Array<{ date: string; inMonth: boolean }> = [];
      for (let day = new Date(gridStart); day <= gridEnd; day = addDays(day, 1)) {
        days.push({
          date: toLocalDateString(day),
          inMonth: day.getMonth() === cursor.getMonth(),
        });
      }

      months.push({
        key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
        label: formatMonthYear(toLocalDateString(cursor)) || '',
        days,
      });

      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }

    return months;
  }, [effectiveSeason.end_date, effectiveSeason.start_date]);

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${activeTeam.name} Schedule`}
        subtitle="Manage upcoming dates, review past dates, and scan the full season calendar."
        actions={(
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFiltersOpen((open) => !open)}
              className={filterButtonClass}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {hasActiveFilters ? ` (${activeFilterBadges.length})` : ''}
            </Button>
            <Button type="button" onClick={() => setAddOpen(true)}>Add Entry</Button>
          </>
        )}
      />

      {hasActiveFilters && !filtersOpen ? (
        <div className="flex flex-wrap items-center gap-2">
          {activeFilterBadges.map((label, index) => (
            <Badge key={`${label}:${index}`} variant="outline" className="bg-white/80 dark:bg-slate-950/35">
              {label}
            </Badge>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
            Clear all
          </Button>
        </div>
      ) : null}

      {filtersOpen ? (
        <Card className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Filter schedule</div>
              <div className="text-sm text-slate-600 dark:text-slate-400">
                Narrow the schedule by entry type and status across list and calendar views.
              </div>
            </div>
            {hasActiveFilters ? (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                Clear all
              </Button>
            ) : null}
          </div>

          {hasActiveFilters ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {activeFilterBadges.map((label, index) => (
                <Badge key={`${label}:${index}`} variant="outline" className="bg-white/80 dark:bg-slate-950/35">
                  {label}
                </Badge>
              ))}
            </div>
          ) : null}

          <div className="mt-4 grid gap-4 border-t border-[color:var(--app-border-subtle)] pt-4 xl:grid-cols-2">
            <FilterPillGroup
              label="Type"
              options={entryTypeOptions}
              values={selectedEntryTypes}
              onToggle={(value) => setSelectedEntryTypes((current) => toggleFilterValue(current, value))}
              tone="sky"
            />
            <FilterPillGroup
              label="Status"
              options={statusOptions}
              values={selectedStatuses}
              onToggle={(value) => setSelectedStatuses((current) => toggleFilterValue(current, value))}
              tone="violet"
            />
          </div>
        </Card>
      ) : null}

      <SegmentedTabs
        items={[
          { label: 'Upcoming Dates', value: 'upcoming' as const },
          { label: 'Past Dates', value: 'past' as const },
          { label: 'Season Calendar', value: 'calendar' as const },
          { label: 'Upload CSV', value: 'upload' as const },
        ]}
        value={tab}
        onChange={setTab}
      />

      {(tab === 'upcoming' || tab === 'past') && (
        <Card>
          <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl bg-white md:hidden dark:divide-slate-800 dark:bg-slate-950/20">
            {loading && <CardListSkeleton count={3} />}

            {!loading && displayedEntries.map((e) => (
              <div key={e.id} className="p-4">
                <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {formatShortDate(e.date) || e.date} {formatTimeHHMM(e.time) || ''}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant={e.entry_type === 'home' ? 'success' : 'info'}>
                        {e.entry_type === 'home' ? 'Home' : 'Away'}
                      </Badge>
                      {e.blocked
                        ? <Badge variant="warning">Blocked</Badge>
                        : <Badge variant={statusColors[e.status] || 'neutral'}>{e.status === 'confirmed' ? 'Confirmed' : e.status === 'scheduled' ? 'Scheduled' : 'Open'}</Badge>}
                    </div>

                    {(e.opponent_name || e.location || e.notes) && (
                      <div className="mt-3 space-y-1 text-sm text-slate-700 dark:text-slate-300">
                        {e.opponent_name ? <div className="font-medium text-slate-900 dark:text-slate-100">vs {e.opponent_name}</div> : null}
                        {e.location ? <div className="text-xs text-slate-500 dark:text-slate-400">{e.location}</div> : null}
                        {e.notes ? <div className="text-xs text-slate-500 dark:text-slate-400">{e.notes}</div> : null}
                      </div>
                    )}
                    {tab === 'upcoming' && (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {e.status === 'open' && e.time && !e.blocked && (
                          <Button type="button" size="sm" variant="primary" onClick={() => findOpponents(e.id)} className="justify-center">
                            <Search className="h-3.5 w-3.5" />
                            Find Opponents
                          </Button>
                        )}
                        {e.status === 'open' && (
                          <Button type="button" size="sm" variant="outline" onClick={() => toggleBlocked(e)} className="justify-center">
                            {e.blocked ? <Eye className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                            {e.blocked ? 'Unblock' : 'Block'}
                          </Button>
                        )}
                        {(e.status === 'scheduled' || e.status === 'confirmed') && e.game_id && (
                          <>
                            {!e.weekly_confirmed && (
                              <Button type="button" size="sm" variant="primary" onClick={() => handleConfirm(e)} className="justify-center">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Confirm
                              </Button>
                            )}
                            {e.weekly_confirmed && (
                              <div className="flex items-center">
                                <Badge variant="success" icon={<CheckCircle2 className="h-3 w-3" />}>Confirmed</Badge>
                              </div>
                            )}
                            <Button type="button" size="sm" variant="outline" onClick={() => handleCancelGame(e)} className="justify-center">
                              <XCircle className="h-3.5 w-3.5" />
                              Remove Matchup
                            </Button>
                          </>
                        )}
                        <div className="col-span-2 flex justify-center">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleDelete(e.id)}
                            className="w-full max-w-[10.75rem] justify-center border-rose-200/80 px-3 text-rose-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800 dark:border-rose-900/70 dark:text-rose-200 dark:hover:border-rose-800 dark:hover:bg-rose-950/30 dark:hover:text-rose-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove Date
                          </Button>
                        </div>
                      </div>
                    )}
                </div>
              </div>
            ))}

            {!loading && displayedEntries.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
                {hasActiveFilters
                  ? 'No schedule entries match the current filters.'
                  : tab === 'past'
                    ? 'No past schedule entries for this season.'
                    : 'No upcoming schedule entries for this season.'}
              </div>
            )}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-900/40 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Opponent</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Notes</th>
                  {tab === 'upcoming' ? <th className="px-4 py-3 text-right"></th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/20">
                {loading && (
                  <tr>
                    <td colSpan={tab === 'upcoming' ? 8 : 7} className="p-0">
                      <TableSkeleton columns={tab === 'upcoming' ? 8 : 7} rows={4} compact />
                    </td>
                  </tr>
                )}
                {!loading && displayedEntries.map((e) => (
                  <tr key={e.id} className="align-top hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{formatShortDate(e.date) || e.date}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{formatTimeHHMM(e.time) || '-'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={e.entry_type === 'home' ? 'success' : 'info'}>
                        {e.entry_type === 'home' ? 'Home' : 'Away'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {e.blocked
                        ? <Badge variant="warning">Blocked</Badge>
                        : <Badge variant={statusColors[e.status] || 'neutral'}>{e.status === 'confirmed' ? 'Confirmed' : e.status === 'scheduled' ? 'Scheduled' : 'Open'}</Badge>}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{e.opponent_name || '-'}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{e.location || '-'}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{e.notes || '-'}</td>
                    {tab === 'upcoming' ? (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {e.status === 'open' && e.time && !e.blocked && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => findOpponents(e.id)}
                              aria-label="Find opponents"
                              title="Find Opponents"
                            >
                              <Search className="h-4 w-4" />
                            </Button>
                          )}
                          {e.status === 'open' && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => toggleBlocked(e)}
                              aria-label={e.blocked ? 'Unblock' : 'Block'}
                              title={e.blocked ? 'Unblock' : 'Block'}
                            >
                              {e.blocked
                                ? <Eye className="h-4 w-4 text-amber-500" />
                                : <Ban className="h-4 w-4 text-slate-400" />}
                            </Button>
                          )}
                          {(e.status === 'scheduled' || e.status === 'confirmed') && e.game_id && (
                            <>
                              {!e.weekly_confirmed && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleConfirm(e)}
                                  title="Confirm Game"
                                  aria-label="Confirm Game"
                                  className={tableActionButtonClass}
                                >
                                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                </Button>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleCancelGame(e)}
                                  title="Remove Matchup"
                                  aria-label="Remove Matchup"
                                  className={tableActionButtonClass}
                                >
                                  <XCircle className="h-4 w-4 text-rose-500" />
                                </Button>
                            </>
                          )}
                          <Button type="button" variant="ghost" size="icon" onClick={() => handleDelete(e.id)} aria-label="Remove Date" title="Remove Date" className={tableActionButtonClass}>
                            <Trash2 className="h-4 w-4 text-rose-600" />
                          </Button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}

                {!loading && displayedEntries.length === 0 && (
                  <tr>
                    <td colSpan={tab === 'upcoming' ? 8 : 7} className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
                      {hasActiveFilters
                        ? 'No schedule entries match the current filters.'
                        : tab === 'past'
                          ? 'No past schedule entries for this season.'
                          : 'No upcoming schedule entries for this season.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'calendar' && (
        <div className="space-y-4">
          {loading ? <CardListSkeleton count={3} /> : null}
          {!loading && calendarMonths.map((month) => (
            <Card key={month.key} className="overflow-hidden p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                  {month.label}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Click a day to add an open date</div>
              </div>

              <div className="grid grid-cols-7 gap-2">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                  <div key={day} className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {day}
                  </div>
                ))}

                {month.days.map((day) => {
                  const dayEntries = entriesByDate[day.date] || [];
                  const hasEntries = dayEntries.length > 0;
                  const isToday = day.date === todayStr;
                  return (
                    <button
                      key={day.date}
                      type="button"
                      onClick={() => {
                        setAddForm((current) => ({ ...current, date: day.date }));
                        setAddOpen(true);
                      }}
                      className={cn(
                        'group min-h-[8.5rem] cursor-pointer rounded-2xl border p-2 text-left transition-colors',
                        day.inMonth
                          ? 'border-[color:var(--app-border-subtle)] bg-[var(--app-surface)] hover:border-sky-400/40 hover:bg-[var(--app-surface-strong)]'
                          : 'border-transparent bg-slate-100/60 text-slate-400 hover:border-slate-300/40 dark:bg-slate-900/30 dark:text-slate-600',
                        isToday && 'ring-2 ring-sky-400/40',
                      )}
                      aria-label={
                        `${formatWeekdayDate(day.date) || day.date}. `
                        + (dayEntries.length > 0
                          ? `${dayEntries.length} schedule ${dayEntries.length === 1 ? 'entry' : 'entries'}.`
                          : 'No schedule entries. ')
                        + ' Click to add an open date.'
                      }
                      aria-current={isToday ? 'date' : undefined}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn(
                          'text-sm font-semibold',
                          day.inMonth ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400 dark:text-slate-600',
                        )}>
                          {parseLocalDate(day.date)?.getDate()}
                        </span>
                        {!hasEntries && day.inMonth ? (
                          <span className="opacity-0 transition-opacity group-hover:opacity-100">
                            <CalendarPlus2 className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-2 space-y-1.5">
                        {dayEntries.slice(0, 3).map((entry) => (
                          <div
                            key={entry.id}
                            className={cn(
                              'rounded-lg px-2 py-1 text-[11px] leading-tight',
                              entry.blocked
                                ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
                                : entry.status === 'open'
                                  ? entry.entry_type === 'home'
                                    ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/35 dark:text-emerald-200'
                                    : 'bg-sky-100 text-sky-900 dark:bg-sky-950/35 dark:text-sky-200'
                                  : 'bg-slate-100 text-slate-800 dark:bg-slate-900/60 dark:text-slate-200',
                            )}
                          >
                            <div className="whitespace-normal break-words font-medium">
                              {formatTimeHHMM(entry.time) || 'TBD'} · {entry.entry_type === 'home' ? 'Home' : 'Away'}
                            </div>
                            <div className="whitespace-normal break-words">
                              {entry.opponent_name || getEntryStatusLabel(entry)}
                            </div>
                          </div>
                        ))}
                        {dayEntries.length > 3 ? (
                          <div className="px-1 text-[11px] text-slate-500 dark:text-slate-400">+{dayEntries.length - 3} more</div>
                        ) : null}
                        {dayEntries.length === 0 && day.inMonth ? (
                          <div className="px-1 pt-6 text-[11px] text-slate-400 opacity-0 transition-opacity group-hover:opacity-100 dark:text-slate-500">
                            Add open date
                          </div>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>
          ))}
          {!loading && filteredEntries.length === 0 && (
            <EmptyState
              icon={<CalendarPlus2 className="h-5 w-5" />}
              title={hasActiveFilters ? 'No schedule entries match these filters' : 'No schedule entries yet'}
              description={hasActiveFilters ? 'Clear or change filters to see the calendar again.' : 'Add your first open date to start building the season schedule.'}
              actions={!hasActiveFilters ? (
                <Button type="button" size="sm" onClick={() => setAddOpen(true)}>
                  Add Entry
                </Button>
              ) : undefined}
            />
          )}
        </div>
      )}

      {tab === 'upload' && <CsvUploader teamId={activeTeam.id} onConfirmed={() => { load(); setTab('upcoming'); }} />}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add Schedule Entry"
        footer={
          <>
            <Button type="button" onClick={handleAdd} disabled={!addForm.date}>
              Add
            </Button>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Date</label>
            <Input
              type="date"
              value={addForm.date}
              onChange={(e) => setAddForm((f) => ({ ...f, date: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Time</label>
            <Input
              type="time"
              value={addForm.time}
              onChange={(e) => setAddForm((f) => ({ ...f, time: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Type</label>
            <Select
              value={addForm.entry_type}
              onChange={(e) => setAddForm((f) => ({ ...f, entry_type: e.target.value }))}
            >
              <option value="home">Home</option>
              <option value="away">Away</option>
            </Select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
