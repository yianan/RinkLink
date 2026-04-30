import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, Calendar, CalendarClock, Check, History, SendHorizontal, X, XCircle } from 'lucide-react';
import { api, isAbortError, type ListMeta } from '../api/client';
import { Arena, ArenaRink, IceSlot, Proposal } from '../types';
import { useSeason } from '../context/SeasonContext';
import { useTeam } from '../context/TeamContext';
import { useAuth } from '../context/AuthContext';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import PageHeader from '../components/PageHeader';
import SegmentedTabs from '../components/SegmentedTabs';
import { Select } from '../components/ui/Select';
import { Textarea } from '../components/ui/Textarea';
import { getCompetitionBadgeVariant, getCompetitionLabel } from '../lib/competition';
import { formatShortDate, formatTimeHHMM } from '../lib/time';
import { useConfirmDialog } from '../context/ConfirmDialogContext';
import { useToast } from '../context/ToastContext';
import { useNavBadgeRefresh } from '../context/NavBadgeContext';
import TeamLogo from '../components/TeamLogo';
import { canManageProposals } from '../lib/permissions';

const TABS = [
  { label: 'Incoming', value: 'incoming' as const, direction: 'incoming', status: 'proposed' },
  { label: 'Outgoing', value: 'outgoing' as const, direction: 'outgoing', status: 'proposed' },
  { label: 'Accepted', value: 'accepted' as const, direction: 'all', status: 'accepted' },
  { label: 'History', value: 'history' as const, direction: 'all', status: undefined },
] as const;
const LIST_LIMIT = 100;

const statusColors: Record<Proposal['status'], 'warning' | 'success' | 'danger' | 'neutral'> = {
  proposed: 'warning',
  accepted: 'success',
  declined: 'danger',
  cancelled: 'neutral',
};

function proposalTimeLabel(proposal: Proposal) {
  const start = formatTimeHHMM(proposal.proposed_start_time) || proposal.proposed_start_time || 'Any time';
  const end = formatTimeHHMM(proposal.proposed_end_time) || proposal.proposed_end_time;
  return end ? `${start}-${end}` : start;
}

function proposalVenueLabel(proposal: Proposal) {
  const venue = [proposal.arena_name, proposal.arena_rink_name].filter(Boolean).join(' • ');
  const slot =
    proposal.ice_slot_start_time
      ? `${formatTimeHHMM(proposal.ice_slot_start_time) || proposal.ice_slot_start_time}${proposal.ice_slot_end_time ? `-${formatTimeHHMM(proposal.ice_slot_end_time) || proposal.ice_slot_end_time}` : ''}`
      : null;
  return [venue || proposal.location_label || 'Venue TBD', slot].filter(Boolean).join(' • ');
}

function proposalTeamName(proposal: Proposal, teamId: string | null) {
  if (!teamId) return 'Unknown team';
  if (teamId === proposal.home_team_id) return proposal.home_team_name || 'Home team';
  if (teamId === proposal.away_team_id) return proposal.away_team_name || 'Away team';
  return 'Unknown team';
}

function proposalResponseLabel(proposal: Proposal) {
  if (!proposal.responded_at) return null;
  const actor = proposal.response_source === 'arena' ? 'Arena' : proposal.response_source === 'system' ? 'System' : 'Team';
  return `${actor} response ${formatShortDate(proposal.responded_at)}`;
}

