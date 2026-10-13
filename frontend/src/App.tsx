import { useEffect, useState } from "react";
import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  Calendar,
  Inbox,
  Search,
  Users,
  Settings,
  Menu,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { authClient } from "./lib/auth-client";
import { Select } from "./components/ui/Select";
import { Alert } from "./components/ui/Alert";
import { Button } from "./components/ui/Button";
import ThemeToggle from "./components/ThemeToggle";
import { navigationClass } from "./minimal/theme";
import { toolbarSelectClass } from "./lib/uiClasses";
import SettingsPage from "./pages/SettingsPage";
import { WorkspaceContext, useResource, useWorkspace } from "./minimal/context";
import {
  SchedulePage,
  AvailabilityPage,
  SearchPage,
  ProposalsPage,
  TeamsPage,
  VenuesPage,
  AccessPage,
  OnboardingPage,
  AuthPage,
  InvitePage,
  ContactPage,
} from "./minimal/pages";
import type { Arena, Season, Team } from "./types";

function Shell() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { version, refresh: refreshDirectories } = useWorkspace();
  const [menu, setMenu] = useState(false);
  const [teamId, setTeamId] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const disabled =
    !!auth.me &&
    (auth.me.user.access_state === "disabled" ||
      auth.me.user.auth_state === "disabled");
  const ready =
    !auth.authEnabled ||
    (auth.isAuthenticated &&
      !!auth.me &&
      !disabled &&
      (auth.me.user.status === "active" || auth.me.user.is_platform_admin));
  const mine = useResource<Team[]>(ready ? "/teams?mine=true" : null);
  const seasons = useResource<Season[]>(ready ? "/seasons" : null);
  const venues = useResource<Arena[]>(ready ? "/arenas" : null);
  const teams = useResource<Team[]>(ready ? "/teams" : null);
  const team =
    mine.data?.find((item) => item.id === teamId) ?? mine.data?.[0] ?? null;
  const season =
    seasons.data?.find((item) => item.id === seasonId) ??
    seasons.data?.find((item) => item.is_active) ??
    seasons.data?.[0] ??
    null;
  const allowed = (capability: string) =>
    !!(
      !auth.authEnabled ||
      (capability.startsWith("team.")
        ? !!team &&
          (auth.me?.user.is_platform_admin ||
            (capability === "team.manage" || capability === "team.manage_staff"
              ? auth.me?.teams.some(
                  (member) =>
                    member.team_id === team.id && member.role === "team_admin",
                )
              : auth.me?.teams.some((member) => member.team_id === team.id)))
        : !!auth.me?.capabilities.includes(capability))
    );
  const refresh = () => {
    refreshDirectories();
    if (auth.authEnabled) void auth.refreshProfile({ silent: true });
  };
  useEffect(() => {
    setMenu(false);
  }, [location.pathname]);
  async function signOut() {
    await authClient.signOut();
    auth.clearProfile();
    navigate("/auth/sign-in");
  }
  if (auth.loading) return <div className="p-8">Loading your workspace…</div>;
  if (auth.authEnabled && !auth.isAuthenticated)
    return (
      <Routes>
        <Route path="/auth/:pathname" element={<AuthPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route
          path="*"
          element={
            <Navigate
              to={`/auth/sign-in?returnTo=${encodeURIComponent(location.pathname)}`}
              replace
            />
          }
        />
      </Routes>
    );
  if (auth.authEnabled && !auth.me)
    return (
      <Alert variant="error">
        {auth.error || "Unable to load your access profile"}
        <Button onClick={() => void auth.refreshProfile()}>Retry</Button>
      </Alert>
    );
  const workspace = {
    team,
    season,
    teams: teams.data || [],
    venues: venues.data || [],
    version,
    refresh,
    allowed,
  };
  if (!ready)
    return (
      <WorkspaceContext.Provider value={workspace}>
        <div className="mx-auto max-w-3xl p-6">
          <div className="mb-6 flex justify-between">
            <h1 className="text-xl font-bold">RinkLink</h1>
            <Button variant="ghost" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
          <Routes>
            <Route path="/invite/:token" element={<InvitePage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/settings/:tab?" element={<SettingsPage />} />
            <Route path="/auth/:pathname" element={<AuthPage />} />
            <Route
              path="*"
              element={
                disabled ? (
                  <Alert variant="info">
                    Your account is closed or access has been disabled.
                  </Alert>
                ) : (
                  <OnboardingPage />
                )
              }
            />
          </Routes>
        </div>
      </WorkspaceContext.Provider>
    );
  const nav = [
    { path: "/schedule", label: "Schedule", icon: Calendar },
    { path: "/availability", label: "Availability", icon: Calendar },
    { path: "/search", label: "Find Opponents", icon: Search },
    { path: "/proposals", label: "Proposals", icon: Inbox },
    { path: "/teams", label: "Teams", icon: Users },
    { path: "/access", label: "Team Access", icon: ShieldCheck },
    { path: "/settings", label: "Settings", icon: Settings },
  ];
  return (
    <WorkspaceContext.Provider value={workspace}>
      <div className="min-h-screen">
        <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-gradient-to-r from-white via-cyan-50 to-violet-50 px-4 py-3 dark:border-white/10 dark:from-slate-950 dark:via-slate-950 dark:to-slate-950">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
            <Button
              variant="ghost"
              aria-label="Toggle navigation"
              className="lg:hidden"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={18} />
            </Button>
            <img
              src="/icons/rinklink-icon-192.png"
              alt="RinkLink"
              className="h-9 w-9 rounded-xl"
            />
            <div className="mr-auto">
              <div className="font-display font-bold">RinkLink</div>
              <div className="text-xs text-slate-600 dark:text-white/70">
                Team matching and scheduling
              </div>
            </div>
            <Select
              aria-label="Active team"
              value={team?.id || ""}
              onChange={(event) => setTeamId(event.target.value)}
              className={`${toolbarSelectClass} !w-auto max-w-64`}
            >
              {!mine.data?.length && <option value="">No teams yet</option>}
              {mine.data?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Active season"
              value={season?.id || ""}
              onChange={(event) => setSeasonId(event.target.value)}
              className={`${toolbarSelectClass} !w-auto`}
            >
              {seasons.data?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
            <ThemeToggle />
            {auth.authEnabled && (
              <Button
                variant="ghost"
                aria-label="Sign out"
                onClick={() => void signOut()}
              >
                <LogOut size={18} />
              </Button>
            )}
          </div>
        </header>
        <div className="mx-auto flex max-w-7xl">
          <aside
            className={`${menu ? "block" : "hidden"} shrink-0 border-r border-slate-200/70 bg-white/80 p-3 backdrop-blur-sm dark:border-slate-800/70 dark:bg-slate-950/90 lg:block lg:w-56 ${menu ? "fixed inset-y-20 left-0 z-30 w-64 shadow-xl" : ""}`}
          >
            <nav className="space-y-1">
              {nav.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    navigationClass(isActive)
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon size={18} className={isActive
                        ? "text-[color:var(--app-accent-link)]"
                        : "text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300"} />
                      {item.label}
                    </>
                  )}
                </NavLink>
              ))}
              {allowed("venue.manage") && (
                <NavLink className={({ isActive }) => navigationClass(isActive)} to="/venues">
                  Venue directory
                </NavLink>
              )}
            </nav>
          </aside>
          <main className="min-w-0 flex-1 p-4 sm:p-6">
            {(mine.error || seasons.error || venues.error || teams.error) && (
              <Alert variant="error">
                {mine.error || seasons.error || venues.error || teams.error}
              </Alert>
            )}
            <Routes>
              <Route path="/" element={<Navigate to="/schedule" replace />} />
              <Route path="/schedule" element={<SchedulePage />} />
              <Route path="/availability" element={<AvailabilityPage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/proposals" element={<ProposalsPage />} />
              <Route path="/teams" element={<TeamsPage />} />
              <Route path="/venues" element={<VenuesPage />} />
              <Route path="/access" element={<AccessPage />} />
              <Route path="/settings/:tab?" element={<SettingsPage />} />
              <Route path="/invite/:token" element={<InvitePage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/auth/:pathname" element={<AuthPage />} />
              <Route
                path="*"
                element={
                  <div className="p-6">
                    <h1 className="font-bold">Page unavailable</h1>
                    <p>This version provides team matching and scheduling.</p>
                    <NavLink to="/schedule">Open schedule</NavLink>
                  </div>
                }
              />
            </Routes>
          </main>
        </div>
      </div>
    </WorkspaceContext.Provider>
  );
}

// Shell's directory resources also need the same invalidation counter as page resources.
function Root() {
  const [generation, setGeneration] = useState(0);
  return (
    <WorkspaceContext.Provider
      value={{
        team: null,
        season: null,
        teams: [],
        venues: [],
        version: generation,
        refresh: () => setGeneration((value) => value + 1),
        allowed: () => false,
      }}
    >
      <Shell />
    </WorkspaceContext.Provider>
  );
}
export default function App() {
  return (
    <TooltipPrimitive.Provider>
      <ToastProvider>
        <AuthProvider>
          <Root />
        </AuthProvider>
      </ToastProvider>
    </TooltipPrimitive.Provider>
  );
}
