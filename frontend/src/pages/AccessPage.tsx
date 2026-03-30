import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Copy, MailPlus, RefreshCcw, ShieldCheck, UserCheck, XCircle } from 'lucide-react';

import { api } from '../api/client';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { AccessRequest, Arena, Association, AccessibleTeam, Invite, Player } from '../types';

const TEAM_ROLES = ['team_admin', 'manager', 'scheduler', 'coach'] as const;
const ARENA_ROLES = ['arena_admin', 'arena_ops'] as const;
const ASSOCIATION_ROLES = ['association_admin'] as const;
const TARGET_TYPES = ['association', 'team', 'arena', 'guardian_link', 'player_link'] as const;

function statusVariant(status: string) {
  switch (status) {
    case 'approved':
    case 'accepted':
      return 'success' as const;
    case 'pending':
      return 'warning' as const;
    case 'rejected':
    case 'expired':
    case 'cancelled':
      return 'danger' as const;
    default:
      return 'neutral' as const;
  }
}

function canManageAccess(capabilities: string[]) {
  return capabilities.some((capability) => (
    capability === 'platform.manage'
    || capability === 'association.manage'
    || capability === 'team.manage_staff'
    || capability === 'team.manage_roster'
    || capability === 'arena.manage'
  ));
}

function roleOptionsForTarget(targetType: string) {
  if (targetType === 'association') return [...ASSOCIATION_ROLES];
  if (targetType === 'team') return [...TEAM_ROLES];
  if (targetType === 'arena') return [...ARENA_ROLES];
  return [] as string[];
}

function roleLabel(role: string) {
  return role.replaceAll('_', ' ');
}

function targetTypeLabel(targetType: string) {
  return targetType.replaceAll('_', ' ');
}

