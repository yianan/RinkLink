import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Ban, CalendarPlus2, Eye, Pencil, Save, Search, Trash2, X } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import CsvUploader from '../components/CsvUploader';
import FilterPillGroup, { type FilterOption } from '../components/FilterPillGroup';
import { FilterPanel, FilterPanelTrigger } from '../components/FilterPanel';
import { AvailabilityWindow } from '../types';
import { useSeason } from '../context/SeasonContext';
import { useTeam } from '../context/TeamContext';
import { useAuth } from '../context/AuthContext';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import PageHeader from '../components/PageHeader';
import SegmentedTabs from '../components/SegmentedTabs';
import EmptyState from '../components/EmptyState';
import { CardListSkeleton, TableSkeleton } from '../components/ui/TableSkeleton';
import TeamLogo from '../components/TeamLogo';
import { Select } from '../components/ui/Select';
import {
  addDays,
  formatMonthYear,
  formatShortDate,
  formatTimeHHMM,
  hasInvalidTimeRange,
  parseLocalDate,
  toLocalDateString,
} from '../lib/time';
import { useConfirmDialog } from '../context/ConfirmDialogContext';
import { useToast } from '../context/ToastContext';
import { cn } from '../lib/cn';
import { canManageProposals, canManageSchedule } from '../lib/permissions';
import { compactChipButtonClass, destructiveIconButtonClass, tableActionButtonClass } from '../lib/uiClasses';

const statusColors: Record<string, 'success' | 'info' | 'warning' | 'neutral'> = {
  Open: 'success',
  Scheduled: 'info',
  Confirmed: 'warning',
  Cancelled: 'neutral',
  Blocked: 'warning',
};

function getAvailabilityStatusLabel(window: AvailabilityWindow) {
  if (window.blocked) return 'Blocked';
  if (window.status === 'confirmed') return 'Confirmed';
  if (window.status === 'scheduled') return 'Scheduled';
  if (window.status === 'cancelled') return 'Cancelled';
  return 'Open';
}

function formatWindowTime(window: AvailabilityWindow) {
  const start = formatTimeHHMM(window.start_time) || window.start_time;
  const end = formatTimeHHMM(window.end_time) || window.end_time;
  if (start && end) return `${start}-${end}`;
  if (start) return start;
  return 'Time TBD';
}

function formatWindowTimeCompact(window: AvailabilityWindow) {
  const compact = (value: string | null | undefined) => {
    const formatted = formatTimeHHMM(value);
    if (!formatted) return value;
    return formatted
      .replace(':00', '')
      .replace(' AM', 'a')
      .replace(' PM', 'p')
      .replace(' ', '');
  };
  const start = compact(window.start_time);
  const end = compact(window.end_time);
  if (start && end) return `${start}-${end}`;
  if (start) return start;
  return 'TBD';
}

function monthKeyForDate(date: string) {
  return date.slice(0, 7);
}

function getDaySurfaceClasses(dayWindows: AvailabilityWindow[]) {
  if (dayWindows.length === 0) {
    return 'border-slate-200/80 bg-white/60 dark:border-slate-800/85 dark:bg-slate-950/45';
  }

  const hasHome = dayWindows.some((window) => window.availability_type === 'home');
  const hasAway = dayWindows.some((window) => window.availability_type === 'away');

  if (hasHome && hasAway) {
    return 'border-violet-200/80 bg-violet-50/75 dark:border-violet-900/80 dark:bg-violet-950/42';
  }

  if (hasHome) {
    return 'border-emerald-200/80 bg-emerald-50/75 dark:border-emerald-900/80 dark:bg-emerald-950/42';
  }

  return 'border-sky-200/80 bg-sky-50/75 dark:border-sky-900/80 dark:bg-sky-950/42';
}

