import csv
import io
import re
from datetime import date, time

from ..schemas.schedule_entry import ScheduleUploadRow, ScheduleUploadPreview

# Normalized header names -> canonical field
HEADER_MAP = {
    "date": "date",
    "game date": "date",
    "time": "time",
    "game time": "time",
    "start time": "time",
    "home/away": "entry_type",
    "homeaway": "entry_type",
    "home_away": "entry_type",
    "type": "entry_type",
    "h/a": "entry_type",
    "opponent": "opponent_name",
    "opponent name": "opponent_name",
    "opp": "opponent_name",
    "location": "location",
    "rink": "location",
    "venue": "location",
    "notes": "notes",
    "note": "notes",
    "comments": "notes",
}


def _normalize_header(h: str) -> str:
    return re.sub(r"[^a-z0-9/]", " ", h.lower()).strip()


def _parse_date(val: str) -> date:
    val = val.strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%m-%d-%Y", "%m-%d-%y"):
        try:
            return date.fromisoformat(val) if fmt == "%Y-%m-%d" else __import__("datetime").datetime.strptime(val, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Unrecognized date format: {val}")


def _parse_time(val: str) -> time | None:
    val = val.strip()
    if not val:
        return None
    for fmt in ("%H:%M", "%I:%M %p", "%I:%M%p", "%H:%M:%S"):
        try:
            from datetime import datetime as dt
            return dt.strptime(val, fmt).time()
        except ValueError:
            continue
    return None


def _parse_entry_type(val: str) -> str:
    v = val.strip().lower()
    if v in ("home", "h"):
        return "home"
    if v in ("away", "a"):
        return "away"
    raise ValueError(f"Unrecognized home/away value: {val}")


def parse_csv(content: str) -> ScheduleUploadPreview:
    """Parse CSV content into schedule entry previews."""
    warnings: list[str] = []
    entries: list[ScheduleUploadRow] = []

    reader = csv.DictReader(io.StringIO(content))
    if not reader.fieldnames:
        return ScheduleUploadPreview(entries=[], warnings=["Empty CSV or no headers found"])

    # Map headers
    field_map: dict[str, str] = {}
    for raw_header in reader.fieldnames:
        norm = _normalize_header(raw_header)
        if norm in HEADER_MAP:
            field_map[raw_header] = HEADER_MAP[norm]

    if "date" not in field_map.values():
        return ScheduleUploadPreview(entries=[], warnings=["No 'Date' column found in CSV"])
    if "entry_type" not in field_map.values():
        return ScheduleUploadPreview(entries=[], warnings=["No 'Home/Away' column found in CSV"])

    for i, row in enumerate(reader, start=2):
        try:
            mapped = {}
            for raw_h, canonical in field_map.items():
                mapped[canonical] = row.get(raw_h, "").strip()

            d = _parse_date(mapped["date"])
            t = _parse_time(mapped.get("time", ""))
            et = _parse_entry_type(mapped["entry_type"])
            opp = mapped.get("opponent_name") or None
            loc = mapped.get("location") or None
            notes = mapped.get("notes") or None
            status = "scheduled" if opp else "open"

            entries.append(ScheduleUploadRow(
                date=d, time=t, entry_type=et,
                opponent_name=opp, location=loc, notes=notes, status=status,
            ))
        except (ValueError, KeyError) as e:
            warnings.append(f"Row {i}: {e}")

    return ScheduleUploadPreview(entries=entries, warnings=warnings)
