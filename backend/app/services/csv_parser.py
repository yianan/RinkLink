import csv
import io
import re
from datetime import date, time

from ..schemas.availability_window import AvailabilityUploadPreview, AvailabilityUploadRow

# Normalized header names -> canonical field
HEADER_MAP = {
    "date": "date",
    "game date": "date",
    "time": "time",
    "game time": "time",
    "start time": "time",
    "home/away": "availability_type",
    "homeaway": "availability_type",
    "home_away": "availability_type",
    "type": "availability_type",
    "availability": "availability_type",
    "h/a": "availability_type",
    "notes": "notes",
    "note": "notes",
    "comments": "notes",
    "end time": "end_time",
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


def _parse_availability_type(val: str) -> str:
    v = val.strip().lower()
    if v in ("home", "h"):
        return "home"
    if v in ("away", "a"):
        return "away"
    raise ValueError(f"Unrecognized home/away value: {val}")


def parse_csv(content: str) -> AvailabilityUploadPreview:
    """Parse CSV content into availability upload previews."""
    warnings: list[str] = []
    entries: list[AvailabilityUploadRow] = []

    reader = csv.DictReader(io.StringIO(content))
    if not reader.fieldnames:
        return AvailabilityUploadPreview(entries=[], warnings=["Empty CSV or no headers found"])

    # Map headers
    field_map: dict[str, str] = {}
    for raw_header in reader.fieldnames:
        norm = _normalize_header(raw_header)
        if norm in HEADER_MAP:
            field_map[raw_header] = HEADER_MAP[norm]

    if "date" not in field_map.values():
        return AvailabilityUploadPreview(entries=[], warnings=["No 'Date' column found in CSV"])
    if "availability_type" not in field_map.values():
        return AvailabilityUploadPreview(entries=[], warnings=["No 'Home/Away' column found in CSV"])

    for i, row in enumerate(reader, start=2):
        try:
            mapped = {}
            for raw_h, canonical in field_map.items():
                mapped[canonical] = row.get(raw_h, "").strip()

            d = _parse_date(mapped["date"])
            t = _parse_time(mapped.get("time", ""))
            et = _parse_availability_type(mapped["availability_type"])
            notes = mapped.get("notes") or None
            end_t = _parse_time(mapped.get("end_time", ""))

            entries.append(AvailabilityUploadRow(
                date=d,
                start_time=t,
                end_time=end_t,
                availability_type=et,
                notes=notes,
                status="open",
            ))
        except (ValueError, KeyError) as e:
            warnings.append(f"Row {i}: {e}")

    return AvailabilityUploadPreview(entries=entries, warnings=warnings)
