from __future__ import annotations

import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from html import escape

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import and_, func, or_, text
from sqlalchemy.orm import Session

from ..auth.context import (
    AuthorizationContext,
    can_access_association,
    can_access_arena,
    can_access_team,
    current_authorization_context,
    ensure_association_access,
    ensure_arena_access,
    ensure_capability,
    ensure_team_access,
)
from ..auth.dependencies import current_me_user
from ..auth.rate_limit import RateLimitRule, enforce_rate_limit
from ..database import get_db
from ..models import (
    AccessRequest,
    AppUser,
    Arena,
    ArenaMembership,
    Association,
    AssociationMembership,
    AuditLog,
    Invite,
    Player,
    PlayerGuardianship,
    PlayerMembership,
    Team,
    TeamMembership,
)
from ..schemas import (
    AccessRequestCreate,
    AccessRequestDecision,
    AccessRequestOut,
    AccessTargetOut,
    AppUserOut,
    ContactMessageCreate,
    InviteCreate,
    InviteOut,
    UserAccessChange,
    UserAccessEntryOut,
    UserAccessSummaryOut,
    UserAuditEntryOut,
)
from ..services.email import email_enabled, send_access_request_decision_email, send_access_request_review_email, send_email, send_invite_email
from ..services.competitions import ensure_current_season_membership
from ..config import settings

router = APIRouter(tags=["auth"])
logger = logging.getLogger(__name__)

ASSOCIATION_ROLES = {"association_admin"}
TEAM_ROLES = {"team_admin", "manager", "scheduler", "coach"}
ARENA_ROLES = {"arena_admin", "arena_ops"}
RESOURCE_TARGET_TYPES = {"association", "team", "arena", "guardian_link", "player_link", "team_setup", "association_attach"}
ROLE_BASED_TARGET_TYPES = {"association", "team", "arena"}
INVITE_ACCEPT_RATE_LIMIT = RateLimitRule(limit=5, window_seconds=300)
ACCESS_REQUEST_RATE_LIMIT = RateLimitRule(limit=10, window_seconds=300)
INVITE_CREATE_RATE_LIMIT = RateLimitRule(limit=20, window_seconds=300)
CONTACT_RATE_LIMIT = RateLimitRule(limit=5, window_seconds=3600)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _is_valid_contact_email(email: str) -> bool:
    normalized = email.strip()
    return "@" in normalized and "." in normalized.rsplit("@", 1)[-1]


def _not_found(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


def _build_target_summary(target_type: str, target) -> AccessTargetOut:
    if target_type == "association":
        return AccessTargetOut(type=target_type, id=target.id, name=target.name, context=None)
    if target_type == "team":
        context = target.association.name if getattr(target, "association", None) else None
        return AccessTargetOut(type=target_type, id=target.id, name=target.name, context=context)
    if target_type == "arena":
        location = ", ".join(part for part in [target.city, target.state] if part)
        return AccessTargetOut(type=target_type, id=target.id, name=target.name, context=location or None)
    if target_type == "team_setup":
        details = target.details_json if isinstance(target.details_json, dict) else {}
        name = str(details.get("team_name") or "New team")
        context_parts = [str(details.get(key) or "").strip() for key in ("age_group", "level")]
        context = " · ".join(part for part in context_parts if part)
        return AccessTargetOut(type=target_type, id=target.id, name=name, context=context or "New team request")
    if target_type == "association_attach":
        details = target.details_json if isinstance(target.details_json, dict) else {}
        team_name = str(details.get("team_name") or "Team")
        association_name = str(details.get("association_name") or "Association")
        current_association_name = str(details.get("current_association_name") or "").strip()
        verb = "Move to" if current_association_name else "Join"
        return AccessTargetOut(type=target_type, id=target.id, name=team_name, context=f"{verb} {association_name}")

    player_name = f"{target.first_name} {target.last_name}".strip()
    team_name = target.team.name if getattr(target, "team", None) else None
    context = f"{team_name} · Parent/guardian access" if target_type == "guardian_link" and team_name else "Parent/guardian access"
    if target_type == "player_link":
        context = f"{team_name} · Player access" if team_name else "Player access"
    return AccessTargetOut(type=target_type, id=target.id, name=player_name, context=context)


def _app_url(path: str) -> str:
    return f"{settings.frontend_url.rstrip('/')}/{path.lstrip('/')}"


def _access_request_review_link(access_request: AccessRequest) -> str:
    return _app_url(f"/access?requestId={access_request.id}")


def _access_request_target_link(target_type: str, target) -> str:
    if target_type == "arena":
        return _app_url(f"/arenas/{target.id}")
    if target_type in {"team", "guardian_link", "player_link"}:
        return _app_url("/")
    if target_type == "association":
        return _app_url("/associations")
    return _app_url("/")


def _masked_player_name(target) -> str:
    last_initial = f"{target.last_name[:1]}." if getattr(target, "last_name", None) else ""
    return " ".join(part for part in [target.first_name, last_initial] if part)


def _load_target(db: Session, target_type: str, target_id: str):
    if target_type not in RESOURCE_TARGET_TYPES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported target type")

    if target_type == "association":
        target = db.get(Association, target_id)
        if target is None:
            raise _not_found("Association not found")
        return target
    if target_type == "team":
        target = db.get(Team, target_id)
        if target is None:
            raise _not_found("Team not found")
        return target
    if target_type == "arena":
        target = db.get(Arena, target_id)
        if target is None:
            raise _not_found("Arena not found")
        return target
    if target_type == "team_setup":
        target = db.get(AccessRequest, target_id)
        if target is None or target.target_type != "team_setup":
            raise _not_found("Team request not found")
        return target
    if target_type == "association_attach":
        target = db.get(AccessRequest, target_id)
        if target is None or target.target_type != "association_attach":
            raise _not_found("Association request not found")
        return target

    target = db.get(Player, target_id)
    if target is None:
        raise _not_found("Player not found")
    return target


def _validate_role(target_type: str, role: str | None) -> None:
    if target_type == "association":
        if role not in ASSOCIATION_ROLES:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid association role")
        return
    if target_type == "team":
        if role not in TEAM_ROLES:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid team role")
        return
    if target_type == "arena":
        if role not in ARENA_ROLES:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid arena role")
        return
    if target_type == "team_setup":
        if role is not None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="New team requests do not use roles")
        return
    if target_type == "association_attach":
        if role is not None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Association requests do not use roles")
        return
    if role is not None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="This target type does not use roles")


def _ensure_manage_target(context: AuthorizationContext, target_type: str, target) -> None:
    if target_type == "association":
        ensure_association_access(context, target.id, "association.manage")
        return
    if target_type == "team":
        ensure_team_access(context, target, "team.manage_staff")
        return
    if target_type == "arena":
        ensure_arena_access(context, target.id, "arena.manage")
        return
    if target_type == "team_setup":
        ensure_capability(context, "platform.manage")
        return
    if target_type == "association_attach":
        details = target.details_json if isinstance(target.details_json, dict) else {}
        association_id = str(details.get("association_id") or "")
        if not association_id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Association is missing")
        ensure_association_access(context, association_id, "association.manage")
        return
    ensure_team_access(context, target.team, "team.manage_roster")


