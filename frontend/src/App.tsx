import { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import {
  Building2,
  Calendar,
  ClipboardList,
  ClipboardSignature,
  Dumbbell,
  Flag,
  Home,
  Inbox,
  Menu,
  Search,
  Snowflake,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { TeamProvider } from './context/TeamContext';
import { SeasonProvider } from './context/SeasonContext';
import TeamSwitcher from './components/TeamSwitcher';
import SeasonSwitcher from './components/SeasonSwitcher';
import ThemeToggle from './components/ThemeToggle';
import { cn } from './lib/cn';
import { useTeam } from './context/TeamContext';
import { useSeason } from './context/SeasonContext';
import { api } from './api/client';
import { sectionLabelClass } from './lib/uiClasses';
import { addDays, toLocalDateString } from './lib/time';
import { ConfirmDialogProvider } from './context/ConfirmDialogContext';
import { ToastProvider } from './context/ToastContext';
import { NavBadgeProvider, useNavBadgeKey } from './context/NavBadgeContext';
import { Skeleton } from './components/ui/Skeleton';

const HomePage = lazy(() => import('./pages/HomePage'));
const AssociationListPage = lazy(() => import('./pages/AssociationListPage'));
const CompetitionsPage = lazy(() => import('./pages/CompetitionsPage'));
const StandingsPage = lazy(() => import('./pages/StandingsPage'));
const TeamListPage = lazy(() => import('./pages/TeamListPage'));
const RosterPage = lazy(() => import('./pages/RosterPage'));
const SchedulePage = lazy(() => import('./pages/SchedulePage'));
const GamesPage = lazy(() => import('./pages/GamesPage'));
const GamePage = lazy(() => import('./pages/GamePage'));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const ProposalsPage = lazy(() => import('./pages/ProposalsPage'));
const PracticePage = lazy(() => import('./pages/PracticePage'));
const RinkListPage = lazy(() => import('./pages/RinkListPage'));
const IceSlotsPage = lazy(() => import('./pages/IceSlotsPage'));

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

const NAV_SECTIONS = [
  {
    label: 'Overview',
    items: [{ path: '/', label: 'Dashboard', icon: Home }],
  },
  {
    label: 'Team',
    items: [
      { path: '/roster', label: 'Roster', icon: ClipboardList },
      { path: '/schedule', label: 'Schedule', icon: Calendar },
      { path: '/games', label: 'Games', icon: ClipboardSignature },
      { path: '/practice', label: 'Practice', icon: Dumbbell },
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
      { path: '/associations', label: 'Associations', icon: Building2 },
      { path: '/rinks', label: 'Rinks', icon: Snowflake },
    ],
  },
];

function AppNav({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const { activeTeam } = useTeam();
  const { activeSeason, seasons } = useSeason();
  const effectiveSeason = activeSeason ?? seasons.find((season) => season.is_active) ?? seasons[0] ?? null;
  const [navBadges, setNavBadges] = useState<Record<string, number>>({});
  const navBadgeKey = useNavBadgeKey();

  useEffect(() => {
    if (!activeTeam) {
      setNavBadges({});
      return;
    }
    let cancelled = false;
    const today = new Date();
    const todayStr = toLocalDateString(today);
    const weekEnd = toLocalDateString(addDays(today, 7));
    const params = effectiveSeason ? { season_id: effectiveSeason.id } : undefined;

    Promise.all([
      api.getProposals(activeTeam.id, { direction: 'incoming', status: 'proposed' }),
      api.getSchedule(activeTeam.id, params),
    ]).then(([incomingProposals, schedule]) => {
      if (cancelled) return;
      const unconfirmedThisWeek = schedule.filter((entry) =>
        !!entry.game_id
        && entry.date >= todayStr
        && entry.date <= weekEnd
        && !entry.weekly_confirmed,
      ).length;
      setNavBadges({
        '/proposals': incomingProposals.length,
        '/schedule': unconfirmedThisWeek,
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
      {NAV_SECTIONS.map((section) => (
        <div key={section.label} className="space-y-1">
          <div className={sectionLabelClass}>{section.label}</div>
          {section.items.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.path === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.path);
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
                      ? `${item.label}, ${badgeCount} game${badgeCount === 1 ? '' : 's'} to confirm`
                      : item.label
                }
                className={cn(
                  'group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
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
                          ? `${badgeCount} game${badgeCount === 1 ? '' : 's'} to confirm`
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
      ))}
    </nav>
  );
}

function AppContent() {
  const { loading: teamsLoading } = useTeam();
  const { loading: seasonsLoading } = useSeason();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const appLoading = teamsLoading || seasonsLoading;

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-full">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-slate-200/70 bg-gradient-to-r from-white via-cyan-50/70 to-violet-50/50 dark:border-white/10 dark:from-slate-950 dark:via-cyan-950/25 dark:to-violet-950/35">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            className="rl-tooltip inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900/5 text-slate-800 ring-1 ring-slate-200/70 hover:bg-slate-900/10 hover:text-slate-900 lg:hidden dark:bg-white/10 dark:text-white dark:ring-white/15 dark:hover:bg-white/15 dark:hover:text-white"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
            data-tooltip="Open navigation"
            title="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900/5 ring-1 ring-slate-200/70 dark:bg-white/10 dark:ring-white/15">
              <Snowflake className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="font-display text-sm font-bold tracking-tight text-slate-900 dark:text-white">RinkLink</div>
              <div className="hidden text-xs text-slate-600 dark:text-white/70 sm:block">Ice time & scheduling</div>
            </div>
          </div>

          <div className="ml-auto">
            <div className="flex items-center gap-2">
              <TeamSwitcher />
              <SeasonSwitcher />
              <div className="hidden sm:block">
                <ThemeToggle />
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="pt-14">
        <aside className="hidden lg:fixed lg:inset-y-14 lg:left-0 lg:block lg:w-56 lg:overflow-y-auto lg:border-r lg:border-slate-200/70 lg:bg-gradient-to-b lg:from-white lg:via-[color:color-mix(in_srgb,var(--app-surface)_82%,rgb(245_243_255))] lg:to-white dark:lg:border-slate-800/70 dark:lg:bg-gradient-to-b dark:lg:from-slate-950 dark:lg:via-slate-950 dark:lg:to-slate-950">
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
                <Route path="/" element={<HomePage />} />
                <Route path="/associations" element={<AssociationListPage />} />
                <Route path="/competitions" element={<CompetitionsPage />} />
                <Route path="/standings" element={<StandingsPage />} />
                <Route path="/teams" element={<TeamListPage />} />
                <Route path="/roster" element={<RosterPage />} />
                <Route path="/schedule" element={<SchedulePage />} />
                <Route path="/games" element={<GamesPage />} />
                <Route path="/games/:gameId" element={<GamePage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/proposals" element={<ProposalsPage />} />
                <Route path="/practice" element={<PracticePage />} />
                <Route path="/rinks" element={<RinkListPage />} />
                <Route path="/rinks/:rinkId/slots" element={<IceSlotsPage />} />
              </Routes>
              </div>
            </Suspense>
          )}
        </main>
      </div>

      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          <div
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]"
            onMouseDown={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <div className="relative h-full w-72 max-w-[80vw] overflow-y-auto bg-gradient-to-b from-white via-[color:color-mix(in_srgb,var(--app-surface)_82%,rgb(245_243_255))] to-white shadow-2xl ring-1 ring-slate-200/70 dark:from-slate-950 dark:via-slate-950 dark:to-slate-950 dark:ring-slate-800/70">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Menu</div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white/80 px-2 py-1 text-xs font-medium text-slate-700 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-200">
                  <span>Theme</span>
                  <ThemeToggle />
                </div>
                <button
                  type="button"
                  className="rl-tooltip inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900/60 dark:hover:text-slate-100"
                  onClick={() => setMobileNavOpen(false)}
                  aria-label="Close navigation"
                  data-tooltip="Close navigation"
                  title="Close navigation"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <AppNav onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <TeamProvider>
      <SeasonProvider>
        <NavBadgeProvider>
          <ToastProvider>
            <ConfirmDialogProvider>
              <BrowserRouter>
                <AppContent />
              </BrowserRouter>
            </ConfirmDialogProvider>
          </ToastProvider>
        </NavBadgeProvider>
      </SeasonProvider>
    </TeamProvider>
  );
}
