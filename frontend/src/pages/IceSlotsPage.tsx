import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { Rink, IceSlot } from '../types';
import IceSlotCsvUploader from '../components/IceSlotCsvUploader';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Textarea } from '../components/ui/Textarea';
import { cn } from '../lib/cn';
import { formatTimeHHMM } from '../lib/time';

const statusColors: Record<string, 'success' | 'warning' | 'info' | 'neutral'> = {
  available: 'success',
  held: 'warning',
  booked: 'info',
};

export default function IceSlotsPage() {
  const { rinkId } = useParams<{ rinkId: string }>();
  const navigate = useNavigate();
  const [rink, setRink] = useState<Rink | null>(null);
  const [slots, setSlots] = useState<IceSlot[]>([]);
  const [tab, setTab] = useState(0);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ date: '', start_time: '', end_time: '', notes: '' });

  const load = () => {
    if (!rinkId) return;
    api.getIceSlots(rinkId).then(setSlots);
  };

  useEffect(() => {
    if (!rinkId) return;
    api.getRinks().then((rinks) => {
      const r = rinks.find((r) => r.id === rinkId);
      if (r) setRink(r);
    });
    load();
  }, [rinkId]);

  const handleAdd = async () => {
    if (!rinkId) return;
    await api.createIceSlot(rinkId, {
      date: form.date,
      start_time: form.start_time,
      end_time: form.end_time || null,
      notes: form.notes || null,
    } as any);
    setOpen(false);
    setForm({ date: '', start_time: '', end_time: '', notes: '' });
    load();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this ice slot?')) {
      await api.deleteIceSlot(id);
      load();
    }
  };

  if (!rinkId) return <Alert variant="error">No rink ID provided.</Alert>;

  // Group slots by month for calendar view
  const byMonth: Record<string, IceSlot[]> = {};
  slots.forEach((s) => {
    const month = s.date.substring(0, 7);
    (byMonth[month] ??= []).push(s);
  });

  return (
    <div className="space-y-4 overflow-x-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="icon" onClick={() => navigate('/rinks')} aria-label="Back to rinks">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="page-title">{rink ? `${rink.name} — Ice Slots` : 'Ice Slots'}</div>
            {rink && (
              <div className="page-subtitle">
                {rink.address}, {rink.city}, {rink.state} {rink.zip_code}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid w-full grid-cols-1 gap-1 rounded-xl bg-slate-100 p-1 sm:grid-cols-3">
        {[
          { label: `List View (${slots.length})`, value: 0 },
          { label: 'Calendar View', value: 1 },
          { label: 'Upload CSV', value: 2 },
        ].map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={cn(
              'w-full rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              tab === t.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 0 && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button type="button" onClick={() => setOpen(true)}>
              Add Slot
            </Button>
          </div>

          <Card className="overflow-hidden">
            <table className="w-full table-fixed text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-3 sm:px-4">Date</th>
                  <th className="hidden px-3 py-3 sm:table-cell sm:px-4">Start</th>
                  <th className="hidden px-3 py-3 sm:table-cell sm:px-4">End</th>
                  <th className="hidden px-3 py-3 sm:table-cell sm:px-4">Status</th>
                  <th className="hidden px-3 py-3 md:table-cell md:px-4">Notes</th>
                  <th className="px-3 py-3 text-right sm:px-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {slots.map((s) => {
                  const startTime = formatTimeHHMM(s.start_time) ?? s.start_time;
                  const endTime = s.end_time ? formatTimeHHMM(s.end_time) ?? s.end_time : null;

                  return (
                    <tr key={s.id} className="hover:bg-slate-50/60">
                      <td className="px-3 py-3 font-medium text-slate-900 sm:px-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="whitespace-nowrap">{s.date}</div>
                          <div className="sm:hidden">
                            <Badge variant={statusColors[s.status] || 'neutral'}>{s.status}</Badge>
                          </div>
                        </div>
                        <div className="mt-0.5 text-xs font-normal text-slate-500 break-words whitespace-normal sm:hidden">
                          {startTime}
                          {endTime ? `–${endTime}` : ''}
                          {s.notes ? ` • ${s.notes}` : ''}
                        </div>
                      </td>
                      <td className="hidden px-3 py-3 text-slate-700 whitespace-nowrap sm:table-cell sm:px-4">{startTime}</td>
                      <td className="hidden px-3 py-3 text-slate-700 whitespace-nowrap sm:table-cell sm:px-4">{endTime || '-'}</td>
                      <td className="hidden px-3 py-3 sm:table-cell sm:px-4">
                        <Badge variant={statusColors[s.status] || 'neutral'}>{s.status}</Badge>
                      </td>
                      <td className="hidden px-3 py-3 text-slate-700 break-words whitespace-normal md:table-cell md:px-4">
                        {s.notes || '-'}
                      </td>
                      <td className="px-3 py-3 sm:px-4">
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(s.id)}
                            disabled={s.status === 'booked'}
                            aria-label="Delete slot"
                          >
                            <Trash2 className={cn('h-4 w-4', s.status === 'booked' ? 'text-slate-300' : 'text-rose-600')} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {slots.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-600">
                      No ice slots yet. Add one or upload a CSV.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {tab === 1 && (
        <div className="space-y-3">
          {Object.entries(byMonth).sort().map(([month, monthSlots]) => (
            <Card key={month} className="p-4">
              <div className="text-sm font-semibold tracking-tight text-slate-900">{month}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {monthSlots.map((s) => (
                  <Badge
                    key={s.id}
                    variant={statusColors[s.status] || 'neutral'}
                    className={cn(s.status === 'available' ? '' : 'bg-white')}
                  >
                    {s.date.substring(5)} {formatTimeHHMM(s.start_time) ?? s.start_time}
                    {s.end_time ? `-${formatTimeHHMM(s.end_time) ?? s.end_time}` : ''}
                  </Badge>
                ))}
              </div>
            </Card>
          ))}

          {Object.keys(byMonth).length === 0 && <div className="text-sm text-slate-600">No ice slots to display.</div>}
        </div>
      )}

      {tab === 2 && <IceSlotCsvUploader rinkId={rinkId} onConfirmed={() => { setTab(0); load(); }} />}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add Ice Slot"
        footer={
          <>
            <Button type="button" onClick={handleAdd} disabled={!form.date || !form.start_time}>
              Save
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
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
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              required
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Start Time</label>
              <Input
                type="time"
                value={form.start_time}
                onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">End Time</label>
              <Input
                type="time"
                value={form.end_time}
                onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Notes</label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