def _can_manage_target(context: AuthorizationContext, target_type: str, target) -> bool:
    if context.user.is_platform_admin:
        return True
    if target_type == "association":
        return can_access_association(context, target.id, "association.manage")
    if target_type == "team":
        return can_access_team(context, target, "team.manage_staff")
    if target_type == "arena":
        return can_access_arena(context, target.id, "arena.manage")
    if target_type == "team_setup":
        return False
    if target_type == "association_attach":
        details = target.details_json if isinstance(target.details_json, dict) else {}
        association_id = str(details.get("association_id") or "")
        return bool(association_id and can_access_association(context, association_id, "association.manage"))
    return can_access_team(context, target.team, "team.manage_roster")


def _record_audit(
    db: Session,
    *,
    actor_user_id: str | None,
    action: str,
    resource_type: str,
    resource_id: str,
    request: Request | None = None,
    details: dict | list | None = None,
) -> None:
    ip_address = None
    user_agent = None
    if request is not None:
        forwarded_for = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        ip_address = forwarded_for or (request.client.host if request.client else None)
        user_agent = request.headers.get("user-agent")
    db.add(
        AuditLog(
            actor_user_id=actor_user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            ip_address=ip_address,
            user_agent=user_agent,
            details_json=details,
        )
    )


def _mark_user_active(user: AppUser, *, default_team_id: str | None = None) -> None:
    if user.status != "active":
        user.status = "active"
    if default_team_id and not user.default_team_id:
        user.default_team_id = default_team_id


def _set_app_access_state(
    *,
    user: AppUser,
    access_state: str,
    invalidate_tokens: bool = False,
) -> tuple[str, str]:
    previous_state = user.access_state
    if previous_state != access_state:
        user.access_state = access_state
    if invalidate_tokens:
        user.revoked_at = _utcnow()
    return previous_state, user.access_state


def _set_auth_state(
    *,
    user: AppUser,
    auth_state: str,
    invalidate_tokens: bool = False,
) -> tuple[str, str]:
    previous_state = user.auth_state
    if previous_state != auth_state:
        user.auth_state = auth_state
    if invalidate_tokens:
        user.revoked_at = _utcnow()
    return previous_state, user.auth_state


def _revoke_auth_sessions(db: Session, *, user: AppUser) -> int:
    bind = db.get_bind()
    dialect_name = getattr(getattr(bind, "dialect", None), "name", None)
    if dialect_name != "postgresql":
        return 0
    result = db.execute(
        text('DELETE FROM auth."session" WHERE "userId" = :auth_id'),
        {"auth_id": user.auth_id},
    )
    return max(result.rowcount or 0, 0)


