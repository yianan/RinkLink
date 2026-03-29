import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarPlus2, Eye, Search as SearchIcon, SendHorizontal, SlidersHorizontal, X } from 'lucide-react';
import { api } from '../api/client';
import { Arena, ArenaRink, AutoMatchResult, AvailabilityWindow, IceSlot, OpponentResult, Proposal } from '../types';
import { useSeason } from '../context/SeasonContext';
import { useTeam } from '../context/TeamContext';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import EmptyState from '../components/EmptyState';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import { Textarea } from '../components/ui/Textarea';
import PageHeader from '../components/PageHeader';
import SegmentedTabs from '../components/SegmentedTabs';
import TeamLogo from '../components/TeamLogo';
import { getCompetitionBadgeVariant, getCompetitionLabel } from '../lib/competition';
import { addDays, formatShortDate, formatTimeHHMM, toLocalDateString } from '../lib/time';
import { useToast } from '../context/ToastContext';
import { cn } from '../lib/cn';
import { filterButtonClass } from '../lib/uiClasses';

const EVENT_TYPES: Proposal['event_type'][] = ['league', 'tournament', 'practice', 'showcase', 'scrimmage', 'exhibition'];
const LEVELS_10U_PLUS = ['AAA', 'AA', 'A', 'B', 'C', 'Rec'];
const LEVELS_6U_8U = ['Beginner', 'Beginner/Intermediate', 'Intermediate', 'Intermediate/Advanced', 'Advanced'];

type ProposalDraft = {
  open: boolean;
  mode: 'search' | 'auto';
  opponent?: OpponentResult;
  autoMatch?: AutoMatchResult;
};

function parseAgeNumber(ageGroup: string) {
  const match = ageGroup.match(/(\d+)/);
  if (!match) return null;
  const age = Number(match[1]);
  return Number.isFinite(age) ? age : null;
}

function standardLevelsForAgeGroup(ageGroup: string) {
  if (!ageGroup) return LEVELS_10U_PLUS;
  const ageNumber = parseAgeNumber(ageGroup);
  const isMite = ageNumber != null ? ageNumber <= 8 : ageGroup === '6U' || ageGroup === '8U';
  return isMite ? LEVELS_6U_8U : LEVELS_10U_PLUS;
}

function getAutoMatchTimeGroup(date: string): string {
  const today = new Date();
  const todayStr = toLocalDateString(today);
  const dayOfWeek = (today.getDay() + 6) % 7;
  const thisWeekEnd = toLocalDateString(addDays(today, 6 - dayOfWeek));
  const nextWeekEnd = toLocalDateString(addDays(today, 13 - dayOfWeek));
  if (date < todayStr) return 'Past';
  if (date <= thisWeekEnd) return 'This Week';
  if (date <= nextWeekEnd) return 'Next Week';
  return 'Later';
}

function proposalBadgeVariant(status: string | null | undefined): 'success' | 'warning' | 'outline' {
  if (status === 'accepted') return 'success';
  if (status === 'proposed') return 'warning';
  return 'outline';
}

function proposalStatusLabel(status: string | null | undefined) {
  if (status === 'accepted') return 'Accepted';
  if (status === 'proposed') return 'Pending';
  return 'Proposal';
}

function timeWindowLabel(startTime: string | null | undefined, endTime: string | null | undefined) {
  const start = formatTimeHHMM(startTime);
  const end = formatTimeHHMM(endTime);
  if (start && end) return `${start}-${end}`;
  if (start) return start;
  return 'Any time';
}

