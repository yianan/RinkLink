import {
  useEffect,
  useState,
  type FormEvent,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  Link,
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { AuthView } from "@daveyplate/better-auth-ui";
import { BetterAuthUiProvider } from "../context/BetterAuthUiProvider";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import { authApiBaseUrl } from "../lib/auth-client";
import {
  peekAuthReturnTo,
  setAuthReturnTo,
  consumeAuthReturnTo,
} from "../lib/auth-routing";
import PageHeader from "../components/PageHeader";
import AgeLevelSelect from "../components/AgeLevelSelect";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Textarea } from "../components/ui/Textarea";
import { Alert } from "../components/ui/Alert";
import { Badge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { useWorkspace, useResource } from "./context";
import {
  DateFields,
  Field,
  TextField,
  VenueFields,
  type Values,
} from "./forms";
import { today, timeLabel } from "./time";
import { actionLinkClass, authViewClassNames } from "./theme";
import { AuthShell } from "./AuthShell";
import { accentLinkClass } from "../lib/uiClasses";
import type {
  Event,
  AvailabilityWindow,
  Match,
  Proposal,
  Team,
  Staff,
  Invite,
  AccessRequest,
  Notification,
} from "../types";

function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { refresh } = useWorkspace();
  async function run(job: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await job();
      refresh();
      return true;
    } catch (reason) {
      setError(String(reason));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run, clear: () => setError("") };
}
function ResourceState({
  loading,
  error,
  empty = false,
}: {
  loading: boolean;
  error: string;
  empty?: boolean;
}) {
  return error ? (
    <Alert variant="error">{error}</Alert>
  ) : loading ? (
    <p className="p-4 text-slate-500 dark:text-slate-400">Loading…</p>
  ) : empty ? (
    <p className="p-4 text-slate-500 dark:text-slate-400">No records to show.</p>
  ) : null;
}
function NeedTeam() {
  return (
    <Alert variant="info">Select a team or open Teams to request access.</Alert>
  );
}
function seasonQuery(id: string | undefined) {
  return id ? `?season_id=${encodeURIComponent(id)}` : "";
}
function initialGame(team: Team | null): Values {
  return {
    event_type: "exhibition",
    opponent_name: "",
    date: today(),
    start_time: "18:00",
    end_time: "19:00",
    arena_id: team?.home_arena_id || "",
    arena_rink_id: team?.home_arena_rink_id || "",
    notes: "",
  };
}