export default function AvailabilityPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeTeam } = useTeam();
  const { activeSeason, seasons } = useSeason();
  const { authEnabled, me } = useAuth();
  const confirm = useConfirmDialog();
  const pushToast = useToast();
  const scheduleEditable = !authEnabled || canManageSchedule(me);
  const proposalEditable = !authEnabled || canManageProposals(me);

  const [availability, setAvailability] = useState<AvailabilityWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedTeamId, setLoadedTeamId] = useState<string | null>(null);
  const [tab, setTab] = useState<'upcoming' | 'past' | 'calendar' | 'upload'>(() => {
    const requestedTab = searchParams.get('tab');
    return requestedTab === 'past' || requestedTab === 'calendar' || requestedTab === 'upload' ? requestedTab : 'upcoming';
  });
  const [open, setOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editingWindowId, setEditingWindowId] = useState<string | null>(null);
  const [selectedAvailabilityTypes, setSelectedAvailabilityTypes] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [form, setForm] = useState({
    date: '',
    start_time: '',
    end_time: '',
    availability_type: 'home' as 'home' | 'away',
    notes: '',
  });
  const availabilityTimeError = hasInvalidTimeRange(form.start_time, form.end_time)
    ? 'Available until must be the same as or later than available from.'
    : '';

  const effectiveSeason = activeSeason ?? seasons.find((season) => season.is_active) ?? seasons[0] ?? null;
  const todayStr = toLocalDateString(new Date());
  const returnDate = searchParams.get('date');

  useEffect(() => {
    const requestedTab = searchParams.get('tab');
    const normalizedTab = requestedTab === 'past' || requestedTab === 'calendar' || requestedTab === 'upload' ? requestedTab : 'upcoming';
    if (normalizedTab !== tab) setTab(normalizedTab);
  }, [searchParams, tab]);

  const handleTabChange = (nextTab: 'upcoming' | 'past' | 'calendar' | 'upload') => {
    setTab(nextTab);
    const nextParams = new URLSearchParams(searchParams);
    if (nextTab === 'upcoming') {
      nextParams.delete('tab');
    } else {
      nextParams.set('tab', nextTab);
    }
    setSearchParams(nextParams, { replace: true });
  };

  useEffect(() => {
    if (tab !== 'calendar') return;
    const dateTarget = returnDate ? document.getElementById(`availability-day-${returnDate}`) : null;
    const month = searchParams.get('month');
    const monthTarget = month ? document.getElementById(`availability-month-${month}`) : null;
    const target = dateTarget || monthTarget;
    if (!target) return;
    requestAnimationFrame(() => {
      target.scrollIntoView({ block: dateTarget ? 'center' : 'start', behavior: 'auto' });
    });
  }, [returnDate, searchParams, tab]);

  const load = () => {
    if (!activeTeam) return;
    let cancelled = false;
    setLoading(true);
    api.getAvailability(activeTeam.id, effectiveSeason ? { season_id: effectiveSeason.id } : undefined)
      .then((data) => {
        if (!cancelled) {
          setAvailability(data);
          setLoadedTeamId(activeTeam.id);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  };

  useEffect(() => load(), [activeTeam?.id, effectiveSeason?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const sortedAvailability = [...availability].sort((left, right) => {
    const dateCompare = left.date.localeCompare(right.date);
    if (dateCompare !== 0) return dateCompare;
    return (left.start_time || '').localeCompare(right.start_time || '');
  });

  const availabilityTypeOptions = useMemo<FilterOption[]>(() => {
    const values = Array.from(new Set(sortedAvailability.map((window) => window.availability_type)));
    return values.map((value) => ({ value, label: value === 'home' ? 'Home' : 'Away' }));
  }, [sortedAvailability]);

  const statusOptions = useMemo<FilterOption[]>(() => {
    const values = Array.from(new Set(sortedAvailability.map((window) => getAvailabilityStatusLabel(window))));
    const order = ['Open', 'Scheduled', 'Confirmed', 'Blocked', 'Cancelled'];
    return values
      .sort((left, right) => order.indexOf(left) - order.indexOf(right))
      .map((value) => ({ value, label: value }));
  }, [sortedAvailability]);

  const filteredAvailability = useMemo(
    () => sortedAvailability.filter((window) => {
      const statusLabel = getAvailabilityStatusLabel(window);
      return (selectedAvailabilityTypes.length === 0 || selectedAvailabilityTypes.includes(window.availability_type))
        && (selectedStatuses.length === 0 || selectedStatuses.includes(statusLabel));
    }),
    [selectedAvailabilityTypes, selectedStatuses, sortedAvailability],
  );

  const activeFilterBadges = useMemo(() => {
    const labelsFor = (options: FilterOption[], selectedValues: string[]) =>
      options.filter((option) => selectedValues.includes(option.value)).map((option) => option.label);
    return [
      ...labelsFor(availabilityTypeOptions, selectedAvailabilityTypes),
      ...labelsFor(statusOptions, selectedStatuses),
    ];
  }, [availabilityTypeOptions, selectedAvailabilityTypes, selectedStatuses, statusOptions]);

  const clearFilters = () => {
    setSelectedAvailabilityTypes([]);
    setSelectedStatuses([]);
  };

  const upcomingAvailability = filteredAvailability.filter((window) => window.date >= todayStr);
  const pastAvailability = [...filteredAvailability.filter((window) => window.date < todayStr)].reverse();
  const displayedAvailability = tab === 'past' ? pastAvailability : upcomingAvailability;

  const byDate = useMemo(() => {
    const grouped: Record<string, AvailabilityWindow[]> = {};
    filteredAvailability.forEach((window) => {
      (grouped[window.date] ||= []).push(window);
    });
    return grouped;
  }, [filteredAvailability]);

  const calendarMonths = useMemo(() => {
    if (!effectiveSeason) return [];
    const seasonStart = parseLocalDate(effectiveSeason.start_date);
    const seasonEnd = parseLocalDate(effectiveSeason.end_date);
    if (!seasonStart || !seasonEnd) return [];

    const months: Array<{ key: string; label: string; days: Array<{ date: string; inMonth: boolean }> }> = [];
    let cursor = new Date(seasonStart.getFullYear(), seasonStart.getMonth(), 1);
    const endCursor = new Date(seasonEnd.getFullYear(), seasonEnd.getMonth(), 1);

    while (cursor <= endCursor) {
      const firstDay = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      const startOffset = (firstDay.getDay() + 6) % 7;
      const gridStart = addDays(firstDay, -startOffset);
      const endOffset = 6 - ((lastDay.getDay() + 6) % 7);
      const gridEnd = addDays(lastDay, endOffset);
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
  }, [effectiveSeason]);

  if (!activeTeam) {
    return <Alert variant="info">Select a team to manage availability.</Alert>;
  }
  if (!scheduleEditable) {
    return <Alert variant="error">You do not have permission to manage availability for this team.</Alert>;
  }

  const saveAvailability = async () => {
    if (availabilityTimeError) {
      pushToast({ variant: 'error', title: 'Check the time range', description: availabilityTimeError });
      return;
    }
    if (editingWindowId) {
      await api.updateAvailability(editingWindowId, {
        date: form.date,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        availability_type: form.availability_type,
        notes: form.notes || null,
        season_id: effectiveSeason?.id || null,
      });
    } else {
      await api.createAvailability(activeTeam.id, {
        date: form.date,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        availability_type: form.availability_type,
        notes: form.notes || null,
        season_id: effectiveSeason?.id || null,
      });
    }
    setOpen(false);
    setEditingWindowId(null);
    setForm({ date: '', start_time: '', end_time: '', availability_type: 'home', notes: '' });
    load();
    pushToast({ variant: 'success', title: editingWindowId ? 'Availability updated' : 'Availability added' });
  };

  const openAddAvailability = (date: string) => {
    setEditingWindowId(null);
    setForm((current) => ({ ...current, date }));
    setOpen(true);
  };

  const openEditAvailability = (window: AvailabilityWindow) => {
    setEditingWindowId(window.id);
    setForm({
      date: window.date,
      start_time: window.start_time || '',
      end_time: window.end_time || '',
      availability_type: window.availability_type,
      notes: window.notes || '',
    });
    setOpen(true);
  };

  const toggleBlocked = async (window: AvailabilityWindow) => {
    await api.updateAvailability(window.id, { blocked: !window.blocked });
    load();
    pushToast({ variant: 'info', title: window.blocked ? 'Availability reopened' : 'Availability blocked' });
  };

  const removeAvailability = async (windowId: string) => {
    const confirmed = await confirm({
      title: 'Delete availability window?',
      description: 'This removes the date from the planning calendar.',
      confirmLabel: 'Delete window',
      confirmVariant: 'destructive',
    });
    if (!confirmed) return;
    await api.deleteAvailability(windowId);
    load();
    pushToast({ variant: 'success', title: 'Availability deleted' });
  };

  const showingStaleTeamData = !!activeTeam && !!loadedTeamId && loadedTeamId !== activeTeam.id && loading;
  const showSkeleton = loading && availability.length === 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Availability"
        subtitle="Manage open home and away windows for matchup planning."
        actions={(
          <>
            <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <FilterPanelTrigger count={activeFilterBadges.length} open={filtersOpen} onClick={() => setFiltersOpen((current) => !current)} />
            <Button type="button" onClick={() => {
              setEditingWindowId(null);
              setForm({ date: '', start_time: '', end_time: '', availability_type: 'home', notes: '' });
              setOpen(true);
            }}
            >
              <CalendarPlus2 className="h-4 w-4" />
              Add Availability
            </Button>
          </>
        )}
      />
      <FilterPanel
        title="Filter availability"
        description="Narrow the planning calendar by home/away windows and status."
        open={filtersOpen}
        badges={activeFilterBadges}
        onClear={clearFilters}
      >
        <FilterPillGroup
          label="Type"
          options={availabilityTypeOptions}
          values={selectedAvailabilityTypes}
          onChange={setSelectedAvailabilityTypes}
          tone="sky"
        />
        <FilterPillGroup
          label="Status"
          options={statusOptions}
          values={selectedStatuses}
          onChange={setSelectedStatuses}
          tone="violet"
        />
      </FilterPanel>

      <SegmentedTabs
        items={[
          { label: 'Upcoming Dates', value: 'upcoming' as const },
          { label: 'Past Dates', value: 'past' as const },
          { label: 'Season Calendar', value: 'calendar' as const },
          { label: 'Upload CSV', value: 'upload' as const },
        ]}
        value={tab}
        onChange={handleTabChange}
      />

      {(tab === 'upcoming' || tab === 'past') ? (
        <Card className="overflow-hidden">
          <div className={cn('divide-y divide-slate-200 bg-white transition-opacity md:hidden dark:divide-slate-800 dark:bg-slate-950/20', showingStaleTeamData && 'opacity-70')}>
            {showSkeleton ? (
              <CardListSkeleton count={3} />
            ) : displayedAvailability.map((window) => {
              const statusLabel = getAvailabilityStatusLabel(window);
              return (
                <div key={window.id} className="p-4">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {formatShortDate(window.date) || window.date} • {formatWindowTime(window)}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant={window.availability_type === 'home' ? 'success' : 'info'}>
                        {window.availability_type === 'home' ? 'Home' : 'Away'}
                      </Badge>
                      <Badge variant={statusColors[statusLabel] || 'neutral'}>{statusLabel}</Badge>
                    </div>
                    {window.notes ? (
                      <div className="mt-3 text-sm text-slate-600 dark:text-slate-400">{window.notes}</div>
                    ) : null}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {window.status === 'open' || window.blocked ? (
                        <>
                          {!window.blocked && proposalEditable ? (
                            <Button type="button" size="sm" onClick={() => navigate(`/search?availability=${window.id}&from=availability&tab=${tab}&month=${monthKeyForDate(window.date)}&date=${window.date}`)} className="justify-center">
                              <Search className="h-3.5 w-3.5" />
                              Find Opponents
                            </Button>
                          ) : null}
                          {!window.event_id ? (
                            <Button type="button" size="sm" variant="outline" onClick={() => openEditAvailability(window)} className="justify-center">
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </Button>
                          ) : null}
                          <Button type="button" size="sm" variant="outline" onClick={() => toggleBlocked(window)} className="justify-center">
                            <Ban className="h-3.5 w-3.5" />
                            {window.blocked ? 'Unblock' : 'Block'}
                          </Button>
                        </>
                      ) : null}
                      {window.event_id ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/schedule/${window.event_id}`, {
                            state: {
                              backTo: `/availability?tab=${tab}&month=${monthKeyForDate(window.date)}&date=${window.date}`,
                              backLabel: 'Back to Availability',
                            },
                          })}
                          className="justify-center"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Open Event
                        </Button>
                      ) : null}
                      <div className="col-span-2 flex justify-center">
                        <Button type="button" size="sm" variant="destructive" onClick={() => removeAvailability(window.id)} className="w-full max-w-[10.75rem] justify-center">
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {!showSkeleton && displayedAvailability.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
                {tab === 'past' ? 'No past availability windows for this season.' : 'No upcoming availability windows for this season.'}
              </div>
            ) : null}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-900/40 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Notes</th>
                  <th className="px-4 py-3 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/20">
                {showSkeleton ? (
                  <tr>
                    <td colSpan={6} className="p-0">
                      <TableSkeleton columns={6} rows={4} compact />
                    </td>
                  </tr>
                ) : displayedAvailability.map((window) => {
                  const statusLabel = getAvailabilityStatusLabel(window);
                  return (
                    <tr key={window.id} className={cn('align-top hover:bg-slate-50/60 dark:hover:bg-slate-900/40', showingStaleTeamData && 'opacity-70')}>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{formatShortDate(window.date) || window.date}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{formatWindowTime(window)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={window.availability_type === 'home' ? 'success' : 'info'}>
                          {window.availability_type === 'home' ? 'Home' : 'Away'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={statusColors[statusLabel] || 'neutral'}>{statusLabel}</Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{window.notes || '-'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {window.status === 'open' && !window.blocked && proposalEditable ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => navigate(`/search?availability=${window.id}&from=availability&tab=${tab}&month=${monthKeyForDate(window.date)}&date=${window.date}`)}
                              aria-label="Find opponents"
                              title="Find Opponents"
                              className={tableActionButtonClass}
                            >
                              <Search className="h-4 w-4" />
                            </Button>
                          ) : null}
                          {!window.event_id ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditAvailability(window)}
                              aria-label="Edit availability"
                              title="Edit availability"
                              className={tableActionButtonClass}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          ) : null}
                          {window.status === 'open' || window.blocked ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => toggleBlocked(window)}
                              aria-label={window.blocked ? 'Unblock' : 'Block'}
                              title={window.blocked ? 'Unblock' : 'Block'}
                              className={tableActionButtonClass}
                            >
                              <Ban className="h-4 w-4" />
                            </Button>
                          ) : null}
                          {window.event_id ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => navigate(`/schedule/${window.event_id}`, {
                                state: {
                                  backTo: `/availability?tab=${tab}&month=${monthKeyForDate(window.date)}&date=${window.date}`,
                                  backLabel: 'Back to Availability',
                                },
                              })}
                              aria-label="Open event"
                              title="Open Event"
                              className={tableActionButtonClass}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          ) : null}
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeAvailability(window.id)} aria-label="Delete window" title="Delete window" className={`${tableActionButtonClass} ${destructiveIconButtonClass}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {!showSkeleton && displayedAvailability.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
                      {tab === 'past' ? 'No past availability windows for this season.' : 'No upcoming availability windows for this season.'}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {tab === 'calendar' ? (
        <div className="space-y-4">
          {showSkeleton ? <CardListSkeleton count={3} /> : null}
          {calendarMonths.map((month) => (
            <Card
              key={month.key}
              id={`availability-month-${month.key}`}
              className={cn('bg-white/95 p-4 transition-opacity dark:bg-slate-950/88', showingStaleTeamData && 'opacity-70')}
            >
              <div className="mb-3 text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">{month.label}</div>
              <div className="grid grid-cols-7 border-b border-slate-200 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
                    <div key={label} className="py-1.5">{label}</div>
                  ))}
              </div>
              <div className="grid grid-cols-7 gap-2 pt-2">
                {month.days.map((day) => {
                  const dayWindows = byDate[day.date] || [];
                  const isInteractiveDay = !!effectiveSeason && day.date >= effectiveSeason.start_date && day.date <= effectiveSeason.end_date;
                  const isReturnDate = returnDate === day.date;
                  const daySurfaceClasses = getDaySurfaceClasses(dayWindows);
                  return (
                    <div
                      key={day.date}
                      id={`availability-day-${day.date}`}
                      role={isInteractiveDay ? 'button' : undefined}
                      tabIndex={isInteractiveDay ? 0 : -1}
                      onClick={isInteractiveDay ? () => openAddAvailability(day.date) : undefined}
                      onKeyDown={isInteractiveDay ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openAddAvailability(day.date);
                        }
                      } : undefined}
                      className={cn(
                        'group min-h-[7.75rem] rounded-lg border p-2 text-left text-xs transition',
                        isInteractiveDay && 'cursor-pointer hover:border-sky-300/80 hover:bg-sky-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60',
                        isInteractiveDay
                          ? `${daySurfaceClasses} dark:hover:border-sky-500/70 dark:hover:bg-sky-950/30`
                          : 'border-slate-200/55 bg-slate-100/55 text-slate-400 opacity-70 dark:border-slate-900 dark:bg-slate-950/70 dark:text-slate-600',
                        isReturnDate && 'ring-2 ring-sky-500/70 ring-offset-1 ring-offset-white dark:ring-sky-400/80 dark:ring-offset-slate-950',
                      )}
                    >
                      <div className="mb-1 flex items-center justify-between gap-1">
                        <div className="text-[11px] font-medium text-slate-700 dark:text-slate-200">{day.date.slice(-2)}</div>
                        <div className="h-[18px] w-[18px]" aria-hidden="true" />
                      </div>
                      <div className="space-y-1">
                        {dayWindows.slice(0, 3).map((window) => {
                          const statusLabel = getAvailabilityStatusLabel(window);
                          const toneClasses = window.availability_type === 'home'
                            ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/72 dark:text-emerald-100'
                            : 'bg-sky-100 text-sky-900 dark:bg-sky-950/72 dark:text-sky-100';
                          return (
                            <div key={window.id} className={`rounded px-1.5 py-1.5 ${toneClasses}`}>
                              <div className="truncate font-medium">
                                {window.availability_type === 'home' ? 'Home' : 'Away'}
                              </div>
                              <div className="mt-0.5 whitespace-nowrap text-[10px] leading-tight opacity-90">
                                {formatWindowTimeCompact(window)}
                              </div>
                              <div className="mt-1 flex flex-nowrap gap-1 text-[9px] font-medium">
                                {statusLabel === 'Open' && !window.blocked ? (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      navigate(`/search?availability=${window.id}&from=availability&tab=${tab}&month=${month.key}&date=${day.date}`);
                                    }}
                                    className={`${compactChipButtonClass} px-1.5 py-0.5 text-[9px]`}
                                  >
                                    Find
                                  </button>
                                ) : null}
                                {!window.event_id ? (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openEditAvailability(window);
                                    }}
                                    className={`${compactChipButtonClass} px-1.5 py-0.5 text-[9px]`}
                                  >
                                    Edit
                                  </button>
                                ) : null}
                                {window.status === 'open' || window.blocked ? (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      toggleBlocked(window);
                                    }}
                                    className={`${compactChipButtonClass} px-1.5 py-0.5 text-[9px]`}
                                  >
                                    {window.blocked ? 'Unblock' : 'Block'}
                                  </button>
                                ) : null}
                                {window.event_id ? (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      navigate(`/schedule/${window.event_id}`, {
                                        state: {
                                          backTo: `/availability?tab=${tab}&month=${month.key}&date=${day.date}`,
                                          backLabel: 'Back to Availability',
                                        },
                                      });
                                    }}
                                    className={`${compactChipButtonClass} px-1.5 py-0.5 text-[9px]`}
                                  >
                                    Open
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                        {dayWindows.length === 0 && isInteractiveDay ? (
                          <div className="px-1 pt-6 text-[11px] text-slate-500 opacity-0 transition-opacity group-hover:opacity-100 dark:text-slate-400">
                            Add availability
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
          {!showSkeleton && filteredAvailability.length === 0 ? (
            <EmptyState
              icon={<CalendarPlus2 className="h-5 w-5" />}
              title={activeFilterBadges.length > 0 ? 'No availability windows match these filters' : 'No availability windows yet'}
              description={activeFilterBadges.length > 0 ? 'Clear or change filters to see the season calendar again.' : 'Add your first home or away window to start planning matchups.'}
              actions={activeFilterBadges.length === 0 ? (
                <Button type="button" size="sm" onClick={() => setOpen(true)}>
                  <CalendarPlus2 className="h-4 w-4" />
                  Add Availability
                </Button>
              ) : undefined}
            />
          ) : null}
        </div>
      ) : null}

      {tab === 'upload' ? <CsvUploader teamId={activeTeam.id} onConfirmed={() => { load(); handleTabChange('upcoming'); }} /> : null}

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setEditingWindowId(null);
        }}
        title={editingWindowId ? 'Edit Availability' : 'Add Availability'}
        footer={(
          <>
            <Button type="button" onClick={saveAvailability} disabled={!form.date || !!availabilityTimeError}>
              <Save className="h-4 w-4" />
              {editingWindowId ? 'Save Changes' : 'Save'}
            </Button>
            <Button type="button" variant="outline" onClick={() => { setOpen(false); setEditingWindowId(null); }}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
          </>
        )}
      >
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Date</label>
            <Input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Available From</label>
              <Input type="time" value={form.start_time} onChange={(event) => setForm((current) => ({ ...current, start_time: event.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Available Until</label>
              <Input type="time" min={form.start_time || undefined} value={form.end_time} onChange={(event) => setForm((current) => ({ ...current, end_time: event.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Type</label>
              <Select
                value={form.availability_type}
                onChange={(event) => setForm((current) => ({ ...current, availability_type: event.target.value as 'home' | 'away' }))}
              >
                <option value="home">Home</option>
                <option value="away">Away</option>
              </Select>
            </div>
          </div>
          {availabilityTimeError ? (
            <div className="text-xs font-medium text-rose-600 dark:text-rose-300">{availabilityTimeError}</div>
          ) : null}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Notes</label>
            <Input value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
