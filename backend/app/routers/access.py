from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth.context import (
    AuthorizationContext,
    can_access_association,
    can_access_arena,
    can_access_team,
    current_authorization_context,
    ensure_association_access,
    ensure_arena_access,
    ensure_team_access,
)
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
    InviteCreate,
    InviteOut,
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
    details: dict | list | None = None,
) -> None:
    db.add(
        AuditLog(
            actor_user_id=actor_user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details_json=details,
        )
    )


def _mark_user_active(user: AppUser, *, default_team_id: str | None = None) -> None:
    if user.status != "active":
        user.status = "active"
    if default_team_id and not user.default_team_id:
        user.default_team_id = default_team_id


def _apply_target_grant(
    db: Session,
    *,
    user: AppUser,
    target_type: str,
    target,
    role: str | None,
) -> None:
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
        elif role and membership.role != role:
            membership.role = role
        _mark_user_active(user)
        return

    if target_type == "team":
        membership = (
            db.query(TeamMembership)
            .filter(TeamMembership.user_id == user.id, TeamMembership.team_id == target.id)
            .first()
        )
        if membership is None:
            db.add(TeamMembership(user_id=user.id, team_id=target.id, role=role or "coach"))
        elif role and membership.role != role:
            membership.role = role
        _mark_user_active(user, default_team_id=target.id)
        return

    if target_type == "arena":
        membership = (
            db.query(ArenaMembership)
            .filter(ArenaMembership.user_id == user.id, ArenaMembership.arena_id == target.id)
            .first()
        )
        if membership is None:
            db.add(ArenaMembership(user_id=user.id, arena_id=target.id, role=role or "arena_ops"))
        elif role and membership.role != role:
            membership.role = role
        _mark_user_active(user)
        return

    if target_type == "guardian_link":
        link = (
            db.query(PlayerGuardianship)
            .filter(PlayerGuardianship.user_id == user.id, PlayerGuardianship.player_id == target.id)
            .first()
        )
        if link is None:
            db.add(PlayerGuardianship(user_id=user.id, player_id=target.id, relationship_type="guardian"))
        _mark_user_active(user, default_team_id=target.team_id)
        return

    link = (
        db.query(PlayerMembership)
        .filter(PlayerMembership.user_id == user.id, PlayerMembership.player_id == target.id)
        .first()
    )
    if link is None:
        db.add(PlayerMembership(user_id=user.id, player_id=target.id))
    _mark_user_active(user, default_team_id=target.team_id)


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


def _access_request_out(db: Session, access_request: AccessRequest) -> AccessRequestOut:
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
        target=_build_target_summary(access_request.target_type, target),
    )


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

    invites = query.all()
    visible_invites: list[InviteOut] = []
    for invite in invites:
        target = _load_target(db, invite.target_type, invite.target_id)
        if invite.invited_by_user_id == context.user.id or _can_manage_target(context, invite.target_type, target):
            visible_invites.append(_invite_out(db, invite))
    return visible_invites


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
):
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
):
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
    _apply_target_grant(db, user=context.user, target_type=invite.target_type, target=target, role=invite.role)
    invite.status = "accepted"
    invite.accepted_at = _utcnow()
    _record_audit(
        db,
        actor_user_id=context.user.id,
        action="invite.accepted",
        resource_type=invite.target_type,
        resource_id=invite.target_id,
        details={"invite_id": invite.id, "role": invite.role},
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
        return [_access_request_out(db, access_request) for access_request in requests]

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
    context: AuthorizationContext = Depends(current_authorization_context),
    db: Session = Depends(get_db),
):
    del context  # Authenticated session required; target lookup is intentionally lightweight for pending users too.

    if target_type == "association":
        associations = db.query(Association).order_by(Association.name.asc()).all()
        return [_build_target_summary("association", association) for association in associations]

    if target_type == "team":
        teams = db.query(Team).order_by(Team.name.asc()).all()
        return [_build_target_summary("team", team) for team in teams]

    if target_type == "arena":
        arenas = db.query(Arena).order_by(Arena.name.asc()).all()
        return [_build_target_summary("arena", arena) for arena in arenas]

    if not team_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="team_id is required for player link lookups")

    team = db.get(Team, team_id)
    if team is None:
        raise _not_found("Team not found")

    players = (
        db.query(Player)
        .filter(Player.team_id == team_id)
        .order_by(Player.last_name.asc(), Player.first_name.asc())
        .all()
    )
    return [_build_target_summary(target_type, player) for player in players]


@router.post("/access-requests", response_model=AccessRequestOut, status_code=status.HTTP_201_CREATED)
def create_access_request(
    payload: AccessRequestCreate,
    context: AuthorizationContext = Depends(current_authorization_context),
    db: Session = Depends(get_db),
):
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
        return _access_request_out(db, existing)

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
        details={"access_request_user_id": context.user.id},
    )
    db.commit()
    db.refresh(access_request)
    return _access_request_out(db, access_request)


@router.post("/access-requests/{request_id}/approve", response_model=AccessRequestOut)
def approve_access_request(
    request_id: str,
    payload: AccessRequestDecision,
    context: AuthorizationContext = Depends(current_authorization_context),
    db: Session = Depends(get_db),
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

    _apply_target_grant(db, user=user, target_type=access_request.target_type, target=target, role=payload.role)
    access_request.status = "approved"
    access_request.reviewed_by_user_id = context.user.id
    access_request.reviewed_at = _utcnow()
    _record_audit(
        db,
        actor_user_id=context.user.id,
        action="access_request.approved",
        resource_type=access_request.target_type,
        resource_id=access_request.target_id,
        details={"access_request_id": access_request.id, "approved_user_id": access_request.user_id, "role": payload.role},
    )
    db.commit()
    db.refresh(access_request)
    return _access_request_out(db, access_request)


@router.post("/access-requests/{request_id}/reject", response_model=AccessRequestOut)
def reject_access_request(
    request_id: str,
    context: AuthorizationContext = Depends(current_authorization_context),
    db: Session = Depends(get_db),
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
        details={"access_request_id": access_request.id, "rejected_user_id": access_request.user_id},
    )
    db.commit()
    db.refresh(access_request)
    return _access_request_out(db, access_request)
