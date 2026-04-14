from __future__ import annotations

from datetime import date

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.auth.capabilities import effective_capabilities
from app.auth.context import authorization_context, build_authorization_context, can_access_any_event_team, can_access_arena, can_access_team
from app.auth.runtime import assert_auth_runtime_safe
from app.auth.dependencies import current_user
from app.auth import dependencies as auth_dependencies
from app.models import (
    AppUser,
    Arena,
    ArenaMembership,
    ArenaRink,
    Association,
    AssociationMembership,
    Event,
    Player,
    PlayerGuardianship,
    Season,
    Team,
    TeamMembership,
)


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


def make_user(db: Session, email: str, *, is_platform_admin: bool = False) -> AppUser:
    user = AppUser(
        auth_id=f"auth-{email}",
        email=email,
        status="active",
        is_platform_admin=is_platform_admin,
    )
    db.add(user)
    db.flush()
    return user


def make_arena(db: Session, name: str) -> tuple[Arena, ArenaRink]:
    arena = Arena(name=name, city="Boston", state="MA", zip_code="02108")
    db.add(arena)
    db.flush()
    rink = ArenaRink(arena_id=arena.id, name=f"{name} Rink")
    db.add(rink)
    db.flush()
    return arena, rink


def test_effective_capabilities_include_association_private_and_coach_scoresheet() -> None:
    association_admin = AppUser(auth_id="auth-assoc", email="assoc@example.com", status="active")
    association_capabilities = effective_capabilities(
        user=association_admin,
        association_roles=["association_admin"],
        team_roles=[],
        arena_roles=[],
        has_guardian_link=False,
        has_player_link=False,
    )
    assert "team.view_private" in association_capabilities
    assert "team.manage_staff" in association_capabilities

    coach = AppUser(auth_id="auth-coach", email="coach@example.com", status="active")
    coach_capabilities = effective_capabilities(
        user=coach,
        association_roles=[],
        team_roles=["coach"],
        arena_roles=[],
        has_guardian_link=False,
        has_player_link=False,
    )
    assert "team.manage_scoresheet" in coach_capabilities
    assert "team.manage_attendance" in coach_capabilities

    scheduler = AppUser(auth_id="auth-scheduler", email="scheduler@example.com", status="active")
    scheduler_capabilities = effective_capabilities(
        user=scheduler,
        association_roles=[],
        team_roles=["scheduler"],
        arena_roles=[],
        has_guardian_link=False,
        has_player_link=False,
    )
    assert "team.manage_schedule" in scheduler_capabilities
    assert "team.manage_proposals" in scheduler_capabilities
    assert "team.view_private" not in scheduler_capabilities


def test_association_admin_gets_private_team_access_only_for_owned_association(db: Session) -> None:
    association = make_association(db, "North Stars")
    other_association = make_association(db, "South Stars")
    owned_team = make_team(db, association, "North Stars 14U AA")
    foreign_team = make_team(db, other_association, "South Stars 14U AA")
    user = make_user(db, "assoc-admin@example.com")
    db.add(AssociationMembership(user_id=user.id, association_id=association.id, role="association_admin"))
    db.commit()

    context = build_authorization_context(db, user)

    assert can_access_team(context, owned_team, "team.view_private") is True
    assert can_access_team(context, foreign_team, "team.view_private") is False


def test_guardian_context_allows_only_linked_family_team_and_event_access(db: Session) -> None:
    association = make_association(db, "Family Assoc")
    team = make_team(db, association, "Family Team")
    other_team = make_team(db, association, "Other Team")
    season = make_season(db)
    arena, rink = make_arena(db, "Family Arena")
    parent = make_user(db, "parent@example.com")
    linked_player = Player(
        team_id=team.id,
        season_id=season.id,
        first_name="Casey",
        last_name="Player",
        jersey_number=12,
        position="F",
    )
    db.add(linked_player)
    db.flush()
    db.add(PlayerGuardianship(user_id=parent.id, player_id=linked_player.id, relationship_type="parent"))
    event = Event(
        event_type="league",
        home_team_id=team.id,
        away_team_id=other_team.id,
        season_id=season.id,
        arena_id=arena.id,
        arena_rink_id=rink.id,
        date=date(2026, 3, 29),
    )
    unrelated_event = Event(
        event_type="league",
        home_team_id=other_team.id,
        away_team_id=None,
        season_id=season.id,
        arena_id=arena.id,
        arena_rink_id=rink.id,
        date=date(2026, 3, 30),
    )
    db.add_all([event, unrelated_event])
    db.commit()

    context = build_authorization_context(db, parent)

    assert "player.respond_guarded" in context.capabilities
    assert context.linked_team_ids == {team.id}
    assert can_access_team(context, team, "team.view", allow_linked_family=True) is True
    assert can_access_team(context, team, "team.view") is False
    assert can_access_team(context, other_team, "team.view", allow_linked_family=True) is False
    assert can_access_any_event_team(context, event, "team.view", allow_linked_family=True) is True
    assert can_access_any_event_team(context, unrelated_event, "team.view", allow_linked_family=True) is False


