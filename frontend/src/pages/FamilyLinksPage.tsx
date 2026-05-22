import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { MailPlus, XCircle } from 'lucide-react';

import { api } from '../api/client';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Textarea } from '../components/ui/Textarea';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../context/AuthContext';
import { useTeam } from '../context/TeamContext';
import { useToast } from '../context/ToastContext';
import { getAccessTargetTypeLabel } from '../lib/accessLabels';
import type { AccessRequest, AccessTarget, Invite, Player } from '../types';

type LinkType = 'guardian_link' | 'player_link';

const LINK_TYPE_LABELS: Record<LinkType, string> = {
  guardian_link: 'Parent / Guardian',
  player_link: 'Player (self)',
};

function statusVariant(status: string) {
  switch (status) {
    case 'accepted':
      return 'success' as const;
    case 'pending':
      return 'warning' as const;
    default:
      return 'danger' as const;
  }
}

export default function FamilyLinksPage() {
  const { authEnabled, me } = useAuth();
  const { activeTeam } = useTeam();
  const pushToast = useToast();

  const [players, setPlayers] = useState<Player[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Form state
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [email, setEmail] = useState('');
  const [linkType, setLinkType] = useState<LinkType>('guardian_link');
  const [requestType, setRequestType] = useState<LinkType>('guardian_link');
  const [requestTeamQuery, setRequestTeamQuery] = useState('');
  const [requestTeams, setRequestTeams] = useState<AccessTarget[]>([]);
  const [requestTeamId, setRequestTeamId] = useState('');
  const [requestPlayerQuery, setRequestPlayerQuery] = useState('');
  const [requestPlayers, setRequestPlayers] = useState<AccessTarget[]>([]);
  const [requestPlayerId, setRequestPlayerId] = useState('');
  const [requestNotes, setRequestNotes] = useState('');
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestLookupError, setRequestLookupError] = useState<string | null>(null);

  const capabilities = me?.capabilities || [];
  const canManage =
    capabilities.includes('platform.manage') ||
    capabilities.includes('association.manage') ||
    capabilities.includes('team.manage_roster');
  const canRequestFamilyLinks =
    capabilities.includes('player.respond_guarded') ||
    capabilities.includes('player.respond_self') ||
    (me?.linked_players.length || 0) > 0;

  const familyInvites = useMemo(
    () => invites.filter((i) => i.target.type === 'guardian_link' || i.target.type === 'player_link'),
    [invites],
  );
  const teamNamesById = useMemo(
    () => new Map((me?.accessible_teams || []).map((team) => [team.id, team.name])),
    [me?.accessible_teams],
  );

  useEffect(() => {
    if (!canManage || !activeTeam) return;

    let cancelled = false;
    setLoading(true);

    Promise.all([
      api.getPlayers(activeTeam.id),
      api.getInvites({ direction: 'managed', status: 'pending' }),
    ])
      .then(([nextPlayers, nextInvites]) => {
        if (cancelled) return;
        setPlayers(nextPlayers);
        setInvites(nextInvites);
        if (nextPlayers.length > 0 && !nextPlayers.some((p) => p.id === selectedPlayerId)) {
          setSelectedPlayerId(nextPlayers[0].id);
        }
      })
      .catch(() => {
        if (!cancelled) {
          pushToast({ title: 'Failed to load roster', variant: 'error' });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [activeTeam?.id, canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!canRequestFamilyLinks) return;
    let cancelled = false;
    setRequestLoading(true);
    api.getAccessRequests({ scope: 'mine' })
      .then((nextRequests) => {
        if (cancelled) return;
        setRequests(nextRequests.filter((request) => request.target.type === 'guardian_link' || request.target.type === 'player_link'));
      })
      .catch((err) => {
        if (!cancelled) {
          pushToast({
            title: 'Unable to load family requests',
            description: err instanceof Error ? err.message : String(err),
            variant: 'error',
          });
        }
      })
      .finally(() => {
        if (!cancelled) setRequestLoading(false);
      });
    return () => { cancelled = true; };
  }, [canRequestFamilyLinks]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!canRequestFamilyLinks) return;
    if (requestTeamQuery.trim().length < 2) {
      setRequestTeams([]);
      setRequestTeamId('');
      return;
    }
    let cancelled = false;
    api.getAccessTargets({ target_type: 'team', q: requestTeamQuery.trim() })
      .then((targets) => {
        if (cancelled) return;
        setRequestTeams(targets);
        setRequestTeamId((current) => (current && targets.some((target) => target.id === current) ? current : targets[0]?.id || ''));
      })
      .catch((err) => {
        if (!cancelled) {
          setRequestTeams([]);
          setRequestTeamId('');
          setRequestLookupError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => { cancelled = true; };
  }, [canRequestFamilyLinks, requestTeamQuery]);

  useEffect(() => {
    if (!canRequestFamilyLinks) return;
    if (!requestTeamId || requestPlayerQuery.trim().length < 2) {
      setRequestPlayers([]);
      setRequestPlayerId('');
      return;
    }
    let cancelled = false;
    setRequestLookupError(null);
    api.getAccessTargets({
      target_type: requestType,
      team_id: requestTeamId,
      q: requestPlayerQuery.trim(),
    })
      .then((targets) => {
        if (cancelled) return;
        setRequestPlayers(targets);
        setRequestPlayerId((current) => (current && targets.some((target) => target.id === current) ? current : targets[0]?.id || ''));
      })
      .catch((err) => {
        if (!cancelled) {
          setRequestPlayers([]);
          setRequestPlayerId('');
          setRequestLookupError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => { cancelled = true; };
  }, [canRequestFamilyLinks, requestPlayerQuery, requestTeamId, requestType]);

  if (!authEnabled) return <Navigate to="/" replace />;
  if (!canManage && !canRequestFamilyLinks) return <Navigate to="/" replace />;

  const sendInvite = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      pushToast({ title: 'Enter an email address', variant: 'warning' });
      return;
    }
    if (!selectedPlayerId) {
      pushToast({ title: 'Select a player first', variant: 'warning' });
      return;
    }
    setBusy(true);
    try {
      const created = await api.createInvite({
        email: trimmedEmail,
        target_type: linkType,
        target_id: selectedPlayerId,
        role: null,
      });
      setInvites((current) => [created, ...current]);
      setEmail('');
      const player = players.find((p) => p.id === selectedPlayerId);
      pushToast({
        title: 'Invite sent',
        description: `${LINK_TYPE_LABELS[linkType]} invite for ${player ? `${player.first_name} ${player.last_name}` : 'player'} sent to ${trimmedEmail}`,
        variant: 'success',
      });
    } catch (err) {
      pushToast({
        title: 'Failed to send invite',
        description: err instanceof Error ? err.message : String(err),
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const cancelInvite = async (invite: Invite) => {
    setBusy(true);
    try {
      await api.cancelInvite(invite.id);
      setInvites((current) => current.filter((i) => i.id !== invite.id));
      pushToast({ title: 'Invite cancelled', variant: 'info' });
    } catch (err) {
      pushToast({
        title: 'Failed to cancel invite',
        description: err instanceof Error ? err.message : String(err),
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const submitFamilyRequest = async () => {
    if (!requestPlayerId) {
      pushToast({ title: 'Choose a player', description: 'Search for the team, then choose the player.', variant: 'warning' });
      return;
    }
    setRequestLoading(true);
    try {
      const created = await api.createAccessRequest({
        target_type: requestType,
        target_id: requestPlayerId,
        notes: requestNotes.trim() || null,
      });
      setRequests((current) => {
        const withoutDuplicate = current.filter((request) => request.id !== created.id);
        return [created, ...withoutDuplicate];
      });
      setRequestPlayerQuery('');
      setRequestPlayers([]);
      setRequestPlayerId('');
      setRequestNotes('');
      pushToast({ title: 'Request submitted', description: created.target.name, variant: 'success' });
    } catch (err) {
      pushToast({
        title: 'Unable to submit request',
        description: err instanceof Error ? err.message : String(err),
        variant: 'error',
      });
    } finally {
      setRequestLoading(false);
    }
  };

  if (!canManage) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="My Players"
          subtitle="Add a child or request access to a player on another team."
        />

        <Card className="p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Your players</h2>
          <div className="mt-4 space-y-3">
            {(me?.linked_players.length || 0) === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                No players yet.
              </div>
            ) : (
              me?.linked_players.map((player) => (
                <div key={player.player_id} className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {player.first_name} {player.last_name}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {teamNamesById.get(player.team_id) || 'Team'} · {player.link_type === 'player' ? 'Player account' : 'Parent/guardian'}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Add a player</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Access type
              </label>
              <Select value={requestType} onChange={(event) => {
                setRequestType(event.target.value as LinkType);
                setRequestPlayers([]);
                setRequestPlayerId('');
              }}>
                <option value="guardian_link">{LINK_TYPE_LABELS.guardian_link}</option>
                <option value="player_link">{LINK_TYPE_LABELS.player_link}</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Find team
              </label>
              <Input value={requestTeamQuery} onChange={(event) => setRequestTeamQuery(event.target.value)} placeholder="Start typing the team name" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Team
              </label>
              <Select value={requestTeamId} onChange={(event) => setRequestTeamId(event.target.value)} disabled={requestTeams.length === 0}>
                {requestTeams.length === 0 ? <option value="">Search for a team</option> : null}
                {requestTeams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}{team.context ? ` · ${team.context}` : ''}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Find player
              </label>
              <Input value={requestPlayerQuery} onChange={(event) => setRequestPlayerQuery(event.target.value)} placeholder="Start typing the player name" disabled={!requestTeamId} />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Player
              </label>
              <Select value={requestPlayerId} onChange={(event) => setRequestPlayerId(event.target.value)} disabled={requestPlayers.length === 0}>
                {requestPlayers.length === 0 ? <option value="">Search for a player</option> : null}
                {requestPlayers.map((player) => (
                  <option key={player.id} value={player.id}>{player.name}{player.context ? ` · ${player.context}` : ''}</option>
                ))}
              </Select>
              {requestLookupError ? <div className="mt-2 text-xs text-rose-600 dark:text-rose-300">{requestLookupError}</div> : null}
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Note
              </label>
              <Textarea rows={3} value={requestNotes} onChange={(event) => setRequestNotes(event.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div className="mt-5">
            <Button type="button" onClick={() => void submitFamilyRequest()} disabled={requestLoading || !requestPlayerId}>
              Request access
            </Button>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Your requests</h2>
            <Badge variant="outline">{requests.length}</Badge>
          </div>
          <div className="mt-4 space-y-3">
            {requestLoading && requests.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">Loading…</div>
            ) : requests.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">No player access requests yet.</div>
            ) : (
              requests.map((request) => (
                <div key={request.id} className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{request.target.name}</div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {getAccessTargetTypeLabel(request.target.type)}{request.target.context ? ` · ${request.target.context}` : ''}
                      </div>
                    </div>
                    <Badge variant={statusVariant(request.status)}>{request.status}</Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    );
  }

  if (!activeTeam) {
    return (
      <div className="space-y-6">
        <PageHeader title="Player Access" subtitle="Select a team to manage parent and player access." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Player Access"
        subtitle={`Invite parents or players to access players on ${activeTeam.name}.`}
      />

      {/* Send invite form */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Send Invite</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Pick a player from the roster, enter the parent or player email, and send the invite.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Player
            </label>
            <Select
              value={selectedPlayerId}
              onChange={(e) => setSelectedPlayerId(e.target.value)}
              disabled={loading || players.length === 0}
            >
              {players.length === 0 ? (
                <option value="">{loading ? 'Loading roster…' : 'No players on roster'}</option>
              ) : (
                players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.first_name} {p.last_name}{p.jersey_number != null ? ` #${p.jersey_number}` : ''}
                  </option>
                ))
              )}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Access type
            </label>
            <Select value={linkType} onChange={(e) => setLinkType(e.target.value as LinkType)}>
              <option value="guardian_link">{LINK_TYPE_LABELS.guardian_link}</option>
              <option value="player_link">{LINK_TYPE_LABELS.player_link}</option>
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Email
            </label>
            <Input
              type="email"
              placeholder="parent@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void sendInvite(); }}
            />
          </div>

          <div className="flex items-end">
            <Button
              type="button"
              onClick={() => void sendInvite()}
              disabled={busy || loading || !selectedPlayerId || !email.trim()}
              className="w-full sm:w-auto"
            >
              <MailPlus className="h-4 w-4" />
              Send Invite
            </Button>
          </div>
        </div>
      </Card>

      {/* Pending invites */}
      <Card className="p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Pending Invites</h2>
          <Badge variant="outline">{familyInvites.length}</Badge>
        </div>

        <div className="mt-4 space-y-3">
          {loading ? (
            <p className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Loading…
            </p>
          ) : familyInvites.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              No pending player invites.
            </p>
          ) : (
            familyInvites.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60"
              >
                <div className="space-y-0.5">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {invite.target.name}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {LINK_TYPE_LABELS[(invite.target.type as LinkType)] || invite.target.type}
                    {' · '}
                    {invite.email}
                    {' · expires '}
                    {new Date(invite.expires_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant(invite.status)}>{invite.status}</Badge>
                  <Button type="button" variant="ghost" size="sm" onClick={() => void cancelInvite(invite)} disabled={busy}>
                    <XCircle className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
