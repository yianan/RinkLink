import { useState, useEffect, useMemo } from 'react';
import { useSeason } from '../context/SeasonContext';
import { api } from '../api/client';
import { StandingsEntry } from '../types';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import PageHeader from '../components/PageHeader';
import { cn } from '../lib/cn';

function ToggleChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
        active
          ? 'bg-cyan-100 text-cyan-800 ring-1 ring-cyan-300 dark:bg-cyan-900/40 dark:text-cyan-200 dark:ring-cyan-700'
          : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200',
      )}
    >
      {label}
    </button>
  );
}

export default function StandingsPage() {
  const { activeSeason, seasons } = useSeason();
  const [allStandings, setAllStandings] = useState<StandingsEntry[]>([]);
  const [selectedAgeGroups, setSelectedAgeGroups] = useState<Set<string>>(new Set());
  const [selectedLevels, setSelectedLevels] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeSeason) {
      setAllStandings([]);
      return;
    }
    setLoading(true);
    api.getStandings(activeSeason.id)
      .then((data) => {
        setAllStandings(data);
        // Select all by default
        setSelectedAgeGroups(new Set(data.map((s) => s.age_group)));
        setSelectedLevels(new Set(data.map((s) => s.level)));
      })
      .finally(() => setLoading(false));
  }, [activeSeason]);

  const ageGroups = useMemo(() => [...new Set(allStandings.map((s) => s.age_group))].sort(), [allStandings]);
  const levels = useMemo(() => [...new Set(allStandings.map((s) => s.level))].sort(), [allStandings]);

  const toggleAgeGroup = (ag: string) => {
    setSelectedAgeGroups((prev) => {
      const next = new Set(prev);
      if (next.has(ag)) next.delete(ag); else next.add(ag);
      return next;
    });
  };

  const toggleLevel = (l: string) => {
    setSelectedLevels((prev) => {
      const next = new Set(prev);
      if (next.has(l)) next.delete(l); else next.add(l);
      return next;
    });
  };

  const filtered = useMemo(() => {
    return allStandings.filter(
      (s) => selectedAgeGroups.has(s.age_group) && selectedLevels.has(s.level),
    );
  }, [allStandings, selectedAgeGroups, selectedLevels]);

  if (!activeSeason) {
    return (
      <div className="space-y-4">
        <PageHeader title="Standings" subtitle="Select a season from the header to view standings." />
        <Alert variant="info">
          {seasons.length === 0
            ? 'No seasons have been created yet. Create one from the Seasons page.'
            : 'Select a season from the dropdown in the header to view standings.'}
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Standings" subtitle={`${activeSeason.name} season standings.`} />

      {allStandings.length > 0 && (
        <div className="space-y-2">
          {ageGroups.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mr-1">Age:</span>
              {ageGroups.map((ag) => (
                <ToggleChip key={ag} label={ag} active={selectedAgeGroups.has(ag)} onClick={() => toggleAgeGroup(ag)} />
              ))}
            </div>
          )}
          {levels.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mr-1">Level:</span>
              {levels.map((l) => (
                <ToggleChip key={l} label={l} active={selectedLevels.has(l)} onClick={() => toggleLevel(l)} />
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="py-10 text-center text-sm text-slate-600 dark:text-slate-400">Loading standings...</div>
      ) : filtered.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-600 dark:text-slate-400">No standings data for this selection.</div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {filtered.map((s, i) => (
              <Card key={s.team_id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-slate-400 dark:text-slate-500">#{i + 1}</span>
                      <span className="font-medium text-slate-900 dark:text-slate-100">{s.team_name}</span>
                    </div>
                  </div>
                  <Badge variant="info">{s.points} pts</Badge>
                </div>
                <div className="mt-2 flex gap-4 text-sm text-slate-700 dark:text-slate-300">
                  <span>GP: {s.games_played}</span>
                  <span>W: {s.wins}</span>
                  <span>L: {s.losses}</span>
                  <span>T: {s.ties}</span>
                </div>
              </Card>
            ))}
          </div>

          {/* Desktop table */}
          <Card className="hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-900/40 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3 w-12">#</th>
                    <th className="px-4 py-3">Team</th>
                    <th className="px-4 py-3">Association</th>
                    <th className="px-4 py-3 text-center">GP</th>
                    <th className="px-4 py-3 text-center">W</th>
                    <th className="px-4 py-3 text-center">L</th>
                    <th className="px-4 py-3 text-center">T</th>
                    <th className="px-4 py-3 text-center">Pts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/20">
                  {filtered.map((s, i) => (
                    <tr key={s.team_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                      <td className="px-4 py-3 font-bold text-slate-400 dark:text-slate-500">{i + 1}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{s.team_name}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{s.association_name || '—'}</td>
                      <td className="px-4 py-3 text-center text-slate-700 dark:text-slate-300">{s.games_played}</td>
                      <td className="px-4 py-3 text-center text-slate-700 dark:text-slate-300">{s.wins}</td>
                      <td className="px-4 py-3 text-center text-slate-700 dark:text-slate-300">{s.losses}</td>
                      <td className="px-4 py-3 text-center text-slate-700 dark:text-slate-300">{s.ties}</td>
                      <td className="px-4 py-3 text-center font-semibold text-slate-900 dark:text-slate-100">{s.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
