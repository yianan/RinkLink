from __future__ import annotations

from datetime import date, time

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Arena, ArenaRink, Association, AvailabilityWindow, Event, Team
from app.services.calendar_feed import build_team_calendar, create_calendar_token, read_calendar_token


def make_team_with_arena(db: Session) -> tuple[Team, Team, Arena, ArenaRink]:
    association = Association(name="Calendar Association", city="Boston", state="MA", zip_code="02108")
    db.add(association)
    db.flush()
    home = Team(
        association_id=association.id,
        name="Calendar Home",
        age_group="14U",
        level="AA",
        manager_name="Manager",
        manager_email="manager@example.com",
        manager_phone="555-0100",
    )
    away = Team(
        association_id=association.id,
        name="Calendar Away",
        age_group="14U",
        level="AA",
        manager_name="Manager",
        manager_email="manager@example.com",
        manager_phone="555-0101",
    )
    arena = Arena(name="Calendar Arena", city="Boston", state="MA", zip_code="02108")
    db.add_all([home, away, arena])
    db.flush()
    rink = ArenaRink(arena_id=arena.id, name="Rink A")
    db.add(rink)
    db.flush()
    return home, away, arena, rink


def test_calendar_token_round_trips_team_id() -> None:
    token = create_calendar_token("team-123")
    assert read_calendar_token(token) == "team-123"


def test_calendar_token_rejects_tampering() -> None:
    token = create_calendar_token("team-123")
    bad_token = f"{token[:-1]}{'A' if token[-1] != 'A' else 'B'}"
    with pytest.raises(HTTPException):
        read_calendar_token(bad_token)


def test_team_calendar_contains_events_and_availability(db: Session) -> None:
    home, away, arena, rink = make_team_with_arena(db)
    db.add(
        Event(
            event_type="league",
            status="scheduled",
            home_team_id=home.id,
            away_team_id=away.id,
            arena_id=arena.id,
            arena_rink_id=rink.id,
            date=date(2026, 5, 1),
            start_time=time(10, 0),
            end_time=time(11, 0),
            notes="Arrive early",
        )
    )
    db.add(
        AvailabilityWindow(
            team_id=home.id,
            date=date(2026, 5, 2),
            start_time=time(12, 0),
            end_time=time(13, 0),
            availability_type="home",
            status="open",
        )
    )
    db.commit()

    feed = build_team_calendar(db, home.id)

    assert feed.startswith("BEGIN:VCALENDAR")
    assert "SUMMARY:Calendar Home vs Calendar Away" in feed
    assert "SUMMARY:Calendar Home open home availability" in feed
    assert "LOCATION:Calendar Arena > Rink A" in feed
