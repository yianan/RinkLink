from __future__ import annotations

from datetime import date
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.auth.context import build_authorization_context, can_access_team
from app.auth.dependencies import current_user
from app.auth import dependencies as auth_dependencies
from app.config import settings
from app.models import AccessRequest, AppUser, Arena, ArenaMembership, Association, AssociationMembership, AuditLog, Invite, Player, PlayerGuardianship, PlayerMembership, Season, Team, TeamMembership
from app.routers.access import (
    approve_access_request,
    accept_invite,
    close_account,
    create_access_request,
    create_invite,
    disable_auth,
    disable_app_access,
    get_user_access_summary,
    list_access_requests,
    list_public_access_targets,
    list_access_targets,
    revoke_membership,
    revoke_user,
    restore_auth,
    restore_app_access,
    reject_access_request,
    send_contact_message,
    list_users,
)
from app.schemas import AccessRequestCreate, AccessRequestDecision, ContactMessageCreate, InviteCreate, UserAccessChange
from fastapi.security import HTTPAuthorizationCredentials


def make_request(path: str = "/test"):
    return SimpleNamespace(headers={}, client=None, url=SimpleNamespace(path=path))


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


def make_user(db: Session, email: str, *, status: str = "pending", auth_state: str = "active") -> AppUser:
    user = AppUser(
        auth_id=f"auth-{email}",
        email=email,
        status=status,
        auth_state=auth_state,
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


def test_pending_user_can_lookup_request_targets_with_search(db: Session) -> None:
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

    team_targets = list_access_targets(target_type="team", team_id=None, q="Lo", context=context, db=db)
    arena_targets = list_access_targets(target_type="arena", team_id=None, q="Lo", context=context, db=db)
    player_targets = list_access_targets(target_type="guardian_link", team_id=team.id, q="Jo", context=context, db=db)

    assert [target.id for target in team_targets] == [team.id]
    assert [target.id for target in arena_targets] == [arena.id]
    assert [target.id for target in player_targets]
    assert player_targets[0].name == "Jordan S."
    assert "Parent/guardian access" in (player_targets[0].context or "")


def test_public_signup_target_lookup_does_not_require_auth_context(db: Session) -> None:
    association = make_association(db, "Signup Association")
    team = make_team(db, association, "Signup Team")
    season = make_season(db)
    db.add(
        Player(
            team_id=team.id,
            season_id=season.id,
            first_name="Casey",
            last_name="Forward",
            jersey_number=9,
            position="F",
        )
    )
    db.commit()

    team_targets = list_public_access_targets(target_type="team", team_id=None, q="Sign", db=db)
    player_targets = list_public_access_targets(target_type="player_link", team_id=team.id, q="Case", db=db)

    assert [target.id for target in team_targets] == [team.id]
    assert player_targets[0].name == "Casey F."
    assert "Player access" in (player_targets[0].context or "")


def test_contact_message_sends_to_active_platform_admins(db: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    platform_admin = make_user(db, "admin@example.com", status="active")
    platform_admin.is_platform_admin = True
    disabled_admin = make_user(db, "disabled-admin@example.com", status="active", auth_state="disabled")
    disabled_admin.is_platform_admin = True
    requester = make_user(db, "parent@example.com", status="closed", auth_state="disabled")
    sent: list[dict[str, str]] = []
    db.commit()

    monkeypatch.setattr("app.routers.access.email_enabled", lambda: True)
    monkeypatch.setattr("app.routers.access.send_email", lambda **kwargs: sent.append(kwargs) or True)

    response = send_contact_message(
        ContactMessageCreate(name="Parent User", email="Parent@Example.com", message="Please restore my account."),
        request=make_request("/api/contact"),
        db=db,
    )

    assert response.status_code == 204
    assert [message["to_email"] for message in sent] == ["admin@example.com"]
    assert sent[0]["subject"] == "RinkLink contact request"
    assert "Please restore my account." in sent[0]["text_body"]
    audit = db.query(AuditLog).filter(AuditLog.action == "contact.submitted").one()
    assert audit.actor_user_id == requester.id
    assert audit.details_json["email"] == "parent@example.com"


def test_contact_message_requires_configured_platform_admin(db: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.routers.access.email_enabled", lambda: True)

    with pytest.raises(HTTPException) as exc_info:
        send_contact_message(
            ContactMessageCreate(name="Parent User", email="parent@example.com", message="I need help."),
            request=make_request("/api/contact"),
            db=db,
        )

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == "Contact is not configured"


def test_player_lookup_requires_team_id_for_family_link_search(db: Session) -> None:
    association = make_association(db, "Lookup Association")
    team = make_team(db, association, "Lookup Team")
    pending_user = make_user(db, "pending@example.com")
    db.commit()
    context = build_authorization_context(db, pending_user)

    with pytest.raises(HTTPException) as exc_info:
        list_access_targets(target_type="guardian_link", team_id=None, q="Jo", context=context, db=db)

    assert exc_info.value.status_code == 422
    assert exc_info.value.detail == "team_id is required for player access lookups"


def test_guardian_request_can_be_created_without_team_staff_request(db: Session) -> None:
    association = make_association(db, "Family Association")
    team = make_team(db, association, "Family Team")
    season = make_season(db)
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
    pending_user = make_user(db, "family@example.com")
    db.commit()

    context = build_authorization_context(db, pending_user)
    player = db.query(Player).filter(Player.team_id == team.id).one()

    created = create_access_request(
        payload=AccessRequestCreate(target_type="guardian_link", target_id=player.id, notes=None),
        context=context,
        db=db,
        request=make_request("/api/access-requests"),
    )

    assert created.status == "pending"
    assert created.target.name == "Jordan S."


def test_duplicate_access_request_reuses_existing_pending_row(db: Session) -> None:
    association = make_association(db, "Duplicate Association")
    team = make_team(db, association, "Duplicate Team")
    pending_user = make_user(db, "duplicate@example.com")
    db.commit()

    context = build_authorization_context(db, pending_user)
    payload = AccessRequestCreate(target_type="team", target_id=team.id, notes="Need manager access")

    first = create_access_request(payload=payload, context=context, db=db, request=make_request("/api/access-requests"))
    second = create_access_request(payload=payload, context=context, db=db, request=make_request("/api/access-requests"))

    assert first.id == second.id
    assert db.query(AccessRequest).count() == 1


def test_team_access_request_notifies_current_reviewers(db: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.routers import access as access_router

    association = make_association(db, "Notify Association")
    team = make_team(db, association, "Notify Team")
    requester = make_user(db, "requester@example.com")
    team_admin = make_user(db, "team-admin@example.com", status="active")
    association_admin = make_user(db, "association-admin@example.com", status="active")
    manager = make_user(db, "manager@example.com", status="active")
    platform_admin = make_user(db, "platform-admin@example.com", status="active")
    platform_admin.is_platform_admin = True
    db.add(TeamMembership(user_id=team_admin.id, team_id=team.id, role="team_admin"))
    db.add(AssociationMembership(user_id=association_admin.id, association_id=association.id, role="association_admin"))
    db.add(TeamMembership(user_id=manager.id, team_id=team.id, role="manager"))
    db.commit()

    sent: list[dict] = []
    monkeypatch.setattr(access_router, "send_access_request_review_email", lambda **kwargs: sent.append(kwargs) or True)

    context = build_authorization_context(db, requester)
    create_access_request(
        payload=AccessRequestCreate(target_type="team", target_id=team.id, notes="Need scheduler access"),
        context=context,
        db=db,
        request=make_request("/api/access-requests"),
    )

    assert {email["to_email"] for email in sent} == {
        "association-admin@example.com",
        "platform-admin@example.com",
        "team-admin@example.com",
    }
    assert "manager@example.com" not in {email["to_email"] for email in sent}
    assert sent[0]["review_link"].endswith("/access?requestId=" + db.query(AccessRequest).one().id)


def test_family_access_request_notifies_team_managers(db: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.routers import access as access_router

    association = make_association(db, "Family Notify Association")
    team = make_team(db, association, "Family Notify Team")
    season = make_season(db)
    player = Player(
        team_id=team.id,
        season_id=season.id,
        first_name="Jordan",
        last_name="Skater",
        jersey_number=12,
        position="F",
    )
    requester = make_user(db, "guardian-requester@example.com")
    manager = make_user(db, "family-manager@example.com", status="active")
    db.add(player)
    db.add(TeamMembership(user_id=manager.id, team_id=team.id, role="manager"))
    db.commit()

    sent: list[dict] = []
    monkeypatch.setattr(access_router, "send_access_request_review_email", lambda **kwargs: sent.append(kwargs) or True)

    context = build_authorization_context(db, requester)
    create_access_request(
        payload=AccessRequestCreate(target_type="guardian_link", target_id=player.id, notes=None),
        context=context,
        db=db,
        request=make_request("/api/access-requests"),
    )

    assert [email["to_email"] for email in sent] == ["family-manager@example.com"]
    assert sent[0]["target_name"] == "Jordan Skater"


def test_player_link_access_request_masks_target_name_for_requester(db: Session) -> None:
    association = make_association(db, "Masked Association")
    team = make_team(db, association, "Masked Team")
    season = make_season(db)
    player = Player(
        team_id=team.id,
        season_id=season.id,
        first_name="Jordan",
        last_name="Skater",
        jersey_number=12,
        position="F",
    )
    pending_user = make_user(db, "masked@example.com")
    db.add(player)
    db.commit()

    context = build_authorization_context(db, pending_user)
    created = create_access_request(
        payload=AccessRequestCreate(target_type="player_link", target_id=player.id, notes="Player self access"),
        context=context,
        db=db,
        request=make_request("/api/access-requests"),
    )

    assert created.target.name == "Jordan S."

    mine = list_access_requests(scope="mine", status_filter=None, context=context, db=db)
    assert mine[0].target.name == "Jordan S."


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
            request=make_request("/api/access-requests"),
        )

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail == "You already have access to this resource"


def test_approving_access_request_emails_requester_with_app_link(db: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.routers import access as access_router

    association = make_association(db, "Approve Association")
    team = make_team(db, association, "Approve Team")
    requester = make_user(db, "approve-requester@example.com")
    admin = make_user(db, "approver@example.com", status="active")
    db.add(TeamMembership(user_id=admin.id, team_id=team.id, role="team_admin"))
    access_request = AccessRequest(user_id=requester.id, target_type="team", target_id=team.id, status="pending")
    db.add(access_request)
    db.commit()

    sent: list[dict] = []
    monkeypatch.setattr(access_router, "send_access_request_decision_email", lambda **kwargs: sent.append(kwargs) or True)

    admin_context = build_authorization_context(db, admin)
    approved = approve_access_request(
        request_id=access_request.id,
        payload=AccessRequestDecision(role="scheduler"),
        context=admin_context,
        db=db,
        request=make_request(f"/api/access-requests/{access_request.id}/approve"),
    )

    assert approved.status == "approved"
    assert sent == [
        {
            "to_email": "approve-requester@example.com",
            "status": "approved",
            "target_name": "Approve Team",
            "target_type": "team",
            "role": "scheduler",
            "app_link": f"{settings.frontend_url.rstrip('/')}/",
            "reviewer_email": "approver@example.com",
            "reviewer_note": None,
        }
    ]


def test_platform_admin_can_approve_new_team_request(db: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.routers import access as access_router

    requester = make_user(db, "new-team-requester@example.com")
    admin = make_user(db, "platform-admin@example.com", status="active")
    admin.is_platform_admin = True
    db.commit()

    sent_reviews: list[dict] = []
    sent_decisions: list[dict] = []
    monkeypatch.setattr(access_router, "send_access_request_review_email", lambda **kwargs: sent_reviews.append(kwargs) or True)
    monkeypatch.setattr(access_router, "send_access_request_decision_email", lambda **kwargs: sent_decisions.append(kwargs) or True)

    request_context = build_authorization_context(db, requester)
    created = create_access_request(
        payload=AccessRequestCreate(
            target_type="team_setup",
            target_id="new-team",
            notes="I run this team.",
            details={"team_name": "Independent 12U Blue", "age_group": "12U", "level": "AA", "location": "Boston"},
        ),
        context=request_context,
        db=db,
        request=make_request("/api/access-requests"),
    )

    assert created.status == "pending"
    assert created.target.type == "team_setup"
    assert created.target.name == "Independent 12U Blue"
    assert sent_reviews[0]["to_email"] == "platform-admin@example.com"

    approved = approve_access_request(
        request_id=created.id,
        payload=AccessRequestDecision(role=None),
        context=build_authorization_context(db, admin),
        db=db,
        request=make_request(f"/api/access-requests/{created.id}/approve"),
    )

    team = db.query(Team).filter(Team.name == "Independent 12U Blue").one()
    membership = db.query(TeamMembership).filter(TeamMembership.user_id == requester.id, TeamMembership.team_id == team.id).one()
    db.refresh(requester)

    assert approved.status == "approved"
    assert team.association_id is None
    assert team.age_group == "12U"
    assert team.level == "AA"
    assert membership.role == "team_admin"
    assert requester.status == "active"
    assert requester.default_team_id == team.id
    assert sent_decisions[0]["target_name"] == "Independent 12U Blue"


def test_rejecting_access_request_emails_requester_without_app_link(db: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.routers import access as access_router

    arena = make_arena(db, "Reject Arena")
    requester = make_user(db, "reject-requester@example.com")
    admin = make_user(db, "arena-admin@example.com", status="active")
    db.add(ArenaMembership(user_id=admin.id, arena_id=arena.id, role="arena_admin"))
    access_request = AccessRequest(user_id=requester.id, target_type="arena", target_id=arena.id, status="pending")
    db.add(access_request)
    db.commit()

    sent: list[dict] = []
    monkeypatch.setattr(access_router, "send_access_request_decision_email", lambda **kwargs: sent.append(kwargs) or True)

    admin_context = build_authorization_context(db, admin)
    rejected = reject_access_request(
        request_id=access_request.id,
        payload=AccessRequestDecision(reason="Please request the current team."),
        context=admin_context,
        db=db,
        request=make_request(f"/api/access-requests/{access_request.id}/reject"),
    )

    assert rejected.status == "rejected"
    assert sent == [
        {
            "to_email": "reject-requester@example.com",
            "status": "rejected",
            "target_name": "Reject Arena",
            "target_type": "arena",
            "role": None,
            "app_link": None,
            "reviewer_email": "arena-admin@example.com",
            "reviewer_note": "Please request the current team.",
        }
    ]


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
    accepted = accept_invite(token="invite-token", context=context, db=db, request=make_request("/api/invites/invite-token/accept"))

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
        accept_invite(token="wrong-email-token", context=context, db=db, request=make_request("/api/invites/wrong-email-token/accept"))

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
    accepted = accept_invite(token="guardian-token", context=context, db=db, request=make_request("/api/invites/guardian-token/accept"))

    db.refresh(pending_user)
    assert accepted.status == "accepted"
    assert pending_user.status == "active"
    guardianship = db.query(PlayerGuardianship).filter(
        PlayerGuardianship.user_id == pending_user.id,
        PlayerGuardianship.player_id == player.id,
    ).one()
    assert guardianship.relationship_type == "guardian"


def test_team_manager_cannot_create_team_staff_invite(db: Session) -> None:
    association = make_association(db, "Manager Scope Association")
    team = make_team(db, association, "Manager Scope Team")
    manager = make_user(db, "manager-scope@example.com", status="active")
    db.add(TeamMembership(user_id=manager.id, team_id=team.id, role="manager"))
    db.commit()

    context = build_authorization_context(db, manager)

    with pytest.raises(HTTPException) as exc_info:
        create_invite(
            payload=InviteCreate(
                email="coach@example.com",
                target_type="team",
                target_id=team.id,
                role="coach",
            ),
            context=context,
            db=db,
            request=make_request("/api/invites"),
        )

    assert exc_info.value.status_code == 403


def test_association_admin_cannot_create_arena_invite_outside_scope(db: Session) -> None:
    association = make_association(db, "Assoc Scope")
    arena = make_arena(db, "Arena Scope")
    association_admin = make_user(db, "assoc-scope@example.com", status="active")
    db.add(AssociationMembership(user_id=association_admin.id, association_id=association.id, role="association_admin"))
    db.commit()

    context = build_authorization_context(db, association_admin)

    with pytest.raises(HTTPException) as exc_info:
        create_invite(
            payload=InviteCreate(
                email="arena@example.com",
                target_type="arena",
                target_id=arena.id,
                role="arena_ops",
            ),
            context=context,
            db=db,
            request=make_request("/api/invites"),
        )

    assert exc_info.value.status_code == 403


def test_revoke_membership_removes_team_access(db: Session) -> None:
    association = make_association(db, "Revocation Association")
    team = make_team(db, association, "Revocation Team")
    admin = make_user(db, "admin@example.com", status="active")
    staff = make_user(db, "staff@example.com", status="active")
    db.add(AssociationMembership(user_id=admin.id, association_id=association.id, role="association_admin"))
    membership = TeamMembership(user_id=staff.id, team_id=team.id, role="manager")
    db.add(membership)
    db.commit()

    admin_context = build_authorization_context(db, admin)
    revoke_membership(
        kind="team",
        membership_id=membership.id,
        context=admin_context,
        db=db,
        request=make_request("/api/memberships/team"),
    )

    staff_context = build_authorization_context(db, staff)
    assert can_access_team(staff_context, team, "team.manage_roster") is False


def test_revoke_user_blocks_next_authenticated_request(db: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    admin = make_user(db, "platform-admin@example.com", status="active")
    target = make_user(db, "target@example.com", status="active")
    admin.is_platform_admin = True
    db.commit()

    admin_context = build_authorization_context(db, admin)
    revoke_user(user_id=target.id, context=admin_context, db=db, request=make_request("/api/users/revoke"))

    monkeypatch.setattr(auth_dependencies, "assert_auth_runtime_safe", lambda: None)
    monkeypatch.setattr(auth_dependencies.settings, "auth_enabled", True)
    monkeypatch.setattr(
        auth_dependencies,
        "decode_access_token",
        lambda token: {"sub": target.auth_id, "email": target.email, "email_verified": True, "iat": 1},
    )

    with pytest.raises(HTTPException) as exc_info:
        current_user(
            credentials=HTTPAuthorizationCredentials(scheme="Bearer", credentials="token"),
            db=db,
        )

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Access has been revoked"


def test_disable_and_restore_app_access_updates_user_state(db: Session) -> None:
    admin = make_user(db, "platform-admin@example.com", status="active")
    target = make_user(db, "target@example.com", status="active")
    admin.is_platform_admin = True
    db.commit()

    admin_context = build_authorization_context(db, admin)
    disabled = disable_app_access(
        user_id=target.id,
        context=admin_context,
        db=db,
        request=make_request("/api/users/disable-app-access"),
    )

    assert disabled.access_state == "disabled"
    assert disabled.revoked_at is not None

    restored = restore_app_access(
        user_id=target.id,
        context=admin_context,
        db=db,
        request=make_request("/api/users/restore-app-access"),
    )

    assert restored.access_state == "active"
    assert restored.revoked_at is not None


def test_revoke_alias_disables_app_access(db: Session) -> None:
    admin = make_user(db, "platform-admin@example.com", status="active")
    target = make_user(db, "target@example.com", status="active")
    admin.is_platform_admin = True
    db.commit()

    admin_context = build_authorization_context(db, admin)
    revoked = revoke_user(
        user_id=target.id,
        context=admin_context,
        db=db,
        request=make_request("/api/users/revoke"),
    )

    assert revoked.access_state == "disabled"


def test_disable_and_restore_auth_updates_user_state(db: Session) -> None:
    admin = make_user(db, "platform-admin@example.com", status="active")
    target = make_user(db, "target@example.com", status="active")
    admin.is_platform_admin = True
    db.commit()

    admin_context = build_authorization_context(db, admin)
    disabled = disable_auth(
        user_id=target.id,
        context=admin_context,
        db=db,
        request=make_request("/api/users/disable-auth"),
    )

    assert disabled.auth_state == "disabled"
    assert disabled.revoked_at is not None

    restored = restore_auth(
        user_id=target.id,
        context=admin_context,
        db=db,
        request=make_request("/api/users/restore-auth"),
    )

    assert restored.auth_state == "active"
    assert restored.revoked_at is not None


def test_close_account_disables_sign_in_and_revokes_scoped_access(db: Session) -> None:
    association = make_association(db, "Close Association")
    team = make_team(db, association, "Close Team")
    arena = make_arena(db, "Close Arena")
    season = make_season(db)
    user = make_user(db, "close-me@example.com", status="active")
    player = Player(
        team_id=team.id,
        season_id=season.id,
        first_name="Close",
        last_name="Player",
        jersey_number=9,
        position="F",
    )
    db.add(player)
    db.flush()
    db.add_all([
        AssociationMembership(user_id=user.id, association_id=association.id, role="association_admin"),
        TeamMembership(user_id=user.id, team_id=team.id, role="manager"),
        ArenaMembership(user_id=user.id, arena_id=arena.id, role="arena_ops"),
        PlayerGuardianship(user_id=user.id, player_id=player.id, relationship_type="guardian"),
        PlayerMembership(user_id=user.id, player_id=player.id),
    ])
    user.default_team_id = team.id
    db.commit()

    closed = close_account(
        payload=UserAccessChange(reason="No longer using it"),
        user=user,
        db=db,
        request=make_request("/api/account/close"),
    )

    assert closed.status == "closed"
    assert closed.access_state == "disabled"
    assert closed.auth_state == "disabled"
    assert closed.default_team_id is None
    assert closed.revoked_at is not None
    assert db.query(AssociationMembership).filter_by(user_id=user.id).count() == 0
    assert db.query(TeamMembership).filter_by(user_id=user.id).count() == 0
    assert db.query(ArenaMembership).filter_by(user_id=user.id).count() == 0
    assert db.query(PlayerGuardianship).filter_by(user_id=user.id).count() == 0
    assert db.query(PlayerMembership).filter_by(user_id=user.id).count() == 0
    audit = db.query(AuditLog).filter_by(action="user.account_closed", resource_id=user.id).one()
    assert audit.details_json["reason"] == "No longer using it"
    assert audit.details_json["revoked_memberships"] == {
        "association": 1,
        "team": 1,
        "arena": 1,
        "guardian": 1,
        "player": 1,
    }


def test_platform_admin_cannot_self_close_account(db: Session) -> None:
    admin = make_user(db, "platform-admin@example.com", status="active")
    admin.is_platform_admin = True
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        close_account(user=admin, db=db, request=make_request("/api/account/close"))

    assert exc_info.value.status_code == 400


def test_user_access_summary_includes_memberships_and_history(db: Session) -> None:
    association = make_association(db, "Summary Association")
    team = make_team(db, association, "Summary Team")
    season = make_season(db)
    player = Player(
        team_id=team.id,
        season_id=season.id,
        first_name="Casey",
        last_name="Skater",
        jersey_number=14,
        position="F",
    )
    db.add(player)
    admin = make_user(db, "platform-admin@example.com", status="active")
    admin.is_platform_admin = True
    user = make_user(db, "summary@example.com", status="active")
    db.flush()
    db.add(AssociationMembership(user_id=user.id, association_id=association.id, role="association_admin"))
    db.add(TeamMembership(user_id=user.id, team_id=team.id, role="manager"))
    db.add(PlayerGuardianship(user_id=user.id, player_id=player.id, relationship_type="guardian"))
    db.commit()

    admin_context = build_authorization_context(db, admin)
    disable_app_access(
        user_id=user.id,
        context=admin_context,
        db=db,
        request=make_request("/api/users/disable-app-access"),
    )

    summary = get_user_access_summary(user_id=user.id, context=admin_context, db=db)

    assert summary.user.id == user.id
    assert {entry.membership_kind for entry in summary.access_entries} == {"association", "team", "guardian"}
    assert any(entry.role == "manager" for entry in summary.access_entries)
    assert any(entry.relationship_type == "guardian" for entry in summary.access_entries)
    assert any(entry.action == "user.app_access_disabled" for entry in summary.audit_entries)


def test_list_users_filters_by_email_or_display_name(db: Session) -> None:
    admin = make_user(db, "platform-admin@example.com", status="active")
    admin.is_platform_admin = True
    user = make_user(db, "search-target@example.com", status="active")
    user.display_name = "Search Target"
    user.auth_state = "disabled"
    db.commit()

    admin_context = build_authorization_context(db, admin)
    results = list_users(query="target", limit=10, context=admin_context, db=db)

    assert [result.id for result in results] == [user.id]
    assert results[0].auth_state == "disabled"
