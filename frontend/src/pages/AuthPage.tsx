import { AuthView, ForgotPasswordForm, ResetPasswordForm } from '@daveyplate/better-auth-ui';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link as RouterLink, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { authClient } from '../lib/auth-client';
import { buildAuthCallbackUrl } from '../lib/auth-routing';
import { cn } from '../lib/cn';
import { useToast } from '../context/ToastContext';

const allowedPathnames = new Set([
  'sign-in',
  'sign-up',
  'check-email',
  'forgot-password',
  'reset-password',
  'sign-out',
  'two-factor',
  'callback',
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
          <Button type="button" variant="ghost" onClick={() => navigate('/auth/sign-up')}>
            Change email
          </Button>
        </div>
      )}
    >
      <div className="space-y-5 text-sm text-slate-600 dark:text-slate-300">
        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/50">
          <div className="font-medium text-slate-900 dark:text-slate-100">What happens next</div>
          <div className="mt-2">
            After verification, RinkLink will sign you in automatically and route you to the right next step:
            pending onboarding if you have no grants yet, or directly into the app if you already have access.
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
  const message = error instanceof Error ? error.message : String(error);
  const errorCode = typeof error === 'object' && error !== null && 'error' in error
    ? (error as { error?: { code?: string } }).error?.code
    : undefined;
  const status = typeof error === 'object' && error !== null && 'status' in error
    ? (error as { status?: number }).status
    : undefined;

  return {
    message,
    errorCode,
    status,
  };
}

function SignInCard() {
  const navigate = useNavigate();
  const pushToast = useToast();
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
      const response = await (authClient.signIn.email as unknown as (body: Record<string, unknown>) => Promise<Record<string, unknown>>)({
        email: trimmedEmail,
        password,
        callbackURL: buildAuthCallbackUrl('/'),
        fetchOptions: { throw: true },
      });

      if (response && 'twoFactorRedirect' in response && response.twoFactorRedirect) {
        window.location.assign('/auth/two-factor');
        return;
      }

      window.location.assign(buildAuthCallbackUrl('/'));
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
      navigate(`/auth/check-email?email=${encodeURIComponent(trimmedEmail)}`);
    } catch (error) {
      pushToast({
        title: 'Unable to create account',
        description: error instanceof Error ? error.message : String(error),
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
      description="Self-signup creates your identity first. You can verify your email, review invites, browse published team information, and request app access after that."
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
          {busy ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
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
  const isCheckEmail = pathname === 'check-email';
  const isForgotPassword = pathname === 'forgot-password';
  const isResetPassword = pathname === 'reset-password';
  const isTwoFactor = pathname === 'two-factor';

  if (!allowedPathnames.has(pathname)) {
    return <Navigate to="/auth/sign-in" replace />;
  }

  const pageMeta = pathname === 'sign-up'
    ? {
        mastheadTitle: 'Join the teams, families, and arenas already running on RinkLink.',
        mastheadSubtitle: 'Create your account, verify your email, then review invites or request the exact access you need.',
        cardEyebrow: 'Create account',
        cardTitle: 'Create your RinkLink account',
        cardDescription: null,
      }
    : pathname === 'check-email'
      ? {
          mastheadTitle: 'Check your inbox.',
          mastheadSubtitle: 'Verification completes the identity step, then RinkLink routes you into pending onboarding or your granted workspace.',
          cardEyebrow: 'Check your email',
          cardTitle: 'Finish verifying your email',
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

  const featureItems = isSignUp || isCheckEmail
    ? [
        {
          title: 'Scoped access',
          copy: 'Identity comes first. Resource rights are still granted by the right admin for the right team, arena, or family link.',
        },
        {
          title: 'Invite ready',
          copy: 'Invite links can take a brand-new user through signup, email verification, and exact grant acceptance.',
        },
        {
          title: 'Pending browse',
          copy: 'Verified users can still browse published teams, schedules, and standings while waiting on approval.',
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
      : [
          {
            title: 'Today’s schedule',
            copy: 'Games, practices, and rink details are ready where you left them.',
          },
          {
            title: 'Availability updates',
            copy: 'Review player, family, and staff responses without digging through messages.',
          },
          {
            title: 'Access and invites',
            copy: 'Handle approvals, requests, and account changes from the same workspace.',
          },
        ];

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

  return (
    <main className="rinklink-auth-shell rinklink-auth-page">
      <div className="rinklink-auth-layout">
        <section className="rinklink-auth-hero">
          <div className="rinklink-auth-brand">
            <img src="/favicon.svg" alt="RinkLink logo" className="h-11 w-11 shrink-0" />
            <div className="min-w-0">
              <div className="font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-slate-50">
                RinkLink
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-300">
                Schedules, access, and rink operations in sync.
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h1 className="rinklink-auth-hero-title">{pageMeta.mastheadTitle}</h1>
            <p className="rinklink-auth-hero-subtitle">{pageMeta.mastheadSubtitle}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {featureItems.map((item) => (
              <div key={item.title} className="rinklink-auth-feature">
                <div className="rinklink-auth-feature-title">{item.title}</div>
                <div className="rinklink-auth-feature-copy">{item.copy}</div>
              </div>
            ))}
          </div>
        </section>

        <section className={cn('rinklink-auth-panel max-w-xl', isSignUp && 'max-w-2xl')}>
          {isSignUp
            ? <SignUpCard />
            : isCheckEmail
              ? <CheckEmailCard />
              : pathname === 'sign-in'
                ? <SignInCard />
              : isTwoFactor
                ? <TwoFactorSignInCard />
              : isForgotPassword
                ? recoveryCard(
                    <ForgotPasswordForm
                      classNames={authViewClassNames.form}
                      localization={{}}
                    />,
                  )
                : isResetPassword
                  ? recoveryCard(
                      <ResetPasswordForm
                        classNames={authViewClassNames.form}
                        localization={{}}
                      />,
                    )
                  : (
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
                    />
                  )}
        </section>
      </div>
    </main>
  );
}
