from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth.context import AuthorizationContext, authorization_context
from ..config import settings
from ..database import get_db
from ..seed.seed_data import seed_demo_data

router = APIRouter(tags=["seed"])


@router.post("/seed")
def seed(
    _: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    if settings.app_env != "development":
        raise HTTPException(403, "Demo seeding is only available in development")
    result = seed_demo_data(db)
    return {"message": "Demo data seeded", **result}