export default function SearchPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { activeTeam } = useTeam();
  const { activeSeason, seasons } = useSeason();
  const pushToast = useToast();

  const effectiveSeason = activeSeason ?? seasons.find((season) => season.is_active) ?? seasons[0] ?? null;
  const standardLevels = standardLevelsForAgeGroup(activeTeam?.age_group || '');

  const [tab, setTab] = useState<'search' | 'auto'>('search');
  const [availability, setAvailability] = useState<AvailabilityWindow[]>([]);
  const [selectedAvailabilityId, setSelectedAvailabilityId] = useState('');
  const [maxDistance, setMaxDistance] = useState(200);
  const [level, setLevel] = useState('');
  const [minRanking, setMinRanking] = useState('');
  const [maxRanking, setMaxRanking] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [searchArenaId, setSearchArenaId] = useState('');
  const [searchArenaRinkId, setSearchArenaRinkId] = useState('');
  const [results, setResults] = useState<OpponentResult[]>([]);
  const [autoMatches, setAutoMatches] = useState<AutoMatchResult[]>([]);
  const [arenas, setArenas] = useState<Arena[]>([]);
  const [searchArenaRinks, setSearchArenaRinks] = useState<ArenaRink[]>([]);
  const [proposalArenaRinks, setProposalArenaRinks] = useState<ArenaRink[]>([]);
  const [searchSlots, setSearchSlots] = useState<IceSlot[]>([]);
  const [proposalSlots, setProposalSlots] = useState<IceSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [proposalError, setProposalError] = useState('');
  const [proposalDraft, setProposalDraft] = useState<ProposalDraft>({ open: false, mode: 'search' });
  const [proposalForm, setProposalForm] = useState({
    event_type: 'league' as Proposal['event_type'],
    arena_id: '',
    arena_rink_id: '',
    ice_slot_id: '',
    message: '',
  });

  const selectedAvailability = availability.find((window) => window.id === selectedAvailabilityId) ?? null;
  const selectedDate = selectedAvailability?.date || '';
  const proposalDate = proposalDraft.autoMatch?.date || proposalDraft.opponent?.entry_date || selectedDate || '';
  const selectedProposalSlot = proposalSlots.find((slot) => slot.id === proposalForm.ice_slot_id) ?? null;
  const proposalStartTime = selectedProposalSlot?.start_time || proposalDraft.autoMatch?.home_start_time || proposalDraft.opponent?.start_time || selectedAvailability?.start_time || null;
  const proposalEndTime = selectedProposalSlot?.end_time || proposalDraft.autoMatch?.home_end_time || proposalDraft.opponent?.end_time || selectedAvailability?.end_time || null;
  const availabilityReturnTab = searchParams.get('tab') || 'upcoming';
  const availabilityReturnMonth = searchParams.get('month');
  const availabilityReturnDate = searchParams.get('date');
  const cameFromAvailability = searchParams.get('from') === 'availability' || !!searchParams.get('availability');

  const sortedAutoMatches = useMemo(
    () => autoMatches.slice().sort((left, right) => left.date.localeCompare(right.date) || (left.home_start_time || '').localeCompare(right.home_start_time || '')),
    [autoMatches],
  );

  const rangeMin = 10;
  const rangeMax = 200;
  const rangeProgress = Math.min(100, Math.max(0, ((maxDistance - rangeMin) / (rangeMax - rangeMin)) * 100));
  const rangeStyle = { '--app-range-progress': `${rangeProgress}%` } as CSSProperties;

  useEffect(() => {
    if (!activeTeam) return;
    let cancelled = false;

    Promise.all([
      api.getAvailability(activeTeam.id),
      api.getAutoMatches(activeTeam.id),
      api.getArenas(),
    ]).then(([availabilityData, autoMatchData, arenaData]) => {
      if (cancelled) return;

      const openWindows = availabilityData.filter((window) =>
        window.status === 'open'
        && !window.blocked
        && (!effectiveSeason || (window.date >= effectiveSeason.start_date && window.date <= effectiveSeason.end_date))
        && !!window.start_time,
      );
      setAvailability(openWindows);

      const requestedId = searchParams.get('availability');
      if (requestedId && openWindows.some((window) => window.id === requestedId)) {
        setSelectedAvailabilityId(requestedId);
      } else if (!openWindows.some((window) => window.id === selectedAvailabilityId)) {
        setSelectedAvailabilityId(openWindows[0]?.id || '');
      }

      setAutoMatches(
        autoMatchData.filter((match) =>
          !effectiveSeason || (match.date >= effectiveSeason.start_date && match.date <= effectiveSeason.end_date),
        ),
      );
      setArenas(arenaData);
    }).catch((error) => {
      if (cancelled) return;
      setSearchError(String(error));
    });

    return () => {
      cancelled = true;
    };
  }, [activeTeam?.id, effectiveSeason?.id, searchParams]);

  useEffect(() => {
    setResults([]);
    setHasSearched(false);
    setSearchError('');
  }, [selectedAvailabilityId, maxDistance, level, minRanking, maxRanking, searchArenaId, searchArenaRinkId]);

  useEffect(() => {
    if (!searchArenaId) {
      setSearchArenaRinks([]);
      setSearchArenaRinkId('');
      return;
    }
    api.getArenaRinks(searchArenaId).then(setSearchArenaRinks).catch(() => setSearchArenaRinks([]));
  }, [searchArenaId]);

  useEffect(() => {
    if (!searchArenaRinkId || !selectedDate) {
      setSearchSlots([]);
      return;
    }
    api.getAvailableIceSlots(searchArenaRinkId, selectedDate).then(setSearchSlots).catch(() => setSearchSlots([]));
  }, [searchArenaRinkId, selectedDate]);

  useEffect(() => {
    if (!proposalForm.arena_id) {
      setProposalArenaRinks([]);
      return;
    }
    api.getArenaRinks(proposalForm.arena_id).then(setProposalArenaRinks).catch(() => setProposalArenaRinks([]));
  }, [proposalForm.arena_id]);

  useEffect(() => {
    if (!proposalForm.arena_rink_id || !proposalDate) {
      setProposalSlots([]);
      return;
    }
    api.getAvailableIceSlots(proposalForm.arena_rink_id, proposalDate).then(setProposalSlots).catch(() => setProposalSlots([]));
  }, [proposalForm.arena_rink_id, proposalDate]);

  if (!activeTeam) {
    return <Alert variant="info">Select a team to search for opponents.</Alert>;
  }

  if (!effectiveSeason) {
    return <Alert variant="info">No season is available yet.</Alert>;
  }

  const runSearch = async () => {
    if (!selectedAvailability) return;
    setLoading(true);
    setHasSearched(true);
    setSearchError('');
    try {
      const params: Record<string, string> = {
        team_id: activeTeam.id,
        availability_window_id: selectedAvailability.id,
      };
      if (maxDistance < 200) params.max_distance_miles = String(maxDistance);
      if (level.trim()) params.level = level.trim();
      if (minRanking.trim()) params.min_ranking = minRanking.trim();
      if (maxRanking.trim()) params.max_ranking = maxRanking.trim();
      if (searchArenaId) params.arena_id = searchArenaId;
      const data = await api.searchOpponents(params);
      setResults(data);
    } catch (error) {
      setResults([]);
      setSearchError(String(error));
    } finally {
      setLoading(false);
    }
  };

  const openProposal = (draft: ProposalDraft) => {
    setProposalError('');
    setProposalSlots([]);
    setProposalForm({
      event_type: 'league',
      arena_id: searchArenaId,
      arena_rink_id: searchArenaRinkId,
      ice_slot_id: '',
      message: '',
    });
    setProposalDraft(draft);
  };

  const closeProposal = () => {
    setProposalDraft({ open: false, mode: 'search' });
    setProposalError('');
    setProposalLoading(false);
    setProposalSlots([]);
  };

  const saveProposal = async () => {
    if (!activeTeam || !proposalForm.arena_id || !proposalForm.arena_rink_id) return;
    const selectedSlot = proposalSlots.find((slot) => slot.id === proposalForm.ice_slot_id);

    setProposalLoading(true);
    setProposalError('');
    try {
      if (proposalDraft.mode === 'auto' && proposalDraft.autoMatch) {
        const match = proposalDraft.autoMatch;
        await api.createProposal({
          home_team_id: match.home_team_id,
          away_team_id: match.away_team_id,
          home_availability_window_id: match.home_availability_window_id,
          away_availability_window_id: match.away_availability_window_id,
          event_type: proposalForm.event_type,
          proposed_date: match.date,
          proposed_start_time: selectedSlot?.start_time || match.home_start_time,
          proposed_end_time: selectedSlot?.end_time || match.home_end_time,
          proposed_by_team_id: activeTeam.id,
          arena_id: proposalForm.arena_id,
          arena_rink_id: proposalForm.arena_rink_id,
          ice_slot_id: proposalForm.ice_slot_id || null,
          message: proposalForm.message || null,
        });
      } else if (proposalDraft.mode === 'search' && proposalDraft.opponent && selectedAvailability) {
        const opponent = proposalDraft.opponent;
        const homeTeamId = selectedAvailability.availability_type === 'home' ? activeTeam.id : opponent.team_id;
        const awayTeamId = selectedAvailability.availability_type === 'home' ? opponent.team_id : activeTeam.id;
        const homeAvailabilityWindowId = selectedAvailability.availability_type === 'home' ? selectedAvailability.id : opponent.availability_window_id;
        const awayAvailabilityWindowId = selectedAvailability.availability_type === 'home' ? opponent.availability_window_id : selectedAvailability.id;
        await api.createProposal({
          home_team_id: homeTeamId,
          away_team_id: awayTeamId,
          home_availability_window_id: homeAvailabilityWindowId,
          away_availability_window_id: awayAvailabilityWindowId,
          event_type: proposalForm.event_type,
          proposed_date: opponent.entry_date,
          proposed_start_time: selectedSlot?.start_time || opponent.start_time,
          proposed_end_time: selectedSlot?.end_time || opponent.end_time,
          proposed_by_team_id: activeTeam.id,
          arena_id: proposalForm.arena_id,
          arena_rink_id: proposalForm.arena_rink_id,
          ice_slot_id: proposalForm.ice_slot_id || null,
          message: proposalForm.message || null,
        });
      } else {
        return;
      }

      closeProposal();
      pushToast({ variant: 'success', title: 'Proposal sent' });
      navigate('/proposals');
    } catch (error) {
      setProposalError(String(error));
    } finally {
      setProposalLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Find Opponents"
        subtitle="Search open availability or review auto-matches for the current season."
        actions={(
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate(
              cameFromAvailability
                ? `/availability?tab=${availabilityReturnTab}${availabilityReturnMonth ? `&month=${availabilityReturnMonth}` : ''}${availabilityReturnDate ? `&date=${availabilityReturnDate}` : ''}`
                : '/availability',
            )}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Availability
          </Button>
        )}
      />
      <SegmentedTabs
        items={[
          { label: 'Search by Availability', value: 'search' as const },
          { label: `Auto-Matches (${sortedAutoMatches.length})`, value: 'auto' as const },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'search' ? (
        <div className="space-y-3">
          <Card className="p-4">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:items-end">
              <div className="lg:col-span-4">
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Open Availability</label>
                <Select value={selectedAvailabilityId} onChange={(event) => setSelectedAvailabilityId(event.target.value)}>
                  <option value="">Select availability…</option>
                  {availability.map((window) => (
                    <option key={window.id} value={window.id}>
                      {formatShortDate(window.date)} ({window.availability_type}) {timeWindowLabel(window.start_time, window.end_time)}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="lg:col-span-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Max Distance</label>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{maxDistance >= 200 ? 'Any' : `${maxDistance} mi`}</div>
                </div>
                <input
                  type="range"
                  min={rangeMin}
                  max={rangeMax}
                  step={10}
                  value={maxDistance}
                  onChange={(event) => setMaxDistance(Number(event.target.value))}
                  className="rl-range mt-2 w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 dark:focus-visible:ring-offset-slate-950"
                  style={rangeStyle}
                />
              </div>

              <div className="lg:col-span-2">
                <Button type="button" className="w-full" onClick={runSearch} disabled={!selectedAvailability || loading}>
                  <SearchIcon className="h-4 w-4" />
                  {loading ? 'Searching…' : 'Search'}
                </Button>
              </div>

              <div className="lg:col-span-2 lg:justify-self-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn('w-full lg:w-auto', filterButtonClass)}
                  onClick={() => setShowAdvancedFilters((current) => !current)}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  {showAdvancedFilters ? 'Hide Filters' : 'Advanced Filters'}
                </Button>
              </div>
            </div>

            {showAdvancedFilters ? (
              <div className="mt-4 grid grid-cols-1 gap-3 border-t border-[color:var(--app-border-subtle)] pt-4 lg:grid-cols-12 lg:items-end">
                <div className="lg:col-span-4">
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Preferred Arena</label>
                  <Select
                    value={searchArenaId}
                    onChange={(event) => {
                      setSearchArenaId(event.target.value);
                      setSearchArenaRinkId('');
                    }}
                  >
                    <option value="">Any arena</option>
                    {arenas.map((arena) => (
                      <option key={arena.id} value={arena.id}>{arena.name}</option>
                    ))}
                  </Select>
                </div>

                <div className="lg:col-span-4">
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Preferred Rink</label>
                  <Select value={searchArenaRinkId} onChange={(event) => setSearchArenaRinkId(event.target.value)} disabled={!searchArenaId}>
                    <option value="">{searchArenaId ? 'Any rink' : 'Select arena first'}</option>
                    {searchArenaRinks.map((arenaRink) => (
                      <option key={arenaRink.id} value={arenaRink.id}>{arenaRink.name}</option>
                    ))}
                  </Select>
                </div>

                <div className="lg:col-span-4">
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Level</label>
                  <Select value={level} onChange={(event) => setLevel(event.target.value)}>
                    <option value="">Any level</option>
                    {standardLevels.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </Select>
                </div>

                <div className="lg:col-span-6">
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">MYHockey Ranking</label>
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={minRanking} onChange={(event) => setMinRanking(event.target.value)}>
                      <option value="">Min</option>
                      {[1, 5, 10, 15, 20, 25, 30, 40, 50].map((value) => (
                        <option key={value} value={String(value)}>{value}</option>
                      ))}
                    </Select>
                    <Select value={maxRanking} onChange={(event) => setMaxRanking(event.target.value)}>
                      <option value="">Max</option>
                      {[5, 10, 15, 20, 25, 30, 40, 50, 75, 100].map((value) => (
                        <option key={value} value={String(value)}>{value}</option>
                      ))}
                    </Select>
                  </div>
                </div>
              </div>
            ) : null}
          </Card>

          {searchSlots.length > 0 && searchArenaRinkId && selectedDate ? (
            <Alert variant="info">
              <span className="font-medium">
                {searchSlots.length} available ice slot(s) on {formatShortDate(selectedDate)}:
              </span>{' '}
              {searchSlots
                .map((slot) => `${timeWindowLabel(slot.start_time, slot.end_time)}${slot.notes ? ` (${slot.notes})` : ''}`)
                .join(', ')}
            </Alert>
          ) : null}

          {searchError ? <Alert variant="error" title="Search failed">{searchError}</Alert> : null}

          {results.length > 0 ? (
            <Card className="overflow-hidden">
              <div className="divide-y divide-slate-200 bg-white md:hidden dark:divide-slate-800 dark:bg-slate-950/20">
                {results.map((result) => (
                  <div key={result.availability_window_id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <TeamLogo name={result.team_name} logoUrl={result.team_logo_url} className="h-11 w-11 rounded-xl" initialsClassName="text-sm" />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{result.team_name}</div>
                          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{result.association_name}</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Badge variant={result.availability_type === 'home' ? 'success' : 'info'}>{result.availability_type}</Badge>
                            <Badge variant="outline">{result.age_group} {result.level}</Badge>
                            {result.primary_competition_short_name ? (
                              <Badge variant="outline">
                                {result.primary_competition_short_name}
                                {result.primary_division_name ? ` • ${result.primary_division_name}` : ''}
                              </Badge>
                            ) : null}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                            <span>{timeWindowLabel(result.start_time, result.end_time)}</span>
                            <span>Ranking: {result.myhockey_ranking ?? '—'}</span>
                            <span>{result.distance_miles != null ? `${result.distance_miles} mi` : '—'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        {result.has_existing_proposal ? (
                          <>
                            <Badge variant={proposalBadgeVariant(result.existing_proposal_status)}>
                              {proposalStatusLabel(result.existing_proposal_status)}
                            </Badge>
                            <Button type="button" size="sm" variant="outline" onClick={() => navigate('/proposals')}>
                              <Eye className="h-4 w-4" />
                              Open Proposal
                            </Button>
                          </>
                        ) : (
                          <Button type="button" size="sm" onClick={() => openProposal({ open: true, mode: 'search', opponent: result })}>
                            <CalendarPlus2 className="h-4 w-4" />
                            Propose
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-900/40 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Team</th>
                      <th className="px-4 py-3">Association</th>
                      <th className="px-4 py-3">Level</th>
                      <th className="px-4 py-3">Ranking</th>
                      <th className="px-4 py-3">Distance</th>
                      <th className="px-4 py-3">Opponent Availability</th>
                      <th className="px-4 py-3 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/20">
                    {results.map((result) => (
                      <tr key={result.availability_window_id} className="align-top hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <TeamLogo name={result.team_name} logoUrl={result.team_logo_url} className="h-10 w-10 rounded-xl" initialsClassName="text-xs" />
                            <div className="min-w-0">
                              <div className="font-medium text-slate-900 dark:text-slate-100">{result.team_name}</div>
                              {result.primary_competition_short_name ? (
                                <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                  {result.primary_competition_short_name}
                                  {result.primary_division_name ? ` • ${result.primary_division_name}` : ''}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{result.association_name}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{result.age_group} {result.level}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{result.myhockey_ranking ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{result.distance_miles != null ? `${result.distance_miles} mi` : '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Badge variant={result.availability_type === 'home' ? 'success' : 'info'}>{result.availability_type}</Badge>
                            <div className="text-slate-700 dark:text-slate-300">{timeWindowLabel(result.start_time, result.end_time)}</div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end">
                            {result.has_existing_proposal ? (
                              <div className="flex items-center gap-2">
                                <Badge variant={proposalBadgeVariant(result.existing_proposal_status)}>
                                  {proposalStatusLabel(result.existing_proposal_status)}
                                </Badge>
                                <Button type="button" size="sm" variant="outline" onClick={() => navigate('/proposals')}>
                                  <Eye className="h-4 w-4" />
                                  Open Proposal
                                </Button>
                              </div>
                            ) : (
                              <Button type="button" size="sm" onClick={() => openProposal({ open: true, mode: 'search', opponent: result })}>
                                <CalendarPlus2 className="h-4 w-4" />
                                Propose
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}

          {hasSearched && !loading && results.length === 0 ? (
            <EmptyState
              icon={<SearchIcon className="h-5 w-5" />}
              title="No matching opponents found"
              description="Matches require the opposite home or away availability, the same date and start time, and any filters you selected."
            />
          ) : null}

          {!hasSearched && !loading ? (
            <Card className="p-6 text-sm text-slate-600 dark:text-slate-400">
              Search from an open availability window to compare compatible opponents, rankings, distance, and proposal state.
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === 'auto' ? (
        <Card className="overflow-hidden">
          {sortedAutoMatches.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<CalendarPlus2 className="h-5 w-5" />}
                title="No auto-matches found"
                description="Add more open availability windows to widen the matching pool."
                actions={(
                  <Button type="button" size="sm" variant="outline" onClick={() => navigate('/availability')}>
                    <CalendarPlus2 className="h-4 w-4" />
                    Open Availability
                  </Button>
                )}
                className="border-0 shadow-none"
              />
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-200 bg-white md:hidden dark:divide-slate-800 dark:bg-slate-950/20">
                {sortedAutoMatches.map((match, index) => {
                  const group = getAutoMatchTimeGroup(match.date);
                  const previousGroup = index > 0 ? getAutoMatchTimeGroup(sortedAutoMatches[index - 1].date) : null;
                  const showGroupHeader = group !== previousGroup;
                  return (
                    <div key={`${match.home_availability_window_id}-${match.away_availability_window_id}`}>
                      {showGroupHeader ? (
                        <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 dark:border-slate-800 dark:bg-slate-900/40">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">{group}</span>
                        </div>
                      ) : null}

                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{formatShortDate(match.date) || match.date}</div>

                            <div className="mt-2 flex items-start gap-3">
                              <TeamLogo name={match.home_team_name} logoUrl={match.home_team_logo_url} className="mt-0.5 h-10 w-10 rounded-xl" initialsClassName="text-xs" />
                              <div>
                                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                  {match.home_team_name} <span className="text-xs font-medium text-slate-500 dark:text-slate-400">(H)</span>
                                </div>
                                <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                  {match.home_association_name} @ {timeWindowLabel(match.home_start_time, match.home_end_time)}
                                </div>
                                {match.home_primary_competition_short_name ? (
                                  <div className="mt-1">
                                    <Badge variant="outline">
                                      {match.home_primary_competition_short_name}
                                      {match.home_primary_division_name ? ` • ${match.home_primary_division_name}` : ''}
                                    </Badge>
                                  </div>
                                ) : null}
                              </div>
                            </div>

                            <div className="mt-2 flex items-start gap-3">
                              <TeamLogo name={match.away_team_name} logoUrl={match.away_team_logo_url} className="mt-0.5 h-10 w-10 rounded-xl" initialsClassName="text-xs" />
                              <div>
                                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                  {match.away_team_name} <span className="text-xs font-medium text-slate-500 dark:text-slate-400">(A)</span>
                                </div>
                                <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                  {match.away_association_name} @ {timeWindowLabel(match.away_start_time, match.away_end_time)}
                                </div>
                                {match.away_primary_competition_short_name ? (
                                  <div className="mt-1">
                                    <Badge variant="outline">
                                      {match.away_primary_competition_short_name}
                                      {match.away_primary_division_name ? ` • ${match.away_primary_division_name}` : ''}
                                    </Badge>
                                  </div>
                                ) : null}
                              </div>
                            </div>

                            <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                              Distance: {match.distance_miles != null ? `${match.distance_miles} mi` : '—'}
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-2">
                            {match.has_existing_proposal ? (
                              <>
                                <Badge variant={proposalBadgeVariant(match.existing_proposal_status)}>
                                  {proposalStatusLabel(match.existing_proposal_status)}
                                </Badge>
                                <Button type="button" size="sm" variant="outline" onClick={() => navigate('/proposals')}>
                                  <Eye className="h-4 w-4" />
                                  Open Proposal
                                </Button>
                              </>
                            ) : (
                              <Button type="button" size="sm" onClick={() => openProposal({ open: true, mode: 'auto', autoMatch: match })}>
                                <CalendarPlus2 className="h-4 w-4" />
                                Propose
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-900/40 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Home Team</th>
                      <th className="px-4 py-3">Away Team</th>
                      <th className="px-4 py-3">Distance</th>
                      <th className="px-4 py-3 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/20">
                    {sortedAutoMatches.map((match, index) => {
                      const group = getAutoMatchTimeGroup(match.date);
                      const previousGroup = index > 0 ? getAutoMatchTimeGroup(sortedAutoMatches[index - 1].date) : null;
                      const showGroupHeader = group !== previousGroup;
                      return (
                        <>
                          {showGroupHeader ? (
                            <tr key={`${group}:${match.home_availability_window_id}:group`}>
                              <td colSpan={5} className="bg-slate-50 px-4 py-2 dark:bg-slate-900/40">
                                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">{group}</span>
                              </td>
                            </tr>
                          ) : null}
                          <tr key={`${match.home_availability_window_id}-${match.away_availability_window_id}`} className="align-top hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                            <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{formatShortDate(match.date) || match.date}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <TeamLogo name={match.home_team_name} logoUrl={match.home_team_logo_url} className="h-10 w-10 rounded-xl" initialsClassName="text-xs" />
                                <div>
                                  <div className="font-medium text-slate-900 dark:text-slate-100">{match.home_team_name}</div>
                                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                    {match.home_association_name} @ {timeWindowLabel(match.home_start_time, match.home_end_time)}
                                  </div>
                                  {match.home_primary_competition_short_name ? (
                                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                      {match.home_primary_competition_short_name}
                                      {match.home_primary_division_name ? ` • ${match.home_primary_division_name}` : ''}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <TeamLogo name={match.away_team_name} logoUrl={match.away_team_logo_url} className="h-10 w-10 rounded-xl" initialsClassName="text-xs" />
                                <div>
                                  <div className="font-medium text-slate-900 dark:text-slate-100">{match.away_team_name}</div>
                                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                    {match.away_association_name} @ {timeWindowLabel(match.away_start_time, match.away_end_time)}
                                  </div>
                                  {match.away_primary_competition_short_name ? (
                                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                      {match.away_primary_competition_short_name}
                                      {match.away_primary_division_name ? ` • ${match.away_primary_division_name}` : ''}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{match.distance_miles != null ? `${match.distance_miles} mi` : '—'}</td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end">
                                {match.has_existing_proposal ? (
                                  <div className="flex items-center gap-2">
                                    <Badge variant={proposalBadgeVariant(match.existing_proposal_status)}>
                                      {proposalStatusLabel(match.existing_proposal_status)}
                                    </Badge>
                                    <Button type="button" size="sm" variant="outline" onClick={() => navigate('/proposals')}>
                                      <Eye className="h-4 w-4" />
                                      Open Proposal
                                    </Button>
                                  </div>
                                ) : (
                                  <Button type="button" size="sm" onClick={() => openProposal({ open: true, mode: 'auto', autoMatch: match })}>
                                    <CalendarPlus2 className="h-4 w-4" />
                                    Propose
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      ) : null}

      <Modal
        open={proposalDraft.open}
        onClose={closeProposal}
        title="Propose Event"
        footer={(
          <>
            <Button type="button" onClick={saveProposal} disabled={proposalLoading || !proposalForm.arena_id || !proposalForm.arena_rink_id || !proposalForm.ice_slot_id}>
              <SendHorizontal className="h-4 w-4" />
              {proposalLoading ? 'Sending…' : 'Send Proposal'}
            </Button>
            <Button type="button" variant="outline" onClick={closeProposal} disabled={proposalLoading}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
          </>
        )}
      >
        <div className="space-y-3">
          {proposalError ? <Alert variant="error" title="Proposal failed">{proposalError}</Alert> : null}

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
            {proposalDraft.mode === 'auto' && proposalDraft.autoMatch ? (
              <>
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  <span className="inline-flex items-center gap-2">
                    <TeamLogo name={proposalDraft.autoMatch.home_team_name} logoUrl={proposalDraft.autoMatch.home_team_logo_url} className="h-8 w-8 rounded-lg" initialsClassName="text-[11px]" />
                    <span>{proposalDraft.autoMatch.home_team_name} (H)</span>
                  </span>
                  <span className="mx-2">vs</span>
                  <span className="inline-flex items-center gap-2">
                    <TeamLogo name={proposalDraft.autoMatch.away_team_name} logoUrl={proposalDraft.autoMatch.away_team_logo_url} className="h-8 w-8 rounded-lg" initialsClassName="text-[11px]" />
                    <span>{proposalDraft.autoMatch.away_team_name} (A)</span>
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                  <span>{formatShortDate(proposalDraft.autoMatch.date) || proposalDraft.autoMatch.date}</span>
                  <span>{timeWindowLabel(proposalDraft.autoMatch.home_start_time, proposalDraft.autoMatch.home_end_time)}</span>
                  <span>{proposalDraft.autoMatch.distance_miles != null ? `${proposalDraft.autoMatch.distance_miles} mi` : 'Distance unavailable'}</span>
                </div>
              </>
            ) : proposalDraft.opponent ? (
              <>
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  <span className="inline-flex items-center gap-2">
                    <TeamLogo name={activeTeam.name} logoUrl={activeTeam.logo_url} className="h-8 w-8 rounded-lg" initialsClassName="text-[11px]" />
                    <span>{activeTeam.name}</span>
                  </span>
                  <span className="mx-2">vs</span>
                  <span className="inline-flex items-center gap-2">
                    <TeamLogo name={proposalDraft.opponent.team_name} logoUrl={proposalDraft.opponent.team_logo_url} className="h-8 w-8 rounded-lg" initialsClassName="text-[11px]" />
                    <span>{proposalDraft.opponent.team_name}</span>
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                  <span>{formatShortDate(proposalDraft.opponent.entry_date) || proposalDraft.opponent.entry_date}</span>
                  <span>{timeWindowLabel(proposalDraft.opponent.start_time, proposalDraft.opponent.end_time)}</span>
                  <span>{proposalDraft.opponent.age_group} {proposalDraft.opponent.level}</span>
                  {proposalDraft.opponent.myhockey_ranking != null ? <span>Ranking: {proposalDraft.opponent.myhockey_ranking}</span> : null}
                  {proposalDraft.opponent.distance_miles != null ? <span>{proposalDraft.opponent.distance_miles} mi</span> : null}
                </div>
              </>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Event Type</label>
            <Select value={proposalForm.event_type} onChange={(event) => setProposalForm((current) => ({ ...current, event_type: event.target.value as Proposal['event_type'] }))}>
              {EVENT_TYPES.map((eventType) => (
                <option key={eventType} value={eventType}>{getCompetitionLabel(eventType)}</option>
              ))}
            </Select>
            <div className="mt-2">
              <Badge variant={getCompetitionBadgeVariant(proposalForm.event_type)}>{getCompetitionLabel(proposalForm.event_type)}</Badge>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Arena</label>
            <Select
              value={proposalForm.arena_id}
              onChange={(event) => setProposalForm((current) => ({ ...current, arena_id: event.target.value, arena_rink_id: '', ice_slot_id: '' }))}
            >
              <option value="">Select arena…</option>
              {arenas.map((arena) => (
                <option key={arena.id} value={arena.id}>{arena.name}</option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Arena Rink</label>
            <Select
              value={proposalForm.arena_rink_id}
              onChange={(event) => setProposalForm((current) => ({ ...current, arena_rink_id: event.target.value, ice_slot_id: '' }))}
              disabled={!proposalForm.arena_id}
            >
              <option value="">{proposalForm.arena_id ? 'Select rink…' : 'Select arena first'}</option>
              {proposalArenaRinks.map((arenaRink) => (
                <option key={arenaRink.id} value={arenaRink.id}>{arenaRink.name}</option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Ice Slot</label>
            <Select
              value={proposalForm.ice_slot_id}
              onChange={(event) => setProposalForm((current) => ({ ...current, ice_slot_id: event.target.value }))}
              disabled={!proposalForm.arena_rink_id}
            >
              <option value="">{!proposalForm.arena_rink_id ? 'Select rink first' : proposalSlots.length === 0 ? 'No available slots' : 'No slot selected'}</option>
              {proposalSlots.map((slot) => (
                <option key={slot.id} value={slot.id}>
                  {timeWindowLabel(slot.start_time, slot.end_time)}
                  {slot.notes ? ` (${slot.notes})` : ''}
                </option>
              ))}
            </Select>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {selectedProposalSlot
                ? `Using configured ice slot time ${timeWindowLabel(selectedProposalSlot.start_time, selectedProposalSlot.end_time)}.`
                : 'A proposal now requires a real ice slot. If none are available for this rink and date, add slot inventory in Arenas or choose another rink/date.'}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Message</label>
            <Textarea value={proposalForm.message} onChange={(event) => setProposalForm((current) => ({ ...current, message: event.target.value }))} rows={4} />
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400">
            Proposed window: {formatShortDate(proposalDate)} • {timeWindowLabel(proposalStartTime, proposalEndTime)}
          </div>
        </div>
      </Modal>
    </div>
  );
}