export function SchedulePage() {
  const { team, season, allowed } = useWorkspace();
  const events = useResource<Event[]>(
    team ? `/teams/${team.id}/events${seasonQuery(season?.id)}` : null,
  );
  const notifications = useResource<Notification[]>(
    team ? `/teams/${team.id}/notifications` : null,
  );
  const action = useAction();
  const [editing, setEditing] = useState<Event | null>(null);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Values>(initialGame(team));
  const [view, setView] = useState("upcoming");
  const [calendarUrl, setCalendarUrl] = useState("");
  useEffect(() => {
    setOpen(false);
    setCalendarUrl("");
  }, [team?.id]);
  if (!team) return <NeedTeam />;
  function edit(event?: Event) {
    action.clear();
    setEditing(event || null);
    setValues(
      event
        ? {
            event_type: event.event_type,
            opponent_name: event.away_team_name || "",
            date: event.date,
            start_time: event.start_time.slice(0, 5),
            end_time: event.end_time.slice(0, 5),
            arena_id: event.arena_id,
            arena_rink_id: event.arena_rink_id,
            notes: event.notes || "",
          }
        : initialGame(team),
    );
    setOpen(true);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    await action.run(async () => {
      const body = {
        ...values,
        opponent_name:
          values.event_type === "practice" ? null : values.opponent_name,
        season_id: season?.id || null,
      };
      if (editing) await api.put(`/events/${editing.id}`, body);
      else await api.post(`/teams/${team!.id}/events`, body);
      setOpen(false);
    });
  }
  const visible = events.data?.filter(
    (event) =>
      view === "all" ||
      (view === "upcoming"
        ? event.date >= today() && event.status !== "cancelled"
        : event.date < today()),
  );
  return (
    <div className="space-y-5">
      <PageHeader
        title="Schedule"
        subtitle="Games and practices, including commitments arranged outside RinkLink."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={action.busy}
              onClick={() =>
                void action.run(async () => {
                  const result = await api.get<{ url: string }>(
                    `/teams/${team.id}/calendar-feed`,
                  );
                  setCalendarUrl(result.url);
                  await navigator.clipboard.writeText(result.url);
                })
              }
            >
              Copy calendar subscription
            </Button>
            {allowed("team.manage_schedule") && (
              <Button onClick={() => edit()}>Add game or practice</Button>
            )}
          </div>
        }
      />
      {calendarUrl && (
        <Alert variant="info">
          Subscribe to this link in Apple, Google, or Outlook Calendar:{" "}
          <a className={`${accentLinkClass} break-all underline`} href={calendarUrl}>
            {calendarUrl}
          </a>
        </Alert>
      )}
      {action.error && <Alert variant="error">{action.error}</Alert>}
      {!!notifications.data?.length && (
        <Card className="space-y-2 p-4">
          <h2 className="font-semibold">Updates</h2>
          {notifications.data.map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span>
                <strong>{row.title}</strong> — {row.message}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={action.busy}
                onClick={() =>
                  void action.run(() =>
                    api.patch(`/notifications/${row.id}/read`),
                  )
                }
              >
                Dismiss
              </Button>
            </div>
          ))}
        </Card>
      )}
      <div className="flex gap-2">
        {["upcoming", "past", "all"].map((value) => (
          <Button
            key={value}
            variant={view === value ? "primary" : "outline"}
            onClick={() => setView(value)}
          >
            {value[0].toUpperCase() + value.slice(1)}
          </Button>
        ))}
      </div>
      <ResourceState
        loading={events.loading}
        error={events.error}
        empty={!visible?.length}
      />
      {visible?.map((event) => (
        <Card className="space-y-3 p-5" key={event.id}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold">
                {event.event_type === "practice"
                  ? `${event.home_team_name} practice`
                  : `${event.home_team_name} vs ${event.away_team_name}`}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {event.date} · {timeLabel(event.start_time, event.end_time)} ·{" "}
                {event.location_label}
              </p>
            </div>
            <Badge>{event.status}</Badge>
          </div>
          {event.notes && <p className="text-sm">{event.notes}</p>}
          {event.status !== "cancelled" && allowed("team.manage_schedule") && (
            <div className="flex flex-wrap gap-2">
              {event.proposal_id ? (
                <Link
                  to="/proposals"
                  className={`${accentLinkClass} text-sm font-medium underline`}
                >
                  Reschedule with opponent
                </Link>
              ) : (
                event.home_team_id === team.id && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => edit(event)}
                  >
                    Edit
                  </Button>
                )
              )}
              <Button
                size="sm"
                variant="ghost"
                disabled={action.busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "Cancel this event for everyone on its schedule?",
                    )
                  )
                    void action.run(() =>
                      api.patch(`/events/${event.id}/cancel`),
                    );
                }}
              >
                Cancel event
              </Button>
            </div>
          )}
        </Card>
      ))}
      <Modal
        open={open}
        title={editing ? "Edit schedule entry" : "Add game or practice"}
        onClose={() => setOpen(false)}
      >
        <form className="space-y-4" onSubmit={(event) => void save(event)}>
          <Field label="Type">
            <Select
              value={values.event_type}
              onChange={(event) =>
                setValues({ ...values, event_type: event.target.value })
              }
            >
              {[
                "exhibition",
                "league",
                "scrimmage",
                "showcase",
                "practice",
              ].map((type) => (
                <option key={type} value={type}>
                  {type[0].toUpperCase() + type.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
          {values.event_type !== "practice" && (
            <TextField
              label="Opponent name"
              name="opponent_name"
              values={values}
              onChange={setValues}
              required
            />
          )}
          <DateFields values={values} onChange={setValues} />
          <VenueFields values={values} onChange={setValues} />
          <TextField
            label="Notes"
            name="notes"
            values={values}
            onChange={setValues}
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Enter ice already arranged externally. To agree a game with another
            RinkLink team, use Proposals.
          </p>
          {action.error && <Alert variant="error">{action.error}</Alert>}
          <Button type="submit" disabled={action.busy}>
            {action.busy ? "Saving…" : "Save schedule entry"}
          </Button>
        </form>
      </Modal>
    </div>
  );
}

export function AvailabilityPage() {
  const { team, season, allowed } = useWorkspace();
  const windows = useResource<AvailabilityWindow[]>(
    team ? `/teams/${team.id}/availability${seasonQuery(season?.id)}` : null,
  );
  const action = useAction();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [values, setValues] = useState<Values>({
    date: today(),
    start_time: "18:00",
    end_time: "19:00",
    availability_type: "home",
    notes: "",
  });
  const [preview, setPreview] = useState<{
    entries: Record<string, unknown>[];
    warnings: string[];
  } | null>(null);
  useEffect(() => {
    setOpen(false);
    setPreview(null);
  }, [team?.id]);
  if (!team) return <NeedTeam />;
  if (!allowed("team.manage_schedule"))
    return <Alert variant="info">Scheduling access is required.</Alert>;
  function edit(window?: AvailabilityWindow) {
    action.clear();
    setEditing(window?.id || null);
    setValues(
      window
        ? {
            date: window.date,
            start_time: window.start_time?.slice(0, 5) || "",
            end_time: window.end_time?.slice(0, 5) || "",
            availability_type: window.availability_type,
            notes: window.notes || "",
          }
        : {
            date: today(),
            start_time: "18:00",
            end_time: "19:00",
            availability_type: "home",
            notes: "",
          },
    );
    setOpen(true);
  }
  return (
    <div className="space-y-5">
      <PageHeader
        title="Availability"
        subtitle="Publish home ice, away travel windows, and blocked periods."
        actions={<Button onClick={() => edit()}>Add availability</Button>}
      />
      {action.error && <Alert variant="error">{action.error}</Alert>}
      <ResourceState
        loading={windows.loading}
        error={windows.error}
        empty={!windows.data?.length}
      />
      {windows.data?.map((window) => (
        <Card
          key={window.id}
          className="flex flex-wrap items-center justify-between gap-4 p-4"
        >
          <div>
            <div className="font-semibold">
              {window.date} · {timeLabel(window.start_time, window.end_time)}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {window.availability_type} ·{" "}
              {window.blocked ? "blocked" : window.status}
            </p>
            {window.notes && <p className="text-sm">{window.notes}</p>}
          </div>
          {window.status === "open" && (
            <div className="flex flex-wrap gap-2">
              {!window.blocked && window.date >= today() && (
                <Link
                  className={actionLinkClass}
                  to={`/search?availability=${window.id}`}
                >
                  Find opponents
                </Link>
              )}
              <Button size="sm" variant="outline" onClick={() => edit(window)}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={action.busy}
                onClick={() =>
                  void action.run(() =>
                    api.put(`/availability-windows/${window.id}`, {
                      blocked: !window.blocked,
                    }),
                  )
                }
              >
                {window.blocked ? "Unblock" : "Block"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={action.busy}
                onClick={() => {
                  if (globalThis.confirm("Delete this availability?"))
                    void action.run(() =>
                      api.delete(`/availability-windows/${window.id}`),
                    );
                }}
              >
                Delete
              </Button>
            </div>
          )}
        </Card>
      ))}
      <Card className="space-y-3 p-5">
        <h2 className="font-semibold">Import availability CSV</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Columns: Date, Start Time, End Time, Home/Away, Notes. Review the
          preview before importing.
        </p>
        <Input
          type="file"
          accept=".csv,text/csv"
          aria-label="Availability CSV"
          disabled={action.busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file)
              void action.run(async () => {
                const data = new FormData();
                data.append("file", file);
                setPreview(
                  await api.post(`/teams/${team.id}/availability/upload`, data),
                );
              });
          }}
        />
        {preview && (
          <>
            <p>{preview.entries.length} valid rows</p>
            {preview.warnings.map((warning, i) => (
              <Alert key={i} variant="warning">
                {warning}
              </Alert>
            ))}
            <div className="max-h-48 overflow-auto text-sm">
              {preview.entries.map((entry, i) => (
                <div key={i}>
                  {String(entry.date)} · {String(entry.availability_type)} ·{" "}
                  {String(entry.start_time || "Any time")}–
                  {String(entry.end_time || "")}
                </div>
              ))}
            </div>
            <Button
              disabled={action.busy || !preview.entries.length}
              onClick={() =>
                void action.run(async () => {
                  await api.post(
                    `/teams/${team.id}/availability/confirm-upload`,
                    { entries: preview.entries },
                  );
                  setPreview(null);
                })
              }
            >
              Import reviewed rows
            </Button>
          </>
        )}
      </Card>
      <Modal
        open={open}
        title={editing ? "Edit availability" : "Add availability"}
        onClose={() => setOpen(false)}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              const body = {
                ...values,
                start_time: values.start_time || null,
                end_time: values.end_time || null,
                season_id: season?.id || null,
              };
              if (editing)
                await api.put(`/availability-windows/${editing}`, body);
              else await api.post(`/teams/${team.id}/availability`, body);
              setOpen(false);
            });
          }}
        >
          <DateFields
            values={values}
            onChange={setValues}
            timesRequired={false}
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Leave both times empty for an all-day window or block.
          </p>
          <Field label="Home or away">
            <Select
              value={values.availability_type}
              onChange={(event) =>
                setValues({ ...values, availability_type: event.target.value })
              }
            >
              <option value="home">Home</option>
              <option value="away">Away</option>
            </Select>
          </Field>
          <TextField
            label="Notes"
            name="notes"
            values={values}
            onChange={setValues}
          />
          {action.error && <Alert variant="error">{action.error}</Alert>}
          <Button type="submit" disabled={action.busy}>
            Save availability
          </Button>
        </form>
      </Modal>
    </div>
  );
}

