from __future__ import annotations

from datetime import date, time

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..models import Event

ACTIVE_EVENT_STATUSES = ("scheduled", "confirmed", "final")


def _times_overlap(
    start: time | None,
    end: time | None,
    other_start: time | None,
    other_end: time | None,
) -> bool:
    if start is None or other_start is None:
        return True
    if end is None or other_end is None:
        return start == other_start
    return start < other_end and other_start < end


def find_event_conflicts(
    db: Session,
    *,
    team_ids: set[str],
    event_date: date,
    start_time: time | None,
    end_time: time | None,
    ice_slot_id: str | None = None,
    exclude_event_id: str | None = None,
) -> list[Event]:
    if not team_ids and not ice_slot_id:
        return []

    filters = [Event.date == event_date, Event.status.in_(ACTIVE_EVENT_STATUSES)]
    if exclude_event_id:
        filters.append(Event.id != exclude_event_id)

    conflict_scope = []
    if team_ids:
        conflict_scope.append(Event.home_team_id.in_(team_ids))
        conflict_scope.append(Event.away_team_id.in_(team_ids))
    if ice_slot_id:
        conflict_scope.append(Event.ice_slot_id == ice_slot_id)

    candidates = db.query(Event).filter(*filters, or_(*conflict_scope)).all()
    conflicts: list[Event] = []
    for candidate in candidates:
        same_slot = ice_slot_id is not None and candidate.ice_slot_id == ice_slot_id
        same_team = candidate.home_team_id in team_ids or (candidate.away_team_id in team_ids if candidate.away_team_id else False)
        if same_slot or (same_team and _times_overlap(start_time, end_time, candidate.start_time, candidate.end_time)):
            conflicts.append(candidate)
    return conflicts


def assert_no_event_conflicts(
    db: Session,
    *,
    team_ids: set[str],
    event_date: date,
    start_time: time | None,
    end_time: time | None,
    ice_slot_id: str | None = None,
    exclude_event_id: str | None = None,
) -> None:
    conflicts = find_event_conflicts(
        db,
        team_ids=team_ids,
        event_date=event_date,
        start_time=start_time,
        end_time=end_time,
        ice_slot_id=ice_slot_id,
        exclude_event_id=exclude_event_id,
    )
    if not conflicts:
        return

    first = conflicts[0]
    if ice_slot_id and first.ice_slot_id == ice_slot_id:
        raise HTTPException(409, "This ice slot is already tied to another active event")
    raise HTTPException(409, "This team already has an active event that overlaps this date and time")
