import { AuthView, ForgotPasswordForm, ResetPasswordForm } from '@daveyplate/better-auth-ui';
import { ArrowLeft, Eye, EyeOff, X } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Link as RouterLink, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { api } from '../api/client';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Textarea } from '../components/ui/Textarea';
import { saveSignupAccessRequestDrafts, type SignupAccessRequestDraft } from '../lib/access-request-draft';
import { authApiBaseUrl, authClient } from '../lib/auth-client';
import { buildAuthCallbackUrl, consumeAuthReturnTo, peekAuthReturnTo } from '../lib/auth-routing';
import { cn } from '../lib/cn';
import { useAuth } from '../context/AuthContext';
import { BetterAuthUiProvider } from '../context/BetterAuthUiProvider';
import { useToast } from '../context/ToastContext';
import type { AccessTarget } from '../types';

const appIconSrc = '/icons/rinklink-icon-192.png';
const SIGNUP_TARGET_TYPES = [
  { value: 'team_setup', label: 'Create a new team' },
  { value: 'team', label: 'Team staff access' },
  { value: 'association', label: 'Association access' },
  { value: 'arena', label: 'Arena staff access' },
  { value: 'guardian_link', label: 'Parent or guardian access' },
  { value: 'player_link', label: 'Player access' },
] as const;

const allowedPathnames = new Set([
  'sign-in',
  'sign-up',
  'request-access',
  'check-email',
  'forgot-password',
  'reset-password',
  'sign-out',
  'two-factor',
  'callback',
  'verify-email',
]);

function AuthCard({
  children,
  description,
  eyebrow,
  footer,
  title,
}: {
  children: ReactNode;
  description?: ReactNode;
  eyebrow: string;
  footer?: ReactNode;
  title: string;
}) {
  return (
    <div className="rinklink-auth-card">
      <div className="rinklink-auth-header">
        <div className="space-y-2">
          <div className="rinklink-auth-card-eyebrow">{eyebrow}</div>
          <div className="rinklink-auth-card-title">{title}</div>
          {description ? (
            <div className="rinklink-auth-card-copy">{description}</div>
          ) : null}
        </div>
      </div>
      <div className="rinklink-auth-content">{children}</div>
      {footer ? <div className="rinklink-auth-footer">{footer}</div> : null}
    </div>
  );
}

function signupTargetSearchLabel(targetType: (typeof SIGNUP_TARGET_TYPES)[number]['value']) {
  switch (targetType) {
    case 'association':
      return 'Find association';
    case 'arena':
      return 'Find arena';
    case 'guardian_link':
    case 'player_link':
      return 'Find player';
    default:
      return 'Find team';
  }
}

