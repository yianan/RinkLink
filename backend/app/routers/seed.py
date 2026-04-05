from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth.context import AuthorizationContext, authorization_context
from ..config import settings
from ..database import get_db
from ..seed.seed_data import PreservedAppUser, seed_demo_data

router = APIRouter(tags=["seed"])


@router.post("/seed")
def seed(
    _: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    if settings.app_env != "development":
        raise HTTPException(403, "Demo seeding is only available in development")
    if not _.user.is_platform_admin:
        raise HTTPException(403, "Only platform admins can reset demo data")

    preserved_user = PreservedAppUser(
        auth_id=_.user.auth_id,
        email=_.user.email,
        display_name=_.user.display_name,
        status="active",
        is_platform_admin=True,
    )
    result = seed_demo_data(db, preserved_users=[preserved_user])
    return {"message": "Demo data seeded", **result}
