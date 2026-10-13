import { useEffect, type ReactNode } from "react";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Alert } from "../components/ui/Alert";
import type { ArenaRink } from "../types";
import { useResource, useWorkspace } from "./context";

export type Values = Record<string, string>;
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
export function TextField({
  label,
  name,
  values,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  name: string;
  values: Values;
  onChange: (value: Values) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <Field label={label}>
      <Input
        type={type}
        required={required}
        value={values[name] || ""}
        onChange={(event) =>
          onChange({ ...values, [name]: event.target.value })
        }
      />
    </Field>
  );
}
export function VenueFields({
  values,
  onChange,
  required = true,
}: {
  values: Values;
  onChange: (value: Values) => void;
  required?: boolean;
}) {
  const { venues } = useWorkspace();
  const { data: rinks, error } = useResource<ArenaRink[]>(
    values.arena_id ? `/arenas/${values.arena_id}/rinks` : null,
  );
  useEffect(() => {
    if (rinks && !rinks.some((rink) => rink.id === values.arena_rink_id)) {
      onChange({ ...values, arena_rink_id: rinks[0]?.id || "" });
    }
  }, [rinks]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <Field label="Venue">
        <Select
          required={required}
          value={values.arena_id || ""}
          onChange={(event) =>
            onChange({
              ...values,
              arena_id: event.target.value,
              arena_rink_id: "",
            })
          }
        >
          <option value="">Choose venue</option>
          {venues.map((venue) => (
            <option key={venue.id} value={venue.id}>
              {venue.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Rink">
        <Select
          required={required}
          value={values.arena_rink_id || ""}
          onChange={(event) =>
            onChange({ ...values, arena_rink_id: event.target.value })
          }
        >
          <option value="">Choose rink</option>
          {rinks?.map((rink) => (
            <option key={rink.id} value={rink.id}>
              {rink.name}
            </option>
          ))}
        </Select>
      </Field>
      {error && <Alert variant="error">{error}</Alert>}
    </>
  );
}
export function DateFields({
  values,
  onChange,
  timesRequired = true,
}: {
  values: Values;
  onChange: (value: Values) => void;
  timesRequired?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <TextField
        label="Date"
        name="date"
        values={values}
        onChange={onChange}
        type="date"
        required
      />
      <TextField
        label="Start"
        name="start_time"
        values={values}
        onChange={onChange}
        type="time"
        required={timesRequired}
      />
      <TextField
        label="End"
        name="end_time"
        values={values}
        onChange={onChange}
        type="time"
        required={timesRequired}
      />
    </div>
  );
}
