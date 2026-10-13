import { useNavigate } from 'react-router-dom';
import { LogOut, Mail, ShieldX } from 'lucide-react';

import PageHeader from '../components/PageHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { useAuth } from '../context/AuthContext';
import { authClient, clearApiAccessToken } from '../lib/auth-client';

export default function DisabledAccessPage() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const signInDisabled = me?.user.auth_state === 'disabled';
  const accountClosed = me?.user.status === 'closed';

  const handleSignOut = async () => {
    clearApiAccessToken();
    await authClient.signOut();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={accountClosed ? 'Account Closed' : signInDisabled ? 'Sign-In Disabled' : 'App Access Disabled'}
        subtitle={accountClosed
          ? 'Contact a RinkLink admin if you need this account restored.'
          : signInDisabled
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
                {accountClosed
                  ? 'Contact us if you need to use this account again.'
                  : signInDisabled
                    ? 'Contact us if sign-in should be restored.'
                    : 'Contact us if you believe this was disabled by mistake.'}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
              {accountClosed
                ? 'An admin can reopen this account if it should be active again.'
                : signInDisabled
                  ? 'An admin can restore sign-in if this account should be active.'
                  : 'An admin can restore app access if this account should be active.'}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="outline" onClick={() => window.location.reload()}>
                Retry
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate('/contact')}>
                <Mail className="h-4 w-4" />
                Contact us
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
