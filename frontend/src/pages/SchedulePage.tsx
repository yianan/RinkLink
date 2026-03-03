import { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import { useTeam } from '../context/TeamContext';
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
import { cn } from '../lib/cn';

const statusColors: Record<string, 'success' | 'info' | 'warning' | 'neutral'> = {
  open: 'success',
  scheduled: 'info',
  confirmed: 'warning',
};

export default function SchedulePage() {
  const { activeTeam } = useTeam();
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [tab, setTab] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ date: '', time: '', entry_type: 'home' });

  const load = () => {
    if (!activeTeam) return;
    api.getSchedule(activeTeam.id).then(setEntries);
  };
  useEffect(() => { load(); }, [activeTeam]); // eslint-disable-line

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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="page-title">{activeTeam.name} Schedule</div>
          <div className="page-subtitle">Track open dates and confirmed games.</div>
        </div>
        <Button type="button" onClick={() => setAddOpen(true)}>
          Add Entry
        </Button>
      </div>

      <div className="inline-flex rounded-xl bg-slate-100 p-1">
        {['List View', 'Calendar View', 'Upload CSV'].map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setTab(i)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              tab === i ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
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
              <tbody className="divide-y divide-slate-200 bg-white">
                {entries.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-medium text-slate-900">{e.date}</td>
                    <td className="px-4 py-3 text-slate-700">{e.time || '-'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={e.entry_type === 'home' ? 'success' : 'info'}>{e.entry_type}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusColors[e.status] || 'neutral'}>{e.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{e.opponent_name || '-'}</td>
                    <td className="px-4 py-3 text-slate-700">{e.location || '-'}</td>
                    <td className="px-4 py-3 text-slate-700">{e.notes || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <Button type="button" variant="ghost" size="icon" onClick={() => handleDelete(e.id)} aria-label="Delete">
                          <Trash2 className="h-4 w-4 text-rose-600" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}

                {entries.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-600">
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
              <div className="text-sm font-semibold tracking-tight text-slate-900">
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
                          ? 'border-emerald-200 bg-emerald-50/60'
                          : 'border-sky-200 bg-sky-50/60'
                        : 'bg-white',
                    )}
                  >
                    <div className="text-sm font-semibold text-slate-900">
                      {new Date(e.date + 'T00:00').toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-600">{e.time || '—'}</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Badge variant={e.entry_type === 'home' ? 'success' : 'info'}>{e.entry_type}</Badge>
                      <Badge variant="outline">{e.status}</Badge>
                    </div>
                    {e.opponent_name && (
                      <div className="mt-2 truncate text-xs text-slate-700">vs {e.opponent_name}</div>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          ))}
          {entries.length === 0 && <div className="text-sm text-slate-600">No schedule entries yet.</div>}
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
            <label className="mb-1 block text-xs font-medium text-slate-600">Date</label>
            <Input
              type="date"
              value={addForm.date}
              onChange={(e) => setAddForm((f) => ({ ...f, date: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Time</label>
            <Input
              type="time"
              value={addForm.time}
              onChange={(e) => setAddForm((f) => ({ ...f, time: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Type</label>
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
