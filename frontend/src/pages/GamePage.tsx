import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MapPin, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import {
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

  const [penaltyForm, setPenaltyForm] = useState({ team_id: '', player_id: '', penalty_type: '', minutes: '2' });

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
    if (!penaltyForm.team_id || !penaltyForm.penalty_type.trim()) return;
    const created = await api.createPenalty(gameId, {
      team_id: penaltyForm.team_id,
      player_id: penaltyForm.player_id || null,
      penalty_type: penaltyForm.penalty_type.trim(),
      minutes: Number(penaltyForm.minutes || '2'),
    });
    setScoresheet((ss) => (ss ? { ...ss, penalties: [...ss.penalties, created] } : ss));
    setPenaltyForm({ team_id: penaltyForm.team_id, player_id: '', penalty_type: '', minutes: '2' });
  };

  const handleDeletePenalty = async (id: string) => {
    await api.deletePenalty(id);
    setScoresheet((ss) => (ss ? { ...ss, penalties: ss.penalties.filter((p) => p.id !== id) } : ss));
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="page-title">Game Scoresheet</div>
          <div className="page-subtitle">
            {formatDateLabel(game.date)} {game.time || ''} • {homeName} vs {awayName}
            {isThisWeek && <span className="ml-2 text-xs font-medium text-brand-700">This week</span>}
          </div>
        </div>
        <Button type="button" variant="outline" onClick={() => navigate('/games')}>
          Back to Games
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm font-semibold tracking-tight text-slate-900">Game Details</div>
            <div className="text-sm text-slate-700">
              <span className="font-medium text-slate-900">{homeName}</span> (Home) vs{' '}
              <span className="font-medium text-slate-900">{awayName}</span> (Away)
            </div>
            {rinkLabel ? (
              <div className="flex items-start gap-2 text-sm text-slate-700">
                <MapPin className="mt-0.5 h-4 w-4 text-slate-500" />
                <div className="min-w-0">{rinkLabel}</div>
              </div>
            ) : (
              <div className="text-sm text-slate-600">No location attached yet. Add a rink or ice slot when proposing a game.</div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={game.home_weekly_confirmed ? 'success' : 'outline'}>{homeName} confirmed</Badge>
            <Badge variant={game.away_weekly_confirmed ? 'success' : 'outline'}>{awayName} confirmed</Badge>
            <Badge variant="outline">{game.status}</Badge>
          </div>
        </div>

        {directionsUrl && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={() => window.open(directionsUrl, '_blank', 'noopener,noreferrer')}>
              Directions
            </Button>
            {restaurantsUrl && (
              <Button type="button" variant="outline" onClick={() => window.open(restaurantsUrl, '_blank', 'noopener,noreferrer')}>
                Restaurants Nearby
              </Button>
            )}
            {thingsUrl && (
              <Button type="button" variant="outline" onClick={() => window.open(thingsUrl, '_blank', 'noopener,noreferrer')}>
                Things To Do Nearby
              </Button>
            )}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm font-semibold tracking-tight text-slate-900">Score</div>
            <div className="mt-1 text-sm text-slate-600">Update the score as the game progresses.</div>
          </div>
          <Button type="button" onClick={handleSaveScore}>
            <Save className="h-4 w-4" />
            Save Score
          </Button>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-xs font-medium text-slate-500">{homeName}</div>
            <div className="mt-2">
              <Input
                inputMode="numeric"
                value={scoreDraft.home}
                onChange={(e) => setScoreDraft((s) => ({ ...s, home: e.target.value }))}
                placeholder="0"
              />
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-xs font-medium text-slate-500">{awayName}</div>
            <div className="mt-2">
              <Input
                inputMode="numeric"
                value={scoreDraft.away}
                onChange={(e) => setScoreDraft((s) => ({ ...s, away: e.target.value }))}
                placeholder="0"
              />
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm font-semibold tracking-tight text-slate-900">Player Stats</div>
            <div className="mt-1 text-sm text-slate-600">Goals, assists, shots on goal.</div>
          </div>
          <Button type="button" onClick={handleSaveStats}>
            <Save className="h-4 w-4" />
            Save Stats
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[
            { teamId: game.home_team_id, title: homeName, players: homePlayers },
            { teamId: game.away_team_id, title: awayName, players: awayPlayers },
          ].map((t) => (
            <Card key={t.teamId} className="overflow-hidden border-slate-200">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-sm font-semibold tracking-tight text-slate-900">{t.title}</div>
              </div>
              <div className="overflow-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-white text-xs uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="px-4 py-2">#</th>
                      <th className="px-4 py-2">Player</th>
                      <th className="px-4 py-2">G</th>
                      <th className="px-4 py-2">A</th>
                      <th className="px-4 py-2">SOG</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {t.players.map((p) => {
                      const v = statDraft[p.id] || { goals: 0, assists: 0, shots: 0, team_id: t.teamId };
                      return (
                        <tr key={p.id}>
                          <td className="px-4 py-2 font-medium text-slate-900">{p.jersey_number ?? '-'}</td>
                          <td className="px-4 py-2 text-slate-700">
                            {p.first_name} {p.last_name}
                            {p.position ? <span className="ml-2 text-xs text-slate-500">{p.position}</span> : null}
                          </td>
                          <td className="px-4 py-2">
                            <Input
                              inputMode="numeric"
                              value={String(v.goals)}
                              onChange={(e) => setStatDraft((d) => ({
                                ...d,
                                [p.id]: { ...v, team_id: t.teamId, goals: Number(e.target.value || '0') },
                              }))}
                              className="h-9 w-16"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <Input
                              inputMode="numeric"
                              value={String(v.assists)}
                              onChange={(e) => setStatDraft((d) => ({
                                ...d,
                                [p.id]: { ...v, team_id: t.teamId, assists: Number(e.target.value || '0') },
                              }))}
                              className="h-9 w-16"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <Input
                              inputMode="numeric"
                              value={String(v.shots)}
                              onChange={(e) => setStatDraft((d) => ({
                                ...d,
                                [p.id]: { ...v, team_id: t.teamId, shots: Number(e.target.value || '0') },
                              }))}
                              className="h-9 w-16"
                            />
                          </td>
                        </tr>
                      );
                    })}

                    {t.players.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-600">
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
        <div className="text-sm font-semibold tracking-tight text-slate-900">Penalties</div>
        <div className="mt-1 text-sm text-slate-600">Type and duration (minutes).</div>

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-3">
            <label className="mb-1 block text-xs font-medium text-slate-600">Team</label>
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
            <label className="mb-1 block text-xs font-medium text-slate-600">Player (optional)</label>
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
            <label className="mb-1 block text-xs font-medium text-slate-600">Penalty Type</label>
            <Textarea
              value={penaltyForm.penalty_type}
              onChange={(e) => setPenaltyForm((f) => ({ ...f, penalty_type: e.target.value }))}
              rows={1}
            />
          </div>
          <div className="lg:col-span-1">
            <label className="mb-1 block text-xs font-medium text-slate-600">Min</label>
            <Input
              inputMode="numeric"
              value={penaltyForm.minutes}
              onChange={(e) => setPenaltyForm((f) => ({ ...f, minutes: e.target.value }))}
            />
          </div>
          <div className="lg:col-span-1">
            <Button type="button" onClick={handleAddPenalty} disabled={!penaltyForm.team_id || !penaltyForm.penalty_type.trim()}>
              Add
            </Button>
          </div>
        </div>

        <div className="mt-4 overflow-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">Team</th>
                <th className="px-4 py-3">Player</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Min</th>
                <th className="px-4 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {scoresheet.penalties.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 text-slate-700">{p.team_id === game.home_team_id ? homeName : awayName}</td>
                  <td className="px-4 py-3 text-slate-700">{playerName(p.player_id)}</td>
                  <td className="px-4 py-3 text-slate-700">{p.penalty_type}</td>
                  <td className="px-4 py-3 text-slate-700">{p.minutes}</td>
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
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-600">
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
            <div className="text-sm font-semibold tracking-tight text-slate-900">Goaltender Stats</div>
            <div className="mt-1 text-sm text-slate-600">Saves and shootouts.</div>
          </div>
          <Button type="button" onClick={handleSaveGoalies}>
            <Save className="h-4 w-4" />
            Save Goalies
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[
            { teamId: game.home_team_id, title: homeName, players: homePlayers },
            { teamId: game.away_team_id, title: awayName, players: awayPlayers },
          ].map((t) => {
            const d = goalieDraft[t.teamId] || { player_id: '', saves: '0', shootout_shots: '0', shootout_saves: '0' };
            return (
              <Card key={t.teamId} className="border-slate-200 p-4">
                <div className="text-sm font-semibold tracking-tight text-slate-900">{t.title}</div>
                <div className="mt-3 grid grid-cols-1 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Goalie</label>
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
                      <label className="mb-1 block text-xs font-medium text-slate-600">Saves</label>
                      <Input
                        inputMode="numeric"
                        value={d.saves}
                        onChange={(e) => setGoalieDraft((g) => ({ ...g, [t.teamId]: { ...d, saves: e.target.value } }))}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">SO Shots</label>
                      <Input
                        inputMode="numeric"
                        value={d.shootout_shots}
                        onChange={(e) => setGoalieDraft((g) => ({ ...g, [t.teamId]: { ...d, shootout_shots: e.target.value } }))}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">SO Saves</label>
                      <Input
                        inputMode="numeric"
                        value={d.shootout_saves}
                        onChange={(e) => setGoalieDraft((g) => ({ ...g, [t.teamId]: { ...d, shootout_saves: e.target.value } }))}
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
        <div className="text-sm font-semibold tracking-tight text-slate-900">Verification Signatures</div>
        <div className="mt-1 text-sm text-slate-600">Digital signatures from coaches/managers and referees.</div>

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {signatureRoles.map((r) => {
            const existing = scoresheet.signatures.find((s) => s.role === r.role) || null;
            return (
              <Card key={r.role} className="border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold tracking-tight text-slate-900">{r.label}</div>
                    {existing ? (
                      <div className="mt-1 text-sm text-slate-700">
                        Signed by <span className="font-medium text-slate-900">{existing.signer_name}</span>{' '}
                        <span className="text-slate-500">({new Date(existing.signed_at).toLocaleString()})</span>
                      </div>
                    ) : (
                      <div className="mt-1 text-sm text-slate-600">Not signed yet.</div>
                    )}
                  </div>
                  {existing ? <ShieldCheck className="h-5 w-5 text-emerald-600" /> : <div className="h-5 w-5" />}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Input
                    value={signatureDraft[r.role] || ''}
                    onChange={(e) => setSignatureDraft((d) => ({ ...d, [r.role]: e.target.value }))}
                    placeholder="Type full name"
                  />
                  <Button type="button" onClick={() => handleSign(r.role, r.team_id)}>
                    Sign
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
