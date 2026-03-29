import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Check, ChevronDown } from 'lucide-react';
import { useTeam } from '../context/TeamContext';
import TeamLogo from './TeamLogo';
import { focusRingClass, toolbarSelectClass } from '../lib/uiClasses';
import { cn } from '../lib/cn';

const HIDE_TEAM_SWITCHER_PATHS = ['/associations', '/arenas', '/competitions'];

export default function TeamSwitcher() {
  const { teams, activeTeam, setActiveTeam, loading } = useTeam();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const hideTeamSwitcher = HIDE_TEAM_SWITCHER_PATHS.some((path) => location.pathname.startsWith(path));

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  if (hideTeamSwitcher) return null;

  const triggerLabel = loading
    ? 'Loading teams…'
    : activeTeam?.name || (teams.length > 0 ? 'Select a team…' : 'No teams available');

  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="hidden text-xs font-medium text-slate-600 sm:block dark:text-white/80">Active team</div>
      <div ref={rootRef} className="relative w-full min-w-0 sm:w-[320px]">
        <button
          type="button"
          disabled={loading || teams.length === 0}
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => setOpen((current) => !current)}
          className={cn(
            `flex min-h-11 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm text-slate-900 transition sm:min-h-10 dark:text-slate-100 ${focusRingClass}`,
            toolbarSelectClass,
            'hover:bg-slate-100/80 dark:hover:bg-slate-800/80 dark:hover:ring-slate-600/80 disabled:cursor-not-allowed disabled:opacity-70',
          )}
        >
          <TeamLogo
            name={activeTeam?.name || 'Team'}
            logoUrl={activeTeam?.logo_url || null}
            className="h-8 w-8 shrink-0 rounded-lg"
            initialsClassName="text-[11px]"
          />
          <span className="min-w-0 flex-1 truncate">{triggerLabel}</span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-500 transition-transform dark:text-slate-400', open && 'rotate-180')} />
        </button>

        {open ? (
          <div
            role="listbox"
            aria-label="Active team"
            className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-xl border border-[color:var(--app-border-subtle)] bg-[var(--app-surface-strong)] shadow-xl ring-1 ring-slate-200/70 dark:ring-slate-700/60"
          >
            <div className="max-h-80 overflow-y-auto p-1.5">
              {teams.map((team) => {
                const selected = team.id === activeTeam?.id;
                return (
                  <button
                    key={team.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      setActiveTeam(team);
                      setOpen(false);
                    }}
                    className={cn(
                      `flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition ${focusRingClass}`,
                      selected
                        ? 'bg-[color:color-mix(in_srgb,var(--app-accent-link)_12%,white)] text-slate-950 dark:bg-[color:color-mix(in_srgb,var(--app-accent-link)_18%,transparent)] dark:text-slate-50'
                        : 'text-slate-800 hover:bg-slate-100/80 hover:text-slate-950 dark:text-slate-200 dark:hover:bg-slate-800/90 dark:hover:text-slate-50',
                    )}
                  >
                    <TeamLogo
                      name={team.name}
                      logoUrl={team.logo_url}
                      className="h-9 w-9 shrink-0 rounded-lg"
                      initialsClassName="text-[11px]"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{team.name}</div>
                      <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {[team.association_name, team.age_group, team.level].filter(Boolean).join(' • ')}
                      </div>
                    </div>
                    {selected ? <Check className="h-4 w-4 shrink-0 text-[color:var(--app-accent-link)]" /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
