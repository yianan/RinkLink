import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
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
import PageHeader from '../components/PageHeader';
import SegmentedTabs from '../components/SegmentedTabs';
import Breadcrumbs from '../components/Breadcrumbs';
import { cn } from '../lib/cn';
import { tableActionButtonClass } from '../lib/uiClasses';
import { formatMonthYear, formatShortDate, formatTimeHHMM } from '../lib/time';
import { useConfirmDialog } from '../context/ConfirmDialogContext';
import { useToast } from '../context/ToastContext';

const statusColors: Record<string, 'success' | 'warning' | 'info' | 'neutral'> = {
  available: 'success',
  held: 'warning',
  booked: 'info',
};

export default function IceSlotsPage() {
  const { rinkId } = useParams<{ rinkId: string }>();
  const [rink, setRink] = useState<Rink | null>(null);
  const [slots, setSlots] = useState<IceSlot[]>([]);
  const [tab, setTab] = useState(0);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ date: '', start_time: '', end_time: '', notes: '' });
  const confirm = useConfirmDialog();
  const pushToast = useToast();

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
    const confirmed = await confirm({
      title: 'Delete ice slot?',
      description: 'This removes the ice slot from the rink schedule.',
      confirmLabel: 'Delete slot',
      confirmVariant: 'destructive',
    });
    if (!confirmed) return;
    await api.deleteIceSlot(id);
    load();
    pushToast({ variant: 'success', title: 'Ice slot deleted' });
  };

  if (!rinkId) return <Alert variant="error">No rink ID provided.</Alert>;

  // Group slots by month for calendar view
  const byMonth: Record<string, IceSlot[]> = {};
  slots.forEach((s) => {
    const month = s.date.substring(0, 7);
    (byMonth[month] ??= []).push(s);
  });

  const SlotRow = ({ s }: { s: IceSlot }) => {
    const startTime = formatTimeHHMM(s.start_time) ?? s.start_time;
    const endTime = s.end_time ? formatTimeHHMM(s.end_time) ?? s.end_time : null;

    return (
      <tr key={s.id} className="align-top hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
        <td className="px-3 py-3 font-medium text-slate-900 sm:px-4 dark:text-slate-100">
          <div className="flex items-start justify-between gap-2">
            <div className="whitespace-nowrap">{formatShortDate(s.date) ?? s.date}</div>
            <div className="sm:hidden">
              <Badge variant={statusColors[s.status] || 'neutral'}>{s.status}</Badge>
            </div>
          </div>
          <div className="mt-0.5 break-words whitespace-normal text-xs font-normal text-slate-500 sm:hidden dark:text-slate-400">
            {startTime}
            {endTime ? `–${endTime}` : ''}
            {s.notes ? ` • ${s.notes}` : ''}
          </div>
        </td>
        <td className="hidden px-3 py-3 text-slate-700 whitespace-nowrap sm:table-cell sm:px-4 dark:text-slate-300">{startTime}</td>
        <td className="hidden px-3 py-3 text-slate-700 whitespace-nowrap sm:table-cell sm:px-4 dark:text-slate-300">{endTime || '-'}</td>
        <td className="hidden px-3 py-3 sm:table-cell sm:px-4">
          <Badge variant={statusColors[s.status] || 'neutral'}>{s.status}</Badge>
        </td>
        <td className="hidden px-3 py-3 text-slate-700 break-words whitespace-normal md:table-cell md:px-4 dark:text-slate-300">
          {s.notes || '-'}
        </td>
        <td className="px-3 py-3 sm:px-4">
          <div className="flex items-start gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => handleDelete(s.id)}
              disabled={s.status === 'booked'}
              aria-label="Delete slot"
              className={tableActionButtonClass}
            >
              <Trash2 className={cn('h-4 w-4', s.status === 'booked' ? 'text-slate-300 dark:text-slate-600' : 'text-rose-600')} />
            </Button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-4 overflow-x-hidden">
      <Breadcrumbs items={[{ label: 'Rinks', to: '/rinks' }, { label: rink ? `${rink.name} Ice Slots` : 'Ice Slots' }]} />
      <PageHeader
        title={rink ? `${rink.name} — Ice Slots` : 'Ice Slots'}
        subtitle={rink ? `${rink.address}, ${rink.city}, ${rink.state} ${rink.zip_code}` : undefined}
        actions={tab === 0 ? <Button type="button" onClick={() => setOpen(true)}>Add Slot</Button> : undefined}
      />

      <SegmentedTabs
        className="grid w-full grid-cols-1 gap-1 sm:grid-cols-3"
        itemClassName="w-full justify-center"
        items={[
          { label: `List View (${slots.length})`, value: 0 },
          { label: 'Calendar View', value: 1 },
          { label: 'Upload CSV', value: 2 },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 0 && (
        <div className="space-y-3">
          <Card>
            <table className="w-full table-fixed text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-900/40 dark:text-slate-400">
                <tr>
                <th scope="col" className="px-3 py-3 sm:px-4">Date</th>
                <th scope="col" className="hidden px-3 py-3 sm:table-cell sm:px-4">Start</th>
                <th scope="col" className="hidden px-3 py-3 sm:table-cell sm:px-4">End</th>
                <th scope="col" className="hidden px-3 py-3 sm:table-cell sm:px-4">Status</th>
                <th scope="col" className="hidden px-3 py-3 md:table-cell md:px-4">Notes</th>
                <th scope="col" className="px-3 py-3 sm:px-4">Actions</th>
              </tr>
            </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/20">
                {slots.map((s) => <SlotRow key={s.id} s={s} />)}

                {slots.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
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
        <div className="space-y-4">
          {Object.entries(byMonth).sort().map(([month, monthSlots]) => {
            const [yearStr, monthStr] = month.split('-');
            const year = parseInt(yearStr, 10);
            const monthIdx = parseInt(monthStr, 10) - 1;
            const firstDay = new Date(year, monthIdx, 1).getDay(); // 0=Sun
            const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();

            // Index slots by day number
            const slotsByDay: Record<number, IceSlot[]> = {};
            monthSlots.forEach((s) => {
              const day = parseInt(s.date.substring(8, 10), 10);
              (slotsByDay[day] ??= []).push(s);
            });

            const cells: (number | null)[] = [];
            for (let i = 0; i < firstDay; i++) cells.push(null);
            for (let d = 1; d <= daysInMonth; d++) cells.push(d);

            return (
              <Card key={month} className="p-4">
                <div className="mb-3 text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                  {formatMonthYear(month) ?? month}
                </div>
                <div className="grid grid-cols-7 border-b border-slate-200 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                    <div key={d} className="py-1.5">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-px">
                  {cells.map((day, i) => {
                    if (day === null) return <div key={`e-${i}`} />;
                    const daySlots = slotsByDay[day];
                    const dateStr = `${yearStr}-${monthStr}-${String(day).padStart(2, '0')}`;
                    return (
                      <button
                        type="button"
                        key={day}
                        onClick={() => {
                          setForm((f) => ({ ...f, date: dateStr }));
                          setOpen(true);
                        }}
                        className={cn(
                          'min-h-[3rem] cursor-pointer rounded p-1 text-left text-xs transition-colors sm:min-h-[4rem]',
                          'hover:bg-sky-50 hover:ring-1 hover:ring-sky-200 dark:hover:bg-sky-950/30 dark:hover:ring-sky-800',
                          daySlots ? 'bg-slate-50 dark:bg-slate-900/40' : '',
                        )}
                      >
                        <div className={cn(
                          'mb-0.5 text-[11px] font-medium',
                          daySlots ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400 dark:text-slate-600',
                        )}>
                          {day}
                        </div>
                        {daySlots && (
                          <div className="space-y-0.5">
                            {daySlots.map((s) => (
                              <div
                                key={s.id}
                                className={cn(
                                  'truncate rounded px-1 py-0.5 text-[10px] leading-tight',
                                  s.status === 'available' && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
                                  s.status === 'held' && 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
                                  s.status === 'booked' && 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
                                  !statusColors[s.status] && 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
                                )}
                                title={`${formatTimeHHMM(s.start_time) ?? s.start_time}${s.end_time ? `–${formatTimeHHMM(s.end_time) ?? s.end_time}` : ''} (${s.status})${s.notes ? ` — ${s.notes}` : ''}`}
                              >
                                {formatTimeHHMM(s.start_time) ?? s.start_time}
                              </div>
                            ))}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </Card>
            );
          })}

          {Object.keys(byMonth).length === 0 && <div className="text-sm text-slate-600 dark:text-slate-400">No ice slots to display.</div>}
        </div>
      )}

      {tab === 2 && <IceSlotCsvUploader rinkId={rinkId} onConfirmed={() => { setTab(0); load(); }} />}

      {/* Add Slot Modal */}
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
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Date</label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              required
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Start Time</label>
              <Input
                type="time"
                value={form.start_time}
                onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">End Time</label>
              <Input
                type="time"
                value={form.end_time}
                onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Notes</label>
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