export function SearchPage() {
  const { team, season, teams } = useWorkspace();
  const [params] = useSearchParams();
  const [windowId, setWindowId] = useState(params.get("availability") || "");
  const [mode, setMode] = useState("search");
  const [filters, setFilters] = useState<Values>({
    level: "",
    distance: "",
    min: "",
    max: "",
  });
  const [draft, setDraft] = useState<Match | null>(null);
  const [values, setValues] = useState<Values>(initialGame(team));
  const windows = useResource<AvailabilityWindow[]>(
    team ? `/teams/${team.id}/availability${seasonQuery(season?.id)}` : null,
  );
  const openWindows =
    windows.data?.filter(
      (item) => item.status === "open" && !item.blocked && item.date >= today(),
    ) || [];
  useEffect(() => {
    if (windows.data && !openWindows.some((item) => item.id === windowId))
      setWindowId(openWindows[0]?.id || "");
  }, [windows.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setDraft(null);
  }, [team?.id]);
  const selectedWindow = openWindows.find(
    (item) => item.id === windowId && item.team_id === team?.id,
  );
  const query = new URLSearchParams({
    team_id: team?.id || "",
    availability_window_id: windowId,
  });
  if (filters.level) query.set("level", filters.level);
  if (filters.distance) query.set("max_distance_miles", filters.distance);
  if (filters.min) query.set("min_ranking", filters.min);
  if (filters.max) query.set("max_ranking", filters.max);
  const results = useResource<Match[]>(
    team
      ? mode === "auto"
        ? `/search/auto-matches?team_id=${team.id}${season ? `&season_id=${season.id}` : ""}`
        : selectedWindow
          ? `/search/opponents?${query}`
          : null
      : null,
  );
  const action = useAction();
  if (!team) return <NeedTeam />;
  function propose(match: Match) {
    action.clear();
    setDraft(match);
    const home = teams.find((item) => item.id === match.home_team_id);
    setValues({
      ...initialGame(home || null),
      date: match.date,
      start_time: match.home_start_time.slice(0, 5),
      end_time: match.home_end_time.slice(0, 5),
      message: "",
    });
  }
  return (
    <div className="space-y-5">
      <PageHeader
        title="Find Opponents"
        subtitle="Match the full home game interval against an opponent’s available travel window."
      />
      <div className="flex gap-2">
        <Button
          variant={mode === "search" ? "primary" : "outline"}
          onClick={() => setMode("search")}
        >
          Search availability
        </Button>
        <Button
          variant={mode === "auto" ? "primary" : "outline"}
          onClick={() => setMode("auto")}
        >
          Auto-matches
        </Button>
      </div>
      {mode === "search" && (
        <Card className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Your availability">
            <Select
              value={windowId}
              onChange={(event) => setWindowId(event.target.value)}
            >
              <option value="">Choose availability</option>
              {openWindows.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.date} · {item.availability_type} ·{" "}
                  {timeLabel(item.start_time, item.end_time)}
                </option>
              ))}
            </Select>
          </Field>
          <TextField
            label={`Playing level (default ${team.level})`}
            name="level"
            values={filters}
            onChange={setFilters}
          />
          <TextField
            label="Maximum distance, miles"
            name="distance"
            type="number"
            values={filters}
            onChange={setFilters}
          />
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Minimum ranking"
              name="min"
              type="number"
              values={filters}
              onChange={setFilters}
            />
            <TextField
              label="Maximum ranking"
              name="max"
              type="number"
              values={filters}
              onChange={setFilters}
            />
          </div>
        </Card>
      )}
      <ResourceState
        loading={results.loading || windows.loading}
        error={results.error || windows.error}
        empty={!results.data?.length}
      />
      {results.data?.map((match) => (
        <Card
          key={`${match.home_availability_window_id}-${match.away_availability_window_id}`}
          className="flex flex-wrap items-center justify-between gap-4 p-5"
        >
          <div>
            <h2 className="font-semibold">{match.team_name}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {match.age_group} {match.level} · {match.date} · Game{" "}
              {timeLabel(match.home_start_time, match.home_end_time)}
            </p>
            <p className="text-sm">
              Opponent available {timeLabel(match.start_time, match.end_time)} ·{" "}
              {match.distance_miles === null
                ? "Distance unavailable"
                : `${match.distance_miles} miles, straight-line estimate`}{" "}
              · Ranking {match.myhockey_ranking ?? "not entered"}
            </p>
          </div>
          {match.has_existing_proposal ? (
            <Link className={`${accentLinkClass} underline`} to="/proposals">
              View existing proposal
            </Link>
          ) : (
            <Button onClick={() => propose(match)}>Propose game</Button>
          )}
        </Card>
      ))}
      <Modal
        open={!!draft}
        title={`Propose game with ${draft?.team_name || "opponent"}`}
        onClose={() => setDraft(null)}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              await api.post("/proposals", {
                home_team_id: draft!.home_team_id,
                away_team_id: draft!.away_team_id,
                home_availability_window_id: draft!.home_availability_window_id,
                away_availability_window_id: draft!.away_availability_window_id,
                proposed_by_team_id: team.id,
                event_type: values.event_type,
                proposed_date: values.date,
                proposed_start_time: values.start_time,
                proposed_end_time: values.end_time,
                arena_id: values.arena_id,
                arena_rink_id: values.arena_rink_id,
                message: values.message || null,
              });
              setDraft(null);
            });
          }}
        >
          <DateFields values={values} onChange={setValues} />
          <VenueFields values={values} onChange={setValues} />
          <TextField
            label="Message to opponent"
            name="message"
            values={values}
            onChange={setValues}
          />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            The home team arranges ice externally. RinkLink records the
            agreement; it does not reserve ice.
          </p>
          {action.error && <Alert variant="error">{action.error}</Alert>}
          <Button type="submit" disabled={action.busy}>
            Send proposal
          </Button>
        </form>
      </Modal>
    </div>
  );
}

