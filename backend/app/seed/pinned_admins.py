from __future__ import annotations

import os

from sqlalchemy.orm import Session

from ..models import AppUser

DEFAULT_PINNED_PLATFORM_ADMIN_EMAILS = {"justin.visconti@gmail.com"}


def pinned_platform_admin_emails() -> set[str]:
    configured = os.getenv("RINKLINK_PINNED_PLATFORM_ADMIN_EMAILS")
    if configured is None:
        return set(DEFAULT_PINNED_PLATFORM_ADMIN_EMAILS)
    return {
        email.strip().lower()
        for email in configured.split(",")
        if email.strip()
    }


def repair_pinned_platform_admins(db: Session) -> int:
    emails = pinned_platform_admin_emails()
    if not emails:
        return 0

    repaired = 0
    for user in db.query(AppUser).filter(AppUser.email.in_(emails)).all():
        changed = False
        if user.status != "active":
            user.status = "active"
            changed = True
        if user.access_state != "active":
            user.access_state = "active"
            changed = True
        if user.auth_state != "active":
            user.auth_state = "active"
            changed = True
        if not user.is_platform_admin:
            user.is_platform_admin = True
            changed = True
        if user.revoked_at is not None:
            user.revoked_at = None
            changed = True
        if changed:
            repaired += 1

    if repaired:
        db.commit()
    return repaired
