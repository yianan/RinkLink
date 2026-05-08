from __future__ import annotations

import argparse

from ..database import SessionLocal
from ..models import AppUser
from .seed_data import PreservedAppUser, seed_demo_data


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Reset the current database to the demo dataset and restore a chosen platform admin.",
    )
    parser.add_argument(
        "--admin-email",
        required=False,
        help="Email address of the user to restore as the platform admin after reseeding.",
    )
    parser.add_argument(
        "--preserve-existing-users",
        action="store_true",
        help="Restore all existing app users with their current statuses and platform admin flags after reseeding.",
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    admin_email = (args.admin_email or "").strip().lower()
    if args.preserve_existing_users and admin_email:
        raise SystemExit("--admin-email cannot be combined with --preserve-existing-users")
    if not args.preserve_existing_users and not admin_email:
        raise SystemExit("admin email is required")

    db = SessionLocal()
    try:
        existing_users = []
        if args.preserve_existing_users:
            existing_users = db.query(AppUser).order_by(AppUser.email).all()
            if not existing_users:
                raise SystemExit("No app users exist yet. Sign in through the app first so /api/me creates at least one row, then rerun this command.")
        else:
            existing_user = (
                db.query(AppUser)
                .filter(AppUser.email.ilike(admin_email))
                .first()
            )
            if existing_user is None:
                raise SystemExit(
                    "No matching app user exists yet. Sign in through the app first so /api/me creates the row, then rerun this command.",
                )
            existing_users = [existing_user]

        result = seed_demo_data(
            db,
            preserved_users=[
                PreservedAppUser(
                    auth_id=existing_user.auth_id,
                    email=existing_user.email,
                    display_name=existing_user.display_name,
                    status=existing_user.status if args.preserve_existing_users else "active",
                    is_platform_admin=existing_user.is_platform_admin if args.preserve_existing_users else True,
                )
                for existing_user in existing_users
            ],
        )
    finally:
        db.close()

    if args.preserve_existing_users:
        print(f"Bootstrapped demo data preserving {len(existing_users)} existing app users")
    else:
        print(f"Bootstrapped demo data for {admin_email}")
    for key, value in result.items():
        print(f"{key}: {value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
