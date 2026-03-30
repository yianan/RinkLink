import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import { api } from '../api/client';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { authClient, clearApiAccessToken } from '../lib/auth-client';
import { useAuth } from '../context/AuthContext';
import type { Invite } from '../types';

const RETURN_TO_KEY = 'rinklink.returnTo';

function statusVariant(status: string) {
  switch (status) {
    case 'accepted':
      return 'success' as const;
    case 'pending':
      return 'warning' as const;
    case 'expired':
    case 'cancelled':
      return 'danger' as const;
    default:
      return 'neutral' as const;
  }
}

export default function InviteAcceptancePage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { authEnabled, loading: authLoading, isAuthenticated, me, refreshProfile } = useAuth();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inviteResolved = useMemo(
    () => invite?.status === 'accepted' || (me?.user.status === 'active' && invite?.status === 'pending'),
    [invite?.status, me?.user.status],
  );

  const loadInvite = async () => {
    if (!token || !isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const nextInvite = await api.getInviteByToken(token);
      setInvite(nextInvite);
    } catch (nextError) {
      setInvite(null);
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadInvite();
  }, [isAuthenticated, token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!authEnabled) {
    return <Navigate to="/" replace />;
  }

  if (authLoading) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-8 sm:px-6">
        <Card className="w-full p-8 text-sm text-slate-600 dark:text-slate-300">Checking your session…</Card>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-8 sm:px-6">
        <Card className="w-full p-8 sm:p-10">
          <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200">
            Invite Link
          </div>
          <h1 className="mt-5 font-display text-3xl font-bold tracking-tight text-slate-950 dark:text-slate-50">
            Sign in to review this access invite.
          </h1>
          <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">
            The invite will be applied to the authenticated account that matches the invited email address.
          </p>
          <div className="mt-8 flex gap-3">
            <Button
              type="button"
              onClick={() => {
                window.sessionStorage.setItem(RETURN_TO_KEY, `/invite/${token}`);
                navigate('/auth/sign-in');
              }}
            >
              Sign in
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const acceptInvite = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const nextInvite = await api.acceptInvite(token);
      setInvite(nextInvite);
      await refreshProfile();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setSubmitting(false);
    }
  };

  const signOutAndSwitchAccount = async () => {
    clearApiAccessToken();
    await authClient.signOut();
    window.sessionStorage.setItem(RETURN_TO_KEY, `/invite/${token}`);
    window.location.href = '/auth/sign-in';
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-8 sm:px-6">
      <Card className="w-full p-8 sm:p-10">
        <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200">
          Invite Review
        </div>
        <h1 className="mt-5 font-display text-3xl font-bold tracking-tight text-slate-950 dark:text-slate-50">
          Review and accept access for this account.
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">
          Signed in as <span className="font-medium text-slate-900 dark:text-slate-100">{me?.user.email || 'Unknown user'}</span>.
        </p>

        <div className="mt-6">
          {loading ? (
            <div className="rounded-2xl border border-dashed border-slate-300/80 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Loading invite details…
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
              {error}
            </div>
          ) : invite ? (
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/90 p-5 dark:border-slate-800 dark:bg-slate-900/70">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{invite.target.name}</div>
                  {invite.target.context ? (
                    <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{invite.target.context}</div>
                  ) : null}
                  <div className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    {invite.target.type.replace('_', ' ')}
                    {invite.role ? ` · ${invite.role}` : ''}
                  </div>
                </div>
                <Badge variant={statusVariant(invite.status)}>{invite.status}</Badge>
              </div>
              <div className="mt-4 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                <div>Invite email: {invite.email}</div>
                <div>Invited by: {invite.invited_by_email || 'an administrator'}</div>
                <div>Expires: {new Date(invite.expires_at).toLocaleString()}</div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300/80 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Invite not found.
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button type="button" variant="outline" onClick={() => void loadInvite()} disabled={loading || submitting || !invite}>
            Refresh
          </Button>
          <Button
            type="button"
            onClick={() => void acceptInvite()}
            disabled={!invite || invite.status !== 'pending' || submitting}
          >
            {submitting ? 'Accepting…' : 'Accept invite'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => void signOutAndSwitchAccount()} disabled={submitting}>
            Sign out and switch account
          </Button>
          {inviteResolved ? (
            <Button type="button" variant="ghost" onClick={() => navigate('/')}>
              Continue to app
            </Button>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
