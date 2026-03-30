import { AuthView, ForgotPasswordForm, ResetPasswordForm } from '@daveyplate/better-auth-ui';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link as RouterLink, Navigate, useParams } from 'react-router-dom';

import { cn } from '../lib/cn';

const allowedPathnames = new Set([
  'sign-in',
  'sign-up',
  'forgot-password',
  'reset-password',
  'sign-out',
  'callback',
]);

export default function AuthPage() {
  const { pathname = 'sign-in' } = useParams();
  const isSignUp = pathname === 'sign-up';
  const isForgotPassword = pathname === 'forgot-password';
  const isResetPassword = pathname === 'reset-password';

  if (!allowedPathnames.has(pathname)) {
    return <Navigate to="/auth/sign-in" replace />;
  }

  const pageMeta = pathname === 'sign-up'
      ? {
        mastheadTitle: 'Join the teams, families, and arenas already running on RinkLink.',
        mastheadSubtitle: 'Create your account to manage schedules, availability, invites, and team operations in one place.',
        cardEyebrow: 'Create account',
        cardTitle: 'Create your RinkLink account',
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

  const featureItems = isSignUp
    ? [
        {
          title: 'Team schedules',
          copy: 'Games, practices, confirmations, and venue details stay aligned.',
        },
        {
          title: 'Family coordination',
          copy: 'Parents, players, and staff work from the same account system.',
        },
        {
          title: 'Arena operations',
          copy: 'Availability, bookings, and logistics live alongside team workflow.',
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
          {isForgotPassword
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
