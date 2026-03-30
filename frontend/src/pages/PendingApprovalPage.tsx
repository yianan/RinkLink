import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { api } from '../api/client';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { authClient } from '../lib/auth-client';
import type { AccessRequest, Invite } from '../types';
import { useAuth } from '../context/AuthContext';

function statusVariant(status: string) {
  switch (status) {
    case 'active':
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

export default function PendingApprovalPage() {
  const navigate = useNavigate();
  const { isAuthenticated, me, refreshProfile } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);

  const openInvites = useMemo(
    () => invites.filter((invite) => invite.status === 'pending'),
    [invites],
  );

  const loadPendingData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextInvites, nextRequests] = await Promise.all([
        api.getInvites({ direction: 'received' }),
        api.getAccessRequests({ scope: 'mine' }),
      ]);
      setInvites(nextInvites);
      setRequests(nextRequests);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadPendingData();
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (me?.user.status === 'active') {
    return <Navigate to="/" replace />;
  }

  const signOut = async () => {
    setSubmitting(true);
    try {
      await authClient.signOut();
      window.location.href = '/login';
    } finally {
      setSubmitting(false);
    }
  };

  const refreshAll = async () => {
    setSubmitting(true);
    try {
      await refreshProfile();
      await loadPendingData();
      if (me?.user.status === 'active') {
        navigate('/');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-4 py-8 sm:px-6">
      <div className="grid w-full gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
        <Card className="p-8 sm:p-10">
          <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            Access Pending
          </div>
          <h1 className="mt-5 font-display text-3xl font-bold tracking-tight text-slate-950 dark:text-slate-50">
            Your account is signed in, but app access still needs to be granted.
          </h1>
          <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">
            Generic sign-in is handled already, but the team, association, arena, parent, and player access for this app is granted
            through invites or admin approval. If you were invited, you can accept it below.
          </p>

          <div className="mt-6 rounded-2xl border border-slate-200/80 bg-slate-50/90 px-4 py-4 text-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="font-medium text-slate-900 dark:text-slate-100">Signed in as</div>
            <div className="mt-1 text-slate-600 dark:text-slate-300">{me?.user.email || 'Unknown user'}</div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant={statusVariant(me?.user.status || 'pending')}>Status: {me?.user.status || 'pending'}</Badge>
              <Badge variant="outline">Open invites: {openInvites.length}</Badge>
              <Badge variant="outline">Requests submitted: {requests.length}</Badge>
            </div>
          </div>

          <div className="mt-8 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Invitations For This Email
                </h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  These are app-specific access grants. Accepting one activates the matching team, arena, parent, or player link.
                </p>
              </div>
            </div>

            {loading ? (
              <div className="rounded-2xl border border-dashed border-slate-300/80 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Loading invites and request history…
              </div>
            ) : error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
                {error}
              </div>
            ) : openInvites.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300/80 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                No open invites were found for this email yet.
              </div>
            ) : (
              <div className="space-y-3">
                {openInvites.map((invite) => (
                  <div
                    key={invite.id}
                    className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/40"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{invite.target.name}</div>
                        {invite.target.context ? (
                          <div className="text-sm text-slate-600 dark:text-slate-300">{invite.target.context}</div>
                        ) : null}
                        <div className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                          {invite.target.type.replace('_', ' ')}
                          {invite.role ? ` · ${invite.role}` : ''}
                        </div>
                      </div>
                      <Badge variant={statusVariant(invite.status)}>{invite.status}</Badge>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span>Invited by {invite.invited_by_email || 'an administrator'}</span>
                      <span>Expires {new Date(invite.expires_at).toLocaleString()}</span>
                    </div>
                    <div className="mt-4">
                      <Button type="button" variant="outline" onClick={() => navigate(`/invite/${invite.token}`)}>
                        Review Invite
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Your Access Requests
            </h2>
            <div className="mt-4 space-y-3">
              {loading ? (
                <div className="text-sm text-slate-500 dark:text-slate-400">Loading request history…</div>
              ) : requests.length === 0 ? (
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  No access requests submitted yet. If you expected access, ask the relevant administrator to send an invite.
                </div>
              ) : (
                requests.map((request) => (
                  <div
                    key={request.id}
                    className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{request.target.name}</div>
                        {request.target.context ? (
                          <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{request.target.context}</div>
                        ) : null}
                      </div>
                      <Badge variant={statusVariant(request.status)}>{request.status}</Badge>
                    </div>
                    {request.notes ? (
                      <div className="mt-3 text-sm text-slate-600 dark:text-slate-300">{request.notes}</div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Next Steps
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              <p>Use an invite when possible. It creates the exact team, association, arena, parent, or player link intended for this email.</p>
              <p>Access requests are implemented on the backend now; the reviewer workflows will be surfaced in-app as the next admin slice.</p>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button type="button" variant="outline" onClick={() => void refreshAll()} disabled={submitting}>
                {submitting ? 'Refreshing…' : 'Refresh status'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => void signOut()} disabled={submitting}>
                {submitting ? 'Signing out…' : 'Sign out'}
              </Button>
            </div>
            <div className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              Need a new invite? Share the signed-in email above with the appropriate administrator.
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
