import { useState, useEffect } from 'react';
import { useTeam } from '../context/TeamContext';
import { api } from '../api/client';
import { GameProposal, IceSlot, Rink } from '../types';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import { Textarea } from '../components/ui/Textarea';
import { cn } from '../lib/cn';

const statusColors: Record<string, 'warning' | 'success' | 'danger' | 'neutral'> = {
  proposed: 'warning',
  accepted: 'success',
  declined: 'danger',
  cancelled: 'neutral',
};

const TABS: Array<{
  label: string;
  direction: 'incoming' | 'outgoing' | 'all';
  status?: 'proposed' | 'accepted';
}> = [
  { label: 'Incoming', direction: 'incoming', status: 'proposed' },
  { label: 'Outgoing', direction: 'outgoing', status: 'proposed' },
  { label: 'Accepted', direction: 'all', status: 'accepted' },
  { label: 'History', direction: 'all' },
];

function timeInputValue(t: string | null) {
  if (!t) return '';
  return t.length >= 5 ? t.slice(0, 5) : t;
}

function dedupeAcceptedProposals(ps: GameProposal[]) {
  const byKey = new Map<string, GameProposal>();
  for (const p of ps) {
    const key = `${p.home_schedule_entry_id}|${p.away_schedule_entry_id}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, p);
      continue;
    }
    if (new Date(p.updated_at).getTime() > new Date(existing.updated_at).getTime()) {
      byKey.set(key, p);
    }
  }
  return Array.from(byKey.values());
}

export default function ProposalsPage() {
  const { activeTeam } = useTeam();
  const [tab, setTab] = useState(0);
  const [proposals, setProposals] = useState<GameProposal[]>([]);
  const [rinks, setRinks] = useState<Rink[]>([]);
  const [rescheduleDialog, setRescheduleDialog] = useState<{ open: boolean; proposal?: GameProposal }>({ open: false });
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleRinkId, setRescheduleRinkId] = useState('');
  const [rescheduleSlots, setRescheduleSlots] = useState<IceSlot[]>([]);
  const [rescheduleSlotId, setRescheduleSlotId] = useState('');
  const [rescheduleMessage, setRescheduleMessage] = useState('');
  const [rescheduleError, setRescheduleError] = useState('');
  const [rescheduleLoading, setRescheduleLoading] = useState(false);

  const load = () => {
    if (!activeTeam) return;
    const t = TABS[tab] || TABS[0];
    const params: Record<string, string> = { direction: t.direction };
    if (t.status) params.status = t.status;
    api.getProposals(activeTeam.id, params).then((ps) => {
      setProposals(t.status === 'accepted' ? dedupeAcceptedProposals(ps) : ps);
    });
  };
  useEffect(() => {
    load();
    api.getRinks().then(setRinks);
  }, [activeTeam, tab]); // eslint-disable-line

  const handleAccept = async (id: string) => {
    await api.acceptProposal(id);
    load();
  };
  const handleDecline = async (id: string) => {
    await api.declineProposal(id);
    load();
  };
  const handleCancel = async (id: string) => {
    await api.cancelProposal(id);
    load();
  };

  const handleRequestReschedule = (p: GameProposal) => {
    setRescheduleError('');
    setRescheduleDialog({ open: true, proposal: p });
    setRescheduleDate(p.proposed_date);
    setRescheduleTime(timeInputValue(p.proposed_time));
    setRescheduleRinkId('');
    setRescheduleSlots([]);
    setRescheduleSlotId('');
    setRescheduleMessage('');
  };

  useEffect(() => {
    if (!rescheduleDialog.open || !rescheduleRinkId || !rescheduleDate) {
      setRescheduleSlots([]);
      return;
    }
    api.getAvailableSlots(rescheduleRinkId, rescheduleDate).then(setRescheduleSlots);
  }, [rescheduleDialog.open, rescheduleRinkId, rescheduleDate]);

  const submitReschedule = async () => {
    if (!activeTeam || !rescheduleDialog.proposal) return;
    setRescheduleLoading(true);
    setRescheduleError('');
    try {
      await api.rescheduleProposal(rescheduleDialog.proposal.id, {
        proposed_date: rescheduleDate,
        proposed_time: rescheduleTime || null,
        proposed_by_team_id: activeTeam.id,
        ice_slot_id: rescheduleSlotId || null,
        rink_id: rescheduleRinkId || null,
        message: rescheduleMessage || null,
      });
      setRescheduleDialog({ open: false });
      load();
    } catch (e) {
      setRescheduleError(String(e));
    } finally {
      setRescheduleLoading(false);
    }
  };

  if (!activeTeam) {
    return <Alert variant="info">Select a team to view proposals.</Alert>;
  }

  const tabDef = TABS[tab] || TABS[0];

  return (
    <div className="space-y-4">
      <div>
        <div className="page-title">Game Proposals</div>
        <div className="page-subtitle">Accept, decline, cancel, or request a reschedule.</div>
      </div>

      <div className="inline-flex rounded-xl bg-slate-100 p-1">
        {TABS.map((t, i) => (
          <button
            key={t.label}
            type="button"
            onClick={() => setTab(i)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              tab === i ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Home</th>
                <th className="px-4 py-3">Away</th>
                <th className="px-4 py-3">Rink</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Message</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {proposals.map((p) => {
                const isIncoming = p.proposed_by_team_id !== activeTeam.id;
                const canRespond = isIncoming && p.status === 'proposed';
                const canCancel = !isIncoming && p.status === 'proposed';
                const canReschedule = p.status === 'accepted';
                const canCancelAccepted = p.status === 'accepted';

                return (
                  <tr key={p.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {p.proposed_date} {p.proposed_time || ''}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{p.home_team_name}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{p.home_team_association}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{p.away_team_name}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{p.away_team_association}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {p.rink_name ? (
                        <div>
                          <div className="font-medium text-slate-900">{p.rink_name}</div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            {p.rink_city}, {p.rink_state}
                            {p.ice_slot_start_time && ` • ${p.ice_slot_start_time}${p.ice_slot_end_time ? '-' + p.ice_slot_end_time : ''}`}
                          </div>
                        </div>
                      ) : p.location_label ? (
                        <div className="max-w-[320px] truncate text-slate-700" title={p.location_label}>
                          {p.location_label}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusColors[p.status] || 'neutral'}>{p.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{p.message || '-'}</td>
                    <td className="px-4 py-3 text-slate-700">{new Date(p.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {canRespond && (
                          <>
                            <Button type="button" size="sm" onClick={() => handleAccept(p.id)}>
                              Accept
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => handleDecline(p.id)}>
                              Decline
                            </Button>
                          </>
                        )}
                        {canCancel && (
                          <Button type="button" size="sm" variant="outline" onClick={() => handleCancel(p.id)}>
                            Cancel
                          </Button>
                        )}
                        {canReschedule && (
                          <Button type="button" size="sm" variant="outline" onClick={() => handleRequestReschedule(p)}>
                            Request Reschedule
                          </Button>
                        )}
                        {canCancelAccepted && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (!confirm('Cancel this accepted game?')) return;
                              handleCancel(p.id);
                            }}
                          >
                            Cancel Game
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {proposals.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-600">
                    No {tabDef.label.toLowerCase()} proposals.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={rescheduleDialog.open}
        onClose={() => setRescheduleDialog({ open: false })}
        title="Request Reschedule"
        footer={
          <>
            <Button type="button" onClick={submitReschedule} disabled={rescheduleLoading || !rescheduleDate || !rescheduleTime}>
              {rescheduleLoading ? 'Sending…' : 'Send Request'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setRescheduleDialog({ open: false })} disabled={rescheduleLoading}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {rescheduleError && <Alert variant="error" title="Reschedule failed">{rescheduleError}</Alert>}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Date</label>
              <Input type="date" value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)} required />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Time</label>
              <Input type="time" value={rescheduleTime} onChange={(e) => setRescheduleTime(e.target.value)} required />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Rink (optional)</label>
              <Select value={rescheduleRinkId} onChange={(e) => { setRescheduleRinkId(e.target.value); setRescheduleSlotId(''); }}>
                <option value="">No rink</option>
                {rinks.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} — {r.city}, {r.state}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Ice Slot (optional)</label>
              <Select
                value={rescheduleSlotId}
                onChange={(e) => {
                  const id = e.target.value;
                  setRescheduleSlotId(id);
                  const slot = rescheduleSlots.find((s) => s.id === id);
                  if (slot?.start_time) setRescheduleTime(timeInputValue(slot.start_time));
                }}
                disabled={!rescheduleRinkId}
              >
                <option value="">No ice slot</option>
                {rescheduleSlots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.start_time}
                    {s.end_time ? '-' + s.end_time : ''} {s.notes ? `(${s.notes})` : ''}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Message (optional)</label>
            <Textarea value={rescheduleMessage} onChange={(e) => setRescheduleMessage(e.target.value)} rows={2} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
