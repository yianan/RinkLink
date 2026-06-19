from __future__ import annotations

from datetime import date

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.auth.context import build_authorization_context
from app.models import AppUser, Association, Player, Season, Team
from app.routers.players import create_player, update_player
from app.schemas.player import PlayerCreate, PlayerUpdate


def make_association(db: Session) -> Association:
    association = Association(name="Roster Association", city="Boston", state="MA", zip_code="02108")
    db.add(association)
    db.flush()
    return association


def make_team(db: Session, association: Association) -> Team:
    team = Team(
        association_id=association.id,
        name="Roster Team",
        age_group="14U",
        level="AA",
        manager_name="Manager",
        manager_email="manager@example.com",
        manager_phone="555-0100",
    )
    db.add(team)
    db.flush()
    return team


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


def make_admin_context(db: Session):
    user = AppUser(
        auth_id="auth-roster-admin",
        email="roster-admin@example.com",
        status="active",
        is_platform_admin=True,
    )
    db.add(user)
    db.flush()
    return build_authorization_context(db, user)


def test_create_player_rejects_exact_duplicate_roster_entry(db: Session) -> None:
    association = make_association(db)
    team = make_team(db, association)
    season = make_season(db)
    context = make_admin_context(db)

    body = PlayerCreate(
        season_id=season.id,
        first_name="Repeat",
        last_name="Click",
        jersey_number=17,
        position="F",
    )
    created = create_player(team_id=team.id, body=body, context=context, db=db)

    assert created.season_totals.goals == 0
    assert created.season_totals.assists == 0

    with pytest.raises(HTTPException) as exc:
        create_player(team_id=team.id, body=body, context=context, db=db)

    assert exc.value.status_code == 409
    assert "already exists" in str(exc.value.detail)
    assert db.query(Player).filter(Player.team_id == team.id, Player.season_id == season.id).count() == 1


def test_update_player_rejects_exact_duplicate_roster_entry(db: Session) -> None:
    association = make_association(db)
    team = make_team(db, association)
    season = make_season(db)
    context = make_admin_context(db)
    first = Player(
        team_id=team.id,
        season_id=season.id,
        first_name="Existing",
        last_name="Player",
        jersey_number=None,
        position=None,
    )
    second = Player(
        team_id=team.id,
        season_id=season.id,
        first_name="Different",
        last_name="Player",
        jersey_number=22,
        position="D",
    )
    db.add_all([first, second])
    db.commit()

    updated = update_player(
        id=second.id,
        body=PlayerUpdate(
            first_name="Different",
            last_name="Player",
            jersey_number=23,
            position="D",
        ),
        context=context,
        db=db,
    )
    assert updated.season_totals.goals == 0
    assert updated.jersey_number == 23

    with pytest.raises(HTTPException) as exc:
        update_player(
            id=second.id,
            body=PlayerUpdate(
                first_name="Existing",
                last_name="Player",
                jersey_number=None,
                position=None,
            ),
            context=context,
            db=db,
        )

    assert exc.value.status_code == 409
    assert "already exists" in str(exc.value.detail)
