import { useState, useEffect } from 'react';
import { useTeam } from '../context/TeamContext';
import { api } from '../api/client';
import { PracticeBooking, IceSlot, Rink } from '../types';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import { Textarea } from '../components/ui/Textarea';
import { cn } from '../lib/cn';
import { formatTimeHHMM } from '../lib/time';

const today = new Date().toISOString().slice(0, 10);

export default function PracticePage() {
  const { activeTeam } = useTeam();
  const [tab, setTab] = useState<'upcoming' | 'history'>('upcoming');
  const [bookings, setBookings] = useState<PracticeBooking[]>([]);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [rinks, setRinks] = useState<Rink[]>([]);
  const [selectedRinkId, setSelectedRinkId] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [slots, setSlots] = useState<IceSlot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState('');
  const [notes, setNotes] = useState('');
  const [modalError, setModalError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    if (!activeTeam) return;
    api.getPracticeBookings(activeTeam.id).then(setBookings);
  };

  useEffect(() => {
    load();
  }, [activeTeam]); // eslint-disable-line

  useEffect(() => {
    if (!modalOpen || !selectedRinkId || !selectedDate) {
      setSlots([]);
      return;
    }
    api.getAvailableSlots(selectedRinkId, selectedDate).then(setSlots);
  }, [modalOpen, selectedRinkId, selectedDate]);

  const openModal = () => {
    setModalError('');
    setSelectedRinkId('');
    setSelectedDate('');
    setSlots([]);
    setSelectedSlotId('');
    setNotes('');
    api.getRinks().then(setRinks);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!activeTeam || !selectedSlotId) return;
    setSubmitting(true);
    setModalError('');
    try {
      await api.createPracticeBooking(activeTeam.id, {
        ice_slot_id: selectedSlotId,
        notes: notes || null,
      });
      setModalOpen(false);
      load();
    } catch (e) {
      setModalError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (bookingId: string) => {
    if (!confirm('Cancel this practice booking?')) return;
    try {
      await api.cancelPracticeBooking(bookingId);
      load();
    } catch (e) {
      alert(String(e));
    }
  };

  if (!activeTeam) {
    return <Alert variant="info">Select a team to view practice bookings.</Alert>;
  }

  const upcomingBookings = bookings.filter(
    (b) => b.status === 'active' && b.slot_date && b.slot_date >= today,
  );
  const historyBookings = bookings.filter(
    (b) => b.status === 'cancelled' || (b.slot_date && b.slot_date < today),
  );
  const displayed = tab === 'upcoming' ? upcomingBookings : historyBookings;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="page-title">Practice Bookings</div>
          <div className="page-subtitle">Reserve ice time for practice — no opponent needed.</div>
        </div>
        <Button type="button" onClick={openModal}>
          Book Practice
        </Button>
      </div>

      <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-900/50 dark:ring-1 dark:ring-slate-800/60">
        {(['upcoming', 'history'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors',
              tab === t
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950/40 dark:text-slate-100 dark:shadow-none dark:ring-1 dark:ring-slate-800/70'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="divide-y divide-slate-200 bg-white md:hidden dark:divide-slate-800 dark:bg-slate-950/20">
          {displayed.map((b) => (
            <div key={b.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{b.slot_date || '—'}</div>
                  <div className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                    {formatTimeHHMM(b.slot_start_time) || '—'}
                    {b.slot_end_time ? `–${formatTimeHHMM(b.slot_end_time) || b.slot_end_time}` : ''}
                  </div>
                  <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    {b.rink_name
                      ? `${b.rink_name}${b.rink_city ? ` • ${b.rink_city}, ${b.rink_state}` : ''}`
                      : '—'}
                  </div>
                  {(b.notes || b.slot_notes) && (
                    <div className="mt-2 text-sm text-slate-700 dark:text-slate-300">{b.notes || b.slot_notes}</div>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge variant={b.status === 'active' ? 'success' : 'neutral'}>{b.status}</Badge>
                    <span className="text-xs text-slate-500 dark:text-slate-400">Booked {new Date(b.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                {b.status === 'active' && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleCancel(b.id)}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          ))}

          {displayed.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
              No {tab} practice bookings.
            </div>
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-900/40 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Rink</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Booked</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/20">
              {displayed.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{b.slot_date || '—'}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                    {formatTimeHHMM(b.slot_start_time) || '—'}
                    {b.slot_end_time ? `–${formatTimeHHMM(b.slot_end_time) || b.slot_end_time}` : ''}
                  </td>
                  <td className="px-4 py-3">
                    {b.rink_name ? (
                      <div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">{b.rink_name}</div>
                        <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {b.rink_city}, {b.rink_state}
                        </div>
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{b.notes || b.slot_notes || '—'}</td>
                  <td className="px-4 py-3">
                    <Badge variant={b.status === 'active' ? 'success' : 'neutral'}>{b.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                    {new Date(b.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      {b.status === 'active' && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleCancel(b.id)}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {displayed.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
                    No {tab} practice bookings.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Book Practice Ice"
        footer={
          <>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !selectedSlotId}
            >
              {submitting ? 'Booking…' : 'Confirm Booking'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {modalError && (
            <Alert variant="error" title="Booking failed">
              {modalError}
            </Alert>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Rink</label>
              <Select
                value={selectedRinkId}
                onChange={(e) => {
                  setSelectedRinkId(e.target.value);
                  setSelectedSlotId('');
                }}
              >
                <option value="">Select rink…</option>
                {rinks.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} — {r.city}, {r.state}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Date</label>
              <Input
                type="date"
                min={today}
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setSelectedSlotId('');
                }}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Ice Slot</label>
            <Select
              value={selectedSlotId}
              onChange={(e) => setSelectedSlotId(e.target.value)}
              disabled={!selectedRinkId || !selectedDate}
            >
              <option value="">
                {!selectedRinkId || !selectedDate
                  ? 'Select rink and date first'
                  : slots.length === 0
                  ? 'No slots available'
                  : 'Select slot…'}
              </option>
              {slots.map((s) => (
                <option key={s.id} value={s.id}>
                  {formatTimeHHMM(s.start_time) || s.start_time}
                  {s.end_time ? `–${formatTimeHHMM(s.end_time) || s.end_time}` : ''} {s.notes ? `(${s.notes})` : ''}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Notes (optional)</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
