"""Shared availability rules for opponent lookup and initial proposals."""

from datetime import date, time

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models import AvailabilityWindow
from .schedule_conflicts import find_event_conflicts


def window_contains_game(window: AvailabilityWindow, day: date, start: time | None, end: time | None) -> bool:
    # A game needs a known duration; missing availability bounds are unrestricted.
    if window.date != day or start is None or end is None or end <= start:
        return False
    return (
        (window.start_time is None or window.start_time <= start)
        and (window.end_time is None or end <= window.end_time)
    )


def team_has_blocked_period(db: Session, team_ids: set[str], day: date, start: time, end: time) -> bool:
    blocks = db.query(AvailabilityWindow).filter(
        AvailabilityWindow.team_id.in_(team_ids),
        AvailabilityWindow.date == day,
        AvailabilityWindow.blocked == True,  # noqa: E712
    ).all()
    return any(
        (block.start_time is None or block.start_time < end)
        and (block.end_time is None or start < block.end_time)
        for block in blocks
    )


def matching_windows_are_available(db: Session, first: AvailabilityWindow, second: AvailabilityWindow) -> bool:
    home, away = (first, second) if first.availability_type == "home" else (second, first)
    if (
        home.availability_type != "home" or away.availability_type != "away"
        or home.team_id == away.team_id
        or home.status != "open" or away.status != "open"
        or home.blocked or away.blocked
    ):
        return False
    # The complete home ice interval is the game duration, not just the overlap.
    if not window_contains_game(away, home.date, home.start_time, home.end_time):
        return False
    team_ids = {home.team_id, away.team_id}
    if team_has_blocked_period(db, team_ids, home.date, home.start_time, home.end_time):
        return False
    return not find_event_conflicts(db, team_ids=team_ids, event_date=home.date,
        start_time=home.start_time, end_time=home.end_time)


def validate_proposal_availability(db: Session, home: AvailabilityWindow, away: AvailabilityWindow,
        day: date, start: time | None, end: time | None) -> None:
    if home.availability_type != "home" or away.availability_type != "away":
        raise HTTPException(400, "Proposal requires home and away availability windows")
    if home.status != "open" or away.status != "open" or home.blocked or away.blocked:
        raise HTTPException(409, "One or both availability windows are no longer available")
    if not all(window_contains_game(window, day, start, end) for window in (home, away)):
        raise HTTPException(400, "The full ice slot must fit inside both teams' availability windows")
    if team_has_blocked_period(db, {home.team_id, away.team_id}, day, start, end):
        raise HTTPException(409, "A team has blocked availability overlapping this ice slot")
