from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from ..auth.context import AuthorizationContext, authorization_context, ensure_team_access
from ..database import get_db
from ..models import Team
from ..services.calendar_feed import build_team_calendar, calendar_feed_url, read_calendar_token

router = APIRouter(tags=["calendar"])


@router.get("/teams/{team_id}/calendar-feed")
def get_team_calendar_feed_url(
    team_id: str,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    team = db.get(Team, team_id)
    if not team:
        from fastapi import HTTPException

        raise HTTPException(404, "Team not found")
    ensure_team_access(context, team, "team.view", allow_linked_family=True)
    return {"url": calendar_feed_url(team_id)}


@router.get("/calendar/teams/{team_id}.ics", response_class=PlainTextResponse, include_in_schema=False)
def get_team_calendar(
    team_id: str,
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    token_team_id = read_calendar_token(token)
    if token_team_id != team_id:
        from fastapi import HTTPException

        raise HTTPException(401, "Invalid calendar token")
    return PlainTextResponse(build_team_calendar(db, team_id), media_type="text/calendar; charset=utf-8")
