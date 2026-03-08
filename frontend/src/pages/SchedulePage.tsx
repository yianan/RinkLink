import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, CheckCircle2, Eye, Search, Trash2, XCircle } from 'lucide-react';
import { useTeam } from '../context/TeamContext';
import { useSeason } from '../context/SeasonContext';
import { api } from '../api/client';
import { ScheduleEntry } from '../types';
import CsvUploader from '../components/CsvUploader';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import PageHeader from '../components/PageHeader';
import { cn } from '../lib/cn';
import { formatTimeHHMM } from '../lib/time';

const statusColors: Record<string, 'success' | 'info' | 'warning' | 'neutral'> = {
  open: 'success',
  scheduled: 'info',
  confirmed: 'warning',
};

export default function SchedulePage() {
  const { activeTeam } = useTeam();
  const { activeSeason } = useSeason();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [tab, setTab] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ date: '', time: '', entry_type: 'home' });

  const load = () => {
    if (!activeTeam) return;
    const params: Record<string, string> = {};
    if (activeSeason) params.season_id = activeSeason.id;
    api.getSchedule(activeTeam.id, params).then(setEntries);
  };
  useEffect(() => { load(); }, [activeTeam, activeSeason]); // eslint-disable-line

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

  // Calendar view: group by month
  const byMonth: Record<string, ScheduleEntry[]> = {};
  entries.forEach((e) => {
    const month = e.date.substring(0, 7);
    (byMonth[month] ??= []).push(e);
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${activeTeam.name} Schedule`}
        subtitle="Track open dates and confirmed games."
        actions={<Button type="button" onClick={() => setAddOpen(true)}>Add Entry</Button>}
      />

      <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-900/50 dark:ring-1 dark:ring-slate-800/60">
        {['List View', 'Calendar View', 'Upload CSV'].map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setTab(i)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              tab === i
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950/40 dark:text-slate-100 dark:shadow-none dark:ring-1 dark:ring-slate-800/70'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 0 && (
        <Card className="overflow-hidden">
          <div className="divide-y divide-slate-200 bg-white md:hidden dark:divide-slate-800 dark:bg-slate-950/20">
            {entries.map((e) => (
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

                    <div className="mt-2 flex flex-wrap gap-2">
                      {e.status === 'open' && e.time && !e.blocked && (
                        <button
                          type="button"
                          onClick={() => findOpponents(e.id)}
                          className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline dark:text-cyan-300"
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
                  </div>

                  <Button type="button" variant="ghost" size="icon" onClick={() => handleDelete(e.id)} aria-label="Delete">
                    <Trash2 className="h-4 w-4 text-rose-600" />
                  </Button>
                </div>
              </div>
            ))}

            {entries.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
                No schedule entries. Upload a CSV or add entries manually.
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
                  <th className="px-4 py-3 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/20">
                {entries.map((e) => (
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
                  </tr>
                ))}

                {entries.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
                      No schedule entries. Upload a CSV or add entries manually.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 1 && (
        <div className="space-y-4">
          {Object.entries(byMonth).sort().map(([month, monthEntries]) => (
            <div key={month} className="space-y-2">
              <div className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                {new Date(month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </div>
              <div className="flex flex-wrap gap-2">
                {monthEntries.map((e) => (
                  <Card
                    key={e.id}
                    className={cn(
                      'w-[160px] p-3',
                      e.status === 'open'
                        ? e.entry_type === 'home'
                          ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/60 dark:bg-emerald-950/25'
                          : 'border-sky-200 bg-sky-50/60 dark:border-sky-900/60 dark:bg-sky-950/25'
                        : '',
                    )}
                  >
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {new Date(e.date + 'T00:00').toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{formatTimeHHMM(e.time) || '—'}</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Badge variant={e.entry_type === 'home' ? 'success' : 'info'}>{e.entry_type}</Badge>
                      <Badge variant="outline">{e.status}</Badge>
                    </div>
                    {e.opponent_name && (
                      <div className="mt-2 truncate text-xs text-slate-700 dark:text-slate-300">vs {e.opponent_name}</div>
                    )}
                    {e.status === 'open' && (
                      <div className="mt-2 space-y-1">
                        {e.time && !e.blocked && (
                          <button
                            type="button"
                            onClick={() => findOpponents(e.id)}
                            className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline dark:text-cyan-300"
                          >
                            <Search className="h-3 w-3" />
                            Find Opponents
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleBlocked(e)}
                          className={cn(
                            'flex items-center gap-1 text-xs font-medium hover:underline',
                            e.blocked ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400',
                          )}
                        >
                          {e.blocked ? <Eye className="h-3 w-3" /> : <Ban className="h-3 w-3" />}
                          {e.blocked ? 'Unblock' : 'Block'}
                        </button>
                      </div>
                    )}
                    {(e.status === 'scheduled' || e.status === 'confirmed') && e.game_id && (
                      <div className="mt-2 space-y-1">
                        {!e.weekly_confirmed ? (
                          <button
                            type="button"
                            onClick={() => handleConfirm(e)}
                            className="flex items-center gap-1 text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Confirm
                          </button>
                        ) : (
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
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          ))}
          {entries.length === 0 && <div className="text-sm text-slate-600 dark:text-slate-400">No schedule entries yet.</div>}
        </div>
      )}

      {tab === 2 && <CsvUploader teamId={activeTeam.id} onConfirmed={() => { load(); setTab(0); }} />}

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
