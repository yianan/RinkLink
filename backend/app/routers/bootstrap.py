from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth.context import authorization_context
from ..auth.dependencies import current_me_user
from ..database import get_db
from ..models import Team
from ..schemas import AppBootstrapOut
from .dashboard import dashboard_summary_cached
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
    seasons = season_outputs(db)
    teams = team_summary_outputs(db=db, context=context)
    active_season = next((season for season in seasons if season["is_active"]), None) or (seasons[0] if seasons else None)
    default_team_id = me.user.default_team_id
    initial_team_summary = (
        next((team for team in teams if team.id == default_team_id), None)
        if default_team_id
        else None
    ) or (teams[0] if teams else None)
    today = date.today()
    initial_dashboard = None
    initial_dashboard_team_id = None
    if initial_team_summary:
        team = db.get(Team, initial_team_summary.id)
        if team:
            initial_dashboard_team_id = team.id
            initial_dashboard = dashboard_summary_cached(
                db=db,
                context=context,
                team=team,
                date_from=today,
                season_id=active_season["id"] if active_season else None,
            )

    return AppBootstrapOut(
        me=me,
        seasons=seasons,
        teams=teams,
        initial_dashboard_team_id=initial_dashboard_team_id,
        initial_dashboard_season_id=active_season["id"] if active_season else None,
        initial_dashboard_date_from=today.isoformat(),
        initial_dashboard=initial_dashboard,
    )
