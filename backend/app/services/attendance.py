from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models import Event, EventAttendance, Player
from ..schemas.attendance import EventAttendancePlayer, EventAttendanceSummary

ATTENDANCE_STATUSES = {"attending", "tentative", "absent"}


def validate_attendance_team(event: Event, team_id: str) -> None:
    if team_id not in {event.home_team_id, event.away_team_id}:
        raise HTTPException(400, "Team is not part of this event")


def attendance_is_editable(event: Event) -> bool:
    return event.status != "cancelled" and event.date >= date.today()


def ensure_attendance_editable(event: Event) -> None:
    if not attendance_is_editable(event):
        raise HTTPException(400, "Attendance is read-only for past or cancelled events")


def team_roster_for_event(db: Session, event: Event, team_id: str) -> list[Player]:
    query = db.query(Player).filter(Player.team_id == team_id)
    if event.season_id:
        query = query.filter(Player.season_id == event.season_id)
    return query.order_by(Player.jersey_number.is_(None), Player.jersey_number.asc(), Player.last_name.asc(), Player.first_name.asc()).all()


def attendance_rows_by_player(db: Session, event_id: str, player_ids: list[str]) -> dict[str, EventAttendance]:
    if not player_ids:
        return {}
    rows = (
        db.query(EventAttendance)
        .filter(EventAttendance.event_id == event_id, EventAttendance.player_id.in_(player_ids))
        .all()
    )
    return {row.player_id: row for row in rows}


def build_attendance_players(db: Session, event: Event, team_id: str) -> list[EventAttendancePlayer]:
    roster = team_roster_for_event(db, event, team_id)
    rows = attendance_rows_by_player(db, event.id, [player.id for player in roster])
    return [
        EventAttendancePlayer(
            player_id=player.id,
            first_name=player.first_name,
            last_name=player.last_name,
            jersey_number=player.jersey_number,
            position=player.position,
            status=rows[player.id].status if player.id in rows else "unknown",
            responded_at=rows[player.id].responded_at if player.id in rows else None,
        )
        for player in roster
    ]


def summarize_attendance(players: list[EventAttendancePlayer]) -> EventAttendanceSummary:
    attending_count = sum(1 for player in players if player.status == "attending")
    tentative_count = sum(1 for player in players if player.status == "tentative")
    absent_count = sum(1 for player in players if player.status == "absent")
    total_players = len(players)
    return EventAttendanceSummary(
        attending_count=attending_count,
        tentative_count=tentative_count,
        absent_count=absent_count,
        unknown_count=total_players - attending_count - tentative_count - absent_count,
        total_players=total_players,
    )


def attach_attendance_summary(db: Session, event: Event, team_id: str, out) -> None:
    players = build_attendance_players(db, event, team_id)
    out.attendance_summary = summarize_attendance(players)


def upsert_attendance_updates(db: Session, event: Event, team_id: str, updates: dict[str, str]) -> list[EventAttendancePlayer]:
    ensure_attendance_editable(event)
    roster = team_roster_for_event(db, event, team_id)
    roster_ids = {player.id for player in roster}
    invalid_player_ids = set(updates) - roster_ids
    if invalid_player_ids:
        raise HTTPException(400, "Attendance updates must reference current roster players only")

    existing = attendance_rows_by_player(db, event.id, list(roster_ids))
    now = datetime.now(timezone.utc)

    for player_id, status in updates.items():
        if status == "unknown":
            row = existing.get(player_id)
            if row:
                db.delete(row)
            continue

        if status not in ATTENDANCE_STATUSES:
            raise HTTPException(400, "Invalid attendance status")

        row = existing.get(player_id)
        if row:
            row.status = status
            row.responded_at = now
        else:
            db.add(
                EventAttendance(
                    event_id=event.id,
                    player_id=player_id,
                    status=status,
                    responded_at=now,
                )
            )

    db.flush()
    return build_attendance_players(db, event, team_id)
