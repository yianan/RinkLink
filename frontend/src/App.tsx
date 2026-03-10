import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import {
  Building2,
  Calendar,
  ClipboardList,
  ClipboardSignature,
  Dumbbell,
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
import HomePage from './pages/HomePage';
import AssociationListPage from './pages/AssociationListPage';
import TeamListPage from './pages/TeamListPage';
import RosterPage from './pages/RosterPage';
import SchedulePage from './pages/SchedulePage';
import GamesPage from './pages/GamesPage';
import GamePage from './pages/GamePage';
import SearchPage from './pages/SearchPage';
import ProposalsPage from './pages/ProposalsPage';
import PracticePage from './pages/PracticePage';
import RinkListPage from './pages/RinkListPage';
import IceSlotsPage from './pages/IceSlotsPage';
import StandingsPage from './pages/StandingsPage';
import { cn } from './lib/cn';
import { useTeam } from './context/TeamContext';
import { useSeason } from './context/SeasonContext';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: Home },
  { path: '/associations', label: 'Associations', icon: Building2 },
  { path: '/standings', label: 'Standings', icon: Trophy },
  { path: '/teams', label: 'Teams', icon: Users },
  { path: '/roster', label: 'Roster', icon: ClipboardList },
  { path: '/schedule', label: 'Schedule', icon: Calendar },
  { path: '/games', label: 'Games', icon: ClipboardSignature },
  { path: '/search', label: 'Find Opponents', icon: Search },
  { path: '/proposals', label: 'Proposals', icon: Inbox },
  { path: '/practice', label: 'Practice', icon: Dumbbell },
  { path: '/rinks', label: 'Rinks', icon: Snowflake },
];

function AppNav({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();

  return (
    <nav className="space-y-1 p-3">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive =
          item.path === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(item.path);

        return (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            onClick={onNavigate}
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
          </NavLink>
        );
      })}
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
              <div className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">RinkLink</div>
              <div className="text-xs text-slate-600 dark:text-white/70">Ice time & scheduling</div>
            </div>
          </div>

          <div className="ml-auto">
            <div className="flex items-center gap-2">
              <TeamSwitcher />
              <SeasonSwitcher />
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <div className="pt-14">
        <aside className="hidden lg:fixed lg:inset-y-14 lg:left-0 lg:block lg:w-56 lg:border-r lg:border-slate-200/70 lg:bg-gradient-to-b lg:from-white lg:via-[color:color-mix(in_srgb,var(--app-surface)_82%,rgb(245_243_255))] lg:to-white dark:lg:border-slate-800/70 dark:lg:bg-gradient-to-b dark:lg:from-slate-950 dark:lg:via-slate-950 dark:lg:to-slate-950">
          <AppNav />
        </aside>

        <main className="w-full px-4 py-6 sm:px-6 lg:pl-64 lg:pr-6">
          {appLoading ? (
            <div className="flex min-h-[50vh] items-center justify-center">
              <div className="rounded-2xl border border-[color:var(--app-border-subtle)] bg-[var(--app-surface)] px-5 py-4 text-sm text-slate-600 shadow-soft dark:text-slate-300">
                Loading team and season data…
              </div>
            </div>
          ) : (
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/associations" element={<AssociationListPage />} />
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
          <div className="relative h-full w-72 max-w-[80vw] bg-gradient-to-b from-white via-[color:color-mix(in_srgb,var(--app-surface)_82%,rgb(245_243_255))] to-white shadow-2xl ring-1 ring-slate-200/70 dark:from-slate-950 dark:via-slate-950 dark:to-slate-950 dark:ring-slate-800/70">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Menu</div>
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
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </SeasonProvider>
    </TeamProvider>
  );
}