export default function ProposalsPage() {
  const navigate = useNavigate();
  const { activeTeam } = useTeam();
  const { activeSeason, seasons } = useSeason();
  const { authEnabled, me } = useAuth();
  const confirm = useConfirmDialog();
  const pushToast = useToast();
  const refreshNavBadges = useNavBadgeRefresh();
  const proposalAccess = !authEnabled || canManageProposals(me);

  const effectiveSeason = activeSeason ?? seasons.find((season) => season.is_active) ?? seasons[0] ?? null;

  const [tab, setTab] = useState<(typeof TABS)[number]['value']>('incoming');
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [proposalMeta, setProposalMeta] = useState<ListMeta>({ total: 0, limit: LIST_LIMIT, offset: 0 });
  const [pageOffset, setPageOffset] = useState(0);
  const [arenas, setArenas] = useState<Arena[]>([]);
  const [arenaRinks, setArenaRinks] = useState<ArenaRink[]>([]);
  const [slots, setSlots] = useState<IceSlot[]>([]);
  const [historyProposal, setHistoryProposal] = useState<Proposal | null>(null);
  const [historyItems, setHistoryItems] = useState<Proposal[]>([]);
  const [rescheduleProposal, setRescheduleProposal] = useState<Proposal | null>(null);
  const [rescheduleForm, setRescheduleForm] = useState({
    event_type: 'league' as Proposal['event_type'],
    proposed_date: '',
    arena_id: '',
    arena_rink_id: '',
    ice_slot_id: '',
    message: '',
  });

  const load = useCallback(() => {
    if (!activeTeam) return;
    const activeTab = TABS.find((item) => item.value === tab) || TABS[0];
    const params = {
      direction: activeTab.direction,
      ...(activeTab.status ? { status: activeTab.status } : {}),
      ...(effectiveSeason ? { date_from: effectiveSeason.start_date, date_to: effectiveSeason.end_date } : {}),
      limit: String(LIST_LIMIT),
      offset: String(pageOffset),
    };
    api.getProposalsList(activeTeam.id, params).then((result) => {
      const filtered = result.data.filter((proposal) => {
        if (effectiveSeason && (proposal.proposed_date < effectiveSeason.start_date || proposal.proposed_date > effectiveSeason.end_date)) {
          return false;
        }
        if (tab === 'history') {
          return proposal.status === 'declined' || proposal.status === 'cancelled';
        }
        return true;
      });
      setProposals(filtered);
      setProposalMeta(result.meta);
    }).catch(() => {
      setProposals([]);
      setProposalMeta({ total: 0, limit: LIST_LIMIT, offset: 0 });
    });
  }, [activeTeam, effectiveSeason, pageOffset, tab]);

  useEffect(() => {
    setPageOffset(0);
  }, [activeTeam?.id, effectiveSeason?.id, tab]);

  useEffect(() => {
    if (!activeTeam) return;
    const controller = new AbortController();
    const activeTab = TABS.find((item) => item.value === tab) || TABS[0];
    const params = {
      direction: activeTab.direction,
      ...(activeTab.status ? { status: activeTab.status } : {}),
      ...(effectiveSeason ? { date_from: effectiveSeason.start_date, date_to: effectiveSeason.end_date } : {}),
      limit: String(LIST_LIMIT),
      offset: String(pageOffset),
    };
    api.getProposalsList(activeTeam.id, params, { signal: controller.signal }).then((result) => {
      const filtered = result.data.filter((proposal) => {
        if (effectiveSeason && (proposal.proposed_date < effectiveSeason.start_date || proposal.proposed_date > effectiveSeason.end_date)) {
          return false;
        }
        if (tab === 'history') {
          return proposal.status === 'declined' || proposal.status === 'cancelled';
        }
        return true;
      });
      setProposals(filtered);
      setProposalMeta(result.meta);
    }).catch((error) => {
      if (isAbortError(error)) return;
      setProposals([]);
      setProposalMeta({ total: 0, limit: LIST_LIMIT, offset: 0 });
    });
    api.getArenas().then((data) => {
      if (!controller.signal.aborted) setArenas(data);
    }).catch(() => {
      if (!controller.signal.aborted) setArenas([]);
    });
    return () => {
      controller.abort();
    };
  }, [activeTeam, effectiveSeason, pageOffset, tab]);

  useEffect(() => {
    if (!rescheduleForm.arena_id) return;
    api.getArenaRinks(rescheduleForm.arena_id).then(setArenaRinks);
  }, [rescheduleForm.arena_id]);

  useEffect(() => {
    if (!rescheduleForm.arena_rink_id || !rescheduleForm.proposed_date) return;
    api.getAvailableIceSlots(rescheduleForm.arena_rink_id, rescheduleForm.proposed_date).then(setSlots).catch(() => setSlots([]));
  }, [rescheduleForm.arena_rink_id, rescheduleForm.proposed_date]);
  const visibleArenaRinks = rescheduleForm.arena_id ? arenaRinks : [];
  const visibleSlots = rescheduleForm.arena_rink_id && rescheduleForm.proposed_date ? slots : [];

  const sortedProposals = useMemo(() => {
    const next = proposals.slice();
    if (tab === 'history') {
      return next.sort((left, right) =>
        `${right.responded_at || right.updated_at}`.localeCompare(`${left.responded_at || left.updated_at}`),
      );
    }
    return next.sort((left, right) =>
      `${left.proposed_date}${left.proposed_start_time || ''}`.localeCompare(`${right.proposed_date}${right.proposed_start_time || ''}`),
    );
  }, [proposals, tab]);
  const rangeStart = proposalMeta.total === 0 ? 0 : proposalMeta.offset + 1;
  const rangeEnd = Math.min(proposalMeta.offset + proposals.length, proposalMeta.total);
  const canGoPrevious = proposalMeta.offset > 0;
  const canGoNext = proposalMeta.offset + proposalMeta.limit < proposalMeta.total;
  const paginationControls = proposalMeta.total > proposalMeta.limit ? (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
      <div>{rangeStart}-{rangeEnd} of {proposalMeta.total}</div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" disabled={!canGoPrevious} onClick={() => setPageOffset(Math.max(0, proposalMeta.offset - proposalMeta.limit))}>
          Previous
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={!canGoNext} onClick={() => setPageOffset(proposalMeta.offset + proposalMeta.limit)}>
          Next
        </Button>
      </div>
    </div>
  ) : null;

  if (!activeTeam) {
    return <Alert variant="info">Select a team to review proposals.</Alert>;
  }
  if (!proposalAccess) {
    return <Alert variant="error">You do not have permission to manage proposals for this team.</Alert>;
  }

  const acceptProposal = async (proposalId: string) => {
    await api.acceptProposal(proposalId);
    refreshNavBadges();
    pushToast({ variant: 'success', title: 'Proposal accepted' });
    load();
  };

  const declineProposal = async (proposalId: string) => {
    await api.declineProposal(proposalId);
    refreshNavBadges();
    pushToast({ variant: 'success', title: 'Proposal declined' });
    load();
  };

  const cancelProposal = async (proposal: Proposal) => {
    const confirmed = await confirm({
      title: proposal.status === 'accepted' ? 'Cancel accepted proposal?' : 'Cancel proposal?',
      description: proposal.status === 'accepted' ? 'This also cancels the linked scheduled event.' : 'This removes the proposal from both teams.',
      confirmLabel: 'Cancel proposal',
      confirmVariant: 'destructive',
    });
    if (!confirmed) return;
    await api.cancelProposal(proposal.id);
    refreshNavBadges();
    pushToast({ variant: 'success', title: 'Proposal cancelled' });
    load();
  };

  const openReschedule = (proposal: Proposal) => {
    setRescheduleProposal(proposal);
    setRescheduleForm({
      event_type: proposal.event_type,
      proposed_date: proposal.proposed_date,
      arena_id: proposal.arena_id,
      arena_rink_id: proposal.arena_rink_id,
      ice_slot_id: '',
      message: proposal.message || '',
    });
  };

  const openHistory = async (proposal: Proposal) => {
    setHistoryProposal(proposal);
    setHistoryItems([]);
    try {
      setHistoryItems(await api.getProposalHistory(proposal.id));
    } catch (error) {
      pushToast({ variant: 'error', title: 'Unable to load history', description: String(error) });
    }
  };

  const submitReschedule = async () => {
    if (!rescheduleProposal || !rescheduleForm.arena_id || !rescheduleForm.arena_rink_id) return;
    const selectedSlot = visibleSlots.find((slot) => slot.id === rescheduleForm.ice_slot_id);
    await api.rescheduleProposal(rescheduleProposal.id, {
      event_type: rescheduleForm.event_type,
      proposed_date: rescheduleForm.proposed_date,
      proposed_start_time: selectedSlot?.start_time || rescheduleProposal.proposed_start_time,
      proposed_end_time: selectedSlot?.end_time || rescheduleProposal.proposed_end_time,
      proposed_by_team_id: activeTeam.id,
      arena_id: rescheduleForm.arena_id,
      arena_rink_id: rescheduleForm.arena_rink_id,
      ice_slot_id: rescheduleForm.ice_slot_id || null,
      message: rescheduleForm.message || null,
    });
    setRescheduleProposal(null);
    refreshNavBadges();
    pushToast({ variant: 'success', title: 'Reschedule request sent' });
    load();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Proposals"
        subtitle="Accept, decline, cancel, or reschedule proposals with full arena and rink detail."
      />

      <SegmentedTabs
        items={TABS.map((tabDef) => ({ label: tabDef.label, value: tabDef.value }))}
        value={tab}
        onChange={setTab}
      />

      <div className="space-y-3">
        {sortedProposals.map((proposal) => {
          const isIncoming = proposal.proposed_by_team_id !== activeTeam.id;
          const canRespond = proposal.status === 'proposed' && isIncoming;
          const canCancel = proposal.status === 'proposed' && !isIncoming;
          const canReschedule = proposal.status === 'accepted' || canRespond;
          const directionLabel = isIncoming ? 'Received' : 'Sent';
          const proposerName = proposalTeamName(proposal, proposal.proposed_by_team_id);

          return (
            <Card key={proposal.id} className="overflow-hidden p-0">
              <div className="border-b border-slate-200/80 bg-white/85 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/30">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-3">
                      <div className="flex shrink-0 items-center gap-2">
                        <TeamLogo name={proposal.home_team_name || 'Home'} logoUrl={proposal.home_team_logo_url} className="h-10 w-10 rounded-xl" initialsClassName="text-xs" />
                        <TeamLogo name={proposal.away_team_name || 'Away'} logoUrl={proposal.away_team_logo_url} className="h-10 w-10 rounded-xl" initialsClassName="text-xs" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {proposal.home_team_name} vs {proposal.away_team_name}
                          </div>
                          <Badge
                            variant={isIncoming ? 'warning' : 'info'}
                            icon={isIncoming ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                          >
                            {directionLabel} by {proposerName}
                          </Badge>
                          <Badge variant={getCompetitionBadgeVariant(proposal.event_type)}>
                            {getCompetitionLabel(proposal.event_type)}
                          </Badge>
                          <Badge variant={statusColors[proposal.status]}>{proposal.status}</Badge>
                          {proposal.revision_number > 1 ? (
                            <Badge variant="outline">Revision {proposal.revision_number}</Badge>
                          ) : null}
                        </div>
                        <div className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                          {formatShortDate(proposal.proposed_date)} • {proposalTimeLabel(proposal)}
                        </div>
                        <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                          {proposalVenueLabel(proposal)}
                        </div>
                        {(proposal.home_team_association || proposal.away_team_association) ? (
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {(proposal.home_team_association || 'No home association')} • {(proposal.away_team_association || 'No away association')}
                          </div>
                        ) : null}
                        {(proposal.home_locker_room_name || proposal.away_locker_room_name) ? (
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            Locker rooms: {[proposal.home_locker_room_name, proposal.away_locker_room_name].filter(Boolean).join(' / ')}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    {proposal.message ? (
                      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/35 dark:text-slate-300">
                        {proposal.message}
                      </div>
                    ) : null}
                    {proposal.response_message ? (
                      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/35 dark:text-amber-100">
                        <span className="font-semibold">
                          {proposal.response_source === 'arena' ? 'Arena note:' : 'Update:'}
                        </span>{' '}
                        {proposal.response_message}
                      </div>
                    ) : null}
                    <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                      {proposal.responded_at && (proposal.status === 'declined' || proposal.status === 'cancelled')
                        ? `Updated ${formatShortDate(proposal.responded_at)}`
                        : `Created ${formatShortDate(proposal.created_at)}`}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-start gap-2 lg:justify-end">
                    {canRespond ? (
                      <>
                        <Button type="button" size="sm" onClick={() => acceptProposal(proposal.id)}>
                          <Check className="h-4 w-4" />
                          Accept
                        </Button>
                        <Button type="button" size="sm" variant="destructive" onClick={() => declineProposal(proposal.id)}>
                          <XCircle className="h-4 w-4" />
                          Decline
                        </Button>
                      </>
                    ) : null}
                    {canCancel ? (
                      <Button type="button" size="sm" variant="destructive" onClick={() => cancelProposal(proposal)}>
                        <XCircle className="h-4 w-4" />
                        Cancel Proposal
                      </Button>
                    ) : null}
                    {canReschedule ? (
                      <>
                        <Button type="button" size="sm" variant="outline" onClick={() => openReschedule(proposal)}>
                          <CalendarClock className="h-4 w-4" />
                          {proposal.status === 'proposed' ? 'Counter' : 'Request Reschedule'}
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => navigate('/schedule')}>
                          <Calendar className="h-4 w-4" />
                          Open Schedule
                        </Button>
                        <Button type="button" size="sm" variant="destructive" onClick={() => cancelProposal(proposal)}>
                          <XCircle className="h-4 w-4" />
                          Cancel Proposal
                        </Button>
                      </>
                    ) : null}
                    <Button type="button" size="sm" variant="ghost" onClick={() => openHistory(proposal)}>
                      <History className="h-4 w-4" />
                      History
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}

        {sortedProposals.length === 0 ? (
          <Card className="p-6 text-sm text-slate-600 dark:text-slate-400">
            No proposals in this view. Use Find Opponents from Availability to create the next matchup request.
          </Card>
        ) : null}
        {paginationControls}
      </div>

      <Modal
        open={!!historyProposal}
        title="Proposal History"
        description="Thread revisions and responses for this matchup."
        onClose={() => {
          setHistoryProposal(null);
          setHistoryItems([]);
        }}
        className="max-w-2xl"
      >
        <div className="space-y-3">
          {historyItems.map((proposal) => {
            const responseLabel = proposalResponseLabel(proposal);
            const parentRevision = historyItems.find((item) => item.id === proposal.parent_proposal_id)?.revision_number;
            return (
              <div key={proposal.id} className="rounded-xl border border-slate-200 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">Revision {proposal.revision_number}</Badge>
                    {parentRevision ? <Badge variant="neutral">Counter to {parentRevision}</Badge> : null}
                    <Badge variant={statusColors[proposal.status]}>{proposal.status}</Badge>
                    <Badge variant={getCompetitionBadgeVariant(proposal.event_type)}>{getCompetitionLabel(proposal.event_type)}</Badge>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Sent by {proposalTeamName(proposal, proposal.proposed_by_team_id)}
                  </div>
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {formatShortDate(proposal.proposed_date)} • {proposalTimeLabel(proposal)}
                </div>
                <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">{proposalVenueLabel(proposal)}</div>
                {proposal.message ? (
                  <div className="mt-2 text-sm text-slate-700 dark:text-slate-300">{proposal.message}</div>
                ) : null}
                {proposal.response_message ? (
                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                    <span className="font-semibold">{proposal.response_source === 'arena' ? 'Arena note:' : 'Response:'}</span> {proposal.response_message}
                  </div>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <span>Created {formatShortDate(proposal.created_at)}</span>
                  {responseLabel ? <span>{responseLabel}</span> : null}
                </div>
              </div>
            );
          })}
          {historyItems.length === 0 ? (
            <div className="text-sm text-slate-600 dark:text-slate-400">Loading history...</div>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={!!rescheduleProposal}
        onClose={() => setRescheduleProposal(null)}
        title="Request Reschedule"
        footer={(
          <>
            <Button type="button" onClick={submitReschedule} disabled={!rescheduleForm.proposed_date || !rescheduleForm.arena_id || !rescheduleForm.arena_rink_id}>
              <SendHorizontal className="h-4 w-4" />
              Send Request
            </Button>
            <Button type="button" variant="outline" onClick={() => setRescheduleProposal(null)}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
          </>
        )}
      >
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Event Type</label>
            <Select value={rescheduleForm.event_type} onChange={(event) => setRescheduleForm((current) => ({ ...current, event_type: event.target.value as Proposal['event_type'] }))}>
              {(['league', 'tournament', 'practice', 'showcase', 'scrimmage', 'exhibition'] as Proposal['event_type'][]).map((eventType) => (
                <option key={eventType} value={eventType}>{getCompetitionLabel(eventType)}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Date</label>
            <input
              type="date"
              className="min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950/20"
              value={rescheduleForm.proposed_date}
              onChange={(event) => setRescheduleForm((current) => ({ ...current, proposed_date: event.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Arena</label>
            <Select value={rescheduleForm.arena_id} onChange={(event) => setRescheduleForm((current) => ({ ...current, arena_id: event.target.value, arena_rink_id: '', ice_slot_id: '' }))}>
              <option value="">Select arena…</option>
              {arenas.map((arena) => (
                <option key={arena.id} value={arena.id}>{arena.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Arena Rink</label>
            <Select value={rescheduleForm.arena_rink_id} onChange={(event) => setRescheduleForm((current) => ({ ...current, arena_rink_id: event.target.value, ice_slot_id: '' }))}>
              <option value="">Select rink…</option>
              {visibleArenaRinks.map((arenaRink) => (
                <option key={arenaRink.id} value={arenaRink.id}>{arenaRink.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Ice Slot</label>
            <Select value={rescheduleForm.ice_slot_id} onChange={(event) => setRescheduleForm((current) => ({ ...current, ice_slot_id: event.target.value }))}>
              <option value="">No slot selected</option>
              {visibleSlots.map((slot) => (
                <option key={slot.id} value={slot.id}>
                  {formatTimeHHMM(slot.start_time) || slot.start_time}
                  {slot.end_time ? `-${formatTimeHHMM(slot.end_time) || slot.end_time}` : ''}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Message</label>
            <Textarea value={rescheduleForm.message} onChange={(event) => setRescheduleForm((current) => ({ ...current, message: event.target.value }))} rows={4} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