def test_team_and_arena_memberships_do_not_bleed_across_resource_types(db: Session) -> None:
    association = make_association(db, "Boundary Assoc")
    team = make_team(db, association, "Boundary Team")
    arena, _ = make_arena(db, "Boundary Arena")
    staff_user = make_user(db, "staff@example.com")
    arena_user = make_user(db, "arena@example.com")
    db.add(TeamMembership(user_id=staff_user.id, team_id=team.id, role="manager"))
    db.add(ArenaMembership(user_id=arena_user.id, arena_id=arena.id, role="arena_ops"))
    db.commit()

    staff_context = build_authorization_context(db, staff_user)
    arena_context = build_authorization_context(db, arena_user)

    assert can_access_team(staff_context, team, "team.manage_roster") is True
    assert can_access_arena(staff_context, arena.id, "arena.view") is False
    assert can_access_arena(arena_context, arena.id, "arena.manage_booking_requests") is True
    assert can_access_team(arena_context, team, "team.view_private") is False


def test_current_user_rejects_unverified_email_claims(db: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth_dependencies, "assert_auth_runtime_safe", lambda: None)
    monkeypatch.setattr(auth_dependencies.settings, "auth_enabled", True)
    monkeypatch.setattr(
        auth_dependencies,
        "decode_access_token",
        lambda token: {"sub": "auth-unverified", "email": "user@example.com", "email_verified": False, "iat": 1},
    )

    with pytest.raises(HTTPException) as exc_info:
        current_user(
            credentials=HTTPAuthorizationCredentials(scheme="Bearer", credentials="token"),
            db=db,
        )

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Verified email is required"


def test_current_user_keeps_existing_email_on_claim_mismatch(db: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    user = AppUser(auth_id="auth-mismatch", email="original@example.com", status="active")
    db.add(user)
    db.commit()

    monkeypatch.setattr(auth_dependencies, "assert_auth_runtime_safe", lambda: None)
    monkeypatch.setattr(auth_dependencies.settings, "auth_enabled", True)
    monkeypatch.setattr(
        auth_dependencies,
        "decode_access_token",
        lambda token: {"sub": "auth-mismatch", "email": "changed@example.com", "email_verified": True, "iat": 1},
    )

    resolved_user = current_user(
        credentials=HTTPAuthorizationCredentials(scheme="Bearer", credentials="token"),
        db=db,
    )

    assert resolved_user.email == "original@example.com"


def test_privileged_authorization_requires_mfa_claim(db: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    association = make_association(db, "MFA Assoc")
    team = make_team(db, association, "MFA Team")
    manager = make_user(db, "manager@example.com")
    db.add(TeamMembership(user_id=manager.id, team_id=team.id, role="team_admin"))
    db.commit()
    monkeypatch.setattr(auth_dependencies.settings, "auth_require_mfa_for_privileged", True)

    with pytest.raises(HTTPException) as exc_info:
        authorization_context(user=manager, db=db)

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Two-factor authentication is required for this account"

    setattr(manager, "_token_claims", {"mfa_verified": True})
    context = authorization_context(user=manager, db=db)
    assert "team.manage_staff" in context.capabilities


def test_privileged_authorization_allows_access_when_mfa_rollout_disabled(
    db: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    association = make_association(db, "No MFA Assoc")
    team = make_team(db, association, "No MFA Team")
    manager = make_user(db, "no-mfa-manager@example.com")
    db.add(TeamMembership(user_id=manager.id, team_id=team.id, role="team_admin"))
    db.commit()
    monkeypatch.setattr(auth_dependencies.settings, "auth_require_mfa_for_privileged", False)

    context = authorization_context(user=manager, db=db)

    assert "team.manage_staff" in context.capabilities


def test_runtime_rejects_auth_disabled_outside_development(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth_dependencies.settings, "app_env", "production")
    monkeypatch.setattr(auth_dependencies.settings, "auth_enabled", False)

    with pytest.raises(RuntimeError) as exc_info:
        assert_auth_runtime_safe()

    assert "AUTH_ENABLED may only be disabled" in str(exc_info.value)
