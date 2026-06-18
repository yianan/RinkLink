from __future__ import annotations

import argparse
import base64
import gzip
import hashlib
import json
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from ..database import SessionLocal


GLOBAL_TABLES = [
    "zip_codes",
    "media_assets",
    "associations",
    "teams",
    "arenas",
    "arena_rinks",
    "locker_rooms",
    "competitions",
]

SEASON_ID_TABLES = [
    "competition_divisions",
    "team_competition_memberships",
    "availability_windows",
    "players",
    "events",
    "ice_booking_requests",
    "team_season_records",
    "team_season_venue_assignments",
]

AUTH_AND_USER_TABLES = {
    "access_requests",
    "app_users",
    "arena_memberships",
    "association_memberships",
    "audit_log",
    "invites",
    "player_guardianships",
    "player_memberships",
    "team_memberships",
}


def _json_value(value: Any) -> Any:
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, memoryview):
        return {"__bytes_b64__": base64.b64encode(value.tobytes()).decode("ascii")}
    if isinstance(value, bytes):
        return {"__bytes_b64__": base64.b64encode(value).decode("ascii")}
    return value


def _rows(db: Session, table: str, where: str = "", params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    sql = f'SELECT * FROM "{table}"'
    if where:
        sql += f" WHERE {where}"
    sql += " ORDER BY 1"
    result = db.execute(text(sql), params or {})
    return [
        {key: _json_value(value) for key, value in row.items()}
        for row in result.mappings().all()
    ]


def _in_clause(column: str, values: list[str] | set[str], prefix: str) -> tuple[str, dict[str, Any]]:
    sorted_values = sorted(values)
    if not sorted_values:
        return "1 = 0", {}
    params = {f"{prefix}_{index}": value for index, value in enumerate(sorted_values)}
    placeholders = ", ".join(f":{key}" for key in params)
    return f"{column} IN ({placeholders})", params


def _id_rows(db: Session, sql: str, params: dict[str, Any]) -> list[str]:
    return [row[0] for row in db.execute(text(sql), params).all() if row[0]]


def build_demo_snapshot(db: Session, *, season_name: str = "2025-2026") -> dict[str, Any]:
    season = db.execute(
        text('SELECT id, start_date, end_date FROM "seasons" WHERE name = :season_name'),
        {"season_name": season_name},
    ).mappings().first()
    if not season:
        raise SystemExit(f"Season not found: {season_name}")

    season_id = season["id"]
    season_start = season["start_date"]
    season_end = season["end_date"]

    tables: dict[str, list[dict[str, Any]]] = {}
    for table in GLOBAL_TABLES:
        tables[table] = _rows(db, table)

    tables["seasons"] = _rows(db, "seasons", "name = :season_name", {"season_name": season_name})
    for table in SEASON_ID_TABLES:
        tables[table] = _rows(db, table, "season_id = :season_id", {"season_id": season_id})

    event_ids = _id_rows(db, 'SELECT id FROM "events" WHERE season_id = :season_id', {"season_id": season_id})
    event_where, event_params = _in_clause("event_id", event_ids, "event_id")
    for table in ["event_attendance", "event_goalie_stats", "event_penalties", "event_player_stats", "event_signatures"]:
        tables[table] = _rows(db, table, event_where, event_params)

    slot_ids = set(
        _id_rows(db, 'SELECT ice_slot_id FROM "events" WHERE season_id = :season_id', {"season_id": season_id})
        + _id_rows(db, 'SELECT ice_slot_id FROM "ice_booking_requests" WHERE season_id = :season_id', {"season_id": season_id})
        + _id_rows(
            db,
            'SELECT ice_slot_id FROM "proposals" WHERE proposed_date >= :season_start AND proposed_date <= :season_end',
            {"season_start": season_start, "season_end": season_end},
        )
    )
    slot_where, slot_params = _in_clause("id", slot_ids, "slot_id")
    tables["ice_slots"] = _rows(db, "ice_slots", slot_where, slot_params)

    tables["proposals"] = _rows(
        db,
        "proposals",
        "proposed_date >= :season_start AND proposed_date <= :season_end",
        {"season_start": season_start, "season_end": season_end},
    )
    tables["notifications"] = _rows(
        db,
        "notifications",
        "week_start >= :season_start AND week_start <= :season_end",
        {"season_start": season_start, "season_end": season_end},
    )

    payload = {
        "season_name": season_name,
        "tables": tables,
    }
    table_hashes = {
        table: hashlib.sha256(json.dumps(rows, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
        for table, rows in sorted(tables.items())
    }
    payload["summary"] = {
        "table_counts": {table: len(rows) for table, rows in sorted(tables.items())},
        "table_hashes": table_hashes,
        "snapshot_hash": hashlib.sha256(json.dumps(tables, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest(),
    }
    return payload


def _emit_log_chunks(payload: dict[str, Any], *, chunk_size: int = 6000) -> None:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    digest = hashlib.sha256(raw).hexdigest()
    encoded = base64.b64encode(gzip.compress(raw, mtime=0)).decode("ascii")
    chunks = [encoded[index : index + chunk_size] for index in range(0, len(encoded), chunk_size)]
    print(f"RINKLINK_DEMO_DUMP_BEGIN sha256={digest} chunks={len(chunks)}")
    for index, chunk in enumerate(chunks):
        print(f"RINKLINK_DEMO_DUMP_CHUNK {index:04d} {chunk}")
    print(f"RINKLINK_DEMO_DUMP_END sha256={digest} chunks={len(chunks)}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Export a season-scoped demo data snapshot.")
    parser.add_argument("--season-name", default="2025-2026")
    parser.add_argument("--format", choices=["json", "log-chunks"], default="json")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        payload = build_demo_snapshot(db, season_name=args.season_name)
    finally:
        db.close()

    if args.format == "log-chunks":
        _emit_log_chunks(payload)
    else:
        print(json.dumps(payload, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
