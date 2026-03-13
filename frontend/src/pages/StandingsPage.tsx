import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSeason } from '../context/SeasonContext';
import { useTeam } from '../context/TeamContext';
import { api } from '../api/client';
import { CompetitionDivision, StandingsEntry } from '../types';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import PageHeader from '../components/PageHeader';

function divisionLabel(division: CompetitionDivision) {
  return `${division.competition_short_name} — ${division.name}`;
}

export default function StandingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeSeason, seasons, setActiveSeason } = useSeason();
  const { activeTeam } = useTeam();
  const effectiveSeason = activeSeason ?? seasons.find((season) => season.is_active) ?? seasons[0] ?? null;
  const [divisions, setDivisions] = useState<CompetitionDivision[]>([]);
  const [selectedDivisionId, setSelectedDivisionId] = useState('');
  const [standings, setStandings] = useState<StandingsEntry[]>([]);
  const [loadingDivisions, setLoadingDivisions] = useState(false);
  const [loadingStandings, setLoadingStandings] = useState(false);
  const [activeTeamStandingsDivisionId, setActiveTeamStandingsDivisionId] = useState<string | null>(null);
  const [lastResolvedTeamId, setLastResolvedTeamId] = useState<string | null>(null);
  const [lastResolvedSeasonId, setLastResolvedSeasonId] = useState<string | null>(null);
  const requestedDivisionId = searchParams.get('division') || '';

  useEffect(() => {
    if (!activeSeason && effectiveSeason) {
      setActiveSeason(effectiveSeason);
    }
  }, [activeSeason, effectiveSeason, setActiveSeason]);

  useEffect(() => {
    if (!effectiveSeason) {
      setDivisions([]);
      setSelectedDivisionId('');
      setActiveTeamStandingsDivisionId(null);
      setLastResolvedTeamId(null);
      setLastResolvedSeasonId(null);
      return;
    }
    let cancelled = false;

    const load = async () => {
      setLoadingDivisions(true);
      const divisionData = await api.getCompetitionDivisions({
        season_id: effectiveSeason.id,
        standings_enabled: 'true',
      });
      if (cancelled) return;
      setDivisions(divisionData);

      const divisionExists = (divisionId: string) => divisionData.some((division) => division.id === divisionId);
      const preferredDivisionIdForTeam = async () => {
        if (!activeTeam) return '';
        const memberships = await api.getTeamCompetitionMemberships(activeTeam.id, { season_id: effectiveSeason.id });
        if (cancelled) return '';
        return (
          memberships.find((membership) => membership.is_primary && membership.standings_enabled)?.competition_division_id
          ?? memberships.find((membership) => membership.standings_enabled)?.competition_division_id
          ?? ''
        );
      };
      const preferredDivisionId = await preferredDivisionIdForTeam();
      if (cancelled) return;
      setActiveTeamStandingsDivisionId(preferredDivisionId || null);

      const isFirstResolution = lastResolvedSeasonId === null && lastResolvedTeamId === null;
      const teamChanged = !isFirstResolution && lastResolvedTeamId !== (activeTeam?.id ?? null);
      const seasonChanged = !isFirstResolution && lastResolvedSeasonId !== effectiveSeason.id;
      let nextDivisionId = '';
      if (!teamChanged && !seasonChanged && requestedDivisionId && divisionExists(requestedDivisionId)) {
        nextDivisionId = requestedDivisionId;
      } else if (preferredDivisionId && divisionExists(preferredDivisionId)) {
        nextDivisionId = preferredDivisionId;
      } else if (!activeTeam) {
        nextDivisionId = divisionData[0]?.id || '';
      }
      if (nextDivisionId && !divisionExists(nextDivisionId)) {
        nextDivisionId = '';
      }

      if (!cancelled) {
        setSelectedDivisionId(nextDivisionId);
        setLastResolvedTeamId(activeTeam?.id ?? null);
        setLastResolvedSeasonId(effectiveSeason.id);
        setLoadingDivisions(false);
      }
    };

    load().catch(() => {
      if (!cancelled) setLoadingDivisions(false);
    });

    return () => {
      cancelled = true;
    };
  }, [activeTeam?.id, effectiveSeason?.id, lastResolvedSeasonId, lastResolvedTeamId, requestedDivisionId]);

  useEffect(() => {
    if (!selectedDivisionId) {
      setStandings([]);
      return;
    }
    let cancelled = false;
    setLoadingStandings(true);
    api.getCompetitionDivisionStandings(selectedDivisionId)
      .then((data) => {
        if (!cancelled) setStandings(data);
      })
      .finally(() => {
        if (!cancelled) setLoadingStandings(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDivisionId]);

  const selectedDivision = useMemo(
    () => divisions.find((division) => division.id === selectedDivisionId) || null,
    [divisions, selectedDivisionId],
  );

  useEffect(() => {
    const currentDivision = requestedDivisionId;
    if (selectedDivisionId && currentDivision !== selectedDivisionId) {
      setSearchParams({ division: selectedDivisionId }, { replace: true });
      return;
    }
    if (!selectedDivisionId && currentDivision) {
      setSearchParams({}, { replace: true });
    }
  }, [requestedDivisionId, selectedDivisionId, setSearchParams]);

  if (!effectiveSeason) {
    return (
      <div className="space-y-4">
        <PageHeader title="Standings" subtitle="No season is available yet." />
        <Alert variant="info">No seasons are available yet.</Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Standings"
        subtitle={
          selectedDivision
            ? `${effectiveSeason.name} Season • ${divisionLabel(selectedDivision)}`
            : `${effectiveSeason.name} Season Standings.`
        }
      />

      {loadingDivisions ? (
        <div className="py-10 text-center text-sm text-slate-600 dark:text-slate-400">Loading divisions…</div>
      ) : divisions.length === 0 ? (
        <Alert variant="info">No standings-enabled competition divisions are configured for this season.</Alert>
      ) : activeTeam && !activeTeamStandingsDivisionId && !selectedDivisionId ? (
        <Alert variant="info">The active team is not assigned to a standings-enabled competition in this season.</Alert>
      ) : !selectedDivisionId ? (
        <Alert variant="info">No standings division is selected for this season.</Alert>
      ) : loadingStandings ? (
        <div className="py-10 text-center text-sm text-slate-600 dark:text-slate-400">Loading standings…</div>
      ) : standings.length === 0 ? (
        <Alert variant="info">No standings data is available for this division yet.</Alert>
      ) : (
        <>
          <div className="space-y-2 md:hidden">
            {standings.map((entry, index) => (
              <Card key={entry.team_id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-slate-400 dark:text-slate-500">#{index + 1}</span>
                      <span className="font-medium text-slate-900 dark:text-slate-100">{entry.team_name}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{entry.association_name || '—'}</div>
                  </div>
                  <Badge variant="info">{entry.points} pts</Badge>
                </div>
                <div className="mt-2 flex gap-4 text-sm text-slate-700 dark:text-slate-300">
                  <span>GP: {entry.games_played}</span>
                  <span>W: {entry.wins}</span>
                  <span>L: {entry.losses}</span>
                  <span>T: {entry.ties}</span>
                </div>
              </Card>
            ))}
          </div>

          <Card className="hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-900/40 dark:text-slate-400">
                  <tr>
                    <th className="w-12 px-4 py-3">#</th>
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
                  {standings.map((entry, index) => (
                    <tr key={entry.team_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                      <td className="px-4 py-3 font-bold text-slate-400 dark:text-slate-500">{index + 1}</td>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{entry.team_name}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{entry.association_name || '—'}</td>
                      <td className="px-4 py-3 text-center text-slate-700 dark:text-slate-300">{entry.games_played}</td>
                      <td className="px-4 py-3 text-center text-slate-700 dark:text-slate-300">{entry.wins}</td>
                      <td className="px-4 py-3 text-center text-slate-700 dark:text-slate-300">{entry.losses}</td>
                      <td className="px-4 py-3 text-center text-slate-700 dark:text-slate-300">{entry.ties}</td>
                      <td className="px-4 py-3 text-center font-semibold text-slate-900 dark:text-slate-100">{entry.points}</td>
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