export function ProposalsPage() {
  const { team, season } = useWorkspace();
  const action = useAction();
  const proposals = useResource<Proposal[]>(
    team ? `/teams/${team.id}/proposals${seasonQuery(season?.id)}` : null,
  );
  const [revising, setRevising] = useState<Proposal | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [values, setValues] = useState<Values>(initialGame(team));
  const [all, setAll] = useState(false);
  const history = useResource<Proposal[]>(
    historyId ? `/proposals/${historyId}/history` : null,
  );
  useEffect(() => {
    setRevising(null);
    setHistoryId(null);
  }, [team?.id]);
  if (!team) return <NeedTeam />;
  const visible = proposals.data?.filter(
    (row) => all || ["proposed", "accepted"].includes(row.status),
  );
  return (
    <div className="space-y-5">
      <PageHeader
        title="Proposals"
        subtitle="Agree games and schedule changes with a shared history."
        actions={
          <Button variant="outline" onClick={() => setAll(!all)}>
            {all ? "Show active" : "Show full history"}
          </Button>
        }
      />
      {action.error && <Alert variant="error">{action.error}</Alert>}
      <ResourceState
        loading={proposals.loading}
        error={proposals.error}
        empty={!visible?.length}
      />
      {visible?.map((row) => (
        <Card key={row.id} className="space-y-3 p-5">
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <h2 className="font-semibold">
                {row.home_team_name} vs {row.away_team_name}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {row.proposed_date} ·{" "}
                {timeLabel(row.proposed_start_time, row.proposed_end_time)} ·{" "}
                {row.location_label}
              </p>
              <p className="text-xs">
                {row.proposed_by_team_id === team.id ? "Outgoing" : "Incoming"}{" "}
                · Revision {row.revision_number}
              </p>
            </div>
            <Badge>{row.status}</Badge>
          </div>
          {row.message && <p>{row.message}</p>}
          <div className="flex flex-wrap gap-2">
            {row.status === "proposed" &&
              row.proposed_by_team_id !== team.id && (
                <>
                  <Button
                    size="sm"
                    disabled={action.busy}
                    onClick={() =>
                      void action.run(() =>
                        api.patch(`/proposals/${row.id}/accept`),
                      )
                    }
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={action.busy}
                    onClick={() =>
                      void action.run(() =>
                        api.patch(`/proposals/${row.id}/decline`),
                      )
                    }
                  >
                    Decline
                  </Button>
                </>
              )}
            {["proposed", "accepted"].includes(row.status) && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    action.clear();
                    setRevising(row);
                    setValues({
                      date: row.proposed_date,
                      start_time: row.proposed_start_time.slice(0, 5),
                      end_time: row.proposed_end_time.slice(0, 5),
                      arena_id: row.arena_id,
                      arena_rink_id: row.arena_rink_id,
                      message: "",
                    });
                  }}
                >
                  Propose change
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={action.busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Cancel this proposal? Cancelling an accepted game removes it from both schedules.",
                      )
                    )
                      void action.run(() =>
                        api.patch(`/proposals/${row.id}/cancel`),
                      );
                  }}
                >
                  Cancel
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setHistoryId(row.id)}
            >
              History
            </Button>
          </div>
        </Card>
      ))}
      <Modal
        open={!!revising}
        title="Propose a schedule change"
        onClose={() => setRevising(null)}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              await api.post(`/proposals/${revising!.id}/reschedule`, {
                proposed_by_team_id: team.id,
                proposed_date: values.date,
                proposed_start_time: values.start_time,
                proposed_end_time: values.end_time,
                arena_id: values.arena_id,
                arena_rink_id: values.arena_rink_id,
                message: values.message || null,
              });
              setRevising(null);
            });
          }}
        >
          <DateFields values={values} onChange={setValues} />
          <VenueFields values={values} onChange={setValues} />
          <TextField
            label="Message"
            name="message"
            values={values}
            onChange={setValues}
          />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            The agreed game stays in place until the opposing team accepts.
          </p>
          {action.error && <Alert variant="error">{action.error}</Alert>}
          <Button type="submit" disabled={action.busy}>
            Send change
          </Button>
        </form>
      </Modal>
      <Modal
        open={!!historyId}
        title="Proposal history"
        onClose={() => setHistoryId(null)}
      >
        <ResourceState loading={history.loading} error={history.error} />
        {history.data?.map((row) => (
          <div key={row.id} className="border-b border-[color:var(--app-border-subtle)] py-3">
            <strong>
              Revision {row.revision_number}: {row.status}
            </strong>
            <p>
              {row.proposed_date} ·{" "}
              {timeLabel(row.proposed_start_time, row.proposed_end_time)}
            </p>
            <p>{row.message || row.response_message}</p>
          </div>
        ))}
      </Modal>
    </div>
  );
}

