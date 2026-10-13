import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../api/client";
import type { Arena, Season, Team } from "../types";

export interface Workspace {
  team: Team | null;
  season: Season | null;
  teams: Team[];
  venues: Arena[];
  version: number;
  refresh: () => void;
  allowed: (capability: string) => boolean;
}
export const WorkspaceContext = createContext<Workspace>({
  team: null,
  season: null,
  teams: [],
  venues: [],
  version: 0,
  refresh: () => {},
  allowed: () => false,
});
export const useWorkspace = () => useContext(WorkspaceContext);
export function useResource<T>(path: string | null) {
  const { version } = useWorkspace();
  const [record, setRecord] = useState<{ path: string; data: T } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!!path);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    setLoading(!!path);
    if (!path) return;
    api
      .get<T>(path, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setRecord({ path, data: value });
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(String(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, version]);
  return { data: record?.path === path ? record.data : null, error, loading };
}
