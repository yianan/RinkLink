from fastapi import HTTPException
from sqlalchemy import or_
from ..models import Arena, ArenaRink, AvailabilityWindow, Event, Team, Season, Proposal


def required(db, model, identity):
    row = db.get(model, identity)
    if row is None:
        raise HTTPException(404, f"{model.__name__} not found")
    return row


def lock_teams(db, team_ids):
    # Consistent row locks serialize acceptance, rescheduling and manual entry on PostgreSQL.
    db.query(Team).filter(Team.id.in_(team_ids)).order_by(Team.id).with_for_update().all()


def overlaps(start, end, other_start, other_end):
    return (other_start is None or other_start < end) and (other_end is None or start < other_end)


def contains(window, day, start, end):
    return window.date == day and start is not None and end is not None and start < end and (
        window.start_time is None or window.start_time <= start) and (
        window.end_time is None or end <= window.end_time)


def venue(db, arena_id, rink_id):
    required(db, Arena, arena_id)
    rink = db.query(ArenaRink).filter(ArenaRink.id == rink_id).with_for_update().first()
    if rink is None:
        raise HTTPException(404, "ArenaRink not found")
    if rink.arena_id != arena_id:
        raise HTTPException(400, "Rink does not belong to this venue")


def season_for(db, day, season_id=None):
    if season_id:
        season = required(db, Season, season_id)
        if not season.start_date <= day <= season.end_date:
            raise HTTPException(400, "Date is outside the selected season")
        return season.id
    season = db.query(Season).filter(Season.start_date <= day, Season.end_date >= day).first()
    if not season:
        raise HTTPException(400, "No season covers this date")
    return season.id


def conflicts(db, team_ids, day, start, end, *, rink_id=None, exclude_event_id=None):
    scope = [Event.home_team_id.in_(team_ids), Event.away_team_id.in_(team_ids)]
    if rink_id:
        scope.append(Event.arena_rink_id == rink_id)
    query = db.query(Event).filter(Event.date == day, Event.status != "cancelled", or_(*scope))
    if exclude_event_id:
        query = query.filter(Event.id != exclude_event_id)
    return any(overlaps(start, end, event.start_time, event.end_time) for event in query.all()) or any(
        overlaps(start, end, block.start_time, block.end_time) for block in
        db.query(AvailabilityWindow).filter(AvailabilityWindow.team_id.in_(team_ids),
            AvailabilityWindow.date == day, AvailabilityWindow.blocked == True).all())


def assert_free(db, team_ids, day, start, end, **kwargs):
    if conflicts(db, team_ids, day, start, end, **kwargs):
        raise HTTPException(409, "A team, blocked period, or rink conflicts with this date and time")


def validate_windows(db, proposal):
    home = required(db, AvailabilityWindow, proposal.home_availability_window_id)
    away = required(db, AvailabilityWindow, proposal.away_availability_window_id)
    if home.team_id != proposal.home_team_id or away.team_id != proposal.away_team_id:
        raise HTTPException(400, "Availability windows must belong to the selected teams")
    if home.availability_type != "home" or away.availability_type != "away":
        raise HTTPException(400, "Select home and away availability")
    if home.blocked or away.blocked or home.status != "open" or away.status != "open":
        raise HTTPException(409, "One or both availability windows are no longer available")
    if home.season_id != away.season_id:
        raise HTTPException(400, "Both availability windows must be in the same season")
    if not all(contains(window, proposal.proposed_date, proposal.proposed_start_time,
        proposal.proposed_end_time) for window in [home, away]):
        raise HTTPException(400, "The full game must fit inside both teams' availability")
    return home, away


def cancel_proposal(db, proposal):
    root = proposal.thread_root_proposal_id or proposal.id
    thread = db.query(Proposal).filter(or_(Proposal.id == root, Proposal.thread_root_proposal_id == root)).all()
    event = db.query(Event).filter(Event.proposal_id.in_([row.id for row in thread]), Event.status != "cancelled").first()
    if proposal.parent_proposal_id and proposal.status == "proposed" and event:
        # Withdrawing a requested change must leave the agreed game intact.
        proposal.status, proposal.active_pair_key = "cancelled", None
        return
    for row in thread:
        if row.status in ["proposed", "accepted"]:
            row.status, row.active_pair_key = "cancelled", None
    if event:
        event.status = "cancelled"
    for identity in [proposal.home_availability_window_id, proposal.away_availability_window_id]:
        window = db.get(AvailabilityWindow, identity)
        if window:
            window.status, window.opponent_team_id = "open", None