function emptyTeam(): Values {
  return {
    name: "",
    club_name: "",
    age_group: "14U",
    level: "AA",
    home_zip_code: "",
    manager_name: "",
    manager_email: "",
    manager_phone: "",
    myhockey_ranking: "",
  };
}
function teamBody(values: Values) {
  return {
    ...values,
    myhockey_ranking: values.myhockey_ranking
      ? Number(values.myhockey_ranking)
      : null,
  };
}
function TeamFields({
  values,
  onChange,
}: {
  values: Values;
  onChange: Dispatch<SetStateAction<Values>>;
}) {
  return (
    <>
      <TextField
        label="Team name"
        name="name"
        values={values}
        onChange={onChange}
        required
      />
      <TextField
        label="Club label"
        name="club_name"
        values={values}
        onChange={onChange}
      />
      <AgeLevelSelect
        ageGroup={values.age_group}
        level={values.level}
        onAgeGroupChange={(age_group) =>
          onChange((current) => ({ ...current, age_group }))
        }
        onLevelChange={(level) =>
          onChange((current) => ({ ...current, level }))
        }
      />
      {[
        "home_zip_code",
        "manager_name",
        "manager_email",
        "manager_phone",
        "myhockey_ranking",
      ].map((name) => (
        <TextField
          key={name}
          label={name.replaceAll("_", " ")}
          name={name}
          values={values}
          onChange={onChange}
          type={
            name === "manager_email"
              ? "email"
              : name === "myhockey_ranking"
                ? "number"
                : "text"
          }
        />
      ))}
    </>
  );
}

