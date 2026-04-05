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
        required=True,
        help="Email address of the user to restore as the platform admin after reseeding.",
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    admin_email = args.admin_email.strip().lower()
    if not admin_email:
        raise SystemExit("admin email is required")

    db = SessionLocal()
    try:
        existing_user = (
            db.query(AppUser)
            .filter(AppUser.email.ilike(admin_email))
            .first()
        )
        if existing_user is None:
            raise SystemExit(
                "No matching app user exists yet. Sign in through the app first so /api/me creates the row, then rerun this command.",
            )

        result = seed_demo_data(
            db,
            preserved_users=[
                PreservedAppUser(
                    auth_id=existing_user.auth_id,
                    email=existing_user.email,
                    display_name=existing_user.display_name,
                    status="active",
                    is_platform_admin=True,
                )
            ],
        )
    finally:
        db.close()

    print(f"Bootstrapped demo data for {admin_email}")
    for key, value in result.items():
        print(f"{key}: {value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
