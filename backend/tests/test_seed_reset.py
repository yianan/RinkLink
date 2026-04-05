from __future__ import annotations

from app.models import AppUser, Association
from app.seed.seed_data import PreservedAppUser, seed_demo_data


def test_seed_demo_data_restores_preserved_platform_admin(db) -> None:
    user = AppUser(
        auth_id="auth-render-admin",
        email="render-admin@example.com",
        display_name="Render Admin",
        status="pending",
        is_platform_admin=False,
    )
    db.add(user)
    db.commit()
    auth_id = user.auth_id
    email = user.email
    display_name = user.display_name

    result = seed_demo_data(
        db,
        preserved_users=[
            PreservedAppUser(
                auth_id=auth_id,
                email=email,
                display_name=display_name,
                status="active",
                is_platform_admin=True,
            )
        ],
    )

    restored_user = db.query(AppUser).filter(AppUser.auth_id == auth_id).one()

    assert restored_user.email == email
    assert restored_user.display_name == display_name
    assert restored_user.status == "active"
    assert restored_user.is_platform_admin is True
    assert db.query(Association).count() > 0
    assert result["preserved_users"] == 1
