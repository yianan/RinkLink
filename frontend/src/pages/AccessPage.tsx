import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Copy, RefreshCcw, ShieldCheck, UserCheck, XCircle } from 'lucide-react';

import { api } from '../api/client';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Select } from '../components/ui/Select';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { AccessRequest, Invite } from '../types';

const TEAM_ROLES = ['team_admin', 'manager', 'scheduler', 'coach'] as const;
const ARENA_ROLES = ['arena_admin', 'arena_ops'] as const;
const ASSOCIATION_ROLES = ['association_admin'] as const;

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

export default function AccessPage() {
  const { authEnabled, me } = useAuth();
  const pushToast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [requestRoles, setRequestRoles] = useState<Record<string, string>>({});

  const manageAccess = useMemo(() => canManageAccess(me?.capabilities || []), [me?.capabilities]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
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
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!manageAccess) return;
    void load();
  }, [manageAccess]); // eslint-disable-line react-hooks/exhaustive-deps

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
        subtitle="Review pending access requests and manage the app-level invites you can administer."
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
                const roleOptions = roleOptionsForTarget(request.target.type);
                const selectedRole = requestRoles[request.id] ?? roleOptions[0] ?? '';

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
                          {request.target.type.replace('_', ' ')}
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

                    {roleOptions.length > 0 ? (
                      <div className="mt-4">
                        <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                          Grant role
                        </label>
                        <Select
                          value={selectedRole}
                          onChange={(event) => setRequestRoles((current) => ({ ...current, [request.id]: event.target.value }))}
                        >
                          {roleOptions.map((role) => (
                            <option key={role} value={role}>
                              {roleLabel(role)}
                            </option>
                          ))}
                        </Select>
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-3">
                      <Button
                        type="button"
                        onClick={() => void approveRequest(request)}
                        disabled={busyKey !== null}
                      >
                        <UserCheck className="h-4 w-4" />
                        Approve
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => void rejectRequest(request)}
                        disabled={busyKey !== null}
                      >
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
                Open invites for the resources you can administer. Copy the link for manual testing or cancel stale entries.
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
                        {invite.target.type.replace('_', ' ')}
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
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void copyInviteLink(invite)}
                      disabled={busyKey !== null}
                    >
                      <Copy className="h-4 w-4" />
                      Copy link
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => void cancelInvite(invite)}
                      disabled={busyKey !== null}
                    >
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
