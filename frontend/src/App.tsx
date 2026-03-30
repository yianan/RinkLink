import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { NavLink, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import {
  Building2,
  Calendar,
  ClipboardList,
  ClipboardSignature,
  Flag,
  Home,
  Inbox,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  Snowflake,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { TeamProvider, useTeam } from './context/TeamContext';
import { SeasonProvider, useSeason } from './context/SeasonContext';
import { AuthProvider } from './context/AuthContext';
import { BetterAuthUiProvider } from './context/BetterAuthUiProvider';
import { useAuth } from './context/AuthContext';
import TeamSwitcher from './components/TeamSwitcher';
import SeasonSwitcher from './components/SeasonSwitcher';
import ThemeToggle from './components/ThemeToggle';
import { cn } from './lib/cn';
import { api } from './api/client';
import { chromeIconButtonClass, focusRingClass, sectionLabelClass } from './lib/uiClasses';
import { toLocalDateString } from './lib/time';
import { ConfirmDialogProvider } from './context/ConfirmDialogContext';
import { ToastProvider } from './context/ToastContext';
import { NavBadgeProvider, useNavBadgeKey } from './context/NavBadgeContext';
import { Skeleton } from './components/ui/Skeleton';
import { Button } from './components/ui/Button';
import { authClient, authEnabled, clearApiAccessToken } from './lib/auth-client';
import type { MeResponse } from './types';

const HomePage = lazy(() => import('./pages/HomePage'));
const AuthPage = lazy(() => import('./pages/AuthPage'));
const PendingApprovalPage = lazy(() => import('./pages/PendingApprovalPage'));
const InviteAcceptancePage = lazy(() => import('./pages/InviteAcceptancePage'));
const AccessPage = lazy(() => import('./pages/AccessPage'));
const AssociationListPage = lazy(() => import('./pages/AssociationListPage'));
const CompetitionsPage = lazy(() => import('./pages/CompetitionsPage'));
const StandingsPage = lazy(() => import('./pages/StandingsPage'));
const TeamListPage = lazy(() => import('./pages/TeamListPage'));
const RosterPage = lazy(() => import('./pages/RosterPage'));
const AvailabilityPage = lazy(() => import('./pages/AvailabilityPage'));
const EventsPage = lazy(() => import('./pages/EventsPage'));
const EventPage = lazy(() => import('./pages/EventPage'));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const ProposalsPage = lazy(() => import('./pages/ProposalsPage'));
const ArenaListPage = lazy(() => import('./pages/ArenaListPage'));
const ArenaDetailPage = lazy(() => import('./pages/ArenaDetailPage'));

function RouteFallback() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="rounded-2xl border border-[color:var(--app-border-subtle)] bg-[var(--app-surface)] p-5 shadow-soft"
          >
            <div className="space-y-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LegacyEventRedirect() {
  const { eventId = '' } = useParams();
  return <Navigate to={`/schedule/${eventId}`} replace />;
}

const AUTH_RETURN_TO_KEY = 'rinklink.returnTo';

function consumeAuthReturnTo() {
  if (typeof window === 'undefined') {
    return null;
  }
  const returnTo = window.sessionStorage.getItem(AUTH_RETURN_TO_KEY);
  if (!returnTo) {
    return null;
  }
  window.sessionStorage.removeItem(AUTH_RETURN_TO_KEY);
  return returnTo;
}

const NAV_SECTIONS = [
  {
    label: 'Overview',
    items: [{ path: '/', label: 'Dashboard', icon: Home }],
  },
  {
    label: 'Team',
    items: [
      { path: '/roster', label: 'Roster', icon: ClipboardList },
      { path: '/availability', label: 'Availability', icon: Calendar },
      { path: '/schedule', label: 'Schedule', icon: ClipboardSignature },
    ],
  },
  {
    label: 'Matchmaking',
    items: [
      { path: '/search', label: 'Find Opponents', icon: Search },
      { path: '/proposals', label: 'Proposals', icon: Inbox },
    ],
  },
  {
    label: 'League',
    items: [
      { path: '/competitions', label: 'Competitions', icon: Flag },
      { path: '/standings', label: 'Standings', icon: Trophy },
      { path: '/teams', label: 'Teams', icon: Users },
    ],
  },
  {
    label: 'Admin',
    items: [
      { path: '/access', label: 'Access', icon: ShieldCheck },
      { path: '/associations', label: 'Associations', icon: Building2 },
      { path: '/arenas', label: 'Arenas', icon: Snowflake },
    ],
  },
];

function hasCapability(me: MeResponse | null, capability: string) {
  return !!me?.capabilities.includes(capability);
}

function canViewPath(path: string, me: MeResponse | null, runtimeAuthEnabled: boolean) {
  if (!runtimeAuthEnabled) {
    return true;
  }
  if (!me) {
    return false;
  }
  switch (path) {
    case '/':
      return true;
    case '/roster':
      return hasCapability(me, 'team.view_private');
    case '/availability':
      return hasCapability(me, 'team.manage_schedule');
    case '/schedule':
      return (
        hasCapability(me, 'team.view')
        || hasCapability(me, 'arena.view')
        || hasCapability(me, 'player.respond_guarded')
        || hasCapability(me, 'player.respond_self')
      );
    case '/search':
    case '/proposals':
      return hasCapability(me, 'team.manage_proposals');
    case '/competitions':
    case '/standings':
      return (
        hasCapability(me, 'team.view')
        || hasCapability(me, 'association.view')
        || hasCapability(me, 'player.respond_guarded')
        || hasCapability(me, 'player.respond_self')
      );
    case '/teams':
      return hasCapability(me, 'team.view') || hasCapability(me, 'association.view');
    case '/access':
      return (
        hasCapability(me, 'platform.manage')
        || hasCapability(me, 'association.manage')
        || hasCapability(me, 'team.manage_staff')
        || hasCapability(me, 'team.manage_roster')
        || hasCapability(me, 'arena.manage')
      );
    case '/associations':
      return hasCapability(me, 'association.view');
    case '/arenas':
      return hasCapability(me, 'arena.view');
    default:
      return true;
  }
}

function AppNav({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const { activeTeam } = useTeam();
  const { activeSeason, seasons } = useSeason();
  const { authEnabled: runtimeAuthEnabled, me } = useAuth();
  const effectiveSeason = activeSeason ?? seasons.find((season) => season.is_active) ?? seasons[0] ?? null;
  const [navBadges, setNavBadges] = useState<Record<string, number>>({});
  const navBadgeKey = useNavBadgeKey();

  useEffect(() => {
    if (!activeTeam) {
      setNavBadges({});
      return;
    }
    let cancelled = false;
    const todayStr = toLocalDateString(new Date());
    const params: Record<string, string> = { date_from: todayStr };
    if (effectiveSeason) {
      params.season_id = effectiveSeason.id;
    }

    Promise.all([
      api.getProposals(activeTeam.id, { direction: 'incoming', status: 'proposed' }),
      api.getEvents(activeTeam.id, params),
    ]).then(([incomingProposals, events]) => {
      if (cancelled) return;
      const awaitingConfirmationCount = events.filter((event) => {
        if (!event.away_team_id) return false;
        if (event.status === 'cancelled' || event.status === 'final') return false;
        return event.home_team_id === activeTeam.id ? !event.home_weekly_confirmed : !event.away_weekly_confirmed;
      }).length;
      setNavBadges({
        '/proposals': incomingProposals.length,
        '/schedule': awaitingConfirmationCount,
      });
    }).catch(() => {
      if (!cancelled) setNavBadges({});
    });

    return () => {
      cancelled = true;
    };
  }, [activeTeam, effectiveSeason, navBadgeKey]);

  return (
    <nav className="p-3">
      {NAV_SECTIONS.map((section) => {
        const visibleItems = section.items.filter((item) => canViewPath(item.path, me, runtimeAuthEnabled));
        if (visibleItems.length === 0) {
          return null;
        }
        return (
          <div key={section.label} className="space-y-1">
            <div className={sectionLabelClass}>{section.label}</div>
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path);
              const badgeCount = navBadges[item.path] || 0;

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  onClick={onNavigate}
                  aria-label={
                    item.path === '/proposals' && badgeCount > 0
                      ? `${item.label}, ${badgeCount} incoming proposal${badgeCount === 1 ? '' : 's'}`
                      : item.path === '/schedule' && badgeCount > 0
                        ? `${item.label}, ${badgeCount} event${badgeCount === 1 ? '' : 's'} awaiting your confirmation`
                        : item.label
                  }
                  className={cn(
                    'group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                    focusRingClass,
                    isActive
                      ? "bg-gradient-to-r from-white via-white to-[color:color-mix(in_srgb,var(--app-surface-strong)_82%,rgb(237_233_254))] text-slate-900 shadow-sm ring-1 ring-[color:var(--app-border-subtle)] before:absolute before:left-1 before:top-1.5 before:bottom-1.5 before:w-1 before:rounded-full before:bg-[color:var(--app-accent-link)] before:content-[''] dark:from-slate-900 dark:via-slate-900 dark:to-slate-900 dark:text-slate-100 dark:shadow-none"
                      : 'text-slate-700 hover:bg-white/70 hover:text-slate-900 hover:ring-1 hover:ring-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-900/40 dark:hover:text-slate-100 dark:hover:ring-slate-700/70',
                  )}
                >
                  <Icon
                    className={cn(
                      'h-4 w-4',
                      isActive
                        ? 'text-[color:var(--app-accent-link)]'
                        : 'text-slate-500 group-hover:text-slate-700 dark:text-slate-500 dark:group-hover:text-slate-300',
                    )}
                  />
                  <span className="truncate">{item.label}</span>
                  {badgeCount > 0 ? (
                    <span
                      className="ml-auto inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white shadow-sm dark:bg-rose-500"
                      aria-label={
                        item.path === '/proposals'
                          ? `${badgeCount} incoming proposal${badgeCount === 1 ? '' : 's'}`
                          : item.path === '/schedule'
                            ? `${badgeCount} event${badgeCount === 1 ? '' : 's'} awaiting your confirmation`
                            : undefined
                      }
                    >
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  ) : null}
                </NavLink>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

function AppContent() {
  const { authEnabled: runtimeAuthEnabled, isAuthenticated, me, loading: authLoading, error: authError } = useAuth();
  const { loading: teamsLoading } = useTeam();
  const { loading: seasonsLoading } = useSeason();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(56);
  const headerRef = useRef<HTMLElement | null>(null);
  const mobileNavContentRef = useRef<HTMLDivElement | null>(null);
  const mobileNavScrollRef = useRef<HTMLDivElement | null>(null);
  const appLoading = teamsLoading || seasonsLoading;
  const pendingApproval = runtimeAuthEnabled && isAuthenticated && !!me && !me.user.is_platform_admin && me.user.status !== 'active';

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const updateHeight = () => {
      setHeaderHeight(header.getBoundingClientRect().height);
    };

    updateHeight();

    const observer = new ResizeObserver(() => updateHeight());
    observer.observe(header);
    window.addEventListener('resize', updateHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateHeight);
    };
  }, []);

  if (runtimeAuthEnabled && authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-[color:var(--app-border-subtle)] bg-[var(--app-surface)] px-5 py-4 shadow-soft">
          <div className="space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      </div>
    );
  }

  if (runtimeAuthEnabled && !isAuthenticated) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/auth/:pathname" element={<AuthPage />} />
          <Route path="/invite/:token" element={<InviteAcceptancePage />} />
          <Route path="/login" element={<Navigate to="/auth/sign-in" replace />} />
          <Route path="*" element={<Navigate to="/auth/sign-in" replace />} />
        </Routes>
      </Suspense>
    );
  }

  if (pendingApproval) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/pending" element={<PendingApprovalPage />} />
          <Route path="/invite/:token" element={<InviteAcceptancePage />} />
          <Route path="/auth/:pathname" element={<Navigate to={consumeAuthReturnTo() || '/pending'} replace />} />
          <Route path="*" element={<Navigate to="/pending" replace />} />
        </Routes>
      </Suspense>
    );
  }

  if (runtimeAuthEnabled && isAuthenticated && !me) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-lg rounded-2xl border border-[color:var(--app-border-subtle)] bg-[var(--app-surface)] p-6 shadow-soft">
          <div className="font-display text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Unable to load your access profile
          </div>
          <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            {authError || 'The session is valid, but the app profile could not be loaded.'}
          </div>
          <div className="mt-4 flex gap-3">
            <Button type="button" variant="outline" onClick={() => window.location.reload()}>
              Retry
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={async () => {
                clearApiAccessToken();
                await authClient.signOut();
                window.location.href = '/auth/sign-in';
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <DialogPrimitive.Root open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
      <div className="min-h-full">
        <header
          ref={headerRef}
          className="fixed inset-x-0 top-0 z-40 border-b border-slate-200/70 bg-gradient-to-r from-white via-cyan-50/70 to-violet-50/50 dark:border-white/10 dark:from-slate-950 dark:via-cyan-950/25 dark:to-violet-950/35"
        >
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-4 py-2 sm:h-14 sm:flex-nowrap sm:px-6 sm:py-0">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <DialogPrimitive.Trigger asChild>
                <button
                  type="button"
                  className={cn(
                    'inline-flex shrink-0 items-center justify-center rounded-lg lg:hidden',
                    chromeIconButtonClass,
                  )}
                  aria-label="Open navigation"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </DialogPrimitive.Trigger>

              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900/5 ring-1 ring-slate-200/70 dark:bg-white/10 dark:ring-white/15">
                  <Snowflake className="h-5 w-5" />
                </div>
                <div className="min-w-0 leading-tight">
                  <div className="font-display text-sm font-bold tracking-tight text-slate-900 dark:text-white">RinkLink</div>
                  <div className="hidden text-xs text-slate-600 dark:text-white/70 sm:block">Arenas, availability, and schedule</div>
                </div>
              </div>
            </div>

            <div className="grid w-full grid-cols-[minmax(0,1fr)_minmax(0,9.75rem)] items-center gap-2 sm:ml-auto sm:flex sm:w-auto sm:grid-cols-none">
              <div className="min-w-0">
                <TeamSwitcher />
              </div>
              <div className="min-w-0">
                <SeasonSwitcher />
              </div>
              <div className="hidden sm:block">
                <ThemeToggle />
              </div>
              {runtimeAuthEnabled ? (
                <button
                  type="button"
                  className={cn(
                    'hidden sm:inline-flex shrink-0 items-center justify-center rounded-lg',
                    chromeIconButtonClass,
                  )}
                  aria-label="Sign out"
                  onClick={async () => {
                    clearApiAccessToken();
                    await authClient.signOut();
                    window.location.href = '/auth/sign-in';
                  }}
                >
                  <LogOut className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>
        </header>

        <div style={{ paddingTop: headerHeight }}>
          <aside className="hidden lg:fixed lg:inset-y-14 lg:left-0 lg:block lg:w-56 lg:overflow-y-auto lg:border-r lg:border-slate-200/70 lg:bg-white/80 lg:backdrop-blur-sm dark:lg:border-slate-800/70 dark:lg:bg-slate-950/90">
            <AppNav />
          </aside>

          <main className="w-full px-4 py-6 sm:px-6 lg:pl-64 lg:pr-6">
            {appLoading ? (
              <div className="flex min-h-[50vh] items-center justify-center">
                <div className="w-full max-w-md rounded-2xl border border-[color:var(--app-border-subtle)] bg-[var(--app-surface)] px-5 py-4 shadow-soft">
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                </div>
              </div>
            ) : (
              <Suspense fallback={<RouteFallback />}>
                <div key={location.pathname} className="animate-fade-slide-in">
                  <Routes>
                    <Route path="/auth/:pathname" element={<Navigate to={consumeAuthReturnTo() || '/'} replace />} />
                    <Route path="/pending" element={<Navigate to="/" replace />} />
                    <Route path="/login" element={<Navigate to={authEnabled ? '/auth/sign-in' : '/'} replace />} />
                    <Route path="/invite/:token" element={<InviteAcceptancePage />} />
                    <Route path="/" element={<HomePage />} />
                    <Route path="/access" element={<AccessPage />} />
                    <Route path="/associations" element={<AssociationListPage />} />
                    <Route path="/competitions" element={<CompetitionsPage />} />
                    <Route path="/standings" element={<StandingsPage />} />
                    <Route path="/teams" element={<TeamListPage />} />
                    <Route path="/roster" element={<RosterPage />} />
                    <Route path="/availability" element={<AvailabilityPage />} />
                    <Route path="/schedule" element={<EventsPage />} />
                    <Route path="/schedule/:eventId" element={<EventPage />} />
                    <Route path="/events" element={<Navigate to="/schedule" replace />} />
                    <Route path="/events/:eventId" element={<LegacyEventRedirect />} />
                    <Route path="/search" element={<SearchPage />} />
                    <Route path="/proposals" element={<ProposalsPage />} />
                    <Route path="/arenas" element={<ArenaListPage />} />
                    <Route path="/arenas/:arenaId" element={<ArenaDetailPage />} />
                    <Route path="/arenas/:arenaId/rinks/:arenaRinkId" element={<ArenaDetailPage />} />
                  </Routes>
                </div>
              </Suspense>
            )}
          </main>
        </div>

        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-[2px] lg:hidden" />
          <DialogPrimitive.Content
            ref={mobileNavContentRef}
            aria-label="Navigation"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              const firstNavLink = mobileNavContentRef.current?.querySelector<HTMLAnchorElement>('nav a[href]');
              if (firstNavLink) {
                firstNavLink.focus();
                return;
              }
              mobileNavScrollRef.current?.focus();
            }}
            className="fixed inset-y-0 left-0 z-50 flex h-full w-72 max-w-[80vw] flex-col bg-white/95 shadow-2xl ring-1 ring-slate-200/70 outline-none backdrop-blur-sm dark:bg-slate-950/95 dark:ring-slate-800/70 lg:hidden"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900/5 ring-1 ring-slate-200/70 dark:bg-white/10 dark:ring-white/15">
                  <Snowflake className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
                  <DialogPrimitive.Description className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    RinkLink
                  </DialogPrimitive.Description>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white/80 px-2 py-1 text-xs font-medium text-slate-700 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-200">
                  <span>Theme</span>
                  <ThemeToggle />
                </div>
                <DialogPrimitive.Close asChild>
                  <button
                    type="button"
                    className={cn(
                      'inline-flex items-center justify-center rounded-lg',
                      chromeIconButtonClass,
                    )}
                    aria-label="Close navigation"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </DialogPrimitive.Close>
              </div>
            </div>
            <div
              ref={mobileNavScrollRef}
              tabIndex={0}
              className="min-h-0 flex-1 overflow-y-scroll overscroll-contain focus:outline-none"
            >
              <AppNav onNavigate={() => setMobileNavOpen(false)} />
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </div>
    </DialogPrimitive.Root>
  );
}

export default function App() {
  return (
    <TooltipPrimitive.Provider delayDuration={120}>
      <BetterAuthUiProvider>
        <AuthProvider>
          <TeamProvider>
            <SeasonProvider>
              <NavBadgeProvider>
                <ToastProvider>
                  <ConfirmDialogProvider>
                    <AppContent />
                  </ConfirmDialogProvider>
                </ToastProvider>
              </NavBadgeProvider>
            </SeasonProvider>
          </TeamProvider>
        </AuthProvider>
      </BetterAuthUiProvider>
    </TooltipPrimitive.Provider>
  );
}
