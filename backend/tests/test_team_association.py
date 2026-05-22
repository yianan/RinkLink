from __future__ import annotations

from datetime import date
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.auth.context import build_authorization_context
from app.models import AppUser, Association, AssociationMembership, Competition, CompetitionDivision, Season, Team, TeamCompetitionMembership, TeamMembership
from app.routers.access import approve_access_request, create_access_request, list_access_requests
from app.routers.competitions import delete_team_competition_membership, set_team_competition_membership
from app.routers.teams import update_team
from app.schemas import AccessRequestCreate, AccessRequestDecision, TeamCompetitionMembershipCreate, TeamUpdate


def make_request(path: str = "/test"):
    return SimpleNamespace(headers={}, client=None, url=SimpleNamespace(path=path))


def make_user(db: Session, email: str, *, platform_admin: bool = False) -> AppUser:
    user = AppUser(
        auth_id=f"auth-{email}",
        email=email,
        status="active",
        is_platform_admin=platform_admin,
    )
    db.add(user)
    db.flush()
    return user


def make_association(db: Session, name: str) -> Association:
    association = Association(name=name, city="Boston", state="MA", zip_code="02108")
    db.add(association)
    db.flush()
    return association


def make_independent_team(db: Session, name: str) -> Team:
    team = Team(
        association_id=None,
        name=name,
        age_group="12U",
        level="AA",
        manager_name="Manager",
        manager_email="manager@example.com",
        manager_phone="555-0100",
    )
    db.add(team)
    db.flush()
    return team


def make_season_and_division(db: Session) -> tuple[Season, CompetitionDivision]:
    season = Season(
        name="2026 Season",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
        is_active=True,
    )
    db.add(season)
    competition = Competition(
        name="Team Admin League",
        short_name="TAL",
        governing_body="Test",
        competition_type="league",
        region="MA",
    )
    db.add(competition)
    db.flush()
    division = CompetitionDivision(
        competition_id=competition.id,
        season_id=season.id,
        name="12U AA",
        age_group="12U",
        level="AA",
        standings_enabled=True,
        sort_order=10,
    )
    db.add(division)
    db.flush()
    return season, division


def test_platform_admin_can_attach_independent_team_to_association(db: Session) -> None:
    association = make_association(db, "Attach Association")
    team = make_independent_team(db, "Independent Team")
    admin = make_user(db, "platform@example.com", platform_admin=True)
    db.commit()

    updated = update_team(
        id=team.id,
        body=TeamUpdate(association_id=association.id),
        context=build_authorization_context(db, admin),
        db=db,
    )

    assert updated.association_id == association.id
    assert updated.association_name == association.name


def test_team_admin_cannot_change_team_association(db: Session) -> None:
    association = make_association(db, "Blocked Association")
    team = make_independent_team(db, "Blocked Team")
    user = make_user(db, "team-admin@example.com")
    db.add(TeamMembership(user_id=user.id, team_id=team.id, role="team_admin"))
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        update_team(
            id=team.id,
            body=TeamUpdate(association_id=association.id),
            context=build_authorization_context(db, user),
            db=db,
        )

    assert exc_info.value.status_code == 403


def test_team_admin_can_request_association_and_association_admin_can_approve(db: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.routers import access as access_router

    association = make_association(db, "Requested Association")
    team = make_independent_team(db, "Requesting Team")
    team_admin = make_user(db, "team-requester@example.com")
    association_admin = make_user(db, "association-admin@example.com")
    db.add(TeamMembership(user_id=team_admin.id, team_id=team.id, role="team_admin"))
    db.add(AssociationMembership(user_id=association_admin.id, association_id=association.id, role="association_admin"))
    db.commit()

    review_emails: list[dict] = []
    decision_emails: list[dict] = []
    monkeypatch.setattr(access_router, "send_access_request_review_email", lambda **kwargs: review_emails.append(kwargs) or True)
    monkeypatch.setattr(access_router, "send_access_request_decision_email", lambda **kwargs: decision_emails.append(kwargs) or True)

    created = create_access_request(
        payload=AccessRequestCreate(
            target_type="association_attach",
            target_id=team.id,
            notes="Please add us.",
            details={"team_id": team.id, "association_id": association.id},
        ),
        context=build_authorization_context(db, team_admin),
        db=db,
        request=make_request("/api/access-requests"),
    )

    assert created.status == "pending"
    assert created.target.name == "Requesting Team"
    assert created.target.context == "Join Requested Association"
    assert review_emails[0]["to_email"] == "association-admin@example.com"

    review_requests = list_access_requests(
        scope="review",
        status_filter="pending",
        context=build_authorization_context(db, association_admin),
        db=db,
    )
    assert [request.id for request in review_requests] == [created.id]

    approved = approve_access_request(
        request_id=created.id,
        payload=AccessRequestDecision(role=None),
        context=build_authorization_context(db, association_admin),
        db=db,
        request=make_request(f"/api/access-requests/{created.id}/approve"),
    )
    db.refresh(team)

    assert approved.status == "approved"
    assert team.association_id == association.id
    assert decision_emails[0]["target_name"] == "Requesting Team"


def test_team_admin_can_manage_team_competition_membership(db: Session) -> None:
    team = make_independent_team(db, "Competition Team")
    team_admin = make_user(db, "competition-admin@example.com")
    season, division = make_season_and_division(db)
    db.add(TeamMembership(user_id=team_admin.id, team_id=team.id, role="team_admin"))
    db.commit()

    memberships = set_team_competition_membership(
        team_id=team.id,
        body=TeamCompetitionMembershipCreate(
            season_id=season.id,
            competition_division_id=division.id,
            membership_role="primary",
            is_primary=True,
            sort_order=10,
        ),
        context=build_authorization_context(db, team_admin),
        db=db,
    )

    assert len(memberships) == 1
    assert memberships[0].competition_division_id == division.id
    assert memberships[0].is_primary is True

    stored = db.query(TeamCompetitionMembership).filter(TeamCompetitionMembership.team_id == team.id).one()
    remaining = delete_team_competition_membership(
        team_id=team.id,
        membership_id=stored.id,
        context=build_authorization_context(db, team_admin),
        db=db,
    )

    assert remaining == []
