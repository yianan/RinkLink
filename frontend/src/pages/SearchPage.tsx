import { useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';
import { useTeam } from '../context/TeamContext';
import { api } from '../api/client';
import { AutoMatchResult, IceSlot, OpponentResult, Rink, ScheduleEntry } from '../types';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Textarea } from '../components/ui/Textarea';
import { cn } from '../lib/cn';
import { formatTimeHHMM } from '../lib/time';

const LEVELS_10U_PLUS = ['AAA', 'AA', 'A', 'B', 'C', 'Rec'];
const LEVELS_6U_8U = ['Beginner', 'Beginner/Intermediate', 'Intermediate', 'Intermediate/Advanced', 'Advanced'];

function parseAgeNumber(ageGroup: string) {
  const m = ageGroup.match(/(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function standardLevelsForAgeGroup(ageGroup: string) {
  if (!ageGroup) return LEVELS_10U_PLUS;
  const ageNumber = parseAgeNumber(ageGroup);
  const isMite = ageNumber != null ? ageNumber <= 8 : ageGroup === '6U' || ageGroup === '8U';
  return isMite ? LEVELS_6U_8U : LEVELS_10U_PLUS;
}

export default function SearchPage() {
  const { activeTeam } = useTeam();
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const [openDates, setOpenDates] = useState<ScheduleEntry[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState('');
  const [maxDistance, setMaxDistance] = useState(200);
  const [level, setLevel] = useState('');
  const [minRanking, setMinRanking] = useState('');
  const [maxRanking, setMaxRanking] = useState('');
  const [results, setResults] = useState<OpponentResult[]>([]);
  const [autoMatches, setAutoMatches] = useState<AutoMatchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [rinks, setRinks] = useState<Rink[]>([]);
  const [selectedRink, setSelectedRink] = useState('');
  const [availableSlots, setAvailableSlots] = useState<IceSlot[]>([]);
  const [proposalRinkId, setProposalRinkId] = useState('');
  const [proposalSlots, setProposalSlots] = useState<IceSlot[]>([]);
  const [proposalDialog, setProposalDialog] = useState<{
    open: boolean;
    opponent?: OpponentResult;
    autoMatch?: AutoMatchResult;
    myEntry?: ScheduleEntry;
  }>({ open: false });
  const [selectedIceSlotId, setSelectedIceSlotId] = useState('');
  const [message, setMessage] = useState('');
  const [searchError, setSearchError] = useState('');
  const [proposalError, setProposalError] = useState('');
  const [proposalLoading, setProposalLoading] = useState(false);

  const selectedEntry = openDates.find((e) => e.id === selectedEntryId) || null;
  const selectedDate = selectedEntry?.date || '';
  const proposalDate =
    proposalDialog.autoMatch?.date ||
    proposalDialog.opponent?.entry_date ||
    proposalDialog.myEntry?.date ||
    selectedDate ||
    '';

  useEffect(() => {
    if (!activeTeam) return;
    api.getSchedule(activeTeam.id, { status: 'open' }).then((data) => setOpenDates(data.filter((e) => !!e.time)));
    api.getAutoMatches(activeTeam.id).then(setAutoMatches);
    api.getRinks().then(setRinks);
  }, [activeTeam]);

  // Fetch available ice slots when a rink and date are selected
  useEffect(() => {
    if (!selectedRink || !selectedDate) {
      setAvailableSlots([]);
      return;
    }
    api.getAvailableSlots(selectedRink, selectedDate).then(setAvailableSlots);
  }, [selectedRink, selectedDate]);

  useEffect(() => {
    if (!proposalDialog.open || !proposalRinkId || !proposalDate) {
      setProposalSlots([]);
      return;
    }
    api.getAvailableSlots(proposalRinkId, proposalDate).then(setProposalSlots).catch(() => setProposalSlots([]));
  }, [proposalDialog.open, proposalRinkId, proposalDate]);

  const handleSearch = async () => {
    if (!activeTeam || !selectedEntry) return;
    setLoading(true);
    setSearchError('');
    try {
      const params: Record<string, string> = {
        team_id: activeTeam.id,
        schedule_entry_id: selectedEntry.id,
      };
      if (maxDistance < 200) params.max_distance_miles = maxDistance.toString();
      if (selectedRink) params.rink_id = selectedRink;
      if (level.trim()) params.level = level.trim();
      if (minRanking.trim()) params.min_ranking = minRanking.trim();
      if (maxRanking.trim()) params.max_ranking = maxRanking.trim();
      const data = await api.searchOpponents(params);
      setResults(data);
    } catch (e) {
      setResults([]);
      setSearchError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const openProposal = (payload: { opponent?: OpponentResult; autoMatch?: AutoMatchResult; myEntry?: ScheduleEntry }) => {
    setProposalError('');
    setMessage('');
    setSelectedIceSlotId('');
    setProposalRinkId(selectedRink || '');
    setProposalSlots([]);
    setProposalDialog({ open: true, ...payload });
  };

  const handlePropose = async () => {
    if (!activeTeam) return;
    const { opponent, autoMatch, myEntry } = proposalDialog;

    const existing = opponent?.has_existing_proposal || autoMatch?.has_existing_proposal;
    if (existing) {
      setProposalError('A proposal already exists for this matchup. Check the Proposals page.');
      return;
    }

    let homeTeamId: string, awayTeamId: string, homeEntryId: string, awayEntryId: string, date: string;

    if (autoMatch) {
      homeTeamId = autoMatch.home_team_id;
      awayTeamId = autoMatch.away_team_id;
      homeEntryId = autoMatch.home_entry_id;
      awayEntryId = autoMatch.away_entry_id;
      date = autoMatch.date;
    } else if (opponent && myEntry) {
      if (myEntry.entry_type === 'home') {
        homeTeamId = activeTeam.id;
        awayTeamId = opponent.team_id;
        homeEntryId = myEntry.id;
        awayEntryId = opponent.schedule_entry_id;
      } else {
        homeTeamId = opponent.team_id;
        awayTeamId = activeTeam.id;
        homeEntryId = opponent.schedule_entry_id;
        awayEntryId = myEntry.id;
      }
      date = opponent.entry_date;
    } else {
      return;
    }

    setProposalLoading(true);
    setProposalError('');
    try {
      await api.createProposal({
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        home_schedule_entry_id: homeEntryId,
        away_schedule_entry_id: awayEntryId,
        proposed_date: date,
        proposed_by_team_id: activeTeam.id,
        ice_slot_id: selectedIceSlotId || null,
        rink_id: proposalRinkId || null,
        message: message || null,
      });

      setProposalDialog({ open: false });
      setMessage('');
      setSelectedIceSlotId('');
      setProposalRinkId('');
      setProposalSlots([]);
      // Refresh
      if (tab === 0 && selectedEntry) handleSearch();
      if (tab === 1) api.getAutoMatches(activeTeam.id).then(setAutoMatches);
    } catch (e) {
      setProposalError(String(e));
    } finally {
      setProposalLoading(false);
    }
  };

  if (!activeTeam) {
    return <Alert variant="info">Select a team to search for opponents.</Alert>;
  }

  const standardLevels = standardLevelsForAgeGroup(activeTeam.age_group);
  const rangeMin = 10;
  const rangeMax = 200;
  const rangeProgress = Math.min(100, Math.max(0, ((maxDistance - rangeMin) / (rangeMax - rangeMin)) * 100));
  const rangeStyle = { '--rl-range-progress': `${rangeProgress}%` } as CSSProperties;

  return (
    <div className="space-y-4">
      <div>
        <div className="page-title">Find Opponents</div>
        <div className="page-subtitle">Search by open date or use auto-match suggestions.</div>
      </div>

      <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-900/50 dark:ring-1 dark:ring-slate-800/60">
        {[
          { label: 'Search by Date', value: 0 },
          { label: `Auto-Matches (${autoMatches.length})`, value: 1 },
        ].map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              tab === t.value
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950/40 dark:text-slate-100 dark:shadow-none dark:ring-1 dark:ring-slate-800/70'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 0 && (
        <div className="space-y-3">
          <Card className="p-4">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:items-end">
              <div className="lg:col-span-4">
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Open Date</label>
                <Select value={selectedEntryId} onChange={(e) => setSelectedEntryId(e.target.value)}>
                  <option value="">Select a date…</option>
                  {openDates.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.date} ({e.entry_type}) {formatTimeHHMM(e.time) || ''}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="lg:col-span-3">
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
                  onChange={(e) => setMaxDistance(parseInt(e.target.value))}
                  className="rl-range mt-2 w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 dark:focus-visible:ring-offset-slate-950"
                  style={rangeStyle}
                />
              </div>

              <div className="lg:col-span-3">
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Rink (optional)</label>
                <Select value={selectedRink} onChange={(e) => setSelectedRink(e.target.value)}>
                  <option value="">Any rink</option>
                  {rinks.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} — {r.city}, {r.state}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="lg:col-span-2">
                <Button type="button" className="w-full" onClick={handleSearch} disabled={!selectedEntry || loading}>
                  <SearchIcon className="h-4 w-4" />
                  {loading ? 'Searching…' : 'Search'}
                </Button>
              </div>

              <div className="lg:col-span-3">
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Level (optional)</label>
                <Select value={level} onChange={(e) => setLevel(e.target.value)}>
                  <option value="">Any level</option>
                  {standardLevels.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="lg:col-span-4">
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">MYHockey Ranking (optional)</label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    inputMode="numeric"
                    value={minRanking}
                    onChange={(e) => setMinRanking(e.target.value)}
                    placeholder="Min"
                  />
                  <Input
                    inputMode="numeric"
                    value={maxRanking}
                    onChange={(e) => setMaxRanking(e.target.value)}
                    placeholder="Max"
                  />
                </div>
              </div>
            </div>
          </Card>

          {searchError && <Alert variant="error" title="Search failed">{searchError}</Alert>}

          {availableSlots.length > 0 && selectedRink && selectedDate && (
            <Alert variant="info">
              <span className="font-medium">
                {availableSlots.length} available ice slot(s) at {rinks.find((r) => r.id === selectedRink)?.name}:
              </span>{' '}
              {availableSlots
                .map(
                  (s) =>
                    `${formatTimeHHMM(s.start_time) || s.start_time}${s.end_time ? '-' + (formatTimeHHMM(s.end_time) || s.end_time) : ''}${s.notes ? ' (' + s.notes + ')' : ''}`,
                )
                .join(', ')}
            </Alert>
          )}

          <Card className="overflow-hidden">
            <div className="divide-y divide-slate-200 bg-white md:hidden dark:divide-slate-800 dark:bg-slate-950/20">
              {results.map((r) => (
                <div key={r.schedule_entry_id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{r.team_name}</div>
                      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{r.association_name}</div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                        <span className="whitespace-nowrap">{r.age_group} {r.level}</span>
                        <span className="whitespace-nowrap">Ranking: {r.myhockey_ranking ?? '—'}</span>
                        <span className="whitespace-nowrap">{r.distance_miles != null ? `${r.distance_miles} mi` : '—'}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <Badge variant={r.entry_type === 'home' ? 'success' : 'info'}>{r.entry_type}</Badge>
                        <div className="text-sm text-slate-700 dark:text-slate-300">{formatTimeHHMM(r.entry_time) || ''}</div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      {r.has_existing_proposal ? (
                        <>
                          <Badge variant={r.existing_proposal_status === 'accepted' ? 'success' : 'warning'}>
                            {r.existing_proposal_status === 'accepted' ? 'Accepted' : 'Pending'}
                          </Badge>
                          <Button type="button" size="sm" variant="primary" onClick={() => navigate('/proposals')}>
                            View
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="primary"
                          onClick={() => openProposal({ opponent: r, myEntry: selectedEntry || undefined })}
                          disabled={!selectedEntry}
                        >
                          Propose
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {results.length === 0 && selectedEntry && !loading && (
                <div className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
                  No matching opponents found for this date/time. Matches require an exact time match and opposite home/away.
                </div>
              )}
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
                    <th className="px-4 py-3">Their Slot</th>
                    <th className="px-4 py-3 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/20">
                  {results.map((r) => (
                    <tr key={r.schedule_entry_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{r.team_name}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{r.association_name}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                        {r.age_group} {r.level}
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{r.myhockey_ranking ?? '-'}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{r.distance_miles != null ? `${r.distance_miles} mi` : '-'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Badge variant={r.entry_type === 'home' ? 'success' : 'info'}>{r.entry_type}</Badge>
                          <div className="text-slate-700 dark:text-slate-300">{formatTimeHHMM(r.entry_time) || ''}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          {r.has_existing_proposal ? (
                            <div className="flex items-center gap-2">
                              <Badge variant={r.existing_proposal_status === 'accepted' ? 'success' : 'warning'}>
                                {r.existing_proposal_status === 'accepted' ? 'Accepted' : 'Pending'}
                              </Badge>
                              <Button type="button" size="sm" variant="primary" onClick={() => navigate('/proposals')}>
                                View
                              </Button>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="primary"
                              onClick={() => openProposal({ opponent: r, myEntry: selectedEntry || undefined })}
                              disabled={!selectedEntry}
                            >
                              Propose
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}

                  {results.length === 0 && selectedEntry && !loading && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
                        No matching opponents found for this date/time. Matches require an exact time match and opposite home/away.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 1 && (
        <Card className="overflow-hidden">
          <div className="divide-y divide-slate-200 bg-white md:hidden dark:divide-slate-800 dark:bg-slate-950/20">
            {autoMatches.map((m, i) => (
              <div key={i} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{m.date}</div>

                    <div className="mt-2">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{m.home_team_name} <span className="text-xs font-medium text-slate-500 dark:text-slate-400">(H)</span></div>
                      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {m.home_association_name} {m.home_time && `@ ${formatTimeHHMM(m.home_time) || m.home_time}`}
                      </div>
                    </div>

                    <div className="mt-2">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{m.away_team_name} <span className="text-xs font-medium text-slate-500 dark:text-slate-400">(A)</span></div>
                      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {m.away_association_name} {m.away_time && `@ ${formatTimeHHMM(m.away_time) || m.away_time}`}
                      </div>
                    </div>

                    <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                      Distance: {m.distance_miles != null ? `${m.distance_miles} mi` : '—'}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    {m.has_existing_proposal ? (
                      <>
                        <Badge variant={m.existing_proposal_status === 'accepted' ? 'success' : 'warning'}>
                          {m.existing_proposal_status === 'accepted' ? 'Accepted' : 'Pending'}
                        </Badge>
                        <Button type="button" size="sm" variant="primary" onClick={() => navigate('/proposals')}>
                          View
                        </Button>
                      </>
                    ) : (
                      <Button type="button" size="sm" variant="primary" onClick={() => openProposal({ autoMatch: m })}>
                        Propose
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {autoMatches.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
                No auto-matches found. Add more open dates to find matches.
              </div>
            )}
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
                {autoMatches.map((m, i) => (
                  <tr key={i} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{m.date}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{m.home_team_name}</div>
                      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {m.home_association_name} {m.home_time && `@ ${formatTimeHHMM(m.home_time) || m.home_time}`}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{m.away_team_name}</div>
                      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {m.away_association_name} {m.away_time && `@ ${formatTimeHHMM(m.away_time) || m.away_time}`}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{m.distance_miles != null ? `${m.distance_miles} mi` : '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        {m.has_existing_proposal ? (
                          <div className="flex items-center gap-2">
                            <Badge variant={m.existing_proposal_status === 'accepted' ? 'success' : 'warning'}>
                              {m.existing_proposal_status === 'accepted' ? 'Accepted' : 'Pending'}
                            </Badge>
                            <Button type="button" size="sm" variant="primary" onClick={() => navigate('/proposals')}>
                              View
                            </Button>
                          </div>
                        ) : (
                          <Button type="button" size="sm" variant="primary" onClick={() => openProposal({ autoMatch: m })}>
                            Propose
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

                {autoMatches.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
                      No auto-matches found. Add more open dates to find matches.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={proposalDialog.open}
        onClose={() => { setProposalDialog({ open: false }); setProposalError(''); setProposalRinkId(''); setProposalSlots([]); setSelectedIceSlotId(''); setMessage(''); }}
        title="Propose Game"
        footer={
          <>
            <Button type="button" onClick={handlePropose} disabled={proposalLoading}>
              {proposalLoading ? 'Sending…' : 'Send Proposal'}
            </Button>
            <Button type="button" variant="outline" onClick={() => { setProposalDialog({ open: false }); setProposalError(''); }} disabled={proposalLoading}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {proposalError && <Alert variant="error" title="Proposal failed">{proposalError}</Alert>}
          <div className="text-sm text-slate-700 dark:text-slate-300">
            {proposalDialog.autoMatch
              ? `${proposalDialog.autoMatch.home_team_name} (H) vs ${proposalDialog.autoMatch.away_team_name} (A) on ${proposalDialog.autoMatch.date}`
              : proposalDialog.opponent
                ? `vs ${proposalDialog.opponent.team_name} on ${proposalDialog.opponent.entry_date}`
                : ''}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Rink (optional)</label>
              <Select
                value={proposalRinkId}
                onChange={(e) => {
                  setProposalRinkId(e.target.value);
                  setSelectedIceSlotId('');
                }}
              >
                <option value="">No rink</option>
                {rinks.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} — {r.city}, {r.state}
                  </option>
                ))}
              </Select>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Pick a rink to attach a location even if you don&apos;t have a specific ice slot yet.
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Ice Slot (optional)</label>
              <Select
                value={selectedIceSlotId}
                onChange={(e) => setSelectedIceSlotId(e.target.value)}
                disabled={!proposalRinkId || proposalSlots.length === 0}
              >
                <option value="">{!proposalRinkId ? 'Select a rink first' : proposalSlots.length === 0 ? 'No available slots' : 'No ice slot'}</option>
                {proposalSlots.map((s: IceSlot) => (
                  <option key={s.id} value={s.id}>
                    {formatTimeHHMM(s.start_time) || s.start_time}
                    {s.end_time ? '-' + (formatTimeHHMM(s.end_time) || s.end_time) : ''} {s.notes ? `(${s.notes})` : ''}
                  </option>
                ))}
              </Select>
              {proposalRinkId && proposalSlots.length === 0 && (
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  No available ice slots at this rink on {proposalDate}. You can still propose the rink without a slot.
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Message (optional)</label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
