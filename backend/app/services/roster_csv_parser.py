import csv
import io
import re

from ..schemas.player import PlayerUploadPreview, PlayerUploadRow


HEADER_MAP = {
    "first name": "first_name",
    "firstname": "first_name",
    "given name": "first_name",
    "last name": "last_name",
    "lastname": "last_name",
    "surname": "last_name",
    "player first": "first_name",
    "player last": "last_name",
    "jersey": "jersey_number",
    "jersey number": "jersey_number",
    "number": "jersey_number",
    "#": "jersey_number",
    "pos": "position",
    "position": "position",
}


def _normalize_header(h: str) -> str:
    return re.sub(r"[^a-z0-9#]", " ", h.lower()).strip()


def _parse_int(val: str) -> int | None:
    v = val.strip()
    if not v:
        return None
    try:
        return int(v)
    except ValueError:
        return None


def parse_roster_csv(content: str) -> PlayerUploadPreview:
    warnings: list[str] = []
    entries: list[PlayerUploadRow] = []

    reader = csv.DictReader(io.StringIO(content))
    if not reader.fieldnames:
        return PlayerUploadPreview(entries=[], warnings=["Empty CSV or no headers found"])

    field_map: dict[str, str] = {}
    for raw_header in reader.fieldnames:
        norm = _normalize_header(raw_header)
        if norm in HEADER_MAP:
            field_map[raw_header] = HEADER_MAP[norm]

    if "first_name" not in field_map.values() or "last_name" not in field_map.values():
        return PlayerUploadPreview(entries=[], warnings=["CSV must include First Name and Last Name columns"])

    for i, row in enumerate(reader, start=2):
        mapped: dict[str, str] = {}
        for raw_h, canonical in field_map.items():
            mapped[canonical] = (row.get(raw_h) or "").strip()

        first = mapped.get("first_name", "").strip()
        last = mapped.get("last_name", "").strip()
        if not first or not last:
            warnings.append(f"Row {i}: Missing first or last name")
            continue

        jersey = _parse_int(mapped.get("jersey_number", ""))
        pos = mapped.get("position") or None
        if pos:
            pos = pos.strip() or None

        entries.append(PlayerUploadRow(first_name=first, last_name=last, jersey_number=jersey, position=pos))

    return PlayerUploadPreview(entries=entries, warnings=warnings)

