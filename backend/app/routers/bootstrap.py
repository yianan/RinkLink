from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth.context import current_authorization_context
from ..database import get_db
from ..schemas.bootstrap import BootstrapOut
from .me import build_me_out
from .seasons import list_seasons_out
from .teams import list_scoped_teams_out

router = APIRouter(tags=["auth"])


@router.get("/bootstrap", response_model=BootstrapOut)
def get_bootstrap(context=Depends(current_authorization_context), db: Session = Depends(get_db)):
    me = build_me_out(context, db)
    has_app_access = context.user.is_platform_admin or context.user.status == "active"
    if not has_app_access:
        return BootstrapOut(me=me, teams=[], seasons=[])
    return BootstrapOut(
        me=me,
        teams=list_scoped_teams_out(context, db),
        seasons=list_seasons_out(db),
    )
