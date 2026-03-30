from __future__ import annotations

from datetime import date

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.auth.context import build_authorization_context
from app.models import AccessRequest, AppUser, Arena, Association, Invite, Player, PlayerGuardianship, Season, Team, TeamMembership
from app.routers.access import accept_invite, create_access_request, list_access_targets
from app.schemas import AccessRequestCreate


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


def make_arena(db: Session, name: str) -> Arena:
    arena = Arena(name=name, city="Boston", state="MA", zip_code="02108")
    db.add(arena)
    db.flush()
    return arena


def test_pending_user_can_lookup_request_targets(db: Session) -> None:
    association = make_association(db, "Lookup Association")
    team = make_team(db, association, "Lookup Team")
    season = make_season(db)
    arena = make_arena(db, "Lookup Arena")
    db.add(
        Player(
            team_id=team.id,
            season_id=season.id,
            first_name="Jordan",
            last_name="Skater",
            jersey_number=12,
            position="F",
        )
    )
    pending_user = make_user(db, "pending@example.com")
    db.commit()

    context = build_authorization_context(db, pending_user)

    team_targets = list_access_targets(target_type="team", team_id=None, context=context, db=db)
    arena_targets = list_access_targets(target_type="arena", team_id=None, context=context, db=db)
    player_targets = list_access_targets(target_type="guardian_link", team_id=team.id, context=context, db=db)

    assert [target.id for target in team_targets] == [team.id]
    assert [target.id for target in arena_targets] == [arena.id]
    assert [target.id for target in player_targets]
    assert player_targets[0].name == "Jordan Skater"
    assert "Parent/guardian access" in (player_targets[0].context or "")


def test_duplicate_access_request_reuses_existing_pending_row(db: Session) -> None:
    association = make_association(db, "Duplicate Association")
    team = make_team(db, association, "Duplicate Team")
    pending_user = make_user(db, "duplicate@example.com")
    db.commit()

    context = build_authorization_context(db, pending_user)
    payload = AccessRequestCreate(target_type="team", target_id=team.id, notes="Need manager access")

    first = create_access_request(payload=payload, context=context, db=db)
    second = create_access_request(payload=payload, context=context, db=db)

    assert first.id == second.id
    assert db.query(AccessRequest).count() == 1


def test_existing_membership_blocks_redundant_access_request(db: Session) -> None:
    association = make_association(db, "Member Association")
    team = make_team(db, association, "Member Team")
    active_user = make_user(db, "member@example.com", status="active")
    db.add(TeamMembership(user_id=active_user.id, team_id=team.id, role="manager"))
    db.commit()

    context = build_authorization_context(db, active_user)

    with pytest.raises(HTTPException) as exc_info:
        create_access_request(
            payload=AccessRequestCreate(target_type="team", target_id=team.id, notes=None),
            context=context,
            db=db,
        )

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail == "You already have access to this resource"


def test_accept_invite_activates_pending_user_membership(db: Session) -> None:
    association = make_association(db, "Invite Association")
    team = make_team(db, association, "Invite Team")
    pending_user = make_user(db, "invitee@example.com", status="pending")
    db.add(
        Invite(
            token="invite-token",
            email="invitee@example.com",
            target_type="team",
            target_id=team.id,
            role="manager",
            invited_by_user_id=pending_user.id,
            status="pending",
            expires_at=date.max,
        )
    )
    db.commit()

    context = build_authorization_context(db, pending_user)
    accepted = accept_invite(token="invite-token", context=context, db=db)

    db.refresh(pending_user)
    assert accepted.status == "accepted"
    assert pending_user.status == "active"
    membership = db.query(TeamMembership).filter(TeamMembership.user_id == pending_user.id, TeamMembership.team_id == team.id).one()
    assert membership.role == "manager"


def test_accept_invite_rejects_wrong_email(db: Session) -> None:
    association = make_association(db, "Wrong Email Association")
    team = make_team(db, association, "Wrong Email Team")
    invited_user = make_user(db, "correct@example.com", status="pending")
    wrong_user = make_user(db, "wrong@example.com", status="pending")
    db.add(
        Invite(
            token="wrong-email-token",
            email="correct@example.com",
            target_type="team",
            target_id=team.id,
            role="coach",
            invited_by_user_id=invited_user.id,
            status="pending",
            expires_at=date.max,
        )
    )
    db.commit()

    context = build_authorization_context(db, wrong_user)

    with pytest.raises(HTTPException) as exc_info:
        accept_invite(token="wrong-email-token", context=context, db=db)

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "This invite is for a different email address"


def test_accept_guardian_invite_creates_player_guardianship(db: Session) -> None:
    association = make_association(db, "Guardian Association")
    team = make_team(db, association, "Guardian Team")
    season = make_season(db)
    player = Player(
        team_id=team.id,
        season_id=season.id,
        first_name="Taylor",
        last_name="Goalie",
        jersey_number=31,
        position="G",
    )
    db.add(player)
    pending_user = make_user(db, "guardian@example.com", status="pending")
    db.flush()
    db.add(
        Invite(
            token="guardian-token",
            email="guardian@example.com",
            target_type="guardian_link",
            target_id=player.id,
            role=None,
            invited_by_user_id=pending_user.id,
            status="pending",
            expires_at=date.max,
        )
    )
    db.commit()

    context = build_authorization_context(db, pending_user)
    accepted = accept_invite(token="guardian-token", context=context, db=db)

    db.refresh(pending_user)
    assert accepted.status == "accepted"
    assert pending_user.status == "active"
    guardianship = db.query(PlayerGuardianship).filter(
        PlayerGuardianship.user_id == pending_user.id,
        PlayerGuardianship.player_id == player.id,
    ).one()
    assert guardianship.relationship_type == "guardian"
