from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.auth.context import build_authorization_context
from app.models import AppUser, Association, AssociationMembership, Team, TeamMembership
from app.routers.access import approve_access_request, create_access_request, list_access_requests
from app.routers.teams import update_team
from app.schemas import AccessRequestCreate, AccessRequestDecision, TeamUpdate


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
