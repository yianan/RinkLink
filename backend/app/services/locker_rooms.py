from __future__ import annotations

from datetime import date, datetime, time

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models import Event, LockerRoom, Notification


def event_has_started(event: Event) -> bool:
    today = date.today()
    if event.date < today:
        return True
    if event.date > today:
        return False
    if event.start_time is None:
        return False
    return event.start_time <= datetime.now().time()


def _times_overlap(
    left_start: time | None,
    left_end: time | None,
    right_start: time | None,
    right_end: time | None,
) -> bool:
    if left_start is None or right_start is None:
        return True
    if left_end is None or right_end is None:
        return True
    return left_start < right_end and right_start < left_end


def _occupied_room_ids(
    db: Session,
    *,
    arena_rink_id: str,
    event_date: date,
    start_time: time | None,
    end_time: time | None,
    exclude_event_id: str | None = None,
) -> set[str]:
    query = db.query(Event).filter(
        Event.arena_rink_id == arena_rink_id,
        Event.date == event_date,
        Event.status != "cancelled",
    )
    if exclude_event_id:
        query = query.filter(Event.id != exclude_event_id)

    occupied: set[str] = set()
    for other in query.all():
        if not _times_overlap(start_time, end_time, other.start_time, other.end_time):
            continue
        if other.home_locker_room_id:
            occupied.add(other.home_locker_room_id)
        if other.away_locker_room_id:
            occupied.add(other.away_locker_room_id)
    return occupied


def validate_locker_room_assignments(
    db: Session,
    *,
    arena_rink_id: str,
    event_date: date,
    start_time: time | None,
    end_time: time | None,
    home_locker_room_id: str | None,
    away_locker_room_id: str | None,
    exclude_event_id: str | None = None,
) -> None:
    requested_ids = [room_id for room_id in [home_locker_room_id, away_locker_room_id] if room_id]
    if len(requested_ids) != len(set(requested_ids)):
        raise HTTPException(400, "Home and away locker rooms must be different")

    for room_id in requested_ids:
        room = db.get(LockerRoom, room_id)
        if not room or room.arena_rink_id != arena_rink_id:
            raise HTTPException(400, "Locker room does not belong to arena rink")

    occupied_ids = _occupied_room_ids(
        db,
        arena_rink_id=arena_rink_id,
        event_date=event_date,
        start_time=start_time,
        end_time=end_time,
        exclude_event_id=exclude_event_id,
    )
    conflicting = [room_id for room_id in requested_ids if room_id in occupied_ids]
    if conflicting:
        raise HTTPException(409, "Locker room is already assigned to an overlapping event")


def auto_assign_locker_rooms(
    db: Session,
    *,
    arena_rink_id: str,
    event_date: date,
    start_time: time | None,
    end_time: time | None,
    needs_away_room: bool,
    exclude_event_id: str | None = None,
) -> tuple[str | None, str | None]:
    occupied_ids = _occupied_room_ids(
        db,
        arena_rink_id=arena_rink_id,
        event_date=event_date,
        start_time=start_time,
        end_time=end_time,
        exclude_event_id=exclude_event_id,
    )
    available_rooms = (
        db.query(LockerRoom)
        .filter(LockerRoom.arena_rink_id == arena_rink_id, LockerRoom.is_active.is_(True))
        .order_by(LockerRoom.display_order, LockerRoom.name)
        .all()
    )
    free_ids = [room.id for room in available_rooms if room.id not in occupied_ids]
    if not free_ids:
        return None, None
    home_room_id = free_ids[0]
    if not needs_away_room:
        return home_room_id, None
    if len(free_ids) < 2:
        return None, None
    return home_room_id, free_ids[1]


def assign_locker_rooms(
    db: Session,
    *,
    event: Event,
    home_locker_room_id: str | None,
    away_locker_room_id: str | None,
) -> tuple[str | None, str | None]:
    needs_away_room = bool(event.away_team_id and event.event_type not in {"practice", "scrimmage"})
    target_home = home_locker_room_id
    target_away = away_locker_room_id if needs_away_room else None

    if not target_home or (needs_away_room and not target_away):
        auto_home, auto_away = auto_assign_locker_rooms(
            db,
            arena_rink_id=event.arena_rink_id,
            event_date=event.date,
            start_time=event.start_time,
            end_time=event.end_time,
            needs_away_room=needs_away_room,
            exclude_event_id=event.id,
        )
        target_home = target_home or auto_home
        if needs_away_room:
            target_away = target_away or auto_away

    validate_locker_room_assignments(
        db,
        arena_rink_id=event.arena_rink_id,
        event_date=event.date,
        start_time=event.start_time,
        end_time=event.end_time,
        home_locker_room_id=target_home,
        away_locker_room_id=target_away,
        exclude_event_id=event.id,
    )
    event.home_locker_room_id = target_home
    event.away_locker_room_id = target_away
    return target_home, target_away


def notify_locker_room_update(
    db: Session,
    *,
    event: Event,
    arena_name: str | None,
    arena_rink_name: str | None,
    home_locker_room_name: str | None,
    away_locker_room_name: str | None,
    note: str | None = None,
) -> None:
    title = "Locker rooms assigned" if (home_locker_room_name or away_locker_room_name) else "Locker rooms updated"
    event_title = (
        f"{event.home_team.name} vs {event.away_team.name}"
        if event.away_team
        else f"{event.home_team.name} {event.event_type.title()}"
    )
    venue_line = " • ".join(part for part in [arena_name, arena_rink_name] if part) or "Venue TBD"
    room_line = (
        f"Home: {home_locker_room_name or 'TBD'}"
        if not event.away_team_id
        else f"Home: {home_locker_room_name or 'TBD'} | Away: {away_locker_room_name or 'TBD'}"
    )
    message = "\n".join(
        part for part in [
            event_title,
            f"{event.date.isoformat()} {event.start_time.strftime('%H:%M') if event.start_time else 'TBD'}",
            venue_line,
            room_line,
            f"Note: {note}" if note else None,
        ] if part
    )
    recipient_ids = [event.home_team_id]
    if event.away_team_id and event.away_team_id not in recipient_ids:
        recipient_ids.append(event.away_team_id)
    for team_id in recipient_ids:
        db.add(Notification(team_id=team_id, notif_type="locker_room_update", title=title, message=message))
