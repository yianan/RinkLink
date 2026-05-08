import { AsyncLocalStorage } from "node:async_hooks";

type TimingContext = {
  timings: Map<string, number>;
};

const storage = new AsyncLocalStorage<TimingContext>();

export function withTimingContext<T>(callback: () => T): T {
  return storage.run({ timings: new Map() }, callback);
}

export function recordTiming(label: string, durationMs: number): void {
  const context = storage.getStore();
  if (!context) {
    return;
  }
  context.timings.set(label, (context.timings.get(label) ?? 0) + durationMs);
}

export function timingHeader(): string | null {
  const context = storage.getStore();
  if (!context || context.timings.size === 0) {
    return null;
  }
  return Array.from(context.timings.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, durationMs]) => `${label};dur=${durationMs.toFixed(1)}`)
    .join(", ");
}
