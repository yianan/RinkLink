from __future__ import annotations

from datetime import date, time

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Arena, ArenaRink, Association, Event, IceSlot, Team
from app.services.schedule_conflicts import assert_no_event_conflicts


def make_association(db: Session) -> Association:
    association = Association(name="Conflict Association", city="Boston", state="MA", zip_code="02108")
    db.add(association)
    db.flush()
    return association


def make_team(db: Session, association: Association, name: str) -> Team:
    team = Team(
        association_id=association.id,
        name=name,
        age_group="14U",
        level="AA",
        manager_name="Manager",
        manager_email="manager@example.com",
        manager_phone="555-0100",
    )
    db.add(team)
    db.flush()
    return team


def make_arena(db: Session) -> tuple[Arena, ArenaRink]:
    arena = Arena(name="Conflict Arena", city="Boston", state="MA", zip_code="02108")
    db.add(arena)
    db.flush()
    rink = ArenaRink(arena_id=arena.id, name="Main")
    db.add(rink)
    db.flush()
    return arena, rink


def make_event(db: Session, *, home_team_id: str, away_team_id: str | None, arena: Arena, rink: ArenaRink) -> Event:
    event = Event(
        event_type="league",
        status="scheduled",
        home_team_id=home_team_id,
        away_team_id=away_team_id,
        arena_id=arena.id,
        arena_rink_id=rink.id,
        date=date(2026, 5, 1),
        start_time=time(10, 0),
        end_time=time(11, 0),
    )
    db.add(event)
    db.flush()
    return event


def test_conflict_detection_blocks_overlapping_team_events(db: Session) -> None:
    association = make_association(db)
    home = make_team(db, association, "Home")
    away = make_team(db, association, "Away")
    arena, rink = make_arena(db)
    make_event(db, home_team_id=home.id, away_team_id=away.id, arena=arena, rink=rink)

    with pytest.raises(HTTPException) as exc_info:
        assert_no_event_conflicts(
            db,
            team_ids={home.id},
            event_date=date(2026, 5, 1),
            start_time=time(10, 30),
            end_time=time(11, 30),
        )

    assert exc_info.value.status_code == 409
    assert "overlaps" in exc_info.value.detail


def test_conflict_detection_allows_non_overlapping_same_day_events(db: Session) -> None:
    association = make_association(db)
    home = make_team(db, association, "Home")
    away = make_team(db, association, "Away")
    arena, rink = make_arena(db)
    make_event(db, home_team_id=home.id, away_team_id=away.id, arena=arena, rink=rink)

    assert_no_event_conflicts(
        db,
        team_ids={home.id},
        event_date=date(2026, 5, 1),
        start_time=time(11, 0),
        end_time=time(12, 0),
    )


def test_conflict_detection_blocks_reused_ice_slot(db: Session) -> None:
    association = make_association(db)
    home = make_team(db, association, "Home")
    away = make_team(db, association, "Away")
    other = make_team(db, association, "Other")
    arena, rink = make_arena(db)
    event = make_event(db, home_team_id=home.id, away_team_id=away.id, arena=arena, rink=rink)
    slot = IceSlot(
        id="slot-1",
        arena_rink_id=rink.id,
        date=date(2026, 5, 1),
        start_time=time(10, 0),
        end_time=time(11, 0),
        status="booked",
    )
    db.add(slot)
    db.flush()
    event.ice_slot_id = slot.id
    db.flush()

    with pytest.raises(HTTPException) as exc_info:
        assert_no_event_conflicts(
            db,
            team_ids={other.id},
            event_date=date(2026, 5, 1),
            start_time=time(12, 0),
            end_time=time(13, 0),
            ice_slot_id="slot-1",
        )

    assert exc_info.value.status_code == 409
    assert "ice slot" in exc_info.value.detail
