from __future__ import annotations

import uuid
from datetime import datetime, timezone

import jwt as pyjwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import AppUser
from .jwt import decode_access_token
from .runtime import assert_auth_runtime_safe

bearer_scheme = HTTPBearer(auto_error=False)


def _synthetic_admin() -> AppUser:
    return AppUser(
        id=f"dev-{uuid.uuid4()}",
        auth_id="dev-admin",
        email="dev-admin@local.rinklink",
        display_name="Development Admin",
        status="active",
        is_platform_admin=True,
        revoked_at=None,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )


def _upsert_user_from_claims(db: Session, claims: dict) -> AppUser:
    auth_id = str(claims["sub"])
    email = claims.get("email") or f"{auth_id}@unknown.local"
    display_name = claims.get("name")

    user = db.query(AppUser).filter(AppUser.auth_id == auth_id).first()
    if user is None:
        user = AppUser(
            auth_id=auth_id,
            email=email,
            display_name=display_name,
            status="pending",
            is_platform_admin=False,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    changed = False
    if user.email != email:
        user.email = email
        changed = True
    if display_name and user.display_name != display_name:
        user.display_name = display_name
        changed = True
    if changed:
        db.commit()
        db.refresh(user)
    return user


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> AppUser:
    assert_auth_runtime_safe()

    if not settings.auth_enabled:
        if settings.auth_bypass_dev_only:
            return _synthetic_admin()
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Authentication is not enabled")

    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

    try:
        claims = decode_access_token(credentials.credentials)
    except (pyjwt.InvalidTokenError, RuntimeError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid access token") from exc

    user = _upsert_user_from_claims(db, claims)
    token_issued_at = claims.get("iat")
    if user.revoked_at and token_issued_at:
        revoked_at = int(user.revoked_at.replace(tzinfo=timezone.utc).timestamp())
        if revoked_at > int(token_issued_at):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access has been revoked")
    return user


def require_active_user(user: AppUser = Depends(current_user)) -> AppUser:
    if user.is_platform_admin:
        return user
    if user.status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is not active")
    return user
