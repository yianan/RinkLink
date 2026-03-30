from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth.context import AuthorizationContext, authorization_context, ensure_team_access
from ..database import get_db
from ..models import Event, Notification, Team
from ..schemas import NotificationOut

router = APIRouter(tags=["notifications"])


def _week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def ensure_weekly_confirm_notification(db: Session, team_id: str) -> None:
    """Create an in-app weekly confirmation reminder if the team has unconfirmed events this week."""
    today = date.today()
    week_start = _week_start(today)
    week_end = week_start + timedelta(days=6)

    q = db.query(Event).filter(
        Event.date >= week_start,
        Event.date <= week_end,
        Event.away_team_id.isnot(None),
        (Event.home_team_id == team_id) | (Event.away_team_id == team_id),
    )
    games = q.all()

    unconfirmed = [
        g for g in games
        if (g.home_team_id == team_id and not g.home_weekly_confirmed)
        or (g.away_team_id == team_id and not g.away_weekly_confirmed)
    ]
    if not unconfirmed:
        return

    existing = (
        db.query(Notification)
        .filter(
            Notification.team_id == team_id,
            Notification.notif_type == "weekly_confirm",
            Notification.week_start == week_start,
        )
        .first()
    )
    if existing:
        return

    title = "Weekly event confirmation"
    message = f"Confirm {len(unconfirmed)} scheduled event(s) for the week starting {week_start.isoformat()}."
    db.add(Notification(team_id=team_id, notif_type="weekly_confirm", title=title, message=message, week_start=week_start))
    db.commit()


@router.get("/teams/{team_id}/notifications", response_model=list[NotificationOut])
def list_notifications(
    team_id: str,
    unread_only: bool = Query(False),
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    ensure_team_access(context, team, "team.view")

    ensure_weekly_confirm_notification(db, team_id)

    q = db.query(Notification).filter(Notification.team_id == team_id)
    if unread_only:
        q = q.filter(Notification.read_at.is_(None))
    return q.order_by(Notification.created_at.desc()).all()


@router.patch("/notifications/{id}/read", response_model=NotificationOut)
def mark_read(
    id: str,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    n = db.get(Notification, id)
    if not n:
        raise HTTPException(404, "Notification not found")
    if not n.team:
        raise HTTPException(404, "Team not found")
    ensure_team_access(context, n.team, "team.view")
    if n.read_at is None:
        from datetime import datetime, timezone

        n.read_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(n)
    return n
