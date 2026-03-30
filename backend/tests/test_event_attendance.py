from __future__ import annotations

from datetime import date, time

from sqlalchemy.orm import Session

from app.auth.context import build_authorization_context
from app.models import AppUser, Arena, ArenaRink, Association, Event, Player, PlayerMembership, Season, Team
from app.routers.events import update_event_attendance
from app.schemas.attendance import BulkEventAttendanceUpdate, EventAttendanceUpdate


def make_association(db: Session, name: str) -> Association:
    association = Association(name=name, city="Boston", state="MA", zip_code="02108")
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


def make_user(db: Session, email: str, *, status: str = "pending") -> AppUser:
    user = AppUser(
        auth_id=f"auth-{email}",
        email=email,
        status=status,
        is_platform_admin=False,
    )
    db.add(user)
    db.flush()
    return user


def make_season(db: Session) -> Season:
    season = Season(
        name="2026 Season",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
        is_active=True,
    )
    db.add(season)
    db.flush()
    return season


def make_arena_with_rink(db: Session) -> tuple[Arena, ArenaRink]:
    arena = Arena(name="Attendance Arena", city="Boston", state="MA", zip_code="02108")
    db.add(arena)
    db.flush()
    rink = ArenaRink(arena_id=arena.id, name="Rink A", display_order=1)
    db.add(rink)
    db.flush()
    return arena, rink


def test_player_self_attendance_update_returns_only_linked_player_rows(db: Session) -> None:
    association = make_association(db, "Attendance Association")
    home_team = make_team(db, association, "Attendance Home")
    away_team = make_team(db, association, "Attendance Away")
    season = make_season(db)
    arena, rink = make_arena_with_rink(db)

    linked_player = Player(
        team_id=home_team.id,
        season_id=season.id,
        first_name="Linked",
        last_name="Player",
        jersey_number=9,
        position="F",
    )
    teammate = Player(
        team_id=home_team.id,
        season_id=season.id,
        first_name="Other",
        last_name="Player",
        jersey_number=12,
        position="D",
    )
    db.add_all([linked_player, teammate])
    db.flush()

    event = Event(
        event_type="league_game",
        status="scheduled",
        home_team_id=home_team.id,
        away_team_id=away_team.id,
        season_id=season.id,
        arena_id=arena.id,
        arena_rink_id=rink.id,
        date=date(2099, 3, 30),
        start_time=time(18, 0),
        end_time=time(19, 15),
        home_weekly_confirmed=True,
        away_weekly_confirmed=True,
    )
    db.add(event)

    player_user = make_user(db, "self-player@example.com", status="active")
    db.add(PlayerMembership(user_id=player_user.id, player_id=linked_player.id))
    db.commit()

    context = build_authorization_context(db, player_user)
    response = update_event_attendance(
        team_id=home_team.id,
        event_id=event.id,
        body=BulkEventAttendanceUpdate(
            updates=[EventAttendanceUpdate(player_id=linked_player.id, status="tentative")]
        ),
        context=context,
        db=db,
    )

    assert [player.player_id for player in response] == [linked_player.id]
    assert response[0].status == "tentative"