def _revoke_user_scoped_access(db: Session, *, user_id: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    membership_models = {
        "association": AssociationMembership,
        "team": TeamMembership,
        "arena": ArenaMembership,
        "guardian": PlayerGuardianship,
        "player": PlayerMembership,
    }
    for kind, model in membership_models.items():
        memberships = db.query(model).filter(model.user_id == user_id).all()
        counts[kind] = len(memberships)
        for membership in memberships:
            db.delete(membership)
    return counts


def _apply_target_grant(
    db: Session,
    *,
    user: AppUser,
    target_type: str,
    target,
    role: str | None,
) -> str:
    if target_type == "association":
        membership = (
            db.query(AssociationMembership)
            .filter(
                AssociationMembership.user_id == user.id,
                AssociationMembership.association_id == target.id,
            )
            .first()
        )
        if membership is None:
            db.add(AssociationMembership(user_id=user.id, association_id=target.id, role=role or "association_admin"))
            result = "created"
        elif role and membership.role != role:
            membership.role = role
            result = "updated"
        else:
            result = "unchanged"
        _mark_user_active(user)
        return result

    if target_type == "team":
        membership = (
            db.query(TeamMembership)
            .filter(TeamMembership.user_id == user.id, TeamMembership.team_id == target.id)
            .first()
        )
        if membership is None:
            db.add(TeamMembership(user_id=user.id, team_id=target.id, role=role or "coach"))
            result = "created"
        elif role and membership.role != role:
            membership.role = role
            result = "updated"
        else:
            result = "unchanged"
        _mark_user_active(user, default_team_id=target.id)
        return result

    if target_type == "arena":
        membership = (
            db.query(ArenaMembership)
            .filter(ArenaMembership.user_id == user.id, ArenaMembership.arena_id == target.id)
            .first()
        )
        if membership is None:
            db.add(ArenaMembership(user_id=user.id, arena_id=target.id, role=role or "arena_ops"))
            result = "created"
        elif role and membership.role != role:
            membership.role = role
            result = "updated"
        else:
            result = "unchanged"
        _mark_user_active(user)
        return result

    if target_type == "team_setup":
        details = target.details_json if isinstance(target.details_json, dict) else {}
        team_name = str(details.get("team_name") or "").strip()
        age_group = str(details.get("age_group") or "").strip()
        level = str(details.get("level") or "").strip()
        if not team_name or not age_group or not level:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Team name, age group, and level are required")
        team = Team(
            association_id=None,
            name=team_name,
            age_group=age_group,
            level=level,
            manager_name=user.display_name or "",
            manager_email=user.email,
            manager_phone="",
        )
        db.add(team)
        db.flush()
        ensure_current_season_membership(db, team, commit=False)
        db.add(TeamMembership(user_id=user.id, team_id=team.id, role="team_admin"))
        _mark_user_active(user, default_team_id=team.id)
        target.details_json = {**details, "created_team_id": team.id}
        return "created"

    if target_type == "association_attach":
        details = target.details_json if isinstance(target.details_json, dict) else {}
        team_id = str(details.get("team_id") or "")
        association_id = str(details.get("association_id") or "")
        team = db.get(Team, team_id)
        association = db.get(Association, association_id)
        if team is None:
            raise _not_found("Team not found")
        if association is None:
            raise _not_found("Association not found")
        if team.association_id == association.id:
            return "unchanged"
        current_association = team.association
        team.association_id = association.id
        target.details_json = {
            **details,
            "association_name": association.name,
            "team_name": team.name,
            "current_association_id": current_association.id if current_association else None,
            "current_association_name": current_association.name if current_association else None,
        }
        return "updated"

    if target_type == "guardian_link":
        link = (
            db.query(PlayerGuardianship)
            .filter(PlayerGuardianship.user_id == user.id, PlayerGuardianship.player_id == target.id)
            .first()
        )
        if link is None:
            db.add(PlayerGuardianship(user_id=user.id, player_id=target.id, relationship_type="guardian"))
            result = "created"
        else:
            result = "unchanged"
        _mark_user_active(user, default_team_id=target.team_id)
        return result

    link = (
        db.query(PlayerMembership)
        .filter(PlayerMembership.user_id == user.id, PlayerMembership.player_id == target.id)
        .first()
    )
    if link is None:
        db.add(PlayerMembership(user_id=user.id, player_id=target.id))
        result = "created"
    else:
        result = "unchanged"
    _mark_user_active(user, default_team_id=target.team_id)
    return result


def _has_existing_access(db: Session, *, user: AppUser, target_type: str, target) -> bool:
    if target_type == "association":
        return (
            db.query(AssociationMembership)
            .filter(
                AssociationMembership.user_id == user.id,
                AssociationMembership.association_id == target.id,
            )
            .first()
            is not None
        )
    if target_type == "team":
        if (
            db.query(TeamMembership)
            .filter(TeamMembership.user_id == user.id, TeamMembership.team_id == target.id)
            .first()
            is not None
        ):
            return True
        return (
            db.query(AssociationMembership)
            .filter(
                AssociationMembership.user_id == user.id,
                AssociationMembership.association_id == target.association_id,
            )
            .first()
            is not None
        )
    if target_type == "arena":
        return (
            db.query(ArenaMembership)
            .filter(ArenaMembership.user_id == user.id, ArenaMembership.arena_id == target.id)
            .first()
            is not None
        )
    if target_type == "team_setup":
        return False
    if target_type == "association_attach":
        return False
    if target_type == "guardian_link":
        return (
            db.query(PlayerGuardianship)
            .filter(PlayerGuardianship.user_id == user.id, PlayerGuardianship.player_id == target.id)
            .first()
            is not None
        )
    return (
        db.query(PlayerMembership)
        .filter(PlayerMembership.user_id == user.id, PlayerMembership.player_id == target.id)
        .first()
        is not None
    )


def _manageable_scope_ids(context: AuthorizationContext, db: Session) -> tuple[set[str], set[str], set[str], set[str]]:
    association_manage_ids = {
        membership.association_id
        for membership in context.association_memberships
        if membership.role in ASSOCIATION_ROLES
    }
    team_manage_staff_ids = {
        membership.team_id
        for membership in context.team_memberships
        if membership.role == "team_admin"
    }
    team_manage_roster_ids = {
        membership.team_id
        for membership in context.team_memberships
        if membership.role in {"team_admin", "manager"}
    }
    arena_manage_ids = {
        membership.arena_id
        for membership in context.arena_memberships
        if membership.role == "arena_admin"
    }
    if association_manage_ids:
        association_team_ids = {
            team.id
            for team in db.query(Team).filter(Team.association_id.in_(association_manage_ids)).all()
        }
        team_manage_staff_ids.update(association_team_ids)
        team_manage_roster_ids.update(association_team_ids)
    manageable_player_ids = {
        player.id
        for player in db.query(Player).filter(Player.team_id.in_(team_manage_roster_ids)).all()
    } if team_manage_roster_ids else set()
    return association_manage_ids, team_manage_staff_ids, arena_manage_ids, manageable_player_ids


def _active_user_query(db: Session):
    return db.query(AppUser).filter(
        AppUser.status == "active",
        AppUser.access_state == "active",
        AppUser.auth_state == "active",
    )


def _access_request_reviewer_emails(db: Session, *, target_type: str, target, requester_user_id: str) -> list[str]:
    users_by_email: dict[str, AppUser] = {}

    def add_users(users: list[AppUser]) -> None:
        for user in users:
            if user.id == requester_user_id:
                continue
            users_by_email[_normalize_email(user.email)] = user

    add_users(_active_user_query(db).filter(AppUser.is_platform_admin.is_(True)).all())

    if target_type == "association":
        add_users(
            _active_user_query(db)
            .join(AssociationMembership, AssociationMembership.user_id == AppUser.id)
            .filter(
                AssociationMembership.association_id == target.id,
                AssociationMembership.role.in_(ASSOCIATION_ROLES),
            )
            .all()
        )
    elif target_type == "team":
        add_users(
            _active_user_query(db)
            .join(TeamMembership, TeamMembership.user_id == AppUser.id)
            .filter(
                TeamMembership.team_id == target.id,
                TeamMembership.role == "team_admin",
            )
            .all()
        )
        add_users(
            _active_user_query(db)
            .join(AssociationMembership, AssociationMembership.user_id == AppUser.id)
            .filter(
                AssociationMembership.association_id == target.association_id,
                AssociationMembership.role.in_(ASSOCIATION_ROLES),
            )
            .all()
        )
    elif target_type == "arena":
        add_users(
            _active_user_query(db)
            .join(ArenaMembership, ArenaMembership.user_id == AppUser.id)
            .filter(
                ArenaMembership.arena_id == target.id,
                ArenaMembership.role == "arena_admin",
            )
            .all()
        )
    elif target_type == "team_setup":
        pass
    elif target_type == "association_attach":
        details = target.details_json if isinstance(target.details_json, dict) else {}
        association_id = str(details.get("association_id") or "")
        if association_id:
            add_users(
                _active_user_query(db)
                .join(AssociationMembership, AssociationMembership.user_id == AppUser.id)
                .filter(
                    AssociationMembership.association_id == association_id,
                    AssociationMembership.role.in_(ASSOCIATION_ROLES),
                )
                .all()
            )
    elif target_type in {"guardian_link", "player_link"}:
        add_users(
            _active_user_query(db)
            .join(TeamMembership, TeamMembership.user_id == AppUser.id)
            .filter(
                TeamMembership.team_id == target.team_id,
                TeamMembership.role.in_(("team_admin", "manager")),
            )
            .all()
        )
        if target.team is not None:
            add_users(
                _active_user_query(db)
                .join(AssociationMembership, AssociationMembership.user_id == AppUser.id)
                .filter(
                    AssociationMembership.association_id == target.team.association_id,
                    AssociationMembership.role.in_(ASSOCIATION_ROLES),
                )
                .all()
            )

    return sorted(users_by_email.keys())


def _notify_access_request_reviewers(db: Session, *, access_request: AccessRequest, target, requester: AppUser) -> None:
    target_summary = _build_target_summary(access_request.target_type, target)
    review_link = _access_request_review_link(access_request)
    for reviewer_email in _access_request_reviewer_emails(
        db,
        target_type=access_request.target_type,
        target=target,
        requester_user_id=requester.id,
    ):
        try:
            send_access_request_review_email(
                to_email=reviewer_email,
                requester_email=requester.email,
                target_name=target_summary.name,
                target_type=access_request.target_type,
                notes=access_request.notes,
                review_link=review_link,
            )
        except Exception:
            logger.exception("Failed to send access request review email for request %s to %s", access_request.id, reviewer_email)


def _notify_access_request_decision(
    *,
    access_request: AccessRequest,
    target,
    requester: AppUser,
    reviewer: AppUser,
    role: str | None = None,
    reviewer_note: str | None = None,
) -> None:
    target_summary = _build_target_summary(access_request.target_type, target)
    app_link = _access_request_target_link(access_request.target_type, target) if access_request.status == "approved" else None
    try:
        send_access_request_decision_email(
            to_email=requester.email,
            status=access_request.status,
            target_name=target_summary.name,
            target_type=access_request.target_type,
            role=role,
            app_link=app_link,
            reviewer_email=reviewer.email,
            reviewer_note=reviewer_note,
        )
    except Exception:
        logger.exception("Failed to send access request decision email for request %s", access_request.id)


def _contact_admin_emails(db: Session) -> list[str]:
    return [
        user.email
        for user in _active_user_query(db)
        .filter(AppUser.is_platform_admin.is_(True))
        .order_by(func.lower(AppUser.email).asc())
        .all()
    ]


def _build_access_target_search_query(search: str) -> str:
    return f"%{search.strip()}%"


def _team_setup_details(payload: AccessRequestCreate) -> dict:
    details = payload.details if isinstance(payload.details, dict) else {}
    normalized = {
        "team_name": str(details.get("team_name") or "").strip(),
        "age_group": str(details.get("age_group") or "").strip(),
        "level": str(details.get("level") or "").strip(),
        "location": str(details.get("location") or "").strip(),
    }
    missing = [label for key, label in (("team_name", "team name"), ("age_group", "age group"), ("level", "level")) if not normalized[key]]
    if missing:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Missing {', '.join(missing)}")
    return normalized


def _association_attach_details(db: Session, context: AuthorizationContext, payload: AccessRequestCreate) -> dict:
    details = payload.details if isinstance(payload.details, dict) else {}
    team_id = str(details.get("team_id") or payload.target_id or "").strip()
    association_id = str(details.get("association_id") or "").strip()
    if not team_id or not association_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Team and association are required")

    team = db.get(Team, team_id)
    if team is None:
        raise _not_found("Team not found")
    association = db.get(Association, association_id)
    if association is None:
        raise _not_found("Association not found")
    ensure_team_access(context, team, "team.manage")
    if team.association_id == association.id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This team is already in that association")

    return {
        "team_id": team.id,
        "team_name": team.name,
        "current_association_id": team.association_id,
        "current_association_name": team.association.name if team.association else None,
        "association_id": association.id,
        "association_name": association.name,
    }


def _invite_out(db: Session, invite: Invite) -> InviteOut:
    target = _load_target(db, invite.target_type, invite.target_id)
    inviter = db.get(AppUser, invite.invited_by_user_id)
    return InviteOut(
        id=invite.id,
        token=invite.token,
        email=invite.email,
        role=invite.role,
        status=invite.status,
        expires_at=invite.expires_at,
        accepted_at=invite.accepted_at,
        created_at=invite.created_at,
        updated_at=invite.updated_at,
        invited_by_user_id=invite.invited_by_user_id,
        invited_by_email=inviter.email if inviter else None,
        target=_build_target_summary(invite.target_type, target),
    )


def _access_request_target_summary(access_request: AccessRequest, target, *, mask_private_target: bool) -> AccessTargetOut:
    summary = _build_target_summary(access_request.target_type, target)
    if mask_private_target and access_request.target_type in {"guardian_link", "player_link"}:
        summary.name = _masked_player_name(target)
    return summary


def _access_request_out(db: Session, access_request: AccessRequest, *, mask_private_target: bool = False) -> AccessRequestOut:
    target = _load_target(db, access_request.target_type, access_request.target_id)
    requester = db.get(AppUser, access_request.user_id)
    reviewer = db.get(AppUser, access_request.reviewed_by_user_id) if access_request.reviewed_by_user_id else None
    return AccessRequestOut(
        id=access_request.id,
        status=access_request.status,
        notes=access_request.notes,
        created_at=access_request.created_at,
        updated_at=access_request.updated_at,
        reviewed_at=access_request.reviewed_at,
        user_id=access_request.user_id,
        user_email=requester.email if requester else None,
        reviewed_by_user_id=access_request.reviewed_by_user_id,
        reviewed_by_email=reviewer.email if reviewer else None,
        target=_access_request_target_summary(access_request, target, mask_private_target=mask_private_target),
        details=access_request.details_json,
    )


def _user_access_entry_out(*, membership_kind: str, membership_id: str, target_type: str, target, role: str | None = None, relationship_type: str | None = None) -> UserAccessEntryOut:
    summary = _build_target_summary(target_type, target)
    return UserAccessEntryOut(
        membership_kind=membership_kind,
        membership_id=membership_id,
        target_type=target_type,
        target_id=summary.id,
        name=summary.name,
        context=summary.context,
        role=role,
        relationship_type=relationship_type,
    )


def _audit_relates_to_user(audit_log: AuditLog, *, user_id: str) -> bool:
    if audit_log.resource_type == "user" and audit_log.resource_id == user_id:
        return True
    details = audit_log.details_json if isinstance(audit_log.details_json, dict) else None
    if not details:
        return False
    user_reference_keys = {
        "target_user_id",
        "revoked_user_id",
        "user_id",
        "approved_user_id",
        "rejected_user_id",
        "access_request_user_id",
    }
    return any(details.get(key) == user_id for key in user_reference_keys)


@router.post("/contact", status_code=status.HTTP_204_NO_CONTENT)
def send_contact_message(
    payload: ContactMessageCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    name = payload.name.strip()
    email = _normalize_email(payload.email)
    message = payload.message.strip()
    if not _is_valid_contact_email(email):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Enter a valid email address")

    enforce_rate_limit(request, user_id=email, route_key="contact", rule=CONTACT_RATE_LIMIT)

    admin_emails = _contact_admin_emails(db)
    if not admin_emails:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Contact is not configured")
    if not email_enabled():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Contact email is not configured")

    existing_user = db.query(AppUser).filter(func.lower(AppUser.email) == email).first()
    subject = "RinkLink contact request"
    text_body = (
        f"{name} sent a message to RinkLink admins.\n\n"
        f"Email: {email}\n\n"
        f"Message:\n{message}\n"
    )
    html_message = escape(message).replace("\n", "<br>")
    html_body = (
        "<p><strong>RinkLink contact request</strong></p>"
        f"<p>{escape(name)} sent a message to RinkLink admins.</p>"
        f"<p><strong>Email:</strong> {escape(email)}</p>"
        f"<p><strong>Message:</strong></p><p>{html_message}</p>"
    )

    sent = False
    for admin_email in admin_emails:
        try:
            sent = send_email(
                to_email=admin_email,
                subject=subject,
                text_body=text_body,
                html_body=html_body,
            ) or sent
        except Exception:
            logger.exception("Failed to send contact message to admin %s", admin_email)

    if not sent:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Message could not be sent")

    _record_audit(
        db,
        actor_user_id=existing_user.id if existing_user else None,
        action="contact.submitted",
        resource_type="contact",
        resource_id=existing_user.id if existing_user else email,
        request=request,
        details={
            "email": email,
            "name": name,
            "recipient_count": len(admin_emails),
        },
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/invites", response_model=list[InviteOut])
def list_invites(
    direction: str = Query(default="received", pattern="^(received|managed)$"),
    status_filter: str | None = Query(default=None, alias="status"),
    context: AuthorizationContext = Depends(current_authorization_context),
    db: Session = Depends(get_db),
):
    query = db.query(Invite).order_by(Invite.created_at.desc())
    if status_filter:
        query = query.filter(Invite.status == status_filter)

    if direction == "received":
        invites = query.filter(func.lower(Invite.email) == _normalize_email(context.user.email)).all()
        return [_invite_out(db, invite) for invite in invites]

    if context.user.is_platform_admin:
        invites = query.all()
        return [_invite_out(db, invite) for invite in invites]

    association_manage_ids, team_manage_ids, arena_manage_ids, manageable_player_ids = _manageable_scope_ids(context, db)
    filters = [Invite.invited_by_user_id == context.user.id]
    if association_manage_ids:
        filters.append(and_(Invite.target_type == "association", Invite.target_id.in_(association_manage_ids)))
    if team_manage_ids:
        filters.append(and_(Invite.target_type == "team", Invite.target_id.in_(team_manage_ids)))
    if arena_manage_ids:
        filters.append(and_(Invite.target_type == "arena", Invite.target_id.in_(arena_manage_ids)))
    if manageable_player_ids:
        filters.append(
            and_(
                Invite.target_type.in_(("guardian_link", "player_link")),
                Invite.target_id.in_(manageable_player_ids),
            )
        )

    invites = query.filter(or_(*filters)).all()
    return [_invite_out(db, invite) for invite in invites]


@router.get("/invites/by-token/{token}", response_model=InviteOut)
def get_invite_by_token(
    token: str,
    context: AuthorizationContext = Depends(current_authorization_context),
    db: Session = Depends(get_db),
):
    invite = db.query(Invite).filter(Invite.token == token).first()
    if invite is None:
        raise _not_found("Invite not found")
    if _normalize_email(invite.email) != _normalize_email(context.user.email):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This invite is for a different email address")
    return _invite_out(db, invite)


@router.post("/invites", response_model=InviteOut, status_code=status.HTTP_201_CREATED)
def create_invite(
    payload: InviteCreate,
    context: AuthorizationContext = Depends(current_authorization_context),
    db: Session = Depends(get_db),
    request: Request = None,
):
    enforce_rate_limit(request, user_id=context.user.id, route_key="invite.create", rule=INVITE_CREATE_RATE_LIMIT)
    target = _load_target(db, payload.target_type, payload.target_id)
    _validate_role(payload.target_type, payload.role)
    _ensure_manage_target(context, payload.target_type, target)

    invite = Invite(
        token=secrets.token_urlsafe(32),
        email=_normalize_email(payload.email),
        target_type=payload.target_type,
        target_id=payload.target_id,
        role=payload.role,
        invited_by_user_id=context.user.id,
        status="pending",
        expires_at=_utcnow() + timedelta(days=payload.expires_in_days),
    )
    db.add(invite)
    _record_audit(
        db,
        actor_user_id=context.user.id,
        action="invite.created",
        resource_type=payload.target_type,
        resource_id=payload.target_id,
        request=request,
        details={"email": invite.email, "role": payload.role},
    )
    db.commit()
    db.refresh(invite)
    try:
        send_invite_email(
            invite_email=invite.email,
            invite_link=f"{settings.frontend_url.rstrip('/')}/invite/{invite.token}",
            target_name=_build_target_summary(invite.target_type, target).name,
            target_type=invite.target_type,
            role=invite.role,
            inviter_email=context.user.email,
            expires_at=_as_utc(invite.expires_at),
        )
    except Exception:
        # Invite creation remains authoritative even if delivery fails.
        # Admins can still copy the generated link from the UI.
        logger.exception("Failed to send invite email for invite %s", invite.id)
    return _invite_out(db, invite)


@router.post("/invites/{token}/accept", response_model=InviteOut)
def accept_invite(
    token: str,
    context: AuthorizationContext = Depends(current_authorization_context),
    db: Session = Depends(get_db),
    request: Request = None,
):
    enforce_rate_limit(request, user_id=context.user.id, route_key="invite.accept", rule=INVITE_ACCEPT_RATE_LIMIT)
    invite = db.query(Invite).filter(Invite.token == token).first()
    if invite is None:
        raise _not_found("Invite not found")
    if _normalize_email(invite.email) != _normalize_email(context.user.email):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This invite is for a different email address")
    if invite.status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This invite is no longer pending")
    if _as_utc(invite.expires_at) <= _utcnow():
        invite.status = "expired"
        db.commit()
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="This invite has expired")

    target = _load_target(db, invite.target_type, invite.target_id)
    grant_result = _apply_target_grant(db, user=context.user, target_type=invite.target_type, target=target, role=invite.role)
    invite.status = "accepted"
    invite.accepted_at = _utcnow()
    _record_audit(
        db,
        actor_user_id=context.user.id,
        action="invite.accepted",
        resource_type=invite.target_type,
        resource_id=invite.target_id,
        request=request,
        details={"invite_id": invite.id, "role": invite.role},
    )
    _record_audit(
        db,
        actor_user_id=context.user.id,
        action=f"membership.{grant_result}",
        resource_type=invite.target_type,
        resource_id=invite.target_id,
        request=request,
        details={"user_id": context.user.id, "source": "invite", "invite_id": invite.id, "role": invite.role},
    )
    db.commit()
    db.refresh(invite)
    db.refresh(context.user)
    return _invite_out(db, invite)


@router.delete("/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_invite(
    invite_id: str,
    context: AuthorizationContext = Depends(current_authorization_context),
    db: Session = Depends(get_db),
    request: Request = None,
):
    invite = db.get(Invite, invite_id)
    if invite is None:
        raise _not_found("Invite not found")
    target = _load_target(db, invite.target_type, invite.target_id)
    if invite.invited_by_user_id != context.user.id:
        _ensure_manage_target(context, invite.target_type, target)
    if invite.status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only pending invites can be cancelled")

    invite.status = "cancelled"
    _record_audit(
        db,
        actor_user_id=context.user.id,
        action="invite.cancelled",
        resource_type=invite.target_type,
        resource_id=invite.target_id,
        request=request,
        details={"invite_id": invite.id},
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/access-requests", response_model=list[AccessRequestOut])
def list_access_requests(
    scope: str = Query(default="mine", pattern="^(mine|review)$"),
    status_filter: str | None = Query(default=None, alias="status"),
    context: AuthorizationContext = Depends(current_authorization_context),
    db: Session = Depends(get_db),
):
    query = db.query(AccessRequest).order_by(AccessRequest.created_at.desc())
    if status_filter:
        query = query.filter(AccessRequest.status == status_filter)

    if scope == "mine":
        requests = query.filter(AccessRequest.user_id == context.user.id).all()
        return [_access_request_out(db, access_request, mask_private_target=True) for access_request in requests]

    requests = query.all()
    visible_requests: list[AccessRequestOut] = []
    for access_request in requests:
        target = _load_target(db, access_request.target_type, access_request.target_id)
        if _can_manage_target(context, access_request.target_type, target):
            visible_requests.append(_access_request_out(db, access_request))
    return visible_requests


@router.get("/access-targets", response_model=list[AccessTargetOut])
def list_access_targets(
    target_type: str = Query(pattern="^(association|team|arena|guardian_link|player_link)$"),
    team_id: str | None = Query(default=None),
    q: str = Query(min_length=2),
    context: AuthorizationContext = Depends(current_authorization_context),
    db: Session = Depends(get_db),
):
    search = _build_access_target_search_query(q)

    if target_type == "association":
        associations = (
            db.query(Association)
            .filter(Association.name.ilike(search))
            .order_by(Association.name.asc())
            .limit(25)
            .all()
        )
        return [_build_target_summary("association", association) for association in associations]

    if target_type == "team":
        teams = (
            db.query(Team)
            .filter(Team.name.ilike(search))
            .order_by(Team.name.asc())
            .limit(25)
            .all()
        )
        return [_build_target_summary("team", team) for team in teams]

    if target_type == "arena":
        arenas = (
            db.query(Arena)
            .filter(Arena.name.ilike(search))
            .order_by(Arena.name.asc())
            .limit(25)
            .all()
        )
        return [_build_target_summary("arena", arena) for arena in arenas]

    if not team_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="team_id is required for player access lookups")

    team = db.get(Team, team_id)
    if team is None:
        raise _not_found("Team not found")
    if not (
        target_type in {"guardian_link", "player_link"}
        or context.user.is_platform_admin
        or can_access_team(context, team, "team.manage_roster")
        or team.id in context.linked_team_ids
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to search players on this team",
        )

    players = (
        db.query(Player)
        .filter(
            Player.team_id == team_id,
            or_(
                Player.first_name.ilike(search),
                Player.last_name.ilike(search),
            ),
        )
        .order_by(Player.last_name.asc(), Player.first_name.asc())
        .limit(25)
        .all()
    )
    masked_targets: list[AccessTargetOut] = []
    for player in players:
        summary = _build_target_summary(target_type, player)
        summary.name = _masked_player_name(player)
        masked_targets.append(summary)
    return masked_targets


@router.get("/public/access-targets", response_model=list[AccessTargetOut])
def list_public_access_targets(
    target_type: str = Query(pattern="^(association|team|arena|guardian_link|player_link)$"),
    team_id: str | None = Query(default=None),
    q: str = Query(min_length=2),
    db: Session = Depends(get_db),
):
    search = _build_access_target_search_query(q)

    if target_type == "association":
        associations = (
            db.query(Association)
            .filter(Association.name.ilike(search))
            .order_by(Association.name.asc())
            .limit(25)
            .all()
        )
        return [_build_target_summary("association", association) for association in associations]

    if target_type == "team":
        teams = (
            db.query(Team)
            .filter(Team.name.ilike(search))
            .order_by(Team.name.asc())
            .limit(25)
            .all()
        )
        return [_build_target_summary("team", team) for team in teams]

    if target_type == "arena":
        arenas = (
            db.query(Arena)
            .filter(Arena.name.ilike(search))
            .order_by(Arena.name.asc())
            .limit(25)
            .all()
        )
        return [_build_target_summary("arena", arena) for arena in arenas]

    if not team_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="team_id is required for player access lookups")

    players = (
        db.query(Player)
        .filter(
            Player.team_id == team_id,
            or_(
                Player.first_name.ilike(search),
                Player.last_name.ilike(search),
            ),
        )
        .order_by(Player.last_name.asc(), Player.first_name.asc())
        .limit(25)
        .all()
    )
    masked_targets: list[AccessTargetOut] = []
    for player in players:
        summary = _build_target_summary(target_type, player)
        summary.name = _masked_player_name(player)
        masked_targets.append(summary)
    return masked_targets


@router.post("/access-requests", response_model=AccessRequestOut, status_code=status.HTTP_201_CREATED)
def create_access_request(
    payload: AccessRequestCreate,
    context: AuthorizationContext = Depends(current_authorization_context),
    db: Session = Depends(get_db),
    request: Request = None,
):
    enforce_rate_limit(
        request,
        user_id=context.user.id,
        route_key="access-request.create",
        rule=ACCESS_REQUEST_RATE_LIMIT,
    )
    if payload.target_type == "team_setup":
        details = _team_setup_details(payload)
        existing = (
            db.query(AccessRequest)
            .filter(
                AccessRequest.user_id == context.user.id,
                AccessRequest.target_type == "team_setup",
                AccessRequest.status == "pending",
            )
            .first()
        )
        if existing is not None:
            existing.details_json = details
            existing.notes = payload.notes
            db.commit()
            db.refresh(existing)
            return _access_request_out(db, existing, mask_private_target=True)

        request_id = str(uuid.uuid4())
        access_request = AccessRequest(
            id=request_id,
            user_id=context.user.id,
            target_type="team_setup",
            target_id=request_id,
            status="pending",
            notes=payload.notes,
            details_json=details,
        )
        db.add(access_request)
        _record_audit(
            db,
            actor_user_id=context.user.id,
            action="access_request.created",
            resource_type="team_setup",
            resource_id=request_id,
            request=request,
            details={"access_request_user_id": context.user.id, "team_name": details["team_name"]},
        )
        db.commit()
        db.refresh(access_request)
        _notify_access_request_reviewers(db, access_request=access_request, target=access_request, requester=context.user)
        return _access_request_out(db, access_request, mask_private_target=True)

    if payload.target_type == "association_attach":
        details = _association_attach_details(db, context, payload)
        existing = (
            db.query(AccessRequest)
            .filter(
                AccessRequest.target_type == "association_attach",
                AccessRequest.status == "pending",
                AccessRequest.details_json["team_id"].as_string() == details["team_id"],
                AccessRequest.details_json["association_id"].as_string() == details["association_id"],
            )
            .first()
        )
        if existing is not None:
            return _access_request_out(db, existing, mask_private_target=True)

        request_id = str(uuid.uuid4())
        access_request = AccessRequest(
            id=request_id,
            user_id=context.user.id,
            target_type="association_attach",
            target_id=request_id,
            status="pending",
            notes=payload.notes,
            details_json=details,
        )
        db.add(access_request)
        _record_audit(
            db,
            actor_user_id=context.user.id,
            action="association_attach_request.created",
            resource_type="team",
            resource_id=details["team_id"],
            request=request,
            details={"association_id": details["association_id"], "access_request_id": request_id},
        )
        db.commit()
        db.refresh(access_request)
        _notify_access_request_reviewers(db, access_request=access_request, target=access_request, requester=context.user)
        return _access_request_out(db, access_request, mask_private_target=True)

    target = _load_target(db, payload.target_type, payload.target_id)
    if _has_existing_access(db, user=context.user, target_type=payload.target_type, target=target):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You already have access to this resource")

    existing = (
        db.query(AccessRequest)
        .filter(
            AccessRequest.user_id == context.user.id,
            AccessRequest.target_type == payload.target_type,
            AccessRequest.target_id == payload.target_id,
            AccessRequest.status == "pending",
        )
        .first()
    )
    if existing is not None:
        return _access_request_out(db, existing, mask_private_target=True)

    access_request = AccessRequest(
        user_id=context.user.id,
        target_type=payload.target_type,
        target_id=payload.target_id,
        status="pending",
        notes=payload.notes,
    )
    db.add(access_request)
    _record_audit(
        db,
        actor_user_id=context.user.id,
        action="access_request.created",
        resource_type=payload.target_type,
        resource_id=payload.target_id,
        request=request,
        details={"access_request_user_id": context.user.id},
    )
    db.commit()
    db.refresh(access_request)
    _notify_access_request_reviewers(db, access_request=access_request, target=target, requester=context.user)
    return _access_request_out(db, access_request, mask_private_target=True)


@router.post("/access-requests/{request_id}/approve", response_model=AccessRequestOut)
def approve_access_request(
    request_id: str,
    payload: AccessRequestDecision,
    context: AuthorizationContext = Depends(current_authorization_context),
    db: Session = Depends(get_db),
    request: Request = None,
):
    access_request = db.get(AccessRequest, request_id)
    if access_request is None:
        raise _not_found("Access request not found")
    if access_request.status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This access request is no longer pending")

    target = _load_target(db, access_request.target_type, access_request.target_id)
    _validate_role(access_request.target_type, payload.role)
    _ensure_manage_target(context, access_request.target_type, target)

    user = db.get(AppUser, access_request.user_id)
    if user is None:
        raise _not_found("Requested user not found")

    grant_result = _apply_target_grant(db, user=user, target_type=access_request.target_type, target=target, role=payload.role)
    access_request.status = "approved"
    access_request.reviewed_by_user_id = context.user.id
    access_request.reviewed_at = _utcnow()
    _record_audit(
        db,
        actor_user_id=context.user.id,
        action="access_request.approved",
        resource_type=access_request.target_type,
        resource_id=access_request.target_id,
        request=request,
        details={"access_request_id": access_request.id, "approved_user_id": access_request.user_id, "role": payload.role},
    )
    _record_audit(
        db,
        actor_user_id=context.user.id,
        action=f"membership.{grant_result}",
        resource_type=access_request.target_type,
        resource_id=access_request.target_id,
        request=request,
        details={"user_id": access_request.user_id, "source": "access_request", "access_request_id": access_request.id, "role": payload.role},
    )
    db.commit()
    db.refresh(access_request)
    _notify_access_request_decision(
        access_request=access_request,
        target=target,
        requester=user,
        reviewer=context.user,
        role=payload.role,
    )
    return _access_request_out(db, access_request)


@router.post("/access-requests/{request_id}/reject", response_model=AccessRequestOut)
def reject_access_request(
    request_id: str,
    payload: AccessRequestDecision | None = None,
    context: AuthorizationContext = Depends(current_authorization_context),
    db: Session = Depends(get_db),
    request: Request = None,
):
    access_request = db.get(AccessRequest, request_id)
    if access_request is None:
        raise _not_found("Access request not found")
    if access_request.status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This access request is no longer pending")

    target = _load_target(db, access_request.target_type, access_request.target_id)
    _ensure_manage_target(context, access_request.target_type, target)

    access_request.status = "rejected"
    access_request.reviewed_by_user_id = context.user.id
    access_request.reviewed_at = _utcnow()
    reviewer_note = payload.reason.strip() if payload and payload.reason and payload.reason.strip() else None
    _record_audit(
        db,
        actor_user_id=context.user.id,
        action="access_request.rejected",
        resource_type=access_request.target_type,
        resource_id=access_request.target_id,
        request=request,
        details={"access_request_id": access_request.id, "rejected_user_id": access_request.user_id, "reason": reviewer_note},
    )
    db.commit()
    db.refresh(access_request)
    requester = db.get(AppUser, access_request.user_id)
    if requester is not None:
        _notify_access_request_decision(
            access_request=access_request,
            target=target,
            requester=requester,
            reviewer=context.user,
            reviewer_note=reviewer_note,
        )
    return _access_request_out(db, access_request)


@router.delete("/memberships/{kind}/{membership_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_membership(
    kind: str,
    membership_id: str,
    payload: UserAccessChange | None = None,
    context: AuthorizationContext = Depends(current_authorization_context),
    db: Session = Depends(get_db),
    request: Request = None,
):
    membership_model = {
        "association": AssociationMembership,
        "team": TeamMembership,
        "arena": ArenaMembership,
        "guardian": PlayerGuardianship,
        "player": PlayerMembership,
    }.get(kind)
    if membership_model is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported membership kind")

    membership = db.get(membership_model, membership_id)
    if membership is None:
        raise _not_found("Membership not found")

    if kind == "association":
        target_type = "association"
        target = db.get(Association, membership.association_id)
    elif kind == "team":
        target_type = "team"
        target = db.get(Team, membership.team_id)
    elif kind == "arena":
        target_type = "arena"
        target = db.get(Arena, membership.arena_id)
    elif kind == "guardian":
        target_type = "guardian_link"
        target = db.get(Player, membership.player_id)
    else:
        target_type = "player_link"
        target = db.get(Player, membership.player_id)

    if target is None:
        raise _not_found("Membership target not found")
    _ensure_manage_target(context, target_type, target)

    revoked_user_id = membership.user_id
    audit_action = "membership.revoked"
    if kind == "guardian":
        audit_action = "guardian_link.revoked"
    elif kind == "player":
        audit_action = "player_link.revoked"
    db.delete(membership)
    _record_audit(
        db,
        actor_user_id=context.user.id,
        action=audit_action,
        resource_type=target_type,
        resource_id=getattr(target, "id"),
        request=request,
        details={
            "membership_id": membership_id,
            "membership_kind": kind,
            "revoked_user_id": revoked_user_id,
            "target_user_id": revoked_user_id,
            "reason": payload.reason if payload else None,
        },
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/users", response_model=list[AppUserOut])
def list_users(
    query: str = Query(default="", max_length=255),
    limit: int = Query(default=25, ge=1, le=100),
    context: AuthorizationContext = Depends(current_authorization_context),
    db: Session = Depends(get_db),
):
    ensure_capability(context, "platform.manage", detail="You do not have permission to view users")
    users_query = db.query(AppUser)
    normalized_query = query.strip()
    if normalized_query:
        like = f"%{normalized_query.lower()}%"
        users_query = users_query.filter(
            or_(
                func.lower(AppUser.email).like(like),
                func.lower(func.coalesce(AppUser.display_name, "")).like(like),
            )
        )
    return (
        users_query
        .order_by(
            AppUser.auth_state.asc(),
            AppUser.access_state.asc(),
            AppUser.status.asc(),
            func.lower(AppUser.email).asc(),
        )
        .limit(limit)
        .all()
    )


@router.get("/users/{user_id}/access-summary", response_model=UserAccessSummaryOut)
def get_user_access_summary(
    user_id: str,
    context: AuthorizationContext = Depends(current_authorization_context),
    db: Session = Depends(get_db),
):
    ensure_capability(context, "platform.manage", detail="You do not have permission to view user access")
    user = db.get(AppUser, user_id)
    if user is None:
        raise _not_found("User not found")

    access_entries: list[UserAccessEntryOut] = []
    for membership in (
        db.query(AssociationMembership)
        .filter(AssociationMembership.user_id == user.id)
        .order_by(AssociationMembership.created_at.desc())
        .all()
    ):
        association = db.get(Association, membership.association_id)
        if association is None:
            continue
        access_entries.append(
            _user_access_entry_out(
                membership_kind="association",
                membership_id=membership.id,
                target_type="association",
                target=association,
                role=membership.role,
            )
        )

    for membership in (
        db.query(TeamMembership)
        .filter(TeamMembership.user_id == user.id)
        .order_by(TeamMembership.created_at.desc())
        .all()
    ):
        team = db.get(Team, membership.team_id)
        if team is None:
            continue
        access_entries.append(
            _user_access_entry_out(
                membership_kind="team",
                membership_id=membership.id,
                target_type="team",
                target=team,
                role=membership.role,
            )
        )

    for membership in (
        db.query(ArenaMembership)
        .filter(ArenaMembership.user_id == user.id)
        .order_by(ArenaMembership.created_at.desc())
        .all()
    ):
        arena = db.get(Arena, membership.arena_id)
        if arena is None:
            continue
        access_entries.append(
            _user_access_entry_out(
                membership_kind="arena",
                membership_id=membership.id,
                target_type="arena",
                target=arena,
                role=membership.role,
            )
        )

    for guardianship in (
        db.query(PlayerGuardianship)
        .filter(PlayerGuardianship.user_id == user.id)
        .order_by(PlayerGuardianship.created_at.desc())
        .all()
    ):
        player = db.get(Player, guardianship.player_id)
        if player is None:
            continue
        access_entries.append(
            _user_access_entry_out(
                membership_kind="guardian",
                membership_id=guardianship.id,
                target_type="guardian_link",
                target=player,
                relationship_type=guardianship.relationship_type or "guardian",
            )
        )

    for membership in (
        db.query(PlayerMembership)
        .filter(PlayerMembership.user_id == user.id)
        .order_by(PlayerMembership.created_at.desc())
        .all()
    ):
        player = db.get(Player, membership.player_id)
        if player is None:
            continue
        access_entries.append(
            _user_access_entry_out(
                membership_kind="player",
                membership_id=membership.id,
                target_type="player_link",
                target=player,
                relationship_type="player",
            )
        )

    access_entries.sort(key=lambda entry: (entry.membership_kind, entry.name.lower(), entry.membership_id))

    candidate_logs = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(300).all()
    relevant_logs = [audit_log for audit_log in candidate_logs if _audit_relates_to_user(audit_log, user_id=user.id)][:50]
    actor_ids = {audit_log.actor_user_id for audit_log in relevant_logs if audit_log.actor_user_id}
    actor_emails = {
        actor.id: actor.email
        for actor in db.query(AppUser).filter(AppUser.id.in_(actor_ids)).all()
    } if actor_ids else {}

    audit_entries = [
        UserAuditEntryOut(
            id=audit_log.id,
            action=audit_log.action,
            resource_type=audit_log.resource_type,
            resource_id=audit_log.resource_id,
            actor_user_id=audit_log.actor_user_id,
            actor_email=actor_emails.get(audit_log.actor_user_id),
            details=audit_log.details_json,
            created_at=audit_log.created_at,
        )
        for audit_log in relevant_logs
    ]

    return UserAccessSummaryOut(
        user=user,
        access_entries=access_entries,
        audit_entries=audit_entries,
    )


def _change_app_access(
    *,
    user_id: str,
    context: AuthorizationContext,
    db: Session,
    request: Request | None,
    access_state: str,
    action: str,
    detail_message: str,
    reason: str | None = None,
    deprecated_alias: bool = False,
) -> AppUser:
    ensure_capability(context, "platform.manage", detail=detail_message)
    user = db.get(AppUser, user_id)
    if user is None:
        raise _not_found("User not found")
    if user.id == context.user.id and access_state == "disabled":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot disable your own app access")
    previous_state, next_state = _set_app_access_state(
        user=user,
        access_state=access_state,
        invalidate_tokens=access_state == "disabled",
    )
    _record_audit(
        db,
        actor_user_id=context.user.id,
        action=action,
        resource_type="user",
        resource_id=user.id,
        request=request,
        details={
            "target_user_id": user.id,
            "email": user.email,
            "previous_access_state": previous_state,
            "new_access_state": next_state,
            "reason": reason,
            "deprecated_alias": deprecated_alias or None,
        },
    )
    db.commit()
    db.refresh(user)
    return user


def _change_auth_access(
    *,
    user_id: str,
    context: AuthorizationContext,
    db: Session,
    request: Request | None,
    auth_state: str,
    action: str,
    detail_message: str,
    reason: str | None = None,
) -> AppUser:
    ensure_capability(context, "platform.manage", detail=detail_message)
    user = db.get(AppUser, user_id)
    if user is None:
        raise _not_found("User not found")
    if user.id == context.user.id and auth_state == "disabled":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot disable your own sign-in")
    previous_state, next_state = _set_auth_state(
        user=user,
        auth_state=auth_state,
        invalidate_tokens=auth_state == "disabled",
    )
    revoked_sessions = _revoke_auth_sessions(db, user=user) if auth_state == "disabled" else 0
    _record_audit(
        db,
        actor_user_id=context.user.id,
        action=action,
        resource_type="user",
        resource_id=user.id,
        request=request,
        details={
            "target_user_id": user.id,
            "email": user.email,
            "previous_auth_state": previous_state,
            "new_auth_state": next_state,
            "reason": reason,
            "revoked_sessions": revoked_sessions,
        },
    )
    db.commit()
    db.refresh(user)
    return user


@router.post("/account/close", response_model=AppUserOut)
def close_account(
    payload: UserAccessChange | None = None,
    user: AppUser = Depends(current_me_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    if user.is_platform_admin:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Platform admin accounts cannot be closed here")

    previous_status = user.status
    previous_access_state, next_access_state = _set_app_access_state(
        user=user,
        access_state="disabled",
        invalidate_tokens=True,
    )
    previous_auth_state, next_auth_state = _set_auth_state(
        user=user,
        auth_state="disabled",
        invalidate_tokens=True,
    )
    user.status = "closed"
    user.default_team_id = None
    revoked_memberships = _revoke_user_scoped_access(db, user_id=user.id)
    revoked_sessions = _revoke_auth_sessions(db, user=user)
    reason = payload.reason.strip() if payload and payload.reason and payload.reason.strip() else None

    _record_audit(
        db,
        actor_user_id=user.id,
        action="user.account_closed",
        resource_type="user",
        resource_id=user.id,
        request=request,
        details={
            "target_user_id": user.id,
            "email": user.email,
            "previous_status": previous_status,
            "new_status": user.status,
            "previous_access_state": previous_access_state,
            "new_access_state": next_access_state,
            "previous_auth_state": previous_auth_state,
            "new_auth_state": next_auth_state,
            "revoked_memberships": revoked_memberships,
            "revoked_sessions": revoked_sessions,
            "reason": reason,
        },
    )
    db.commit()
    db.refresh(user)
    return user


@router.post("/users/{user_id}/disable-app-access", response_model=AppUserOut)
def disable_app_access(
    user_id: str,
    payload: UserAccessChange | None = None,
    context: AuthorizationContext = Depends(current_authorization_context),
    db: Session = Depends(get_db),
    request: Request = None,
):
    return _change_app_access(
        user_id=user_id,
        context=context,
        db=db,
        request=request,
        access_state="disabled",
        action="user.app_access_disabled",
        detail_message="You do not have permission to disable app access",
        reason=payload.reason if payload else None,
    )


@router.post("/users/{user_id}/restore-app-access", response_model=AppUserOut)
def restore_app_access(
    user_id: str,
    payload: UserAccessChange | None = None,
    context: AuthorizationContext = Depends(current_authorization_context),
    db: Session = Depends(get_db),
    request: Request = None,
):
    return _change_app_access(
        user_id=user_id,
        context=context,
        db=db,
        request=request,
        access_state="active",
        action="user.app_access_restored",
        detail_message="You do not have permission to restore app access",
        reason=payload.reason if payload else None,
    )


@router.post("/users/{user_id}/disable-auth", response_model=AppUserOut)
def disable_auth(
    user_id: str,
    payload: UserAccessChange | None = None,
    context: AuthorizationContext = Depends(current_authorization_context),
    db: Session = Depends(get_db),
    request: Request = None,
):
    return _change_auth_access(
        user_id=user_id,
        context=context,
        db=db,
        request=request,
        auth_state="disabled",
        action="user.auth_disabled",
        detail_message="You do not have permission to disable sign-in",
        reason=payload.reason if payload else None,
    )


@router.post("/users/{user_id}/restore-auth", response_model=AppUserOut)
def restore_auth(
    user_id: str,
    payload: UserAccessChange | None = None,
    context: AuthorizationContext = Depends(current_authorization_context),
    db: Session = Depends(get_db),
    request: Request = None,
):
    return _change_auth_access(
        user_id=user_id,
        context=context,
        db=db,
        request=request,
        auth_state="active",
        action="user.auth_restored",
        detail_message="You do not have permission to restore sign-in",
        reason=payload.reason if payload else None,
    )


@router.post("/users/{user_id}/revoke", response_model=AppUserOut)
def revoke_user(
    user_id: str,
    payload: UserAccessChange | None = None,
    context: AuthorizationContext = Depends(current_authorization_context),
    db: Session = Depends(get_db),
    request: Request = None,
):
    return _change_app_access(
        user_id=user_id,
        context=context,
        db=db,
        request=request,
        access_state="disabled",
        action="user.app_access_disabled",
        detail_message="You do not have permission to revoke users",
        reason=payload.reason if payload else None,
        deprecated_alias=True,
    )
