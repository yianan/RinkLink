import csv
import io
import re
from datetime import date, time

from ..schemas.arena import IceSlotUploadRow, IceSlotUploadPreview

HEADER_MAP = {
    "date": "date",
    "game date": "date",
    "start time": "start_time",
    "start": "start_time",
    "time": "start_time",
    "end time": "end_time",
    "end": "end_time",
    "notes": "notes",
    "note": "notes",
    "comments": "notes",
}


def _normalize_header(h: str) -> str:
    return re.sub(r"[^a-z0-9]", " ", h.lower()).strip()


def _parse_date(val: str) -> date:
    val = val.strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%m-%d-%Y", "%m-%d-%y"):
        try:
            if fmt == "%Y-%m-%d":
                return date.fromisoformat(val)
            from datetime import datetime as dt
            return dt.strptime(val, fmt).date()
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


def parse_ice_slot_csv(content: str) -> IceSlotUploadPreview:
    """Parse CSV content into ice slot upload previews."""
    warnings: list[str] = []
    entries: list[IceSlotUploadRow] = []

    reader = csv.DictReader(io.StringIO(content))
    if not reader.fieldnames:
        return IceSlotUploadPreview(entries=[], warnings=["Empty CSV or no headers found"])

    field_map: dict[str, str] = {}
    for raw_header in reader.fieldnames:
        norm = _normalize_header(raw_header)
        if norm in HEADER_MAP:
            field_map[raw_header] = HEADER_MAP[norm]

    if "date" not in field_map.values():
        return IceSlotUploadPreview(entries=[], warnings=["No 'Date' column found in CSV"])
    if "start_time" not in field_map.values():
        return IceSlotUploadPreview(entries=[], warnings=["No 'Start Time' column found in CSV"])

    for i, row in enumerate(reader, start=2):
        try:
            mapped = {}
            for raw_h, canonical in field_map.items():
                mapped[canonical] = row.get(raw_h, "").strip()

            d = _parse_date(mapped["date"])
            st = _parse_time(mapped["start_time"])
            if st is None:
                raise ValueError("Start time is required")
            et = _parse_time(mapped.get("end_time", ""))
            notes = mapped.get("notes") or None

            entries.append(IceSlotUploadRow(
                date=d, start_time=st, end_time=et, notes=notes,
            ))
        except (ValueError, KeyError) as e:
            warnings.append(f"Row {i}: {e}")

    return IceSlotUploadPreview(entries=entries, warnings=warnings)
