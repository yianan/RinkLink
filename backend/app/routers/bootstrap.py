from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth.context import authorization_context
from ..auth.dependencies import current_me_user
from ..database import get_db
from ..schemas import AppBootstrapOut
from .me import build_me_response
from .seasons import season_outputs
from .teams import team_summary_outputs

router = APIRouter(tags=["bootstrap"])


@router.get("/app-bootstrap", response_model=AppBootstrapOut)
def get_app_bootstrap(user=Depends(current_me_user), db: Session = Depends(get_db)):
    me = build_me_response(user, db)
    if user.access_state == "disabled" or user.auth_state == "disabled":
        return AppBootstrapOut(me=me)
    if not (me.user.is_platform_admin or me.user.status == "active"):
        return AppBootstrapOut(me=me)

    context = authorization_context(user=user, db=db)
    return AppBootstrapOut(
        me=me,
        seasons=season_outputs(db),
        teams=team_summary_outputs(db=db, context=context),
    )
