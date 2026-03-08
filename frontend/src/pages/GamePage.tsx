import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MapPin, Navigation, Plus, Save, ShieldCheck, Trash2, UtensilsCrossed } from 'lucide-react';

const GAME_TYPES = [
  { value: '', label: '—' },
  { value: 'league', label: 'League' },
  { value: 'non_league', label: 'Non-League' },
  { value: 'tournament', label: 'Tournament' },
];

const PENALTY_OPTIONS = [
  'Tripping',
  'Hooking',
  'Slashing',
  'Holding',
  'Interference',
  'Roughing',
  'Cross-checking',
  'Boarding',
  'Checking from behind',
  'Charging',
  'High-sticking',
  'Too many players',
  'Unsportsmanlike conduct',
  'Delay of game',
  'Other',
];
import { api } from '../api/client';
import {
  Game,
  GameGoalieStatUpsert,
  GamePlayerStatUpsert,
  GameScoresheet,
  Player,
} from '../types';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Textarea } from '../components/ui/Textarea';
import { formatTimeHHMM } from '../lib/time';

function formatDateLabel(d: string) {
  return new Date(d + 'T00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatLocalDateISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function mapsQueryUrl(query: string) {
  const url = new URL('https://www.google.com/maps/search/');
  url.searchParams.set('api', '1');
  url.searchParams.set('query', query);
  return url.toString();
}

function getStatusLabel(game: Game) {
  if (game.status === 'confirmed') return 'Both confirmed';
  if (game.status === 'final') return 'Final';
  if (game.status === 'cancelled') return 'Cancelled';
  if (game.home_weekly_confirmed) return 'Home confirmed';
  if (game.away_weekly_confirmed) return 'Away confirmed';
  return 'Scheduled';
}

function digitsOnly(value: string) {
  return value.replace(/\D+/g, '');
}

function blockNonIntegerNumberKeys(event: React.KeyboardEvent<HTMLInputElement>) {
  if (['e', 'E', '+', '-', '.'].includes(event.key)) {
    event.preventDefault();
  }
}

export default function GamePage() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scoresheet, setScoresheet] = useState<GameScoresheet | null>(null);
  const [homePlayers, setHomePlayers] = useState<Player[]>([]);
  const [awayPlayers, setAwayPlayers] = useState<Player[]>([]);

  const [scoreDraft, setScoreDraft] = useState({ home: '', away: '' });
  const [statDraft, setStatDraft] = useState<Record<string, { goals: number; assists: number; shots: number; team_id: string }>>({});

  const [penaltyForm, setPenaltyForm] = useState({ team_id: '', player_id: '', penalty_type: '', custom_penalty_type: '', minutes: '' });

  const [goalieDraft, setGoalieDraft] = useState<Record<string, { player_id: string; saves: string; shootout_shots: string; shootout_saves: string }>>({});

  const [signatureDraft, setSignatureDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!gameId) return;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const ss = await api.getScoresheet(gameId);
        setScoresheet(ss);

        setScoreDraft({
          home: ss.game.home_score != null ? String(ss.game.home_score) : '',
          away: ss.game.away_score != null ? String(ss.game.away_score) : '',
        });

        const [hp, ap] = await Promise.all([
          api.getPlayers(ss.game.home_team_id),
          api.getPlayers(ss.game.away_team_id),
        ]);
        setHomePlayers(hp);
        setAwayPlayers(ap);

        const draft: Record<string, { goals: number; assists: number; shots: number; team_id: string }> = {};
        ss.player_stats.forEach((s) => {
          draft[s.player_id] = { goals: s.goals, assists: s.assists, shots: s.shots_on_goal, team_id: s.team_id };
        });
        setStatDraft(draft);

        const goalieByTeam: Record<string, { player_id: string; saves: string; shootout_shots: string; shootout_saves: string }> = {};
        const latestByTeam = new Map<string, typeof ss.goalie_stats[number]>();
        ss.goalie_stats.forEach((g) => {
          latestByTeam.set(g.team_id, g);
        });
        for (const [teamId, g] of latestByTeam.entries()) {
          goalieByTeam[teamId] = {
            player_id: g.player_id,
            saves: String(g.saves),
            shootout_shots: String(g.shootout_shots),
            shootout_saves: String(g.shootout_saves),
          };
        }
        setGoalieDraft(goalieByTeam);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [gameId]);

  const game = scoresheet?.game || null;

  const homeName = game?.home_team_name || 'Home';
  const awayName = game?.away_team_name || 'Away';

  const rinkLabel = useMemo(() => {
    if (!game) return '';
    if (game.rink_name) {
      const parts = [game.rink_name, game.rink_address, [game.rink_city, game.rink_state, game.rink_zip].filter(Boolean).join(' ')].filter(Boolean);
      return parts.join(', ');
    }
    if (game.location_label) return game.location_label;
    return '';
  }, [game]);

  const playerName = (id: string | null) => {
    if (!id) return '—';
    const all = [...homePlayers, ...awayPlayers];
    const p = all.find((x) => x.id === id);
    if (!p) return '—';
    return `${p.first_name} ${p.last_name}`;
  };

  const handleSaveScore = async () => {
    if (!gameId || !game) return;
    const home_score = scoreDraft.home === '' ? null : Number(scoreDraft.home);
    const away_score = scoreDraft.away === '' ? null : Number(scoreDraft.away);
    const updated = await api.updateGame(gameId, { home_score, away_score });
    setScoresheet((ss) => (ss ? { ...ss, game: { ...ss.game, ...updated } } : ss));
  };

  const handleTypeChange = async (game_type: string) => {
    if (!gameId) return;
    const updated = await api.updateGame(gameId, { game_type: (game_type || null) as Game['game_type'] });
    setScoresheet((ss) => (ss ? { ...ss, game: { ...ss.game, ...updated } } : ss));
  };

  const handleSaveStats = async () => {
    if (!gameId || !game) return;
    const stats: GamePlayerStatUpsert[] = [];
    for (const p of homePlayers) {
      const v = statDraft[p.id] || { goals: 0, assists: 0, shots: 0, team_id: game.home_team_id };
      stats.push({ team_id: game.home_team_id, player_id: p.id, goals: v.goals, assists: v.assists, shots_on_goal: v.shots });
    }
    for (const p of awayPlayers) {
      const v = statDraft[p.id] || { goals: 0, assists: 0, shots: 0, team_id: game.away_team_id };
      stats.push({ team_id: game.away_team_id, player_id: p.id, goals: v.goals, assists: v.assists, shots_on_goal: v.shots });
    }
    const updated = await api.upsertPlayerStats(gameId, stats);
    setScoresheet((ss) => (ss ? { ...ss, player_stats: updated } : ss));
  };

  const handleAddPenalty = async () => {
    if (!gameId || !game) return;
    const resolvedPenaltyType =
      penaltyForm.penalty_type === 'Other' ? penaltyForm.custom_penalty_type.trim() : penaltyForm.penalty_type.trim();
    if (!penaltyForm.team_id || !resolvedPenaltyType) return;
    const created = await api.createPenalty(gameId, {
      team_id: penaltyForm.team_id,
      player_id: penaltyForm.player_id || null,
      penalty_type: resolvedPenaltyType,
      minutes: Number(penaltyForm.minutes),
    });
    setScoresheet((ss) => (ss ? { ...ss, penalties: [...ss.penalties, created] } : ss));
    setPenaltyForm({ team_id: '', player_id: '', penalty_type: '', custom_penalty_type: '', minutes: '' });
  };

  const handleDeletePenalty = async (id: string) => {
    await api.deletePenalty(id);
    setScoresheet((ss) => (ss ? { ...ss, penalties: ss.penalties.filter((p) => p.id !== id) } : ss));
    setPenaltyForm({ team_id: '', player_id: '', penalty_type: '', custom_penalty_type: '', minutes: '' });
  };

  const handleSaveGoalies = async () => {
    if (!gameId || !game) return;
    const stats: GameGoalieStatUpsert[] = [];
    for (const teamId of [game.home_team_id, game.away_team_id]) {
      const d = goalieDraft[teamId];
      if (!d || !d.player_id) continue;
      stats.push({
        team_id: teamId,
        player_id: d.player_id,
        saves: Number(d.saves || '0'),
        shootout_shots: Number(d.shootout_shots || '0'),
        shootout_saves: Number(d.shootout_saves || '0'),
      });
    }
    const updated = await api.upsertGoalieStats(gameId, stats);
    setScoresheet((ss) => (ss ? { ...ss, goalie_stats: updated } : ss));
  };

  const handleSign = async (role: string, team_id: string | null) => {
    if (!gameId) return;
    const signer_name = (signatureDraft[role] || '').trim();
    if (!signer_name) return;
    const signed = await api.signGame(gameId, { role, signer_name, team_id: team_id || null });
    setScoresheet((ss) => {
      if (!ss) return ss;
      const next = ss.signatures.filter((s) => s.role !== role);
      next.push(signed);
      next.sort((a, b) => a.role.localeCompare(b.role));
      return { ...ss, signatures: next };
    });
  };

  if (loading) {
    return <Alert variant="info">Loading game…</Alert>;
  }

  if (error) {
    return <Alert variant="error">{error}</Alert>;
  }

  if (!scoresheet || !game) {
    return <Alert variant="error">Game not found.</Alert>;
  }

  const signatureRoles = [
    { role: 'home_manager', label: `${homeName} Manager/Coach`, team_id: game.home_team_id },
    { role: 'away_manager', label: `${awayName} Manager/Coach`, team_id: game.away_team_id },
    { role: 'referee_1', label: 'Referee 1', team_id: null },
    { role: 'referee_2', label: 'Referee 2', team_id: null },
  ];

  const restaurantsUrl = rinkLabel ? mapsQueryUrl(`restaurants near ${rinkLabel}`) : null;
  const thingsUrl = rinkLabel ? mapsQueryUrl(`things to do near ${rinkLabel}`) : null;
  const directionsUrl = rinkLabel ? mapsQueryUrl(rinkLabel) : null;
  const statusLabel = getStatusLabel(game);

  const thisWeekStart = (() => {
    const d = new Date();
    const day = d.getDay(); // 0=Sun
    const diff = (day + 6) % 7;
    const monday = new Date(d);
    monday.setDate(d.getDate() - diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
  })();
  const thisWeekEnd = (() => {
    const sunday = new Date(thisWeekStart);
    sunday.setDate(thisWeekStart.getDate() + 6);
    return sunday;
  })();
  const isThisWeek = game.date >= formatLocalDateISO(thisWeekStart) && game.date <= formatLocalDateISO(thisWeekEnd);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/games')}
            aria-label="Back to Games"
            title="Back to Games"
            className="shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="page-title">Game Scoresheet</div>
          <div className="page-subtitle">
            {formatDateLabel(game.date)} {formatTimeHHMM(game.time) || ''} • {homeName} vs {awayName}
            {isThisWeek && <span className="ml-2 text-xs font-medium text-brand-700 dark:text-cyan-300">This week</span>}
          </div>
        </div>
      </div>

      <Card className="overflow-hidden border-cyan-200/40 bg-gradient-to-br from-white via-cyan-50/50 to-violet-50/40 p-4 dark:border-cyan-900/30 dark:from-slate-950 dark:via-cyan-950/15 dark:to-violet-950/20">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Game Details</div>
            <div className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              <span>{homeName}</span>
              <span className="mx-2 text-slate-400 dark:text-slate-500">vs</span>
              <span>{awayName}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Badge variant={game.home_weekly_confirmed ? 'success' : 'outline'}>{homeName} confirmed</Badge>
              <Badge variant={game.away_weekly_confirmed ? 'success' : 'outline'}>{awayName} confirmed</Badge>
              <Badge variant="outline">{statusLabel}</Badge>
            </div>
            {rinkLabel ? (
              <div className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                <MapPin className="mt-0.5 h-4 w-4 text-slate-500 dark:text-slate-400" />
                <div className="min-w-0">{rinkLabel}</div>
              </div>
            ) : (
              <div className="text-sm text-slate-600 dark:text-slate-400">No location attached yet. Add a rink or ice slot when proposing a game.</div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={game.game_type ?? ''}
              onChange={(e) => handleTypeChange(e.target.value)}
              className="w-36"
            >
              {GAME_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </div>
        </div>

        {directionsUrl && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => window.open(directionsUrl, '_blank', 'noopener,noreferrer')}
              aria-label="Open directions"
              title="Directions"
            >
              <Navigation className="h-4 w-4" />
            </Button>
            {restaurantsUrl && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => window.open(restaurantsUrl, '_blank', 'noopener,noreferrer')}
                aria-label="Open restaurants nearby"
                title="Restaurants Nearby"
              >
                <UtensilsCrossed className="h-4 w-4" />
              </Button>
            )}
            {thingsUrl && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => window.open(thingsUrl, '_blank', 'noopener,noreferrer')}
                aria-label="Open things to do nearby"
                title="Things To Do Nearby"
              >
                <MapPin className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">Score</div>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Update the score as the game progresses. Final scores remain editable for corrections.
            </div>
          </div>
          <Button type="button" size="icon" onClick={handleSaveScore} aria-label="Save score" title="Save score">
            <Save className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/20">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{homeName}</div>
            <div className="mt-2">
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={scoreDraft.home}
                onChange={(e) => setScoreDraft((s) => ({ ...s, home: digitsOnly(e.target.value) }))}
                placeholder="0"
                className="max-w-xs"
              />
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/20">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{awayName}</div>
            <div className="mt-2">
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={scoreDraft.away}
                onChange={(e) => setScoreDraft((s) => ({ ...s, away: digitsOnly(e.target.value) }))}
                placeholder="0"
                className="max-w-xs"
              />
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">Player Stats</div>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">Goals, assists, shots on goal.</div>
          </div>
          <Button type="button" size="icon" onClick={handleSaveStats} aria-label="Save player stats" title="Save player stats">
            <Save className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[
            { teamId: game.home_team_id, title: homeName, players: homePlayers },
            { teamId: game.away_team_id, title: awayName, players: awayPlayers },
          ].map((t) => (
            <Card key={t.teamId} className="overflow-hidden border-slate-200 dark:border-slate-800">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/40">
                <div className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">{t.title}</div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-white text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-950/20 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-2">#</th>
                      <th className="px-4 py-2">Player</th>
                      <th className="px-4 py-2">G</th>
                      <th className="px-4 py-2">A</th>
                      <th className="px-4 py-2">SOG</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/20">
                    {t.players.map((p) => {
                      const v = statDraft[p.id] || { goals: 0, assists: 0, shots: 0, team_id: t.teamId };
                      return (
                        <tr key={p.id}>
                          <td className="px-4 py-2 font-medium text-slate-900 dark:text-slate-100">{p.jersey_number ?? '-'}</td>
                          <td className="px-4 py-2 text-slate-700 dark:text-slate-300">
                            {p.first_name} {p.last_name}
                            {p.position ? <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">{p.position}</span> : null}
                          </td>
                          <td className="px-4 py-2">
                            <Input
                              type="number"
                              min="0"
                              step="1"
                              inputMode="numeric"
                              value={String(v.goals)}
                              onKeyDown={blockNonIntegerNumberKeys}
                              onChange={(e) => setStatDraft((d) => ({
                                ...d,
                                [p.id]: { ...v, team_id: t.teamId, goals: Number(digitsOnly(e.target.value) || '0') },
                              }))}
                              className="h-9 w-16"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <Input
                              type="number"
                              min="0"
                              step="1"
                              inputMode="numeric"
                              value={String(v.assists)}
                              onKeyDown={blockNonIntegerNumberKeys}
                              onChange={(e) => setStatDraft((d) => ({
                                ...d,
                                [p.id]: { ...v, team_id: t.teamId, assists: Number(digitsOnly(e.target.value) || '0') },
                              }))}
                              className="h-9 w-16"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <Input
                              type="number"
                              min="0"
                              step="1"
                              inputMode="numeric"
                              value={String(v.shots)}
                              onKeyDown={blockNonIntegerNumberKeys}
                              onChange={(e) => setStatDraft((d) => ({
                                ...d,
                                [p.id]: { ...v, team_id: t.teamId, shots: Number(digitsOnly(e.target.value) || '0') },
                              }))}
                              className="h-9 w-16"
                            />
                          </td>
                        </tr>
                      );
                    })}

                    {t.players.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-600 dark:text-slate-400">
                          No roster for this team yet. Add players on the Roster page.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <div className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">Penalties</div>
        <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">Type and duration (minutes).</div>

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-3">
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Team</label>
            <Select
              value={penaltyForm.team_id}
              onChange={(e) => setPenaltyForm((f) => ({ ...f, team_id: e.target.value, player_id: '' }))}
            >
              <option value="">Select…</option>
              <option value={game.home_team_id}>{homeName}</option>
              <option value={game.away_team_id}>{awayName}</option>
            </Select>
          </div>
          <div className="lg:col-span-3">
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Player (optional)</label>
            <Select
              value={penaltyForm.player_id}
              onChange={(e) => setPenaltyForm((f) => ({ ...f, player_id: e.target.value }))}
              disabled={!penaltyForm.team_id}
            >
              <option value="">Unknown / Not on roster</option>
              {(penaltyForm.team_id === game.home_team_id ? homePlayers : awayPlayers).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.jersey_number != null ? `#${p.jersey_number} ` : ''}{p.first_name} {p.last_name}
                </option>
              ))}
            </Select>
          </div>
          <div className="lg:col-span-4">
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Penalty Type</label>
            <div className="space-y-2">
              <Select
                value={penaltyForm.penalty_type}
                onChange={(e) => setPenaltyForm((f) => ({
                  ...f,
                  penalty_type: e.target.value,
                  custom_penalty_type: e.target.value === 'Other' ? f.custom_penalty_type : '',
                }))}
              >
                <option value="">Select…</option>
                {PENALTY_OPTIONS.map((penalty) => (
                  <option key={penalty} value={penalty}>{penalty}</option>
                ))}
              </Select>
              {penaltyForm.penalty_type === 'Other' && (
                <Textarea
                  value={penaltyForm.custom_penalty_type}
                  onChange={(e) => setPenaltyForm((f) => ({ ...f, custom_penalty_type: e.target.value }))}
                  rows={1}
                  placeholder="Enter custom penalty"
                />
              )}
            </div>
          </div>
          <div className="lg:col-span-1">
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Min</label>
            <Input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={penaltyForm.minutes}
              onChange={(e) => setPenaltyForm((f) => ({ ...f, minutes: digitsOnly(e.target.value) }))}
            />
          </div>
          <div className="lg:col-span-1">
            <Button
              type="button"
              size="icon"
              onClick={handleAddPenalty}
              disabled={
                !penaltyForm.team_id ||
                !(
                  penaltyForm.penalty_type.trim() &&
                  (penaltyForm.penalty_type !== 'Other' || penaltyForm.custom_penalty_type.trim()) &&
                  penaltyForm.minutes.trim() &&
                  Number(penaltyForm.minutes) >= 1
                )
              }
              aria-label="Add penalty"
              title="Add penalty"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/20">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-900/40 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Team</th>
                <th className="px-4 py-3">Player</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Min</th>
                <th className="px-4 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/20">
              {scoresheet.penalties.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{p.team_id === game.home_team_id ? homeName : awayName}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{playerName(p.player_id)}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{p.penalty_type}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{p.minutes}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <Button type="button" variant="ghost" size="icon" onClick={() => handleDeletePenalty(p.id)} aria-label="Delete penalty">
                        <Trash2 className="h-4 w-4 text-rose-600" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}

              {scoresheet.penalties.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-600 dark:text-slate-400">
                    No penalties recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">Goaltender Stats</div>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">Saves and shootouts.</div>
          </div>
          <Button type="button" size="icon" onClick={handleSaveGoalies} aria-label="Save goalie stats" title="Save goalie stats">
            <Save className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[
            { teamId: game.home_team_id, title: homeName, players: homePlayers },
            { teamId: game.away_team_id, title: awayName, players: awayPlayers },
          ].map((t) => {
            const d = goalieDraft[t.teamId] || { player_id: '', saves: '0', shootout_shots: '0', shootout_saves: '0' };
            return (
              <Card key={t.teamId} className="border-slate-200 p-4 dark:border-slate-800">
                <div className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">{t.title}</div>
                <div className="mt-3 grid grid-cols-1 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Goalie</label>
                    <Select
                      value={d.player_id}
                      onChange={(e) => setGoalieDraft((g) => ({ ...g, [t.teamId]: { ...d, player_id: e.target.value } }))}
                      disabled={t.players.length === 0}
                    >
                      <option value="">Select…</option>
                      {t.players.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.jersey_number != null ? `#${p.jersey_number} ` : ''}{p.first_name} {p.last_name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Saves</label>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        value={d.saves}
                        onKeyDown={blockNonIntegerNumberKeys}
                        onChange={(e) => setGoalieDraft((g) => ({ ...g, [t.teamId]: { ...d, saves: digitsOnly(e.target.value) } }))}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">SO Shots</label>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        value={d.shootout_shots}
                        onKeyDown={blockNonIntegerNumberKeys}
                        onChange={(e) => setGoalieDraft((g) => ({ ...g, [t.teamId]: { ...d, shootout_shots: digitsOnly(e.target.value) } }))}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">SO Saves</label>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        value={d.shootout_saves}
                        onKeyDown={blockNonIntegerNumberKeys}
                        onChange={(e) => setGoalieDraft((g) => ({ ...g, [t.teamId]: { ...d, shootout_saves: digitsOnly(e.target.value) } }))}
                      />
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </Card>

      <Card className="p-4">
        <div className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">Verification Signatures</div>
        <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">Digital signatures from coaches/managers and referees.</div>

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {signatureRoles.map((r) => {
            const existing = scoresheet.signatures.find((s) => s.role === r.role) || null;
            return (
              <Card key={r.role} className="border-slate-200 p-4 dark:border-slate-800">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">{r.label}</div>
                    {existing ? (
                      <div className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                        Signed by <span className="font-medium text-slate-900 dark:text-slate-100">{existing.signer_name}</span>{' '}
                        <span className="text-slate-500 dark:text-slate-400">({new Date(existing.signed_at).toLocaleString()})</span>
                      </div>
                    ) : (
                      <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">Not signed yet.</div>
                    )}
                  </div>
                  {existing ? <ShieldCheck className="h-5 w-5 text-emerald-600" /> : <div className="h-5 w-5" />}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <Input
                    value={signatureDraft[r.role] || ''}
                    onChange={(e) => setSignatureDraft((d) => ({ ...d, [r.role]: e.target.value }))}
                    placeholder="Type full name"
                    className="min-w-0 flex-1"
                  />
                  <Button
                    type="button"
                    size="icon"
                    onClick={() => handleSign(r.role, r.team_id)}
                    aria-label={`Sign as ${r.label}`}
                    title={`Sign as ${r.label}`}
                  >
                    <ShieldCheck className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
