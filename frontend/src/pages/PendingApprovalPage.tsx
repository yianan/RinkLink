import { useState } from 'react';
import { Navigate } from 'react-router-dom';

import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { authClient } from '../lib/auth-client';
import { useAuth } from '../context/AuthContext';

export default function PendingApprovalPage() {
  const { isAuthenticated, me } = useAuth();
  const [submitting, setSubmitting] = useState(false);

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

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-8 sm:px-6">
      <Card className="w-full p-8 sm:p-10">
        <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          Access Pending
        </div>
        <h1 className="mt-5 font-display text-3xl font-bold tracking-tight text-slate-950 dark:text-slate-50">
          Your account is signed in, but not approved yet.
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">
          RinkLink accounts can register publicly, but team, association, arena, parent, and player access is granted by invite
          or admin approval. Once your access is approved, this page will be replaced with your app dashboard automatically on the
          next refresh.
        </p>

        <div className="mt-6 rounded-2xl border border-slate-200/80 bg-slate-50/90 px-4 py-4 text-sm dark:border-slate-800 dark:bg-slate-900/70">
          <div className="font-medium text-slate-900 dark:text-slate-100">Signed in as</div>
          <div className="mt-1 text-slate-600 dark:text-slate-300">{me?.user.email || 'Unknown user'}</div>
          <div className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Current status: {me?.user.status || 'pending'}
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button type="button" variant="outline" onClick={() => window.location.reload()}>
            Refresh status
          </Button>
          <Button type="button" variant="ghost" onClick={() => void signOut()} disabled={submitting}>
            {submitting ? 'Signing out…' : 'Sign out'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