export function TeamsPage() {
  const { teams, allowed } = useWorkspace();
  const auth = useAuth();
  const action = useAction();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Team | null>(null);
  const [values, setValues] = useState<Values>(emptyTeam());
  const [homeVenue, setHomeVenue] = useState<Values>({
    arena_id: "",
    arena_rink_id: "",
  });
  const [filter, setFilter] = useState("");
  function canEdit(team: Team) {
    return (
      !auth.authEnabled ||
      auth.me?.user.is_platform_admin ||
      auth.me?.teams.some(
        (member) => member.team_id === team.id && member.role === "team_admin",
      )
    );
  }
  function edit(team?: Team) {
    action.clear();
    setEditing(team || null);
    setValues(
      team
        ? {
            name: team.name,
            club_name: team.club_name,
            age_group: team.age_group,
            level: team.level,
            home_zip_code: team.home_zip_code,
            manager_name: team.manager_name,
            manager_email: team.manager_email,
            manager_phone: team.manager_phone,
            myhockey_ranking: String(team.myhockey_ranking || ""),
          }
        : emptyTeam(),
    );
    setHomeVenue({
      arena_id: team?.home_arena_id || "",
      arena_rink_id: team?.home_arena_rink_id || "",
    });
    setOpen(true);
  }
  return (
    <div className="space-y-5">
      <PageHeader
        title="Teams"
        subtitle="Team profiles, manager contacts, and matching criteria."
        actions={<Button onClick={() => edit()}>Add or request a team</Button>}
      />
      <Input
        aria-label="Filter teams"
        placeholder="Team, club, age or level"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      />
      {action.error && <Alert variant="error">{action.error}</Alert>}
      {teams
        .filter((team) =>
          `${team.name} ${team.club_name} ${team.age_group} ${team.level}`
            .toLowerCase()
            .includes(filter.toLowerCase()),
        )
        .map((team) => (
          <Card
            key={team.id}
            className="flex flex-wrap justify-between gap-4 p-5"
          >
            <div>
              <h2 className="font-semibold">{team.name}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {team.club_name} · {team.age_group} {team.level} · Ranking{" "}
                {team.myhockey_ranking ?? "not entered"}
              </p>
              <p className="text-sm">
                {team.manager_name}{" "}
                <a className={`${accentLinkClass} underline`} href={`mailto:${team.manager_email}`}>
                  {team.manager_email}
                </a>{" "}
                {team.manager_phone}
              </p>
            </div>
            {canEdit(team) ? (
              <Button size="sm" variant="outline" onClick={() => edit(team)}>
                Edit profile
              </Button>
            ) : (
              !auth.me?.accessible_teams.some(
                (item) => item.id === team.id,
              ) && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(() =>
                      api.post("/access-requests", {
                        target_type: "team",
                        target_id: team.id,
                      }),
                    )
                  }
                >
                  Request access
                </Button>
              )
            )}
          </Card>
        ))}
      <Modal
        open={open}
        title={editing ? "Edit team profile" : "Add a team"}
        onClose={() => setOpen(false)}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              const body = {
                ...teamBody(values),
                home_arena_id: homeVenue.arena_id || null,
                home_arena_rink_id: homeVenue.arena_rink_id || null,
              };
              if (editing) await api.put(`/teams/${editing.id}`, body);
              else if (allowed("team.manage") || allowed("platform.manage"))
                await api.post("/teams", body);
              else
                await api.post("/access-requests", {
                  target_type: "team_setup",
                  details: body,
                });
              setOpen(false);
            });
          }}
        >
          <TeamFields values={values} onChange={setValues} />
          <VenueFields
            values={homeVenue}
            onChange={setHomeVenue}
            required={false}
          />
          {action.error && <Alert variant="error">{action.error}</Alert>}
          <Button type="submit" disabled={action.busy}>
            {editing ? "Save profile" : "Submit team"}
          </Button>
        </form>
      </Modal>
    </div>
  );
}

export function VenuesPage() {
  const { venues, allowed } = useWorkspace();
  const action = useAction();
  const [values, setValues] = useState<Values>({
    name: "",
    address: "",
    city: "",
    state: "",
    zip_code: "",
  });
  const [venueId, setVenueId] = useState("");
  const [rinkName, setRinkName] = useState("");
  if (!allowed("venue.manage"))
    return (
      <Alert variant="info">
        Platform administrators maintain the venue directory.
      </Alert>
    );
  return (
    <div className="space-y-5">
      <PageHeader
        title="Venue directory"
        subtitle="Reference addresses and rink names. Ice is arranged externally."
      />
      {action.error && <Alert variant="error">{action.error}</Alert>}
      <Card className="space-y-4 p-5">
        <h2 className="font-semibold">Add venue</h2>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              await api.post("/arenas", values);
              setValues({
                name: "",
                address: "",
                city: "",
                state: "",
                zip_code: "",
              });
            });
          }}
        >
          {["name", "address", "city", "state", "zip_code"].map((name) => (
            <TextField
              key={name}
              label={name.replaceAll("_", " ")}
              name={name}
              values={values}
              onChange={setValues}
              required={name === "name"}
            />
          ))}
          <Button type="submit" disabled={action.busy}>
            Add venue
          </Button>
        </form>
      </Card>
      <Card className="space-y-4 p-5">
        <h2 className="font-semibold">Add rink</h2>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              await api.post(`/arenas/${venueId}/rinks`, { name: rinkName });
              setRinkName("");
            });
          }}
        >
          <Select
            required
            aria-label="Venue for new rink"
            value={venueId}
            onChange={(event) => setVenueId(event.target.value)}
          >
            <option value="">Choose venue</option>
            {venues.map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name}
              </option>
            ))}
          </Select>
          <Input
            aria-label="Rink name"
            placeholder="Rink name"
            required
            value={rinkName}
            onChange={(event) => setRinkName(event.target.value)}
          />
          <Button type="submit" disabled={action.busy}>
            Add rink
          </Button>
        </form>
      </Card>
      {venues.map((venue) => (
        <Card key={venue.id} className="p-4">
          <h2 className="font-semibold">{venue.name}</h2>
          <p>
            {venue.address} {venue.city} {venue.state} {venue.zip_code}
          </p>
        </Card>
      ))}
    </div>
  );
}

