import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, CalendarClock, Check, CheckCircle2, Search, X, XCircle } from 'lucide-react';
import { useTeam } from '../context/TeamContext';
import { useSeason } from '../context/SeasonContext';
import { api } from '../api/client';
import { GameProposal, IceSlot, Rink } from '../types';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import FilterPillGroup, { type FilterOption } from '../components/FilterPillGroup';
import { FilterPanel, FilterPanelTrigger } from '../components/FilterPanel';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import { Textarea } from '../components/ui/Textarea';
import PageHeader from '../components/PageHeader';
import SegmentedTabs from '../components/SegmentedTabs';
import EmptyState from '../components/EmptyState';
import { CardListSkeleton, TableSkeleton } from '../components/ui/TableSkeleton';
import { useConfirmDialog } from '../context/ConfirmDialogContext';
import { useToast } from '../context/ToastContext';
import { useNavBadgeRefresh } from '../context/NavBadgeContext';
import { cn } from '../lib/cn';
import { tableActionButtonClass } from '../lib/uiClasses';
import { formatTimeHHMM, formatShortDate } from '../lib/time';

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
  return formatTimeHHMM(t) || '';
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

function opponentNameForProposal(proposal: GameProposal, activeTeamId: string) {
  if (proposal.home_team_id === activeTeamId) return proposal.away_team_name || 'Unknown opponent';
  if (proposal.away_team_id === activeTeamId) return proposal.home_team_name || 'Unknown opponent';
  return [proposal.home_team_name, proposal.away_team_name].filter(Boolean).join(' vs ') || 'Unknown matchup';
}

function venueLabelForProposal(proposal: GameProposal) {
  return proposal.rink_name || 'Unknown rink';
}

