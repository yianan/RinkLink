import { useState, useEffect } from 'react';
import { useTeam } from '../context/TeamContext';
import { api } from '../api/client';
import { PracticeBooking, IceSlot, Rink } from '../types';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
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
      <div className="flex items-start justify-between">
        <div>
          <div className="page-title">Practice Bookings</div>
          <div className="page-subtitle">Reserve ice time for practice — no opponent needed.</div>
        </div>
        <Button type="button" onClick={openModal}>
          Book Practice
        </Button>
      </div>

      <div className="inline-flex rounded-xl bg-slate-100 p-1">
        {(['upcoming', 'history'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors',
              tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
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
            <tbody className="divide-y divide-slate-200 bg-white">
              {displayed.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-medium text-slate-900">{b.slot_date || '—'}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {formatTimeHHMM(b.slot_start_time) || '—'}
                    {b.slot_end_time ? `–${formatTimeHHMM(b.slot_end_time) || b.slot_end_time}` : ''}
                  </td>
                  <td className="px-4 py-3">
                    {b.rink_name ? (
                      <div>
                        <div className="font-medium text-slate-900">{b.rink_name}</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {b.rink_city}, {b.rink_state}
                        </div>
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{b.notes || b.slot_notes || '—'}</td>
                  <td className="px-4 py-3">
                    <Badge variant={b.status === 'active' ? 'success' : 'neutral'}>{b.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
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
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-600">
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
              <label className="mb-1 block text-xs font-medium text-slate-600">Rink</label>
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
              <label className="mb-1 block text-xs font-medium text-slate-600">Date</label>
              <input
                type="date"
                min={today}
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setSelectedSlotId('');
                }}
                className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Ice Slot</label>
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
            <label className="mb-1 block text-xs font-medium text-slate-600">Notes (optional)</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