export function AccessPage() {
  const { team, allowed } = useWorkspace();
  const action = useAction();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("scheduler");
  const [createdLink, setCreatedLink] = useState("");
  const canManage = allowed("team.manage_staff");
  const staff = useResource<Staff[]>(
    team && canManage ? `/teams/${team.id}/staff` : null,
  );
  const invites = useResource<Invite[]>(
    team && canManage ? `/invites?team_id=${team.id}` : null,
  );
  const requests = useResource<AccessRequest[]>(
    "/access-requests?scope=review",
  );
  const mine = useResource<AccessRequest[]>("/access-requests?scope=mine");
  useEffect(() => {
    setCreatedLink("");
  }, [team?.id]);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Team Access"
        subtitle="Invite team staff, review access requests, and revoke memberships."
      />
      {action.error && <Alert variant="error">{action.error}</Alert>}
      {team && canManage && (
        <>
          <Card className="space-y-4 p-5">
            <h2 className="font-semibold">Invite staff to {team.name}</h2>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void action.run(async () => {
                  const invite = await api.post<Invite>("/invites", {
                    email,
                    target_id: team.id,
                    role,
                  });
                  setCreatedLink(invite.url);
                  setEmail("");
                });
              }}
            >
              <Input
                type="email"
                required
                aria-label="Staff email"
                placeholder="Email address"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <Select
                aria-label="Staff role"
                value={role}
                onChange={(event) => setRole(event.target.value)}
              >
                <option value="scheduler">Scheduler</option>
                <option value="team_admin">Team administrator</option>
              </Select>
              <Button type="submit" disabled={action.busy}>
                Send invitation
              </Button>
            </form>
            {createdLink && (
              <a className="break-all text-sm underline" href={createdLink}>
                {createdLink}
              </a>
            )}
          </Card>
          <Card className="space-y-3 p-5">
            <h2 className="font-semibold">Current staff</h2>
            <ResourceState loading={staff.loading} error={staff.error} />
            {staff.data?.map((member) => (
              <div key={member.id} className="flex justify-between gap-3">
                <span>
                  {member.email} · {member.role}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={action.busy}
                  onClick={() => {
                    if (window.confirm("Revoke this membership?"))
                      void action.run(() =>
                        api.delete(`/team-memberships/${member.id}`),
                      );
                  }}
                >
                  Revoke
                </Button>
              </div>
            ))}
          </Card>
          <Card className="space-y-3 p-5">
            <h2 className="font-semibold">Invitations</h2>
            <ResourceState loading={invites.loading} error={invites.error} />
            {invites.data?.map((invite) => (
              <div key={invite.id} className="flex justify-between gap-3">
                <span>
                  {invite.email} · {invite.status}
                </span>
                {invite.status === "pending" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={action.busy}
                    onClick={() =>
                      void action.run(() => api.delete(`/invites/${invite.id}`))
                    }
                  >
                    Revoke invitation
                  </Button>
                )}
              </div>
            ))}
          </Card>
        </>
      )}
      <Card className="space-y-3 p-5">
        <h2 className="font-semibold">Requests to review</h2>
        <ResourceState
          loading={requests.loading}
          error={requests.error}
          empty={!requests.data?.length}
        />
        {requests.data?.map((request) => (
          <div key={request.id} className="space-y-2 border-b border-[color:var(--app-border-subtle)] pb-3">
            <p>
              {request.user_email} · {request.team_name} · {request.status}
            </p>
            {request.notes && <p>{request.notes}</p>}
            {request.status === "pending" && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(() =>
                      api.post(`/access-requests/${request.id}/approve`, {}),
                    )
                  }
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(() =>
                      api.post(`/access-requests/${request.id}/reject`, {}),
                    )
                  }
                >
                  Reject
                </Button>
              </div>
            )}
          </div>
        ))}
      </Card>
      <Card className="space-y-3 p-5">
        <h2 className="font-semibold">Your requests</h2>
        {mine.data?.map((request) => (
          <p key={request.id}>
            {request.team_name}: {request.status}
          </p>
        ))}
        <Link className={`${accentLinkClass} underline`} to="/teams">
          Request another team
        </Link>
      </Card>
    </div>
  );
}