export default function ProposalsPage() {
  const { activeTeam } = useTeam();
  const { activeSeason, seasons } = useSeason();
  const effectiveSeason = activeSeason ?? seasons.find((season) => season.is_active) ?? seasons[0] ?? null;
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const [proposals, setProposals] = useState<GameProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [rinks, setRinks] = useState<Rink[]>([]);
  const [selectedOpponents, setSelectedOpponents] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedVenues, setSelectedVenues] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [rescheduleDialog, setRescheduleDialog] = useState<{ open: boolean; proposal?: GameProposal }>({ open: false });
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleRinkId, setRescheduleRinkId] = useState('');
  const [rescheduleSlots, setRescheduleSlots] = useState<IceSlot[]>([]);
  const [rescheduleSlotId, setRescheduleSlotId] = useState('');
  const [rescheduleMessage, setRescheduleMessage] = useState('');
  const [rescheduleError, setRescheduleError] = useState('');
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const confirm = useConfirmDialog();
  const pushToast = useToast();
  const refreshNavBadges = useNavBadgeRefresh();

  const load =() => {
    if (!activeTeam || !effectiveSeason) return;
    let cancelled = false;
    const t = TABS[tab] || TABS[0];
    const params: Record<string, string> = { direction: t.direction };
    if (t.status) params.status = t.status;
    setLoading(true);
    api.getProposals(activeTeam.id, params).then((ps) => {
      const seasonScoped = ps.filter(
        (proposal) =>
          proposal.proposed_date >= effectiveSeason.start_date &&
          proposal.proposed_date <= effectiveSeason.end_date,
      );
      if (!cancelled) setProposals(t.status === 'accepted' ? dedupeAcceptedProposals(seasonScoped) : seasonScoped);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  };
  useEffect(() => {
    const cleanup = load();
    api.getRinks().then(setRinks);
    return cleanup;
  }, [activeTeam, effectiveSeason, tab]); // eslint-disable-line

  const handleAccept = async (id: string) => {
    await api.acceptProposal(id);
    load();
    refreshNavBadges();
    pushToast({ variant: 'success', title: 'Proposal accepted' });
  };
  const handleDecline = async (id: string) => {
    await api.declineProposal(id);
    load();
    refreshNavBadges();
    pushToast({ variant: 'success', title: 'Proposal declined' });
  };
  const handleCancel = async (id: string) => {
    await api.cancelProposal(id);
    load();
    refreshNavBadges();
    pushToast({ variant: 'success', title: 'Proposal cancelled' });
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
    if (!rescheduleRinkId) {
      setRescheduleError('Select a rink before sending a reschedule request.');
      return;
    }
    setRescheduleLoading(true);
    setRescheduleError('');
    try {
      await api.rescheduleProposal(rescheduleDialog.proposal.id, {
        proposed_date: rescheduleDate,
        proposed_time: rescheduleTime || null,
        proposed_by_team_id: activeTeam.id,
        ice_slot_id: rescheduleSlotId || null,
        rink_id: rescheduleRinkId,
        message: rescheduleMessage || null,
      });
      setRescheduleDialog({ open: false });
      load();
      pushToast({ variant: 'success', title: 'Reschedule request sent' });
    } catch (e) {
      setRescheduleError(String(e));
    } finally {
      setRescheduleLoading(false);
    }
  };

  if (!activeTeam) {
    return <Alert variant="info">Select a team to view proposals.</Alert>;
  }
  if (!effectiveSeason) {
    return <Alert variant="info">No season is available yet.</Alert>;
  }

  const tabDef = TABS[tab] || TABS[0];
  const opponentOptions = useMemo<FilterOption[]>(
    () =>
      Array.from(new Set(proposals.map((proposal) => opponentNameForProposal(proposal, activeTeam.id)).filter(Boolean)))
        .sort((left, right) => left.localeCompare(right))
        .map((opponent) => ({ value: opponent, label: opponent })),
    [activeTeam.id, proposals],
  );
  const statusOptions = useMemo<FilterOption[]>(
    () =>
      Array.from(new Set(proposals.map((proposal) => proposal.status)))
        .sort((left, right) => left.localeCompare(right))
        .map((status) => ({ value: status, label: status })),
    [proposals],
  );
  const venueOptions = useMemo<FilterOption[]>(
    () =>
      Array.from(new Set(proposals.map((proposal) => venueLabelForProposal(proposal)).filter(Boolean)))
        .sort((left, right) => left.localeCompare(right))
        .map((venue) => ({ value: venue, label: venue })),
    [proposals],
  );

  const filteredProposals = useMemo(
    () =>
      proposals.filter((proposal) => {
        const opponent = opponentNameForProposal(proposal, activeTeam.id);
        const venue = venueLabelForProposal(proposal);
        return (selectedOpponents.length === 0 || selectedOpponents.includes(opponent)) &&
          (selectedStatuses.length === 0 || selectedStatuses.includes(proposal.status)) &&
          (selectedVenues.length === 0 || selectedVenues.includes(venue));
      }),
    [activeTeam.id, proposals, selectedOpponents, selectedStatuses, selectedVenues],
  );

  const activeFilterBadges = useMemo(() => {
    const labelsFor = (options: FilterOption[], selectedValues: string[]) =>
      options.filter((option) => selectedValues.includes(option.value)).map((option) => option.label);
    return [
      ...labelsFor(opponentOptions, selectedOpponents),
      ...labelsFor(statusOptions, selectedStatuses),
      ...labelsFor(venueOptions, selectedVenues),
    ];
  }, [opponentOptions, selectedOpponents, selectedStatuses, selectedVenues, statusOptions, venueOptions]);

  const hasActiveFilters = activeFilterBadges.length > 0;

  const clearFilters = () => {
    setSelectedOpponents([]);
    setSelectedStatuses([]);
    setSelectedVenues([]);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Game Proposals"
        subtitle="Accept, decline, cancel, or request a reschedule."
        actions={(
          <FilterPanelTrigger count={activeFilterBadges.length} onClick={() => setFiltersOpen((open) => !open)} />
        )}
      />

      <FilterPanel
        title="Filter proposals"
        description="Narrow the current proposal list by opponent, status, and venue."
        open={filtersOpen}
        badges={activeFilterBadges}
        onClear={clearFilters}
      >
        {opponentOptions.length > 0 ? (
          <FilterPillGroup
            label="Opponent"
            options={opponentOptions}
            values={selectedOpponents}
            onChange={setSelectedOpponents}
            tone="sky"
          />
        ) : null}
        {statusOptions.length > 0 ? (
          <FilterPillGroup
            label="Status"
            options={statusOptions}
            values={selectedStatuses}
            onChange={setSelectedStatuses}
            tone="violet"
          />
        ) : null}
        {venueOptions.length > 0 ? (
          <FilterPillGroup
            label="Venue"
            options={venueOptions}
            values={selectedVenues}
            onChange={setSelectedVenues}
            tone="emerald"
          />
        ) : null}
      </FilterPanel>

      <SegmentedTabs
        items={TABS.map((t, i) => ({ label: t.label, value: i }))}
        value={tab}
        onChange={setTab}
      />

      <Card>
        <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl bg-white md:hidden dark:divide-slate-800 dark:bg-slate-950/20">
          {filteredProposals.map((p) => {
            const isIncoming = p.proposed_by_team_id !== activeTeam.id;
            const canRespond = isIncoming && p.status === 'proposed';
            const canCancel = !isIncoming && p.status === 'proposed';
            const canReschedule = p.status === 'accepted';
            const canCancelAccepted = p.status === 'accepted';
            const isHistoryTab = tab === 3;
            const isAcceptedTab = tab === 2;

            const rinkLine = p.rink_name
              ? `${p.rink_name}${p.rink_city ? ` • ${p.rink_city}, ${p.rink_state}` : ''}${p.ice_slot_start_time ? ` • ${formatTimeHHMM(p.ice_slot_start_time) || p.ice_slot_start_time}${p.ice_slot_end_time ? '-' + (formatTimeHHMM(p.ice_slot_end_time) || p.ice_slot_end_time) : ''}` : ''}`
              : p.location_label || '—';

            return (
              <div key={p.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {formatShortDate(p.proposed_date)} {formatTimeHHMM(p.proposed_time) || ''}
                    </div>
                    <div className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-300">
                      <div className="truncate">
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Home</span>{' '}
                        <span className="font-medium text-slate-900 dark:text-slate-100">{p.home_team_name}</span>
                      </div>
                      <div className="truncate">
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Away</span>{' '}
                        <span className="font-medium text-slate-900 dark:text-slate-100">{p.away_team_name}</span>
                      </div>
                    </div>
                    {(p.home_team_association || p.away_team_association) && (
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {(p.home_team_association || '—')}{' '}
                        <span className="text-slate-300">•</span>{' '}
                        {(p.away_team_association || '—')}
                      </div>
                    )}
                    <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">{rinkLine}</div>
                    {p.message ? (
                      <div className="mt-2 text-sm text-slate-700 dark:text-slate-300">{p.message}</div>
                    ) : null}
                    <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">Created {formatShortDate(p.created_at)}</div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5">
                    <Badge variant={statusColors[p.status] || 'neutral'}>{p.status}</Badge>
                    {isHistoryTab && (
                      <Badge
                        variant={isIncoming ? 'warning' : 'info'}
                        icon={isIncoming ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                      >
                        {isIncoming ? 'Received' : 'Sent'}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap justify-end gap-1">
                  {canRespond && (
                    <>
                      <Button type="button" variant="ghost" size="icon" className={tableActionButtonClass} onClick={() => handleAccept(p.id)} aria-label="Accept proposal">
                        <Check className="h-4 w-4 text-emerald-600" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className={tableActionButtonClass} onClick={() => handleDecline(p.id)} aria-label="Decline proposal">
                        <X className="h-4 w-4 text-rose-600" />
                      </Button>
                    </>
                  )}
                  {canCancel && (
                    <Button type="button" variant="ghost" size="icon" className={tableActionButtonClass} onClick={() => handleCancel(p.id)} aria-label="Cancel proposal">
                      <X className="h-4 w-4 text-rose-600" />
                    </Button>
                  )}
                  {canReschedule && (
                    <Button type="button" variant="ghost" size="icon" className={tableActionButtonClass} onClick={() => handleRequestReschedule(p)} aria-label="Request reschedule">
                      <CalendarClock className="h-4 w-4" />
                    </Button>
                  )}
                  {isAcceptedTab && (
                    <Button type="button" variant="ghost" size="icon" className={tableActionButtonClass} onClick={() => navigate('/schedule')} aria-label="View schedule">
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                  )}
                  {canCancelAccepted && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={tableActionButtonClass}
                      onClick={async () => {
                        const confirmed = await confirm({
                          title: 'Cancel this game?',
                          description: 'The game will be removed from both teams\' schedules.',
                          confirmLabel: 'Yes, cancel game',
                          confirmVariant: 'destructive',
                        });
                        if (!confirmed) return;
                        handleCancel(p.id);
                      }}
                      aria-label="Cancel game"
                    >
                      <XCircle className="h-4 w-4 text-rose-500" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {loading && <CardListSkeleton count={3} />}
          {!loading && filteredProposals.length === 0 && (
            <div className="p-4">
              <EmptyState
                icon={<Search className="h-5 w-5" />}
                title={hasActiveFilters ? 'No proposals match these filters' : `No ${tabDef.label.toLowerCase()} proposals`}
                description={hasActiveFilters ? 'Clear or change filters to widen the list.' : 'Use Find Opponents to send your next proposal.'}
                actions={!hasActiveFilters ? (
                  <Button type="button" size="sm" onClick={() => navigate('/search')}>
                    Find Opponents
                  </Button>
                ) : undefined}
                className="border-0 shadow-none"
              />
            </div>
          )}
        </div>

        <div className="hidden md:block">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-900/40 dark:text-slate-400">
                <tr>
                  <th className="w-20 px-3 py-3">Date</th>
                  <th className="w-16 px-3 py-3">Time</th>
                  <th className="w-[15%] px-3 py-3">Home</th>
                  <th className="w-[15%] px-3 py-3">Away</th>
                  <th className="w-[16%] px-3 py-3">Rink</th>
                  <th className="w-24 px-3 py-3">Status</th>
                  <th className="w-[10%] px-3 py-3">Message</th>
                  <th className="w-20 px-3 py-3">Created</th>
                  <th className="w-32 px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/20">
              {filteredProposals.map((p) => {
                const isIncoming = p.proposed_by_team_id !== activeTeam.id;
                const canRespond = isIncoming && p.status === 'proposed';
                const canCancel = !isIncoming && p.status === 'proposed';
                const canReschedule = p.status === 'accepted';
                const canCancelAccepted = p.status === 'accepted';
                const isHistoryTab = tab === 3;
                const isAcceptedTab = tab === 2;

                return (
                  <tr key={p.id} className="align-top hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                    <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-900 dark:text-slate-100">
                      {formatShortDate(p.proposed_date)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-700 dark:text-slate-300">
                      {formatTimeHHMM(p.proposed_time) || '-'}
                    </td>
                    <td className="px-3 py-3">
                      <div className="break-words font-medium text-slate-900 dark:text-slate-100">{p.home_team_name}</div>
                      <div className="mt-0.5 break-words text-xs text-slate-500 dark:text-slate-400">{p.home_team_association}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="break-words font-medium text-slate-900 dark:text-slate-100">{p.away_team_name}</div>
                      <div className="mt-0.5 break-words text-xs text-slate-500 dark:text-slate-400">{p.away_team_association}</div>
                    </td>
                    <td className="whitespace-normal break-words px-3 py-3 text-slate-700 dark:text-slate-300">
                      {p.rink_name ? (
                        <div>
                          <div className="break-words font-medium text-slate-900 dark:text-slate-100">{p.rink_name}</div>
                          <div className="mt-0.5 break-words text-xs leading-5 text-slate-500 dark:text-slate-400">
                            {[p.rink_city, p.rink_state].filter(Boolean).join(', ')}
                            {p.ice_slot_start_time && (
                              <>
                                {' · '}
                                {formatTimeHHMM(p.ice_slot_start_time) || p.ice_slot_start_time}
                                {p.ice_slot_end_time ? `-${formatTimeHHMM(p.ice_slot_end_time) || p.ice_slot_end_time}` : ''}
                              </>
                            )}
                          </div>
                        </div>
                      ) : p.location_label ? (
                        <div className="break-words text-slate-700 dark:text-slate-300" title={p.location_label}>
                          {p.location_label}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-3 pr-5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={statusColors[p.status] || 'neutral'}>{p.status}</Badge>
                        {isHistoryTab && (
                          <Badge
                            variant={isIncoming ? 'warning' : 'info'}
                            icon={isIncoming ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                          >
                            {isIncoming ? 'Received' : 'Sent'}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-700 dark:text-slate-300">
                      <div className="break-words text-sm leading-5">{p.message || '-'}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-700 dark:text-slate-300">{formatShortDate(p.created_at)}</td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex items-start gap-1">
                        {canRespond && (
                          <>
                            <Button type="button" variant="ghost" size="icon" className={cn('h-8 w-8', tableActionButtonClass)} onClick={() => handleAccept(p.id)} aria-label="Accept proposal">
                              <Check className="h-4 w-4 text-emerald-600" />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" className={cn('h-8 w-8', tableActionButtonClass)} onClick={() => handleDecline(p.id)} aria-label="Decline proposal">
                              <X className="h-4 w-4 text-rose-600" />
                            </Button>
                          </>
                        )}
                        {canCancel && (
                          <Button type="button" variant="ghost" size="icon" className={cn('h-8 w-8', tableActionButtonClass)} onClick={() => handleCancel(p.id)} aria-label="Cancel proposal">
                            <X className="h-4 w-4 text-rose-600" />
                          </Button>
                        )}
                        {canReschedule && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={cn('h-8 w-8', tableActionButtonClass)}
                            onClick={() => handleRequestReschedule(p)}
                            aria-label="Request reschedule"
                            title="Request reschedule"
                          >
                            <CalendarClock className="h-4 w-4" />
                          </Button>
                        )}
                        {isAcceptedTab && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={cn('h-8 w-8', tableActionButtonClass)}
                            onClick={() => navigate('/schedule')}
                            aria-label="View schedule"
                            title="View Schedule"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                        )}
                        {canCancelAccepted && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={cn('h-8 w-8', tableActionButtonClass)}
                            onClick={async () => {
                              const confirmed = await confirm({
                                title: 'Cancel accepted game?',
                                description: 'This removes the accepted game from the proposal flow.',
                                confirmLabel: 'Cancel game',
                                confirmVariant: 'destructive',
                              });
                              if (!confirmed) return;
                              handleCancel(p.id);
                            }}
                            aria-label="Cancel game"
                            title="Cancel game"
                          >
                            <XCircle className="h-4 w-4 text-rose-500" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {loading && (
                <tr>
                  <td colSpan={9} className="p-0">
                    <TableSkeleton columns={9} rows={4} compact />
                  </td>
                </tr>
              )}
              {!loading && filteredProposals.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-6">
                    <EmptyState
                      icon={<Search className="h-5 w-5" />}
                      title={hasActiveFilters ? 'No proposals match these filters' : `No ${tabDef.label.toLowerCase()} proposals`}
                      description={hasActiveFilters ? 'Clear or change filters to widen the list.' : 'Use Find Opponents to send your next proposal.'}
                      actions={!hasActiveFilters ? (
                        <Button type="button" size="sm" onClick={() => navigate('/search')}>
                          Find Opponents
                        </Button>
                      ) : undefined}
                      className="border-0 shadow-none"
                    />
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
            <Button type="button" onClick={submitReschedule} disabled={rescheduleLoading || !rescheduleDate || !rescheduleTime || !rescheduleRinkId}>
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
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Date</label>
              <Input type="date" value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)} required />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Time</label>
              <Input type="time" value={rescheduleTime} onChange={(e) => setRescheduleTime(e.target.value)} required />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Rink</label>
              <Select value={rescheduleRinkId} onChange={(e) => { setRescheduleRinkId(e.target.value); setRescheduleSlotId(''); }}>
                <option value="">Select a rink…</option>
                {rinks.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} — {r.city}, {r.state}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Ice Slot (optional)</label>
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
                    {formatTimeHHMM(s.start_time) || s.start_time}
                    {s.end_time ? '-' + (formatTimeHHMM(s.end_time) || s.end_time) : ''} {s.notes ? `(${s.notes})` : ''}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Message (optional)</label>
            <Textarea value={rescheduleMessage} onChange={(e) => setRescheduleMessage(e.target.value)} rows={2} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
