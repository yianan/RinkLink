import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Home, Mail } from 'lucide-react';

import PageHeader from '../components/PageHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { api, apiErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const appIconSrc = '/icons/rinklink-icon-192.png';

export default function ContactPage() {
  const { isAuthenticated, me } = useAuth();
  const navigate = useNavigate();
  const pushToast = useToast();
  const initialEmail = useMemo(() => me?.user.email || '', [me?.user.email]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState(initialEmail);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const canSubmit = name.trim() && email.trim() && message.trim() && !submitting;

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate(isAuthenticated ? '/' : '/auth/sign-in', { replace: true });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await api.contactSupport({
        name: name.trim(),
        email: email.trim(),
        message: message.trim(),
      });
      setSent(true);
      setMessage('');
      pushToast({
        title: 'Message sent',
        description: 'RinkLink admins received your message.',
        variant: 'success',
      });
    } catch (error) {
      pushToast({
        title: 'Message not sent',
        description: apiErrorMessage(error),
        variant: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const content = (
    <div className="mx-auto max-w-2xl space-y-6">
      {!isAuthenticated ? (
        <div className="flex items-center gap-3">
          <img src={appIconSrc} alt="RinkLink logo" className="h-10 w-10 shrink-0 rounded-xl" />
          <div className="min-w-0">
            <div className="font-display text-lg font-bold tracking-tight text-slate-950 dark:text-slate-50">
              RinkLink
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-[color:var(--app-border-subtle)] bg-[var(--app-surface)] p-5 shadow-soft sm:p-6">
        <PageHeader
          title="Contact us"
          subtitle="Send a message to the RinkLink admins."
          actions={(
            <Button type="button" variant="outline" onClick={handleBack}>
              {isAuthenticated ? <Home className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
              {isAuthenticated ? 'Home' : 'Back to sign in'}
            </Button>
          )}
        />
      </div>

      <Card className="p-5 sm:p-6">
        {sent ? (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-semibold">Message sent</div>
              <div>We sent your message to the RinkLink admins.</div>
            </div>
          </div>
        ) : null}

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
              <span>Name</span>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                required
              />
            </label>
            <label className="block space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
              <span>Email</span>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>
          </div>

          <label className="block space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
            <span>Message</span>
            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Tell us what you need help with."
              rows={6}
              required
            />
          </label>

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={!canSubmit}>
              <Mail className="h-4 w-4" />
              {submitting ? 'Sending...' : 'Send message'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );

  if (isAuthenticated) {
    return content;
  }

  return (
    <main className="min-h-screen bg-[var(--app-bg)] px-4 py-6 sm:px-6 sm:py-8">
      {content}
    </main>
  );
}