export function OnboardingPage() {
  const targets =
    useResource<
      { id: string; name: string; age_group: string; level: string }[]
    >("/access-targets");
  const requests = useResource<AccessRequest[]>("/access-requests");
  const action = useAction();
  const [newTeam, setNewTeam] = useState(false);
  const [target, setTarget] = useState("");
  const [values, setValues] = useState<Values>(emptyTeam());
  return (
    <div className="space-y-5">
      <PageHeader
        title="Team access"
        subtitle="An administrator will review your request."
      />
      <div className="flex gap-2">
        <Button
          onClick={() => setNewTeam(false)}
          variant={!newTeam ? "primary" : "outline"}
        >
          Existing team
        </Button>
        <Button
          onClick={() => setNewTeam(true)}
          variant={newTeam ? "primary" : "outline"}
        >
          New team
        </Button>
      </div>
      <Card className="p-5">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(() =>
              api.post(
                "/access-requests",
                newTeam
                  ? { target_type: "team_setup", details: teamBody(values) }
                  : { target_type: "team", target_id: target },
              ),
            );
          }}
        >
          {newTeam ? (
            <TeamFields values={values} onChange={setValues} />
          ) : (
            <Field label="Team">
              <Select
                required
                value={target}
                onChange={(event) => setTarget(event.target.value)}
              >
                <option value="">Choose team</option>
                {targets.data?.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name} · {team.age_group} {team.level}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {action.error && <Alert variant="error">{action.error}</Alert>}
          <Button type="submit" disabled={action.busy}>
            Request access
          </Button>
        </form>
      </Card>
      {requests.data?.map((request) => (
        <p key={request.id}>
          {request.team_name}: {request.status}
        </p>
      ))}
      <ResourceState
        loading={targets.loading}
        error={targets.error || requests.error}
      />
      <Link className={`${accentLinkClass} underline`} to="/contact">
        Contact an administrator
      </Link>
    </div>
  );
}

export function AuthPage() {
  const { pathname = "sign-in" } = useParams();
  const [params] = useSearchParams();
  const requested = params.get("returnTo") || peekAuthReturnTo() || "/schedule";
  const target =
    requested.startsWith("/") && !requested.startsWith("//")
      ? requested
      : "/schedule";
  useEffect(() => {
    if (params.get("returnTo")) setAuthReturnTo(target);
  }, [params, target]);
  if (pathname === "verify-email") return <VerifyEmailPage />;
  if (pathname === "callback") return <Navigate to={target} replace />;
  return (
    <BetterAuthUiProvider>
      <AuthShell>
        <AuthView
          pathname={pathname}
          redirectTo={target}
          callbackURL={target}
          classNames={authViewClassNames}
        />
        <Link to="/contact" className="rinklink-auth-footer-link mt-4 block text-center text-sm">
          Contact an administrator
        </Link>
      </AuthShell>
    </BetterAuthUiProvider>
  );
}

export function InvitePage() {
  const { token } = useParams();
  const auth = useAuth();
  const navigate = useNavigate();
  const action = useAction();
  return (
    <Card className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-xl font-bold">Accept team invitation</h1>
      <p>Use the email address this invitation was sent to.</p>
      {action.error && <Alert variant="error">{action.error}</Alert>}
      <Button
        disabled={action.busy}
        onClick={() =>
          void action.run(async () => {
            await api.post(`/invites/${token}/accept`);
            await auth.refreshProfile({ silent: true });
            consumeAuthReturnTo();
            navigate("/schedule");
          })
        }
      >
        Accept invitation
      </Button>
    </Card>
  );
}

export function ContactPage() {
  const [values, setValues] = useState<Values>({
    name: "",
    email: "",
    message: "",
  });
  const [sent, setSent] = useState(false);
  const action = useAction();
  return (
    <Card className="mx-auto my-8 max-w-xl space-y-4 p-6">
      <h1 className="text-xl font-bold">Contact an administrator</h1>
      {sent ? (
        <Alert variant="success">Your message was sent.</Alert>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              await api.post("/contact", values);
              setSent(true);
            });
          }}
        >
          <TextField
            label="Name"
            name="name"
            values={values}
            onChange={setValues}
            required
          />
          <TextField
            label="Email"
            name="email"
            type="email"
            values={values}
            onChange={setValues}
            required
          />
          <Field label="Message">
            <Textarea
              required
              value={values.message}
              onChange={(event) =>
                setValues({ ...values, message: event.target.value })
              }
            />
          </Field>
          {action.error && <Alert variant="error">{action.error}</Alert>}
          <Button type="submit" disabled={action.busy}>
            Send message
          </Button>
        </form>
      )}
      <Link className={`${accentLinkClass} underline`} to="/">
        Back to RinkLink
      </Link>
    </Card>
  );
}

// Verification emails point at this app route, rather than exposing the auth service.
const verificationRequests = new Map<string, Promise<Response>>();
function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();
  const auth = useAuth();
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setError("This verification link is missing its token.");
      return;
    }
    let request = verificationRequests.get(token);
    if (!request) {
      request = fetch(
        `${authApiBaseUrl}/verify-email?token=${encodeURIComponent(token)}`,
        { credentials: "include" },
      );
      verificationRequests.set(token, request);
    }
    void request
      .then(async (response) => {
        if (cancelled) return;
        if (!response.ok)
          throw new Error(
            "This verification link is invalid or expired. Request a new email from sign-in.",
          );
        await auth.refreshProfile({ assumeAuthenticated: true });
        const pendingTarget = peekAuthReturnTo() || "/schedule";
        const target =
          pendingTarget.startsWith("/") && !pendingTarget.startsWith("//")
            ? pendingTarget
            : "/schedule";
        navigate(target, { replace: true });
      })
      .catch((reason) => {
        if (!cancelled) setError(String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <AuthShell>
    <Card className="space-y-4 p-6">
      <h1 className="text-xl font-bold">Verify your email</h1>
      {error ? (
        <Alert variant="error">{error}</Alert>
      ) : (
        <p>Verifying your email…</p>
      )}
      <Link to="/auth/sign-in" className={accentLinkClass}>
        Return to sign-in
      </Link>
    </Card>
    </AuthShell>
  );
}