export default function AccessPage() {
  const { authEnabled, me } = useAuth();
  const pushToast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [associations, setAssociations] = useState<Association[]>([]);
  const [arenas, setArenas] = useState<Arena[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [requestRoles, setRequestRoles] = useState<Record<string, string>>({});

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteTargetType, setInviteTargetType] = useState<(typeof TARGET_TYPES)[number]>('team');
  const [inviteTargetId, setInviteTargetId] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('team_admin');
  const [invitePlayerTeamId, setInvitePlayerTeamId] = useState('');

  const manageAccess = useMemo(() => canManageAccess(me?.capabilities || []), [me?.capabilities]);
  const teams = useMemo<AccessibleTeam[]>(() => me?.accessible_teams || [], [me?.accessible_teams]);
  const capabilities = me?.capabilities || [];
  const canInviteAssociations = capabilities.includes('platform.manage') || capabilities.includes('association.manage');
  const canInviteTeams = canInviteAssociations || capabilities.includes('team.manage_staff');
  const canInviteArenas = capabilities.includes('platform.manage') || capabilities.includes('arena.manage');
  const canInviteFamilyLinks = canInviteAssociations || capabilities.includes('team.manage_roster');
  const availableTargetTypes = useMemo<(typeof TARGET_TYPES)[number][]>(() => {
    const next: (typeof TARGET_TYPES)[number][] = [];
    if (canInviteAssociations) next.push('association');
    if (canInviteTeams) next.push('team');
    if (canInviteArenas) next.push('arena');
    if (canInviteFamilyLinks) {
      next.push('guardian_link', 'player_link');
    }
    return next;
  }, [canInviteArenas, canInviteAssociations, canInviteFamilyLinks, canInviteTeams]);

  const resourceOptions = useMemo(() => {
    if (inviteTargetType === 'association') {
      return associations.map((association) => ({
        id: association.id,
        label: association.name,
        detail: [association.city, association.state].filter(Boolean).join(', '),
      }));
    }
    if (inviteTargetType === 'team') {
      return teams.map((team) => ({
        id: team.id,
        label: team.name,
        detail: `${team.age_group} · ${team.level}`,
      }));
    }
    if (inviteTargetType === 'arena') {
      return arenas.map((arena) => ({
        id: arena.id,
        label: arena.name,
        detail: [arena.city, arena.state].filter(Boolean).join(', '),
      }));
    }
    return players.map((player) => ({
      id: player.id,
      label: `${player.first_name} ${player.last_name}`,
      detail: player.jersey_number ? `#${player.jersey_number}` : player.position || '',
    }));
  }, [arenas, associations, inviteTargetType, players, teams]);

  const roleOptions = useMemo(() => roleOptionsForTarget(inviteTargetType), [inviteTargetType]);

  const loadQueues = async () => {
    const [nextInvites, nextRequests] = await Promise.all([
      api.getInvites({ direction: 'managed', status: 'pending' }),
      api.getAccessRequests({ scope: 'review', status: 'pending' }),
    ]);
    setInvites(nextInvites);
    setRequests(nextRequests);
    setRequestRoles((current) => {
      const next = { ...current };
      for (const request of nextRequests) {
        const options = roleOptionsForTarget(request.target.type);
        if (options.length > 0 && !next[request.id]) {
          next[request.id] = options[0];
        }
      }
      return next;
    });
  };

  const loadResources = async () => {
    const [nextAssociations, nextArenas] = await Promise.all([
      canInviteAssociations ? api.getAssociations() : Promise.resolve([]),
      canInviteArenas ? api.getArenas() : Promise.resolve([]),
    ]);
    setAssociations(nextAssociations);
    setArenas(nextArenas);
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadQueues(), loadResources()]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!manageAccess) return;
    void load();
  }, [canInviteArenas, canInviteAssociations, manageAccess]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (availableTargetTypes.length === 0) {
      return;
    }
    if (!availableTargetTypes.includes(inviteTargetType)) {
      setInviteTargetType(availableTargetTypes[0]);
    }
  }, [availableTargetTypes, inviteTargetType]);

  useEffect(() => {
    if (roleOptions.length === 0) {
      setInviteRole('');
      return;
    }
    if (!roleOptions.includes(inviteRole)) {
      setInviteRole(roleOptions[0]);
    }
  }, [inviteRole, roleOptions]);

  useEffect(() => {
    if (inviteTargetType !== 'guardian_link' && inviteTargetType !== 'player_link') {
      setPlayers([]);
      setInvitePlayerTeamId('');
      return;
    }
    if (!invitePlayerTeamId && teams.length > 0) {
      setInvitePlayerTeamId(teams[0].id);
    }
  }, [inviteTargetType, invitePlayerTeamId, teams]);

  useEffect(() => {
    if (inviteTargetType !== 'guardian_link' && inviteTargetType !== 'player_link') {
      return;
    }
    if (!invitePlayerTeamId) {
      setPlayers([]);
      return;
    }
    let cancelled = false;
    api.getPlayers(invitePlayerTeamId)
      .then((nextPlayers) => {
        if (!cancelled) {
          setPlayers(nextPlayers);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPlayers([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [invitePlayerTeamId, inviteTargetType]);

  useEffect(() => {
    if (resourceOptions.length === 0) {
      setInviteTargetId('');
      return;
    }
    if (!resourceOptions.some((option) => option.id === inviteTargetId)) {
      setInviteTargetId(resourceOptions[0].id);
    }
  }, [inviteTargetId, resourceOptions]);

  if (!authEnabled) {
    return <Navigate to="/" replace />;
  }

  if (!manageAccess) {
    return <Navigate to="/" replace />;
  }

  const copyInviteLink = async (invite: Invite) => {
    const url = `${window.location.origin}/invite/${invite.token}`;
    await navigator.clipboard.writeText(url);
    pushToast({ title: 'Invite link copied', description: invite.target.name, variant: 'success' });
  };

  const cancelInvite = async (invite: Invite) => {
    setBusyKey(`invite:${invite.id}`);
    try {
      await api.cancelInvite(invite.id);
      setInvites((current) => current.filter((entry) => entry.id !== invite.id));
      pushToast({ title: 'Invite cancelled', description: invite.target.name, variant: 'info' });
    } catch (nextError) {
      pushToast({
        title: 'Unable to cancel invite',
        description: nextError instanceof Error ? nextError.message : String(nextError),
        variant: 'error',
      });
    } finally {
      setBusyKey(null);
    }
  };

  const createInvite = async () => {
    if (!inviteEmail.trim()) {
      pushToast({ title: 'Invite email required', description: 'Enter the recipient email before creating an invite.', variant: 'warning' });
      return;
    }
    if (!inviteTargetId) {
      pushToast({ title: 'Invite target required', description: 'Select a resource or player for this invite.', variant: 'warning' });
      return;
    }
    setBusyKey('invite:create');
    try {
      const created = await api.createInvite({
        email: inviteEmail.trim(),
        target_type: inviteTargetType,
        target_id: inviteTargetId,
        role: roleOptions.length > 0 ? inviteRole : null,
      });
      setInvites((current) => [created, ...current]);
      setInviteEmail('');
      pushToast({ title: 'Invite created', description: `${created.target.name} · ${created.email}`, variant: 'success' });
    } catch (nextError) {
      pushToast({
        title: 'Unable to create invite',
        description: nextError instanceof Error ? nextError.message : String(nextError),
        variant: 'error',
      });
    } finally {
      setBusyKey(null);
    }
  };

  const approveRequest = async (request: AccessRequest) => {
    const options = roleOptionsForTarget(request.target.type);
    const role = options.length > 0 ? requestRoles[request.id] ?? options[0] : null;
    setBusyKey(`request:approve:${request.id}`);
    try {
      await api.approveAccessRequest(request.id, role);
      setRequests((current) => current.filter((entry) => entry.id !== request.id));
      pushToast({ title: 'Access request approved', description: request.target.name, variant: 'success' });
    } catch (nextError) {
      pushToast({
        title: 'Unable to approve request',
        description: nextError instanceof Error ? nextError.message : String(nextError),
        variant: 'error',
      });
    } finally {
      setBusyKey(null);
    }
  };

  const rejectRequest = async (request: AccessRequest) => {
    setBusyKey(`request:reject:${request.id}`);
    try {
      await api.rejectAccessRequest(request.id);
      setRequests((current) => current.filter((entry) => entry.id !== request.id));
      pushToast({ title: 'Access request rejected', description: request.target.name, variant: 'info' });
    } catch (nextError) {
      pushToast({
        title: 'Unable to reject request',
        description: nextError instanceof Error ? nextError.message : String(nextError),
        variant: 'error',
      });
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Access"
        subtitle="Create app-level invites, review pending access requests, and manage the onboarding queue for the resources you administer."
        actions={(
          <Button type="button" variant="outline" onClick={() => void load()} disabled={loading || !!busyKey}>
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
        )}
      />

      {error ? (
        <Card className="border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          {error}
        </Card>
      ) : null}

      <Card className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Create Invite</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Use invites for the exact account email you want linked to a team, association, arena, parent/guardian relationship, or player account.
            </p>
          </div>
          <Badge variant="outline">Preferred onboarding path</Badge>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(15rem,1fr)_minmax(13rem,0.9fr)_minmax(13rem,0.9fr)]">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Recipient email
            </label>
            <Input
              type="email"
              placeholder="parent@example.com"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Target type
            </label>
            <Select
              value={inviteTargetType}
              onChange={(event) => setInviteTargetType(event.target.value as (typeof TARGET_TYPES)[number])}
              disabled={availableTargetTypes.length === 0}
            >
              {availableTargetTypes.length === 0 ? (
                <option value="">No invite targets available</option>
              ) : availableTargetTypes.map((targetType) => (
                <option key={targetType} value={targetType}>
                  {targetTypeLabel(targetType)}
                </option>
              ))}
            </Select>
          </div>

          {roleOptions.length > 0 ? (
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Role
              </label>
              <Select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}>
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {roleLabel(role)}
                  </option>
                ))}
              </Select>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300">
              {inviteTargetType === 'guardian_link'
                ? 'Guardian invites create a parent/guardian link to one player.'
                : 'Player invites create the self-managed player attendance/account link.'}
            </div>
          )}
        </div>

        {inviteTargetType === 'guardian_link' || inviteTargetType === 'player_link' ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Team
              </label>
              <Select value={invitePlayerTeamId} onChange={(event) => setInvitePlayerTeamId(event.target.value)}>
                {teams.length === 0 ? <option value="">No accessible teams</option> : null}
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name} · {team.age_group} · {team.level}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Player
              </label>
              <Select value={inviteTargetId} onChange={(event) => setInviteTargetId(event.target.value)}>
                {players.length === 0 ? <option value="">No players available</option> : null}
                {resourceOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}{option.detail ? ` · ${option.detail}` : ''}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Target
            </label>
            <Select value={inviteTargetId} onChange={(event) => setInviteTargetId(event.target.value)}>
              {resourceOptions.length === 0 ? <option value="">No targets available</option> : null}
              {resourceOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}{option.detail ? ` · ${option.detail}` : ''}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <Button type="button" onClick={() => void createInvite()} disabled={busyKey !== null || loading || availableTargetTypes.length === 0}>
            <MailPlus className="h-4 w-4" />
            Create invite
          </Button>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <Card className="p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Review Queue</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                These requests are waiting for approval on teams, associations, arenas, or family/player links that you manage.
              </p>
            </div>
            <Badge variant="outline">{requests.length} open</Badge>
          </div>

          <div className="mt-5 space-y-4">
            {loading ? (
              <div className="rounded-2xl border border-dashed border-slate-300/80 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Loading access requests…
              </div>
            ) : requests.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300/80 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                No pending access requests for the resources you manage.
              </div>
            ) : (
              requests.map((request) => {
                const requestRoleOptions = roleOptionsForTarget(request.target.type);
                const selectedRole = requestRoles[request.id] ?? requestRoleOptions[0] ?? '';

                return (
                  <div
                    key={request.id}
                    className="rounded-2xl border border-slate-200/80 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/60"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{request.target.name}</div>
                        {request.target.context ? (
                          <div className="text-sm text-slate-600 dark:text-slate-300">{request.target.context}</div>
                        ) : null}
                        <div className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                          {targetTypeLabel(request.target.type)}
                        </div>
                      </div>
                      <Badge variant={statusVariant(request.status)}>{request.status}</Badge>
                    </div>

                    <div className="mt-4 text-sm text-slate-600 dark:text-slate-300">
                      Requested by <span className="font-medium text-slate-900 dark:text-slate-100">{request.user_email || 'Unknown user'}</span>
                    </div>
                    {request.notes ? (
                      <div className="mt-2 rounded-xl border border-slate-200/80 bg-white/80 px-3 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">
                        {request.notes}
                      </div>
                    ) : null}

                    {requestRoleOptions.length > 0 ? (
                      <div className="mt-4">
                        <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                          Grant role
                        </label>
                        <Select
                          value={selectedRole}
                          onChange={(event) => setRequestRoles((current) => ({ ...current, [request.id]: event.target.value }))}
                        >
                          {requestRoleOptions.map((role) => (
                            <option key={role} value={role}>
                              {roleLabel(role)}
                            </option>
                          ))}
                        </Select>
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-3">
                      <Button type="button" onClick={() => void approveRequest(request)} disabled={busyKey !== null}>
                        <UserCheck className="h-4 w-4" />
                        Approve
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => void rejectRequest(request)} disabled={busyKey !== null}>
                        <XCircle className="h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Managed Invites</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Open invites for the resources you can administer. Copy links for testing or cancel stale entries.
              </p>
            </div>
            <Badge variant="outline">{invites.length} open</Badge>
          </div>

          <div className="mt-5 space-y-4">
            {loading ? (
              <div className="rounded-2xl border border-dashed border-slate-300/80 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Loading invites…
              </div>
            ) : invites.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300/80 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                No pending invites on resources you manage yet.
              </div>
            ) : (
              invites.map((invite) => (
                <div
                  key={invite.id}
                  className="rounded-2xl border border-slate-200/80 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/60"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{invite.target.name}</div>
                      {invite.target.context ? (
                        <div className="text-sm text-slate-600 dark:text-slate-300">{invite.target.context}</div>
                      ) : null}
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                        {targetTypeLabel(invite.target.type)}
                        {invite.role ? ` · ${roleLabel(invite.role)}` : ''}
                      </div>
                    </div>
                    <Badge variant={statusVariant(invite.status)}>{invite.status}</Badge>
                  </div>

                  <div className="mt-4 text-sm text-slate-600 dark:text-slate-300">
                    <div>{invite.email}</div>
                    <div className="mt-1">Expires {new Date(invite.expires_at).toLocaleString()}</div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button type="button" variant="outline" onClick={() => void copyInviteLink(invite)} disabled={busyKey !== null}>
                      <Copy className="h-4 w-4" />
                      Copy link
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => void cancelInvite(invite)} disabled={busyKey !== null}>
                      <ShieldCheck className="h-4 w-4" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
