import type { ReactNode } from "react";
import ThemeToggle from "../components/ThemeToggle";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="rinklink-auth-shell rinklink-auth-page">
      <div className="rinklink-auth-layout">
        <section className="rinklink-auth-hero">
          <div className="rinklink-auth-brand">
            <img src="/icons/rinklink-icon-192.png" alt="RinkLink logo" className="h-11 w-11 shrink-0 rounded-xl" />
            <div className="font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-slate-50">RinkLink</div>
            <div className="ml-auto"><ThemeToggle /></div>
          </div>
          <div className="space-y-3">
            <h1 className="rinklink-auth-hero-title">Team matching and scheduling</h1>
            <p className="rinklink-auth-hero-subtitle">Find opponents, arrange games, and keep games and practices on one schedule.</p>
          </div>
        </section>
        <section className="rinklink-auth-panel max-w-xl">{children}</section>
      </div>
    </main>
  );
}
