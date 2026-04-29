from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone

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
    InviteCreate,
    InviteOut,
    UserAccessChange,
    UserAccessEntryOut,
    UserAccessSummaryOut,
    UserAuditEntryOut,
)
from ..services.email import send_invite_email
from ..config import settings

router = APIRouter(tags=["auth"])
logger = logging.getLogger(__name__)

ASSOCIATION_ROLES = {"association_admin"}
TEAM_ROLES = {"team_admin", "manager", "scheduler", "coach"}
ARENA_ROLES = {"arena_admin", "arena_ops"}
RESOURCE_TARGET_TYPES = {"association", "team", "arena", "guardian_link", "player_link"}
ROLE_BASED_TARGET_TYPES = {"association", "team", "arena"}
INVITE_ACCEPT_RATE_LIMIT = RateLimitRule(limit=5, window_seconds=300)
ACCESS_REQUEST_RATE_LIMIT = RateLimitRule(limit=10, window_seconds=300)
INVITE_CREATE_RATE_LIMIT = RateLimitRule(limit=20, window_seconds=300)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _normalize_email(email: str) -> str:
    return email.strip().lower()


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

    player_name = f"{target.first_name} {target.last_name}".strip()
    team_name = target.team.name if getattr(target, "team", None) else None
    context = f"{team_name} · Parent/guardian access" if target_type == "guardian_link" and team_name else "Parent/guardian access"
    if target_type == "player_link":
        context = f"{team_name} · Player access" if team_name else "Player access"
    return AccessTargetOut(type=target_type, id=target.id, name=player_name, context=context)


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


def _build_access_target_search_query(search: str) -> str:
    return f"%{search.strip()}%"


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
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="team_id is required for player link lookups")

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
    return _access_request_out(db, access_request)


@router.post("/access-requests/{request_id}/reject", response_model=AccessRequestOut)
def reject_access_request(
    request_id: str,
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
    _record_audit(
        db,
        actor_user_id=context.user.id,
        action="access_request.rejected",
        resource_type=access_request.target_type,
        resource_id=access_request.target_id,
        request=request,
        details={"access_request_id": access_request.id, "rejected_user_id": access_request.user_id},
    )
    db.commit()
    db.refresh(access_request)
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