function CheckEmailCard() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const pushToast = useToast();
  const [busy, setBusy] = useState(false);
  const email = searchParams.get('email') || '';

  const resendVerification = async () => {
    if (!email) {
      pushToast({
        title: 'Email required',
        description: 'Return to sign up so we know which email address to verify.',
        variant: 'warning',
      });
      return;
    }

    setBusy(true);
    try {
      await (authClient.sendVerificationEmail as (payload: Record<string, unknown>) => Promise<unknown>)({
        email,
        callbackURL: buildAuthCallbackUrl('/pending'),
        fetchOptions: { throw: true },
      });
      pushToast({
        title: 'Verification email resent',
        description: email,
        variant: 'success',
      });
    } catch (error) {
      pushToast({
        title: 'Unable to resend verification email',
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      eyebrow="Check your email"
      title="Finish verifying your email"
      description={email ? `We sent a verification link to ${email}. Use it to finish creating your RinkLink account.` : 'Open your inbox and use the verification link to finish creating your RinkLink account.'}
      footer={(
        <div className="flex flex-wrap items-center gap-3">
          <RouterLink to="/auth/sign-in" className="rinklink-auth-footer-link inline-flex items-center gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to sign in</span>
          </RouterLink>
        </div>
      )}
    >
      <div className="space-y-5 text-sm text-slate-600 dark:text-slate-300">
        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/50">
          <div className="font-medium text-slate-900 dark:text-slate-100">What happens next</div>
          <div className="mt-2">
            After you verify your email, your request will be sent to an admin for review.
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={() => void resendVerification()} disabled={busy || !email}>
            {busy ? 'Resending…' : 'Resend verification email'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/auth/sign-in')}>
            I already verified
          </Button>
        </div>
      </div>
    </AuthCard>
  );
}

function localVerificationRedirect(value: string | null): string {
  const fallback = buildAuthCallbackUrl('/pending');
  if (!value) {
    return fallback;
  }

  try {
    const parsed = new URL(value, window.location.origin);
    if (parsed.origin !== window.location.origin) {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

function VerifyEmailCard() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'verifying' | 'failed'>('verifying');
  const [message, setMessage] = useState('Verifying your email now.');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;

    const token = searchParams.get('token');
    if (!token) {
      setStatus('failed');
      setMessage('This verification link is missing its token. Use the resend option from sign in.');
      return;
    }

    const callbackURL = localVerificationRedirect(searchParams.get('callbackURL'));

    void (async () => {
      const response = await fetch(`${authApiBaseUrl}/verify-email?token=${encodeURIComponent(token)}`, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        let detail = `${response.status}`;
        try {
          const payload = await response.json() as { code?: string; message?: string };
          detail = payload.message || payload.code || detail;
        } catch {
          detail = await response.text();
        }
        throw new Error(detail);
      }

      window.location.assign(callbackURL);
    })().catch((error) => {
      setStatus('failed');
      setMessage(error instanceof Error ? error.message : String(error));
    });
  }, [searchParams]);

  return (
    <AuthCard
      eyebrow={status === 'verifying' ? 'Verifying email' : 'Verification failed'}
      title={status === 'verifying' ? 'Finishing your RinkLink account' : 'Unable to verify this link'}
      description={message}
      footer={(
        <RouterLink to="/auth/sign-in" className="rinklink-auth-footer-link inline-flex items-center gap-1.5">
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to sign in</span>
        </RouterLink>
      )}
    >
      <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300">
        {status === 'verifying' ? (
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/50">
            RinkLink will continue automatically when verification is complete.
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={() => window.location.assign('/auth/sign-in')}>
              Return to sign in
            </Button>
          </div>
        )}
      </div>
    </AuthCard>
  );
}

function PasswordField({
  autoComplete,
  disabled,
  id,
  label,
  onChange,
  placeholder,
  value,
}: {
  autoComplete: string;
  disabled?: boolean;
  id: string;
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="rinklink-auth-field">
      <label className="rinklink-auth-label" htmlFor={id}>{label}</label>
      <div className="rinklink-auth-password-field">
        <Input
          id={id}
          className="rinklink-auth-input rinklink-auth-input--password"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          disabled={disabled}
          placeholder={placeholder}
          type={visible ? 'text' : 'password'}
        />
        <button
          type="button"
          className="rinklink-auth-password-toggle"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          disabled={disabled}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          <span>{visible ? 'Hide' : 'Show'}</span>
        </button>
      </div>
    </div>
  );
}

function getAuthErrorDetails(error: unknown) {
  const payload = typeof error === 'object' && error !== null
    ? error as {
      code?: string;
      message?: string;
      status?: number;
      error?: { code?: string; message?: string } | string;
    }
    : null;
  const nestedError = typeof payload?.error === 'object' && payload.error !== null
    ? payload.error
    : null;
  const message = error instanceof Error
    ? error.message
    : payload?.message
      || nestedError?.message
      || (typeof payload?.error === 'string' ? payload.error : undefined)
      || String(error);
  const errorCode = nestedError?.code
    || (typeof payload?.error === 'string' ? payload.error : undefined)
    || payload?.code;
  const status = payload?.status;

  return {
    message,
    errorCode,
    status,
  };
}

function describeSignUpError(error: unknown): string {
  const { message, errorCode, status } = getAuthErrorDetails(error);
  const normalizedCode = errorCode?.toUpperCase();
  const normalizedMessage = message.trim().toLowerCase();

  if (
    normalizedCode === 'USER_ALREADY_EXISTS'
    || normalizedCode === 'EMAIL_ALREADY_EXISTS'
    || normalizedMessage.includes('already exists')
  ) {
    return 'An account with this email already exists. Sign in instead, or use forgot password if needed.';
  }

  if (normalizedCode === 'PASSWORD_TOO_SHORT' || normalizedMessage.includes('password too short')) {
    return 'Use a password with at least 12 characters.';
  }

  if (normalizedCode === 'INVALID_CALLBACK_URL' || normalizedMessage.includes('invalid callback')) {
    return 'Open the current RinkLink sign-up page and try again.';
  }

  if (status === 400) {
    return 'Check the email, name, and password, then try again.';
  }

  if (normalizedMessage === 'failed to fetch' || normalizedMessage.includes('networkerror')) {
    return 'RinkLink could not reach the auth service. Check that the app is fully running, then try again.';
  }

  return message;
}

async function parseAuthErrorResponse(response: Response): Promise<Error & { error?: { code?: string }; status?: number }> {
  let payload: unknown = null;
  let fallbackMessage = response.statusText || `${response.status}`;

  try {
    payload = await response.json();
  } catch {
    try {
      fallbackMessage = await response.text();
    } catch {
      // Keep the HTTP status text fallback.
    }
  }

  const payloadObject = typeof payload === 'object' && payload !== null
    ? payload as {
      code?: string;
      message?: string;
      error?: string | { code?: string; message?: string };
    }
    : null;
  const nestedError = typeof payloadObject?.error === 'object' && payloadObject.error !== null
    ? payloadObject.error
    : null;
  const message = payloadObject?.message
    || nestedError?.message
    || (typeof payloadObject?.error === 'string' ? payloadObject.error : undefined)
    || fallbackMessage;
  const code = payloadObject?.code || nestedError?.code;
  const error = new Error(message) as Error & { error?: { code?: string }; status?: number };
  error.status = response.status;
  error.error = code ? { code } : undefined;
  return error;
}

async function signInWithEmail(email: string, password: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${authApiBaseUrl}/sign-in/email`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw await parseAuthErrorResponse(response);
  }

  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

function SignInCard() {
  const navigate = useNavigate();
  const pushToast = useToast();
  const { refreshProfile } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail || !password) {
      pushToast({
        title: 'Complete all fields',
        description: 'Email and password are required.',
        variant: 'warning',
      });
      return;
    }

    setBusy(true);
    try {
      const response = await signInWithEmail(trimmedEmail, password);

      if (response && 'twoFactorRedirect' in response && response.twoFactorRedirect) {
        window.location.assign('/auth/two-factor');
        return;
      }

      await refreshProfile({ assumeAuthenticated: true });
      navigate(consumeAuthReturnTo() || '/', { replace: true });
    } catch (error) {
      const { message, errorCode, status } = getAuthErrorDetails(error);

      if (errorCode === 'EMAIL_NOT_VERIFIED') {
        pushToast({
          title: 'Verify your email first',
          description: trimmedEmail,
          variant: 'warning',
        });
        navigate(`/auth/check-email?email=${encodeURIComponent(trimmedEmail)}`);
        return;
      }

      const normalizedCode = errorCode?.toUpperCase();
      const invalidCredentials = status === 401
        || message.trim().toLowerCase() === 'unauthorized'
        || normalizedCode === 'INVALID_CREDENTIALS'
        || normalizedCode === 'INVALID_EMAIL_OR_PASSWORD'
        || normalizedCode === 'CREDENTIALS_SIGN_IN_FAILED';
      const accountDisabled = status === 403
        || message.trim().toLowerCase() === 'forbidden'
        || normalizedCode === 'ACCOUNT_DISABLED';

      setPassword('');
      pushToast({
        title: 'Unable to sign in',
        description: accountDisabled
          ? 'Sign-in is disabled for this account. Contact your club or platform administrator.'
          : invalidCredentials
            ? 'Username and password combination not valid.'
            : message,
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      eyebrow="Welcome back"
      title="Sign in to RinkLink"
      description="Pick up where your team left off."
      footer={(
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-slate-500 dark:text-slate-400">Need an account?</span>
          <RouterLink to="/auth/sign-up" className="rinklink-auth-footer-link">
            Create account
          </RouterLink>
        </div>
      )}
    >
      <form className="rinklink-auth-form" onSubmit={(event) => {
        event.preventDefault();
        void signIn();
      }}>
        <div className="rinklink-auth-field">
          <label className="rinklink-auth-label" htmlFor="sign-in-email">Email</label>
          <Input
            id="sign-in-email"
            className="rinklink-auth-input"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
            type="email"
            disabled={busy}
          />
        </div>

        <PasswordField
          id="sign-in-password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          placeholder="Your password"
          disabled={busy}
        />

        <div className="flex items-center justify-end">
          <RouterLink to="/auth/forgot-password" className="rinklink-auth-forgot-link text-sm">
            Forgot password?
          </RouterLink>
        </div>

        <Button type="submit" className="rinklink-auth-primary-button" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthCard>
  );
}

function SignUpCard() {
  const navigate = useNavigate();
  const pushToast = useToast();
  const inviteReturnTo = (peekAuthReturnTo() || '').startsWith('/invite/');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const signUp = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = name.trim();

    if (!trimmedName || !trimmedEmail || !password) {
      pushToast({
        title: 'Complete all fields',
        description: 'Name, email, password, and confirmation are required.',
        variant: 'warning',
      });
      return;
    }

    if (password.length < 12) {
      pushToast({
        title: 'Password too short',
        description: 'Use at least 12 characters.',
        variant: 'warning',
      });
      return;
    }

    if (password !== confirmPassword) {
      pushToast({
        title: 'Passwords do not match',
        description: 'Re-enter the same password in both fields.',
        variant: 'warning',
      });
      return;
    }

    setBusy(true);
    try {
      const payload = await (authClient.signUp.email as unknown as (body: Record<string, unknown>) => Promise<Record<string, unknown>>)({
        name: trimmedName,
        email: trimmedEmail,
        password,
        callbackURL: buildAuthCallbackUrl('/pending'),
        fetchOptions: { throw: true },
      });

      if (payload && 'token' in payload && payload.token) {
        navigate('/');
        return;
      }

      pushToast({
        title: 'Check your email',
        description: trimmedEmail,
        variant: 'success',
      });
      navigate(inviteReturnTo
        ? `/auth/check-email?email=${encodeURIComponent(trimmedEmail)}`
        : `/auth/request-access?email=${encodeURIComponent(trimmedEmail)}`);
    } catch (error) {
      pushToast({
        title: 'Unable to create account',
        description: describeSignUpError(error),
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      eyebrow="Create account"
      title="Create your RinkLink account"
      description={inviteReturnTo
        ? 'Create your account with the invited email, verify it, and RinkLink will return you to the invite.'
        : 'Enter your details to get started.'}
      footer={(
        <RouterLink to="/auth/sign-in" className="rinklink-auth-footer-link inline-flex items-center gap-1.5">
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to sign in</span>
        </RouterLink>
      )}
    >
      <form className="rinklink-auth-form" onSubmit={(event) => {
        event.preventDefault();
        void signUp();
      }}>
        <div className="rinklink-auth-field">
          <label className="rinklink-auth-label" htmlFor="sign-up-name">Full name</label>
          <Input
            id="sign-up-name"
            className="rinklink-auth-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            placeholder="Your name"
            disabled={busy}
          />
        </div>

        <div className="rinklink-auth-field">
          <label className="rinklink-auth-label" htmlFor="sign-up-email">Email</label>
          <Input
            id="sign-up-email"
            className="rinklink-auth-input"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
            type="email"
            disabled={busy}
          />
        </div>

        <PasswordField
          id="sign-up-password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          placeholder="At least 12 characters"
          disabled={busy}
        />

        <PasswordField
          id="sign-up-confirm-password"
          label="Confirm password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
          placeholder="Repeat your password"
          disabled={busy}
        />

        <Button type="submit" className="rinklink-auth-primary-button" disabled={busy}>
          {busy ? 'Creating account…' : inviteReturnTo ? 'Create account' : 'Create account and continue'}
        </Button>
      </form>
    </AuthCard>
  );
}

function RequestAccessSetupCard() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const pushToast = useToast();
  const email = searchParams.get('email') || '';
  const [targetType, setTargetType] = useState<(typeof SIGNUP_TARGET_TYPES)[number]['value']>('team');
  const [teamQuery, setTeamQuery] = useState('');
  const [teamOptions, setTeamOptions] = useState<AccessTarget[]>([]);
  const [teamId, setTeamId] = useState('');
  const [targetQuery, setTargetQuery] = useState('');
  const [targetOptions, setTargetOptions] = useState<AccessTarget[]>([]);
  const [targetId, setTargetId] = useState('');
  const [notes, setNotes] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamAgeGroup, setNewTeamAgeGroup] = useState('');
  const [newTeamLevel, setNewTeamLevel] = useState('');
  const [newTeamLocation, setNewTeamLocation] = useState('');
  const [drafts, setDrafts] = useState<SignupAccessRequestDraft[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  useEffect(() => {
    if (targetType === 'guardian_link' || targetType === 'player_link') {
      return;
    }
    setTeamQuery('');
    setTeamOptions([]);
    setTeamId('');
  }, [targetType]);

  useEffect(() => {
    if (teamQuery.trim().length < 2) {
      setTeamOptions([]);
      setTeamId('');
      return;
    }
    let cancelled = false;
    api.getPublicAccessTargets({ target_type: 'team', q: teamQuery.trim() })
      .then((targets) => {
        if (cancelled) return;
        setTeamOptions(targets);
        setTeamId((current) => (current && targets.some((team) => team.id === current) ? current : targets[0]?.id || ''));
      })
      .catch((error) => {
        if (cancelled) return;
        setTeamOptions([]);
        setTeamId('');
        setLookupError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [teamQuery]);

  useEffect(() => {
    if (targetType === 'team_setup' || targetQuery.trim().length < 2) {
      setTargetOptions([]);
      setTargetId('');
      setLookupLoading(false);
      setLookupError(null);
      return;
    }
    if ((targetType === 'guardian_link' || targetType === 'player_link') && !teamId) {
      setTargetOptions([]);
      setTargetId('');
      setLookupLoading(false);
      return;
    }

    let cancelled = false;
    const params: Record<string, string> = { target_type: targetType, q: targetQuery.trim() };
    if (targetType === 'guardian_link' || targetType === 'player_link') {
      params.team_id = teamId;
    }
    setLookupLoading(true);
    setLookupError(null);
    api.getPublicAccessTargets(params)
      .then((targets) => {
        if (cancelled) return;
        setTargetOptions(targets);
        setTargetId((current) => (current && targets.some((target) => target.id === current) ? current : targets[0]?.id || ''));
      })
      .catch((error) => {
        if (cancelled) return;
        setTargetOptions([]);
        setTargetId('');
        setLookupError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) {
          setLookupLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [targetQuery, targetType, teamId]);

  const selectedTarget = targetOptions.find((target) => target.id === targetId) || null;
  const checkEmailPath = `/auth/check-email${email ? `?email=${encodeURIComponent(email)}` : ''}`;
  const isPlayerAccessRequest = targetType === 'guardian_link' || targetType === 'player_link';
  const isGuardianAccessRequest = targetType === 'guardian_link';
  const isNewTeamRequest = targetType === 'team_setup';
  const searchLabel = signupTargetSearchLabel(targetType);
  const selectedLabel = isPlayerAccessRequest ? 'Player' : 'Choose one';
  const searchPlaceholder = isPlayerAccessRequest
    ? 'Start typing the player name'
    : 'Start typing a name';

  const buildCurrentDraft = (): SignupAccessRequestDraft | null => {
    if (isNewTeamRequest) {
      const teamName = newTeamName.trim();
      const ageGroup = newTeamAgeGroup.trim();
      const level = newTeamLevel.trim();
      if (!teamName || !ageGroup || !level) {
        pushToast({
          title: 'Team details required',
          description: 'Add the team name, age group, and level before continuing.',
          variant: 'warning',
        });
        return null;
      }
      return {
        target_type: 'team_setup',
        target_id: 'new-team',
        target_name: teamName,
        target_context: [ageGroup, level].filter(Boolean).join(' · ') || null,
        notes: notes.trim() || null,
        details: {
          team_name: teamName,
          age_group: ageGroup,
          level,
          location: newTeamLocation.trim(),
        },
      };
    }
    if (!selectedTarget) {
      pushToast({
        title: 'Choose access',
        description: 'Search and choose the team, association, arena, or player before continuing.',
        variant: 'warning',
      });
      return null;
    }
    return {
      target_type: selectedTarget.type,
      target_id: selectedTarget.id,
      target_name: selectedTarget.name,
      target_context: selectedTarget.context,
      notes: notes.trim() || null,
    };
  };

  const addCurrentRequest = () => {
    const draft = buildCurrentDraft();
    if (!draft) return;
    setDrafts((current) => {
      const withoutDuplicate = current.filter((item) => !(item.target_type === draft.target_type && item.target_id === draft.target_id));
      return [...withoutDuplicate, draft];
    });
    setTargetQuery('');
    setTargetOptions([]);
    setTargetId('');
    setNotes('');
  };

  const removeDraft = (draftToRemove: SignupAccessRequestDraft) => {
    setDrafts((current) => current.filter((item) => !(item.target_type === draftToRemove.target_type && item.target_id === draftToRemove.target_id)));
  };

  const continueToVerification = () => {
    if (isGuardianAccessRequest) {
      if (drafts.length === 0) {
        pushToast({
          title: 'Add a child',
          description: 'Add each player to the request before continuing.',
          variant: 'warning',
        });
        return;
      }
      saveSignupAccessRequestDrafts(drafts, email);
      navigate(checkEmailPath);
      return;
    }

    const currentDraft = buildCurrentDraft();
    if (!currentDraft) return;
    const nextDrafts = [
      ...drafts.filter((item) => !(item.target_type === currentDraft.target_type && item.target_id === currentDraft.target_id)),
      currentDraft,
    ];
    saveSignupAccessRequestDrafts(nextDrafts, email);
    navigate(checkEmailPath);
  };

  return (
    <AuthCard
      eyebrow="Request access"
      title="Choose your access"
      description="Your account was created. Choose what you need access to, then verify your email."
    >
      <div className="rinklink-auth-form">
        <div className="rinklink-auth-field">
          <label className="rinklink-auth-label" htmlFor="request-access-type">I need</label>
          <Select
            id="request-access-type"
            className="rinklink-auth-input"
            value={targetType}
            onChange={(event) => {
              setTargetType(event.target.value as (typeof SIGNUP_TARGET_TYPES)[number]['value']);
              setTargetQuery('');
              setTargetOptions([]);
              setTargetId('');
              setLookupError(null);
              setDrafts([]);
              setNewTeamName('');
              setNewTeamAgeGroup('');
              setNewTeamLevel('');
              setNewTeamLocation('');
            }}
          >
            {SIGNUP_TARGET_TYPES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
        </div>

        {isPlayerAccessRequest ? (
          <>
            <div className="rinklink-auth-field">
              <label className="rinklink-auth-label" htmlFor="request-team-search">Find team</label>
              <Input
                id="request-team-search"
                className="rinklink-auth-input"
                value={teamQuery}
                onChange={(event) => setTeamQuery(event.target.value)}
                placeholder="Start typing the team name"
              />
            </div>
            <div className="rinklink-auth-field">
              <label className="rinklink-auth-label" htmlFor="request-team">Choose team</label>
              <Select
                id="request-team"
                className="rinklink-auth-input"
                value={teamId}
                onChange={(event) => setTeamId(event.target.value)}
                disabled={teamOptions.length === 0}
              >
                {teamOptions.length === 0 ? (
                  <option value="">Search for a team</option>
                ) : (
                  teamOptions.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}{team.context ? ` · ${team.context}` : ''}
                    </option>
                  ))
                )}
              </Select>
            </div>
          </>
        ) : null}

        {isNewTeamRequest ? (
          <>
            <div className="rinklink-auth-field">
              <label className="rinklink-auth-label" htmlFor="new-team-name">Team name</label>
              <Input id="new-team-name" className="rinklink-auth-input" value={newTeamName} onChange={(event) => setNewTeamName(event.target.value)} placeholder="Example: RinkLink 12U Blue" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rinklink-auth-field">
                <label className="rinklink-auth-label" htmlFor="new-team-age">Age group</label>
                <Input id="new-team-age" className="rinklink-auth-input" value={newTeamAgeGroup} onChange={(event) => setNewTeamAgeGroup(event.target.value)} placeholder="Example: 12U" />
              </div>
              <div className="rinklink-auth-field">
                <label className="rinklink-auth-label" htmlFor="new-team-level">Level</label>
                <Input id="new-team-level" className="rinklink-auth-input" value={newTeamLevel} onChange={(event) => setNewTeamLevel(event.target.value)} placeholder="Example: AA" />
              </div>
            </div>
            <div className="rinklink-auth-field">
              <label className="rinklink-auth-label" htmlFor="new-team-location">Location</label>
              <Input id="new-team-location" className="rinklink-auth-input" value={newTeamLocation} onChange={(event) => setNewTeamLocation(event.target.value)} placeholder="Optional" />
            </div>
          </>
        ) : (
          <>
            <div className="rinklink-auth-field">
              <label className="rinklink-auth-label" htmlFor="request-target-search">{searchLabel}</label>
              <Input
                id="request-target-search"
                className="rinklink-auth-input"
                value={targetQuery}
                onChange={(event) => setTargetQuery(event.target.value)}
                placeholder={searchPlaceholder}
                disabled={isPlayerAccessRequest && !teamId}
              />
            </div>

            <div className="rinklink-auth-field">
              <label className="rinklink-auth-label" htmlFor="request-target">{selectedLabel}</label>
              <Select
                id="request-target"
                className="rinklink-auth-input"
                value={targetId}
                onChange={(event) => setTargetId(event.target.value)}
                disabled={lookupLoading || targetOptions.length === 0}
              >
                {targetOptions.length === 0 ? (
                  <option value="">{lookupLoading ? 'Loading matches…' : 'Search first'}</option>
                ) : (
                  targetOptions.map((target) => (
                    <option key={target.id} value={target.id}>
                      {target.name}{target.context ? ` · ${target.context}` : ''}
                    </option>
                  ))
                )}
              </Select>
              {lookupError ? (
                <div className="rinklink-auth-error mt-2">{lookupError}</div>
              ) : null}
            </div>
          </>
        )}

        <div className="rinklink-auth-field">
          <label className="rinklink-auth-label" htmlFor="request-notes">Note for admin</label>
          <Textarea
            id="request-notes"
            className="rinklink-auth-input"
            rows={4}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={isPlayerAccessRequest ? 'Optional' : "Example: I help with this team's schedule."}
          />
        </div>

        {isGuardianAccessRequest ? (
          <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-4 text-sm dark:border-slate-800 dark:bg-slate-900/50">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-medium text-slate-900 dark:text-slate-100">
                  Children in this request
                </div>
                <div className="mt-1 text-slate-600 dark:text-slate-300">
                  Add each player before continuing.
                </div>
              </div>
              <Button type="button" variant="outline" onClick={addCurrentRequest} disabled={!selectedTarget}>
                Add child
              </Button>
            </div>
            {drafts.length > 0 ? (
              <div className="space-y-2">
                {drafts.map((draft) => (
                  <div
                    key={`${draft.target_type}:${draft.target_id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950/40"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-900 dark:text-slate-100">{draft.target_name}</div>
                      {draft.target_context ? (
                        <div className="truncate text-xs text-slate-500 dark:text-slate-400">{draft.target_context}</div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100"
                      onClick={() => removeDraft(draft)}
                      aria-label={`Remove ${draft.target_name}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 px-3 py-3 text-slate-500 dark:border-slate-700 dark:text-slate-400">
                No players added yet.
              </div>
            )}
          </div>
        ) : null}
        <Button type="button" className="rinklink-auth-primary-button" onClick={continueToVerification} disabled={isGuardianAccessRequest && drafts.length === 0}>
          Continue
        </Button>
      </div>
    </AuthCard>
  );
}

function TwoFactorSignInCard() {
  const pushToast = useToast();
  const [code, setCode] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [method, setMethod] = useState<'totp' | 'backup'>('totp');
  const [trustDevice, setTrustDevice] = useState(false);
  const [busy, setBusy] = useState(false);

  const verify = async () => {
    const value = method === 'totp' ? code.trim() : backupCode.trim();
    if (!value) {
      pushToast({
        title: 'Security code required',
        description: method === 'totp' ? 'Enter your authenticator code.' : 'Enter one of your backup codes.',
        variant: 'warning',
      });
      return;
    }

    setBusy(true);
    try {
      if (method === 'totp') {
        await (authClient.twoFactor.verifyTotp as unknown as (body: Record<string, unknown>) => Promise<unknown>)({
          code: value,
          trustDevice,
          fetchOptions: { throw: true },
        });
      } else {
        await (authClient.twoFactor.verifyBackupCode as unknown as (body: Record<string, unknown>) => Promise<unknown>)({
          code: value,
          trustDevice,
          fetchOptions: { throw: true },
        });
      }
      window.location.assign(buildAuthCallbackUrl('/'));
    } catch (error) {
      pushToast({
        title: 'Unable to verify security code',
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      eyebrow="Two-factor check"
      title="Verify your sign-in"
      description="Enter the code from your authenticator app or use a saved backup code to finish signing in."
      footer={(
        <RouterLink to="/auth/sign-in" className="rinklink-auth-footer-link inline-flex items-center gap-1.5">
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to sign in</span>
        </RouterLink>
      )}
    >
      <form className="rinklink-auth-form" onSubmit={(event) => {
        event.preventDefault();
        void verify();
      }}>
        <div className="rinklink-auth-field">
          <label className="rinklink-auth-label" htmlFor="two-factor-method">Verification method</label>
          <select
            id="two-factor-method"
            className="rinklink-auth-input"
            value={method}
            onChange={(event) => setMethod(event.target.value as 'totp' | 'backup')}
            disabled={busy}
          >
            <option value="totp">Authenticator app</option>
            <option value="backup">Backup code</option>
          </select>
        </div>

        <div className="rinklink-auth-field">
          <label className="rinklink-auth-label" htmlFor="two-factor-code">
            {method === 'totp' ? 'Authenticator code' : 'Backup code'}
          </label>
          <Input
            id="two-factor-code"
            className="rinklink-auth-input"
            value={method === 'totp' ? code : backupCode}
            onChange={(event) => {
              if (method === 'totp') {
                setCode(event.target.value);
              } else {
                setBackupCode(event.target.value);
              }
            }}
            autoComplete="one-time-code"
            placeholder={method === 'totp' ? '123456' : 'backup-code'}
            disabled={busy}
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={trustDevice}
            onChange={(event) => setTrustDevice(event.target.checked)}
            disabled={busy}
          />
          <span>Trust this device for 30 days</span>
        </label>

        <Button type="submit" className="rinklink-auth-primary-button" disabled={busy}>
          {busy ? 'Verifying…' : 'Verify and continue'}
        </Button>
      </form>
    </AuthCard>
  );
}

export default function AuthPage() {
  const { pathname = 'sign-in' } = useParams();
  const isSignUp = pathname === 'sign-up';
  const isRequestAccess = pathname === 'request-access';
  const isCheckEmail = pathname === 'check-email';
  const isForgotPassword = pathname === 'forgot-password';
  const isResetPassword = pathname === 'reset-password';
  const isTwoFactor = pathname === 'two-factor';
  const isVerifyEmail = pathname === 'verify-email';

  if (!allowedPathnames.has(pathname)) {
    return <Navigate to="/auth/sign-in" replace />;
  }

  const pageMeta = pathname === 'sign-up'
    ? {
        mastheadTitle: 'Create your RinkLink account.',
        mastheadSubtitle: 'Sign up, choose the access you need, and verify your email.',
        cardEyebrow: 'Create account',
        cardTitle: 'Create your RinkLink account',
        cardDescription: null,
      }
    : isRequestAccess
      ? {
          mastheadTitle: 'Choose what you need.',
          mastheadSubtitle: 'Pick the team, association, arena, or player connected to your account.',
          cardEyebrow: 'Request access',
          cardTitle: 'Tell us what you need',
          cardDescription: null,
        }
    : pathname === 'check-email'
      ? {
          mastheadTitle: 'Check your inbox.',
          mastheadSubtitle: 'Use the verification link to finish signup. Then an admin can review your request.',
          cardEyebrow: 'Check your email',
          cardTitle: 'Finish verifying your email',
          cardDescription: null,
        }
      : isVerifyEmail
        ? {
            mastheadTitle: 'Verifying your email.',
            mastheadSubtitle: 'RinkLink is completing the identity step and preparing your session.',
            cardEyebrow: 'Verifying email',
            cardTitle: 'Finishing verification',
            cardDescription: null,
          }
      : pathname === 'forgot-password'
        ? {
            mastheadTitle: 'Reset your password.',
            mastheadSubtitle: 'Use the email on your RinkLink account and we will send you a secure reset link.',
            cardEyebrow: 'Reset password',
            cardTitle: 'Recover your account',
            cardDescription: 'Enter your email and we will send the next step.',
          }
      : pathname === 'reset-password'
          ? {
              mastheadTitle: 'Set a new password.',
              mastheadSubtitle: 'Choose a new password for your RinkLink login and return to the app.',
              cardEyebrow: 'Choose a new password',
              cardTitle: 'Set your new password',
              cardDescription: 'Use a secure password you can rely on for daily access.',
            }
          : pathname === 'two-factor'
            ? {
                mastheadTitle: 'Finish your sign-in securely.',
                mastheadSubtitle: 'Privileged RinkLink access requires a second factor before the backend will honor management capabilities.',
                cardEyebrow: 'Two-factor check',
                cardTitle: 'Verify your sign-in',
                cardDescription: 'Use your authenticator app or one of your backup codes.',
              }
          : pathname === 'sign-out'
            ? {
                mastheadTitle: 'Sign out of RinkLink.',
                mastheadSubtitle: 'End this session safely.',
                cardEyebrow: 'Sign out',
                cardTitle: 'Confirm sign out',
                cardDescription: 'You can sign back in whenever you need to.',
              }
            : pathname === 'callback'
              ? {
                  mastheadTitle: 'RinkLink is getting your session ready.',
                  mastheadSubtitle: 'Completing your authentication flow now.',
                  cardEyebrow: 'Signing you in',
                  cardTitle: 'Finishing sign-in',
                  cardDescription: 'This should only take a moment.',
                }
              : {
                  mastheadTitle: 'Welcome back to RinkLink.',
                  mastheadSubtitle: 'Sign in to get back to today’s schedule, availability updates, booking work, and access requests.',
                  cardEyebrow: 'Welcome back',
                  cardTitle: 'Sign in to RinkLink',
                  cardDescription: 'Pick up where your team left off.',
                };

  const featureItems = isSignUp || isRequestAccess || isCheckEmail
    ? []
    : isVerifyEmail
      ? [
          {
            title: 'Checking your link',
            copy: 'This should only take a moment.',
          },
          {
            title: 'Almost done',
            copy: 'RinkLink will open once your email is verified.',
          },
          {
            title: 'Need access?',
            copy: 'An admin can review your request after signup.',
          },
        ]
    : isForgotPassword || isResetPassword
      ? [
          {
            title: 'Use your account email',
            copy: 'Password recovery only works for the email already attached to your RinkLink login.',
          },
          {
            title: 'Watch your inbox',
            copy: 'The reset link lands in email, so you can securely choose a new password there.',
          },
          {
            title: 'Back to work quickly',
            copy: 'Once your password is updated, you can return straight to sign in and continue.',
          },
        ]
      : isTwoFactor
        ? [
            {
              title: 'Management is gated',
              copy: 'Admin, staff-management, and arena-management access stays locked until second-factor verification succeeds.',
            },
            {
              title: 'Authenticator first',
              copy: 'Use the code from the authenticator app you enrolled in settings, or fall back to a saved backup code.',
            },
            {
              title: 'Trusted devices',
              copy: 'You can trust the current device for a limited window to reduce repeat prompts.',
            },
          ]
      : [];

  const authViewClassNames = {
    base: cn('rinklink-auth-card', isSignUp && 'rinklink-auth-card--signup'),
    header: 'rinklink-auth-header',
    title: 'rinklink-auth-title',
    description: 'rinklink-auth-description',
    content: 'rinklink-auth-content',
    footer: 'rinklink-auth-footer',
    footerLink: 'rinklink-auth-footer-link',
    continueWith: 'rinklink-auth-continue',
    separator: 'rinklink-auth-separator',
    form: {
      base: 'rinklink-auth-form',
      input: 'rinklink-auth-input',
      label: 'rinklink-auth-label',
      error: 'rinklink-auth-error',
      forgotPasswordLink: 'rinklink-auth-forgot-link',
      primaryButton: 'rinklink-auth-primary-button',
      outlineButton: 'rinklink-auth-outline-button',
      providerButton: 'rinklink-auth-provider-button',
      secondaryButton: 'rinklink-auth-secondary-button',
      button: 'rinklink-auth-button',
    },
  } as const;

  const customRecoveryFooter = (
    <RouterLink to="/auth/sign-in" className="rinklink-auth-footer-link inline-flex items-center gap-1.5">
      <ArrowLeft className="h-3.5 w-3.5" />
      <span>Back to sign in</span>
    </RouterLink>
  );

  const recoveryCard = (form: ReactNode) => (
    <div className="rinklink-auth-card">
      <div className="rinklink-auth-header">
        <div className="space-y-2">
          <div className="rinklink-auth-card-eyebrow">{pageMeta.cardEyebrow}</div>
          <div className="rinklink-auth-card-title">{pageMeta.cardTitle}</div>
          {pageMeta.cardDescription ? (
            <div className="rinklink-auth-card-copy">{pageMeta.cardDescription}</div>
          ) : null}
        </div>
      </div>
      <div className="rinklink-auth-content">{form}</div>
      <div className="rinklink-auth-footer rinklink-auth-footer--back">{customRecoveryFooter}</div>
    </div>
  );
  const authUi = (node: ReactNode) => (
    <BetterAuthUiProvider>
      {node}
    </BetterAuthUiProvider>
  );

  return (
    <main className="rinklink-auth-shell rinklink-auth-page">
      <div className="rinklink-auth-layout">
        <section className="rinklink-auth-hero">
          <div className="rinklink-auth-brand">
            <img src={appIconSrc} alt="RinkLink logo" className="h-11 w-11 shrink-0 rounded-xl" />
            <div className="min-w-0">
              <div className="font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-slate-50">
                RinkLink
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h1 className="rinklink-auth-hero-title">{pageMeta.mastheadTitle}</h1>
            <p className="rinklink-auth-hero-subtitle">{pageMeta.mastheadSubtitle}</p>
          </div>

          {featureItems.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {featureItems.map((item) => (
                <div key={item.title} className="rinklink-auth-feature">
                  <div className="rinklink-auth-feature-title">{item.title}</div>
                  <div className="rinklink-auth-feature-copy">{item.copy}</div>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className={cn('rinklink-auth-panel max-w-xl', (isSignUp || isRequestAccess) && 'max-w-2xl')}>
          {isSignUp
            ? <SignUpCard />
            : isRequestAccess
              ? <RequestAccessSetupCard />
              : isCheckEmail
              ? <CheckEmailCard />
              : isVerifyEmail
                ? <VerifyEmailCard />
              : pathname === 'sign-in'
                ? <SignInCard />
              : isTwoFactor
                ? <TwoFactorSignInCard />
              : isForgotPassword
                ? authUi(recoveryCard(
                    <ForgotPasswordForm
                      classNames={authViewClassNames.form}
                      localization={{}}
                    />,
                  ))
                : isResetPassword
                  ? authUi(recoveryCard(
                      <ResetPasswordForm
                        classNames={authViewClassNames.form}
                        localization={{}}
                      />,
                    ))
                  : (
                    authUi(
                      <AuthView
                        pathname={pathname}
                        classNames={authViewClassNames}
                        cardHeader={(
                          <div className={cn('space-y-2', isSignUp && 'rinklink-auth-card-header--signup')}>
                            <div className="rinklink-auth-card-eyebrow">{pageMeta.cardEyebrow}</div>
                            <div className={cn('rinklink-auth-card-title', isSignUp && 'rinklink-auth-card-title--signup')}>
                              {pageMeta.cardTitle}
                            </div>
                            {pageMeta.cardDescription ? (
                              <div className="rinklink-auth-card-copy">{pageMeta.cardDescription}</div>
                            ) : null}
                          </div>
                        )}
                      />,
                    )
                  )}
        </section>
      </div>
      <footer className="rinklink-auth-site-footer">
        <span>Copyright &copy; {new Date().getFullYear()} RinkLink</span>
        <RouterLink to="/contact" className="rinklink-auth-footer-link">
          Contact us
        </RouterLink>
      </footer>
    </main>
  );
}
