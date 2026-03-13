import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, CheckCircle2, Eye, Search, SlidersHorizontal, Trash2, XCircle } from 'lucide-react';
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
import { cn } from '../lib/cn';
import { accentActionClass } from '../lib/uiClasses';
import { formatMonthYear, formatTimeHHMM, formatWeekdayDate } from '../lib/time';

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
  const filterButtonClass = 'h-8 border-slate-300/90 bg-white/95 px-2.5 text-xs text-slate-800 hover:border-sky-400 hover:bg-sky-50 hover:text-sky-900 hover:ring-sky-400/20 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:hover:border-sky-400 dark:hover:bg-sky-950/40 dark:hover:text-sky-100 dark:hover:ring-sky-400/25';

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
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this schedule entry?')) {
      await api.deleteScheduleEntry(id);
      load();
    }
  };

  const findOpponents = (entryId: string) => {
    navigate(`/search?entry=${entryId}`);
  };

  const handleConfirm = async (e: ScheduleEntry) => {
    if (!activeTeam || !e.game_id) return;
    await api.confirmGame(e.game_id, activeTeam.id, true);
    load();
  };

  const handleCancelGame = async (e: ScheduleEntry) => {
    if (!e.game_id) return;
    if (!confirm(`Cancel the game vs ${e.opponent_name || 'opponent'}? This cannot be undone.`)) return;
    await api.cancelGame(e.game_id);
    load();
  };

  const toggleBlocked = async (e: ScheduleEntry) => {
    await api.updateScheduleEntry(e.id, { blocked: !e.blocked });
    load();
  };

  if (!activeTeam) {
    return <Alert variant="info">Select a team to view the schedule.</Alert>;
  }
  if (!effectiveSeason) {
    return <Alert variant="info">No season is available yet.</Alert>;
  }

  const todayLocal = new Date();
  const todayStr = [
    todayLocal.getFullYear(),
    String(todayLocal.getMonth() + 1).padStart(2, '0'),
    String(todayLocal.getDate()).padStart(2, '0'),
  ].join('-');

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
  const byMonth: Record<string, ScheduleEntry[]> = {};
  filteredEntries.forEach((e) => {
    const month = e.date.substring(0, 7);
    (byMonth[month] ??= []).push(e);
  });

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
        <Card className="overflow-hidden">
          <div className="divide-y divide-slate-200 bg-white md:hidden dark:divide-slate-800 dark:bg-slate-950/20">
            {loading && (
              <div className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
                Loading schedule…
              </div>
            )}

            {!loading && displayedEntries.map((e) => (
              <div key={e.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {e.date} {formatTimeHHMM(e.time) || ''}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant={e.entry_type === 'home' ? 'success' : 'info'}>{e.entry_type}</Badge>
                      {e.blocked
                        ? <Badge variant="warning">blocked</Badge>
                        : <Badge variant={statusColors[e.status] || 'neutral'}>{e.status}</Badge>}
                    </div>

                    {(e.opponent_name || e.location || e.notes) && (
                      <div className="mt-3 space-y-1 text-sm text-slate-700 dark:text-slate-300">
                        {e.opponent_name ? <div className="font-medium text-slate-900 dark:text-slate-100">vs {e.opponent_name}</div> : null}
                        {e.location ? <div className="text-xs text-slate-500 dark:text-slate-400">{e.location}</div> : null}
                        {e.notes ? <div className="text-xs text-slate-500 dark:text-slate-400">{e.notes}</div> : null}
                      </div>
                    )}
                    {tab === 'upcoming' && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {e.status === 'open' && e.time && !e.blocked && (
                          <button
                            type="button"
                            onClick={() => findOpponents(e.id)}
                            className={cn('flex items-center gap-1 text-xs', accentActionClass)}
                          >
                            <Search className="h-3 w-3" />
                            Find Opponents
                          </button>
                        )}
                        {e.status === 'open' && (
                          <button
                            type="button"
                            onClick={() => toggleBlocked(e)}
                            className={cn(
                              'flex items-center gap-1 text-xs font-medium hover:underline',
                              e.blocked
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-slate-500 dark:text-slate-400',
                            )}
                          >
                            {e.blocked ? <Eye className="h-3 w-3" /> : <Ban className="h-3 w-3" />}
                            {e.blocked ? 'Unblock' : 'Block'}
                          </button>
                        )}
                        {(e.status === 'scheduled' || e.status === 'confirmed') && e.game_id && (
                          <>
                            {!e.weekly_confirmed && (
                              <button
                                type="button"
                                onClick={() => handleConfirm(e)}
                                className="flex items-center gap-1 text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                Confirm
                              </button>
                            )}
                            {e.weekly_confirmed && (
                              <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="h-3 w-3" />
                                Confirmed
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleCancelGame(e)}
                              className="flex items-center gap-1 text-xs font-medium text-rose-600 hover:underline dark:text-rose-400"
                            >
                              <XCircle className="h-3 w-3" />
                              Cancel Game
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {tab === 'upcoming' ? (
                    <Button type="button" variant="ghost" size="icon" onClick={() => handleDelete(e.id)} aria-label="Delete">
                      <Trash2 className="h-4 w-4 text-rose-600" />
                    </Button>
                  ) : null}
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
                    <td colSpan={tab === 'upcoming' ? 8 : 7} className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
                      Loading schedule…
                    </td>
                  </tr>
                )}
                {!loading && displayedEntries.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{e.date}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{formatTimeHHMM(e.time) || '-'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={e.entry_type === 'home' ? 'success' : 'info'}>{e.entry_type}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {e.blocked
                        ? <Badge variant="warning">blocked</Badge>
                        : <Badge variant={statusColors[e.status] || 'neutral'}>{e.status}</Badge>}
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
                                >
                                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                </Button>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleCancelGame(e)}
                                title="Cancel Game"
                                aria-label="Cancel Game"
                              >
                                <XCircle className="h-4 w-4 text-rose-500" />
                              </Button>
                            </>
                          )}
                          <Button type="button" variant="ghost" size="icon" onClick={() => handleDelete(e.id)} aria-label="Delete">
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
          {loading ? <div className="text-sm text-slate-600 dark:text-slate-400">Loading schedule…</div> : null}
          {!loading && Object.entries(byMonth).sort().map(([month, monthEntries]) => (
              <div key={month} className="space-y-2">
              <div className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                {formatMonthYear(month) || month}
              </div>
              <div className="flex flex-wrap gap-2">
                {monthEntries.map((e) => (
                  <Card
                    key={e.id}
                    className={cn(
                      'w-[184px] p-3',
                      e.status === 'open'
                        ? e.entry_type === 'home'
                          ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/60 dark:bg-emerald-950/25'
                          : 'border-sky-200 bg-sky-50/60 dark:border-sky-900/60 dark:bg-sky-950/25'
                        : '',
                    )}
                  >
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {formatWeekdayDate(e.date) || e.date}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{formatTimeHHMM(e.time) || '—'}</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Badge variant={e.entry_type === 'home' ? 'success' : 'info'}>{e.entry_type}</Badge>
                      <Badge variant="outline">{e.status}</Badge>
                    </div>
                    {e.opponent_name && (
                      <div className="mt-2 whitespace-normal break-words text-xs leading-snug text-slate-700 dark:text-slate-300">
                        vs {e.opponent_name}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          ))}
          {!loading && filteredEntries.length === 0 && (
            <div className="text-sm text-slate-600 dark:text-slate-400">
              {hasActiveFilters ? 'No schedule entries match the current filters.' : 'No schedule entries yet.'}
            </div>
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
