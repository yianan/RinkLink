import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import {
  BadgeCheck,
  Building2,
  Calendar,
  ClipboardList,
  ClipboardSignature,
  Home,
  Inbox,
  Menu,
  Search,
  Snowflake,
  Users,
  X,
} from 'lucide-react';
import { TeamProvider } from './context/TeamContext';
import TeamSwitcher from './components/TeamSwitcher';
import HomePage from './pages/HomePage';
import AssociationListPage from './pages/AssociationListPage';
import TeamListPage from './pages/TeamListPage';
import RosterPage from './pages/RosterPage';
import SchedulePage from './pages/SchedulePage';
import GamesPage from './pages/GamesPage';
import GamePage from './pages/GamePage';
import SearchPage from './pages/SearchPage';
import ProposalsPage from './pages/ProposalsPage';
import WeeklyConfirmPage from './pages/WeeklyConfirmPage';
import RinkListPage from './pages/RinkListPage';
import IceSlotsPage from './pages/IceSlotsPage';
import { cn } from './lib/cn';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: Home },
  { path: '/associations', label: 'Associations', icon: Building2 },
  { path: '/teams', label: 'Teams', icon: Users },
  { path: '/roster', label: 'Roster', icon: ClipboardList },
  { path: '/schedule', label: 'Schedule', icon: Calendar },
  { path: '/games', label: 'Games', icon: ClipboardSignature },
  { path: '/search', label: 'Find Opponents', icon: Search },
  { path: '/proposals', label: 'Proposals', icon: Inbox },
  { path: '/rinks', label: 'Rinks', icon: Snowflake },
  { path: '/confirm', label: 'Weekly Confirm', icon: BadgeCheck },
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
                ? "bg-gradient-to-r from-brand-50 via-white to-fuchsia-50 text-brand-900 shadow-sm ring-1 ring-brand-200/70 before:absolute before:left-1 before:top-1.5 before:bottom-1.5 before:w-1 before:rounded-full before:bg-brand-500 before:content-['']"
                : 'text-slate-700 hover:bg-white/70 hover:text-slate-900 hover:ring-1 hover:ring-slate-200/70',
            )}
          >
            <Icon
              className={cn(
                'h-4 w-4',
                isActive ? 'text-brand-700' : 'text-slate-500 group-hover:text-slate-700',
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
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-full">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-gradient-to-r from-slate-950 via-brand-950 to-fuchsia-950">
        <div className="container-page flex h-14 items-center gap-3">
          <button
            type="button"
            className="rl-tooltip inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/15 lg:hidden"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
            data-tooltip="Open navigation"
            title="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-3 text-white">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
              <Snowflake className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight">RinkLink</div>
              <div className="text-xs text-white/70">Ice time & scheduling</div>
            </div>
          </div>

          <div className="ml-auto">
            <TeamSwitcher />
          </div>
        </div>
      </header>

      <div className="pt-14">
        <aside className="hidden lg:fixed lg:inset-y-14 lg:left-0 lg:block lg:w-64 lg:border-r lg:border-slate-200/70 lg:bg-gradient-to-b lg:from-white lg:via-brand-50/30 lg:to-white">
          <AppNav />
        </aside>

        <main className="container-page py-6 lg:pl-64">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/associations" element={<AssociationListPage />} />
            <Route path="/teams" element={<TeamListPage />} />
            <Route path="/roster" element={<RosterPage />} />
            <Route path="/schedule" element={<SchedulePage />} />
            <Route path="/games" element={<GamesPage />} />
            <Route path="/games/:gameId" element={<GamePage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/proposals" element={<ProposalsPage />} />
            <Route path="/rinks" element={<RinkListPage />} />
            <Route path="/rinks/:rinkId/slots" element={<IceSlotsPage />} />
            <Route path="/confirm" element={<WeeklyConfirmPage />} />
          </Routes>
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
          <div className="relative h-full w-80 max-w-[85vw] bg-gradient-to-b from-white via-brand-50/30 to-white shadow-2xl ring-1 ring-slate-200/70">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="text-sm font-semibold text-slate-900">Menu</div>
              <button
                type="button"
                className="rl-tooltip inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900"
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
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </TeamProvider>
  );
}
