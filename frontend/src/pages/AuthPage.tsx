import { AccountView, AuthView } from '@daveyplate/better-auth-ui';
import { CalendarRange, ShieldCheck, Users } from 'lucide-react';
import { Navigate, useParams } from 'react-router-dom';

const allowedPathnames = new Set([
  'sign-in',
  'sign-up',
  'forgot-password',
  'reset-password',
  'sign-out',
  'settings',
  'security',
  'callback',
]);

export default function AuthPage() {
  const { pathname = 'sign-in' } = useParams();

  if (!allowedPathnames.has(pathname)) {
    return <Navigate to="/auth/sign-in" replace />;
  }

  const isAccountView = pathname === 'settings' || pathname === 'security';

  const spotlight = pathname === 'sign-up'
    ? {
        eyebrow: 'Create Your Account',
        title: 'Bring every team, family, and arena into one secure workflow.',
        description: 'Use the built-in Better Auth registration flow inside a RinkLink shell that matches the rest of the product.',
      }
    : pathname === 'forgot-password' || pathname === 'reset-password'
      ? {
          eyebrow: 'Secure Recovery',
          title: 'Recover access without leaving the app experience.',
          description: 'Password recovery stays in the same visual system as the operational screens your staff and families use every day.',
        }
      : isAccountView
        ? {
            eyebrow: 'Account Settings',
            title: 'Manage identity settings in the same RinkLink visual system.',
            description: 'Built-in account controls stay visually aligned with the scheduling, attendance, and arena workflows around them.',
          }
        : {
            eyebrow: 'Welcome Back',
            title: 'Secure sign-in, integrated with the rest of RinkLink.',
            description: 'Staff, families, and arena users land in the same visual language they see once they enter the app shell.',
          };

  const authViewClassNames = {
    base: 'rinklink-auth-card',
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

  const accountViewClassNames = {
    base: 'rinklink-auth-account-base',
    cards: 'rinklink-auth-account-cards',
    sidebar: {
      base: 'rinklink-auth-account-sidebar',
      button: 'rinklink-auth-account-button',
      buttonActive: 'rinklink-auth-account-button-active',
    },
    card: {
      base: 'rinklink-auth-settings-card',
      header: 'rinklink-auth-settings-header',
      title: 'rinklink-auth-settings-title',
      description: 'rinklink-auth-settings-description',
      content: 'rinklink-auth-settings-content',
      footer: 'rinklink-auth-settings-footer',
      label: 'rinklink-auth-label',
      input: 'rinklink-auth-input',
      error: 'rinklink-auth-error',
      button: 'rinklink-auth-button',
      primaryButton: 'rinklink-auth-primary-button',
      secondaryButton: 'rinklink-auth-secondary-button',
      outlineButton: 'rinklink-auth-outline-button',
      destructiveButton: 'rinklink-auth-destructive-button',
    },
  } as const;

  return (
    <main className="rinklink-auth-shell">
      <div className="rinklink-auth-layout">
        <section className="rinklink-auth-hero">
          <div className="rinklink-auth-hero-badge">RinkLink Identity</div>
          <div className="rinklink-auth-hero-copy">
            <div className="rinklink-auth-hero-eyebrow">{spotlight.eyebrow}</div>
            <h1 className="rinklink-auth-hero-title">{spotlight.title}</h1>
            <p className="rinklink-auth-hero-description">{spotlight.description}</p>
          </div>

          <div className="rinklink-auth-hero-grid">
            <article className="rinklink-auth-hero-card">
              <div className="rinklink-auth-hero-icon">
                <CalendarRange className="h-4 w-4" />
              </div>
              <div>
                <div className="rinklink-auth-hero-card-title">Scheduling Context</div>
                <p className="rinklink-auth-hero-card-copy">
                  Team schedules, arena operations, and booking workflows share one visual system.
                </p>
              </div>
            </article>
            <article className="rinklink-auth-hero-card">
              <div className="rinklink-auth-hero-icon">
                <Users className="h-4 w-4" />
              </div>
              <div>
                <div className="rinklink-auth-hero-card-title">Family-Aware Access</div>
                <p className="rinklink-auth-hero-card-copy">
                  Parent and player account flows remain first-class without breaking staff operations.
                </p>
              </div>
            </article>
            <article className="rinklink-auth-hero-card">
              <div className="rinklink-auth-hero-icon">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <div className="rinklink-auth-hero-card-title">Role-Scoped Security</div>
                <p className="rinklink-auth-hero-card-copy">
                  Identity screens now visually belong to the same product as the authorization model behind them.
                </p>
              </div>
            </article>
          </div>
        </section>

        <section className="rinklink-auth-panel">
          <div className={isAccountView ? 'w-full max-w-5xl' : 'w-full max-w-md'}>
            {isAccountView ? (
              <div className="rinklink-auth-card rinklink-auth-card--wide">
                <div className="rinklink-auth-header">
                  <div className="rinklink-auth-title">Account</div>
                  <div className="rinklink-auth-description">
                    Update your profile, login methods, and account security without leaving the RinkLink shell.
                  </div>
                </div>
                <div className="rinklink-auth-content">
                  <AccountView pathname={pathname} classNames={accountViewClassNames} />
                </div>
              </div>
            ) : (
              <AuthView pathname={pathname} classNames={authViewClassNames} />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
