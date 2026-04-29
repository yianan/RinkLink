import { LogOut, ShieldX } from 'lucide-react';

import PageHeader from '../components/PageHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { useAuth } from '../context/AuthContext';
import { authClient, clearApiAccessToken } from '../lib/auth-client';

export default function DisabledAccessPage() {
  const { me } = useAuth();
  const signInDisabled = me?.user.auth_state === 'disabled';

  const handleSignOut = async () => {
    clearApiAccessToken();
    await authClient.signOut();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={signInDisabled ? 'Sign-In Disabled' : 'App Access Disabled'}
        subtitle={signInDisabled
          ? 'This account can no longer sign in to RinkLink until an administrator restores it.'
          : 'This account is authenticated, but RinkLink access has been turned off by an administrator.'}
      />

      <Card className="p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-rose-100 p-3 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">
            <ShieldX className="h-6 w-6" />
          </div>
          <div className="space-y-3">
            <div>
              <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {me?.user.email || 'This account'} cannot use RinkLink right now
              </div>
              <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {signInDisabled
                  ? 'Contact your club or platform administrator if sign-in should be restored.'
                  : 'Contact your club or platform administrator if you believe this was disabled by mistake.'}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
              {signInDisabled
                ? 'Existing sessions have been revoked. Historical invites, memberships, and audit records remain in place until sign-in is restored.'
                : 'Historical invites, memberships, and audit records remain in place. An administrator must restore app access before this account can use the product again.'}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="outline" onClick={() => window.location.reload()}>
                Retry
              </Button>
              <Button type="button" variant="ghost" onClick={() => void handleSignOut()}>
                <LogOut className="h-4 w-4" />
                Sign out
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
