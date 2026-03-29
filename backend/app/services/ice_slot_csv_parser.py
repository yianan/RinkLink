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
    "pricing mode": "pricing_mode",
    "pricing": "pricing_mode",
    "price": "price",
    "slot price": "price",
    "amount": "price",
    "currency": "currency",
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


def _parse_price_cents(val: str) -> int | None:
    cleaned = val.strip().replace("$", "").replace(",", "")
    if not cleaned:
        return None
    return round(float(cleaned) * 100)


def _parse_pricing_mode(raw_mode: str, raw_price: str) -> str:
    mode = raw_mode.strip().lower().replace("-", "_").replace(" ", "_")
    if mode in {"", "default"}:
        return "fixed_price" if raw_price.strip() else "call_for_pricing"
    if mode in {"fixed", "fixed_price", "price", "priced"}:
        return "fixed_price"
    if mode in {"call", "call_for_price", "call_for_pricing", "tbd", "pricing_tbd"}:
        return "call_for_pricing"
    raise ValueError(f"Unrecognized pricing mode: {raw_mode}")


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
            pricing_mode = _parse_pricing_mode(mapped.get("pricing_mode", ""), mapped.get("price", ""))
            price_amount_cents = _parse_price_cents(mapped.get("price", ""))
            if pricing_mode == "fixed_price" and price_amount_cents is None:
                raise ValueError("Price is required when pricing mode is fixed_price")
            if pricing_mode == "call_for_pricing":
                price_amount_cents = None
            currency = (mapped.get("currency") or "USD").strip().upper() or "USD"
            if len(currency) != 3 or not currency.isalpha():
                raise ValueError(f"Invalid currency code: {currency}")
            notes = mapped.get("notes") or None

            entries.append(IceSlotUploadRow(
                date=d,
                start_time=st,
                end_time=et,
                pricing_mode=pricing_mode,
                price_amount_cents=price_amount_cents,
                currency=currency,
                notes=notes,
            ))
        except (ValueError, KeyError) as e:
            warnings.append(f"Row {i}: {e}")

    return IceSlotUploadPreview(entries=entries, warnings=warnings)
