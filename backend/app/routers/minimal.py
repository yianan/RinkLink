"""Only team matching, scheduling, venue reference data, and team access."""
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Annotated
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from ..database import get_db
from ..config import settings
from ..models import (Team, Season, Arena, ArenaRink, AvailabilityWindow, Proposal, Event,
    AppUser, TeamMembership, Invite, AccessRequest, AuditLog, Notification)
from ..schemas import (TeamCreate, VenueCreate, RinkCreate, EventCreate, ProposalCreate, ProposalRevision,
    AvailabilityWindowCreate, AvailabilityWindowUpdate, AvailabilityConfirmUpload, InviteCreate,
    AccessRequestCreate, AccessDecision, AccountAction, ContactMessageCreate)
from ..auth.context import (AuthorizationContext, authorization_context, current_authorization_context,
    enforced_authorization_context, ensure_team_access, ensure_capability, ensure_event_team_access,
    ensure_proposal_team_access, ensure_proposal_counterparty_access, can_access_team)
from ..auth.dependencies import current_me_user, _current_user_cache
from ..auth.rate_limit import enforce_rate_limit, RateLimitRule
from ..services.presentation import row_out, enrich
from ..services.scheduling import (required, lock_teams, contains, conflicts, venue, season_for,
    assert_free, validate_windows, cancel_proposal)
from ..services.season_utils import ensure_standard_seasons
from ..services.csv_parser import parse_csv
from ..services.distance import get_distance
from ..services.email import send_email

router = APIRouter()
DB = Annotated[Session, Depends(get_db)]
CTX = Annotated[AuthorizationContext, Depends(authorization_context)]
CURRENT = Annotated[AuthorizationContext, Depends(current_authorization_context)]


def commit(db):
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(409, "This record already exists or is still referenced") from error


def audit(db, context, action, target, details=None):
    if db.get(AppUser, context.user.id):
        db.add(AuditLog(actor_user_id=context.user.id, action=action,
            resource_type=target.__tablename__, resource_id=target.id, details_json=details))


def notify(db, team_ids, title, message):
    for identity in set(team_ids):
        db.add(Notification(team_id=identity, notif_type="schedule", title=title, message=message))


def me_out(db, user):
    context = enforced_authorization_context(db, user)
    ready = user.access_state == "active" and user.auth_state == "active"
    teams = db.query(Team).order_by(Team.name)
    if not user.is_platform_admin:
        teams = teams.filter(Team.id.in_(context.team_ids))
    return {"user": row_out(user), "capabilities": sorted(context.capabilities) if ready else [],
        "teams": [{"team_id": m.team_id, "role": m.role} for m in context.team_memberships] if ready else [],
        "accessible_teams": [row_out(team) for team in teams.all()] if ready else []}


@router.get('/me')
def get_me(db: DB, user=Depends(current_me_user)):
    return me_out(db, user)


@router.get('/app-bootstrap')
def bootstrap(db: DB, user=Depends(current_me_user)):
    me = me_out(db, user)
    ready = user.access_state == user.auth_state == "active" and (user.status == "active" or user.is_platform_admin)
    return {"me": me, "teams": me["accessible_teams"],
        "seasons": [row_out(s) for s in ensure_standard_seasons(db)] if ready else []}


@router.get('/seasons')
def seasons(db: DB, context: CTX):
    return [row_out(s) for s in ensure_standard_seasons(db)]


@router.get('/teams')
def teams(db: DB, context: CTX, mine: bool = False):
    query = db.query(Team).order_by(Team.name)
    if mine and not context.user.is_platform_admin:
        query = query.filter(Team.id.in_(context.team_ids))
    return [row_out(team) for team in query.limit(500).all()]


@router.get('/access-targets')
def access_targets(db: DB, context: CURRENT):
    return [{"id": team.id, "name": team.name, "age_group": team.age_group, "level": team.level}
        for team in db.query(Team).order_by(Team.name).limit(500).all()]


def validate_team_venue(db, body):
    if body.home_arena_rink_id:
        if not body.home_arena_id:
            raise HTTPException(400, "Choose the home venue before its rink")
        venue(db, body.home_arena_id, body.home_arena_rink_id)
    elif body.home_arena_id:
        required(db, Arena, body.home_arena_id)


@router.post('/teams', status_code=201)
def create_team(body: TeamCreate, db: DB, context: CTX):
    if not context.user.is_platform_admin and "team.manage" not in context.capabilities:
        raise HTTPException(403, "Ask an administrator to create your team")
    validate_team_venue(db, body)
    team = Team(**body.model_dump())
    db.add(team)
    db.flush()
    if db.get(AppUser, context.user.id):
        db.add(TeamMembership(user_id=context.user.id, team_id=team.id, role="team_admin"))
    audit(db, context, 'team.create', team)
    commit(db)
    return row_out(team)


@router.put('/teams/{team_id}')
def update_team(team_id: str, body: TeamCreate, db: DB, context: CTX):
    team = required(db, Team, team_id)
    ensure_team_access(context, team, 'team.manage')
    validate_team_venue(db, body)
    for key, value in body.model_dump().items():
        setattr(team, key, value)
    audit(db, context, 'team.update', team)
    commit(db)
    return row_out(team)


@router.get('/arenas')
def arenas(db: DB, context: CTX):
    return [row_out(arena) for arena in db.query(Arena).order_by(Arena.name).limit(500).all()]


@router.post('/arenas', status_code=201)
def add_arena(body: VenueCreate, db: DB, context: CTX):
    ensure_capability(context, 'venue.manage')
    arena = Arena(**body.model_dump())
    db.add(arena)
    commit(db)
    return row_out(arena)


@router.get('/arenas/{arena_id}/rinks')
def rinks(arena_id: str, db: DB, context: CTX):
    required(db, Arena, arena_id)
    return [row_out(rink) for rink in db.query(ArenaRink).filter(ArenaRink.arena_id == arena_id).order_by(ArenaRink.name).all()]


@router.post('/arenas/{arena_id}/rinks', status_code=201)
def add_rink(arena_id: str, body: RinkCreate, db: DB, context: CTX):
    ensure_capability(context, 'venue.manage')
    required(db, Arena, arena_id)
    rink = ArenaRink(arena_id=arena_id, name=body.name)
    db.add(rink)
    commit(db)
    return row_out(rink)


def window_out(db, window):
    data = row_out(window)
    event = db.query(Event).filter(Event.status != 'cancelled', or_(
        Event.home_availability_window_id == window.id, Event.away_availability_window_id == window.id)).first()
    data['event_id'] = event.id if event else None
    return data


@router.get('/teams/{team_id}/availability')
def availability(team_id: str, db: DB, context: CTX, season_id: str | None = None):
    ensure_team_access(context, required(db, Team, team_id), 'team.manage_schedule')
    query = db.query(AvailabilityWindow).filter(AvailabilityWindow.team_id == team_id)
    if season_id:
        query = query.filter(AvailabilityWindow.season_id == season_id)
    return [window_out(db, row) for row in query.order_by(AvailabilityWindow.date, AvailabilityWindow.start_time).limit(500).all()]


@router.post('/teams/{team_id}/availability', status_code=201)
def add_availability(team_id: str, body: AvailabilityWindowCreate, db: DB, context: CTX):
    ensure_team_access(context, required(db, Team, team_id), 'team.manage_schedule')
    lock_teams(db, {team_id})
    values = body.model_dump()
    values['season_id'] = season_for(db, body.date, body.season_id)
    window = AvailabilityWindow(team_id=team_id, **values)
    db.add(window)
    commit(db)
    return window_out(db, window)


@router.put('/availability-windows/{window_id}')
def update_availability(window_id: str, body: AvailabilityWindowUpdate, db: DB, context: CTX):
    window = required(db, AvailabilityWindow, window_id)
    ensure_team_access(context, required(db, Team, window.team_id), 'team.manage_schedule')
    lock_teams(db, {window.team_id})
    db.refresh(window)
    if window.status != 'open':
        raise HTTPException(409, "Cancel or reschedule the agreed game before changing its availability")
    values = {**row_out(window), **body.model_dump(exclude_unset=True)}
    checked = AvailabilityWindowCreate(**{key: values[key] for key in AvailabilityWindowCreate.model_fields})
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(window, key, value)
    window.season_id = season_for(db, checked.date, checked.season_id)
    commit(db)
    return window_out(db, window)


@router.delete('/availability-windows/{window_id}', status_code=204)
def delete_availability(window_id: str, db: DB, context: CTX):
    window = required(db, AvailabilityWindow, window_id)
    ensure_team_access(context, required(db, Team, window.team_id), 'team.manage_schedule')
    lock_teams(db, {window.team_id})
    if db.query(Proposal).filter(or_(Proposal.home_availability_window_id == window.id,
        Proposal.away_availability_window_id == window.id)).first():
        raise HTTPException(409, "Availability with proposal history must be kept; block it instead")
    db.delete(window)
    commit(db)


@router.post('/teams/{team_id}/availability/upload')
async def upload_availability(team_id: str, db: DB, context: CTX, file: UploadFile = File(...)):
    ensure_team_access(context, required(db, Team, team_id), 'team.manage_schedule')
    content = await file.read(2_000_001)
    if len(content) > 2_000_000:
        raise HTTPException(413, "CSV must be smaller than 2 MB")
    try:
        return parse_csv(content.decode('utf-8-sig'))
    except UnicodeDecodeError as error:
        raise HTTPException(400, "Upload a UTF-8 CSV") from error


@router.post('/teams/{team_id}/availability/confirm-upload', status_code=201)
def confirm_upload(team_id: str, body: AvailabilityConfirmUpload, db: DB, context: CTX):
    ensure_team_access(context, required(db, Team, team_id), 'team.manage_schedule')
    if len(body.entries) > 500:
        raise HTTPException(400, "Import at most 500 availability rows at a time")
    lock_teams(db, {team_id})
    rows = []
    for entry in body.entries:
        checked = AvailabilityWindowCreate(**entry.model_dump())
        values = checked.model_dump()
        values['season_id'] = season_for(db, entry.date)
        window = AvailabilityWindow(team_id=team_id, **values)
        db.add(window)
        rows.append(window)
    commit(db)
    return [window_out(db, window) for window in rows]


def candidate_matches(db, window, level=None, min_ranking=None, max_ranking=None, max_distance=None):
    if window.status != 'open' or window.blocked or window.date < date.today():
        return []
    team = required(db, Team, window.team_id)
    query = db.query(AvailabilityWindow).join(Team, Team.id == AvailabilityWindow.team_id).filter(
        AvailabilityWindow.date == window.date, AvailabilityWindow.season_id == window.season_id,
        AvailabilityWindow.status == 'open', AvailabilityWindow.blocked == False,
        AvailabilityWindow.availability_type == ('away' if window.availability_type == 'home' else 'home'),
        Team.id != team.id, Team.age_group == team.age_group, Team.level == (level or team.level))
    if min_ranking is not None:
        query = query.filter(Team.myhockey_ranking >= min_ranking)
    if max_ranking is not None:
        query = query.filter(Team.myhockey_ranking <= max_ranking)
    matches = []
    for other in query.order_by(AvailabilityWindow.id).limit(500).all():
        home, away = (window, other) if window.availability_type == 'home' else (other, window)
        if not contains(away, home.date, home.start_time, home.end_time):
            continue
        if conflicts(db, {home.team_id, away.team_id}, home.date, home.start_time, home.end_time):
            continue
        opponent = required(db, Team, other.team_id)
        distance = get_distance(db, team.home_zip_code, opponent.home_zip_code)
        if max_distance is not None and (distance is None or distance > max_distance):
            continue
        existing = db.query(Proposal).filter(Proposal.home_availability_window_id == home.id,
            Proposal.away_availability_window_id == away.id, Proposal.status.in_(['proposed', 'accepted'])).first()
        matches.append({**row_out(opponent), 'team_id': opponent.id, 'team_name': opponent.name,
            'availability_window_id': other.id, 'entry_date': other.date, 'start_time': other.start_time,
            'end_time': other.end_time, 'availability_type': other.availability_type,
            'home_team_id': home.team_id, 'away_team_id': away.team_id,
            'home_availability_window_id': home.id, 'away_availability_window_id': away.id,
            'date': home.date, 'home_start_time': home.start_time, 'home_end_time': home.end_time,
            'distance_miles': distance, 'has_existing_proposal': existing is not None,
            'existing_proposal_id': existing.id if existing else None})
    return sorted(matches, key=lambda match: match['distance_miles'] if match['distance_miles'] is not None else float('inf'))


@router.get('/search/opponents')
def search_opponents(team_id: str, availability_window_id: str, db: DB, context: CTX,
        level: str | None = None, min_ranking: int | None = None, max_ranking: int | None = None,
        max_distance_miles: float | None = Query(None, ge=0)):
    ensure_team_access(context, required(db, Team, team_id), 'team.manage_proposals')
    window = required(db, AvailabilityWindow, availability_window_id)
    if window.team_id != team_id:
        raise HTTPException(400, "Availability does not belong to your team")
    return candidate_matches(db, window, level, min_ranking, max_ranking, max_distance_miles)


@router.get('/search/auto-matches')
def auto_matches(team_id: str, db: DB, context: CTX, season_id: str | None = None):
    ensure_team_access(context, required(db, Team, team_id), 'team.manage_proposals')
    query = db.query(AvailabilityWindow).filter(AvailabilityWindow.team_id == team_id,
        AvailabilityWindow.status == 'open', AvailabilityWindow.blocked == False,
        AvailabilityWindow.date >= date.today())
    if season_id:
        query = query.filter(AvailabilityWindow.season_id == season_id)
    results = []
    for window in query.order_by(AvailabilityWindow.date).limit(100).all():
        results.extend(candidate_matches(db, window))
    return results[:500]


@router.get('/teams/{team_id}/events')
def list_events(team_id: str, db: DB, context: CTX, season_id: str | None = None):
    ensure_team_access(context, required(db, Team, team_id), 'team.view')
    query = db.query(Event).filter(or_(Event.home_team_id == team_id, Event.away_team_id == team_id))
    if season_id:
        query = query.filter(Event.season_id == season_id)
    return [enrich(event, db) for event in query.order_by(Event.date, Event.start_time).limit(500).all()]


@router.get('/events/{event_id}')
def get_event(event_id: str, db: DB, context: CTX):
    event = required(db, Event, event_id)
    ensure_event_team_access(context, event, 'team.view')
    return enrich(event, db)


def validate_event(db, context, owner, body, exclude=None):
    team_ids = {owner}
    if body.away_team_id:
        if body.away_team_id == owner:
            raise HTTPException(400, "A team cannot play itself")
        ensure_team_access(context, required(db, Team, body.away_team_id), 'team.manage_schedule')
        team_ids.add(body.away_team_id)
    lock_teams(db, team_ids)
    venue(db, body.arena_id, body.arena_rink_id)
    assert_free(db, team_ids, body.date, body.start_time, body.end_time,
        rink_id=body.arena_rink_id, exclude_event_id=exclude)
    return season_for(db, body.date, body.season_id)


@router.post('/teams/{team_id}/events', status_code=201)
def create_event(team_id: str, body: EventCreate, db: DB, context: CTX):
    ensure_team_access(context, required(db, Team, team_id), 'team.manage_schedule')
    season_id = validate_event(db, context, team_id, body)
    values = body.model_dump()
    values['season_id'] = season_id
    event = Event(home_team_id=team_id, **values)
    db.add(event)
    db.flush()
    audit(db, context, 'event.create', event)
    commit(db)
    return enrich(event, db)


@router.put('/events/{event_id}')
def update_event(event_id: str, body: EventCreate, db: DB, context: CTX):
    event = required(db, Event, event_id)
    ensure_team_access(context, required(db, Team, event.home_team_id), 'team.manage_schedule')
    if event.proposal_id:
        raise HTTPException(409, "Use a reschedule proposal so both teams agree to the change")
    if event.status == 'cancelled':
        raise HTTPException(409, "A cancelled event cannot be edited")
    season_id = validate_event(db, context, event.home_team_id, body, event.id)
    db.refresh(event)
    for key, value in body.model_dump().items():
        setattr(event, key, value)
    event.season_id = season_id
    audit(db, context, 'event.update', event)
    commit(db)
    return enrich(event, db)


@router.patch('/events/{event_id}/cancel')
def cancel_event(event_id: str, db: DB, context: CTX):
    event = required(db, Event, event_id)
    ensure_event_team_access(context, event, 'team.manage_schedule')
    lock_teams(db, {identity for identity in [event.home_team_id, event.away_team_id] if identity})
    if event.proposal_id:
        cancel_proposal(db, required(db, Proposal, event.proposal_id))
    else:
        event.status = 'cancelled'
    notify(db, [identity for identity in [event.home_team_id, event.away_team_id] if identity],
        'Event cancelled', f'{event.date}: {event.notes or event.event_type}')
    audit(db, context, 'event.cancel', event)
    commit(db)
    return enrich(event, db)


def pair_key(home, away):
    return '|'.join(sorted([home, away]))


@router.post('/proposals', status_code=201)
def create_proposal(body: ProposalCreate, db: DB, context: CTX):
    ensure_team_access(context, required(db, Team, body.proposed_by_team_id), 'team.manage_proposals')
    home, away = required(db, Team, body.home_team_id), required(db, Team, body.away_team_id)
    if home.age_group != away.age_group:
        raise HTTPException(400, "Teams must be in the same age group")
    lock_teams(db, {home.id, away.id})
    validate_windows(db, body)
    venue(db, body.arena_id, body.arena_rink_id)
    season_for(db, body.proposed_date)
    assert_free(db, {home.id, away.id}, body.proposed_date, body.proposed_start_time, body.proposed_end_time,
        rink_id=body.arena_rink_id)
    key = pair_key(body.home_availability_window_id, body.away_availability_window_id)
    if db.query(Proposal).filter(Proposal.active_pair_key == key).first():
        raise HTTPException(409, "A proposal already exists for these availability windows")
    proposal = Proposal(**body.model_dump(), active_pair_key=pair_key(
        body.home_availability_window_id, body.away_availability_window_id))
    db.add(proposal)
    db.flush()
    notify(db, [{home.id, away.id}.difference({body.proposed_by_team_id}).pop()], 'New proposal',
        f'{home.name} vs {away.name} on {body.proposed_date}')
    audit(db, context, 'proposal.create', proposal)
    commit(db)
    return enrich(proposal, db)


@router.get('/teams/{team_id}/proposals')
def list_proposals(team_id: str, db: DB, context: CTX, season_id: str | None = None):
    ensure_team_access(context, required(db, Team, team_id), 'team.manage_proposals')
    query = db.query(Proposal).filter(or_(Proposal.home_team_id == team_id, Proposal.away_team_id == team_id))
    if season_id:
        season = required(db, Season, season_id)
        query = query.filter(Proposal.proposed_date >= season.start_date, Proposal.proposed_date <= season.end_date)
    return [enrich(proposal, db) for proposal in query.order_by(Proposal.created_at.desc()).limit(500).all()]


@router.get('/proposals/{proposal_id}/history')
def proposal_history(proposal_id: str, db: DB, context: CTX):
    proposal = required(db, Proposal, proposal_id)
    ensure_proposal_team_access(context, proposal, 'team.manage_proposals')
    root = proposal.thread_root_proposal_id or proposal.id
    return [enrich(row, db) for row in db.query(Proposal).filter(or_(Proposal.id == root,
        Proposal.thread_root_proposal_id == root)).order_by(Proposal.revision_number).all()]


def locked_proposal(db, context, proposal_id, *, counterparty=False):
    proposal = required(db, Proposal, proposal_id)
    if counterparty:
        ensure_proposal_counterparty_access(context, proposal, 'team.manage_proposals')
    else:
        ensure_proposal_team_access(context, proposal, 'team.manage_proposals')
    lock_teams(db, {proposal.home_team_id, proposal.away_team_id})
    db.refresh(proposal)
    return proposal


@router.patch('/proposals/{proposal_id}/accept')
def accept_proposal(proposal_id: str, db: DB, context: CTX):
    proposal = locked_proposal(db, context, proposal_id, counterparty=True)
    if proposal.status != 'proposed':
        raise HTTPException(409, "This proposal is no longer awaiting acceptance")
    root = proposal.thread_root_proposal_id or proposal.id
    thread = db.query(Proposal).filter(or_(Proposal.id == root, Proposal.thread_root_proposal_id == root)).all()
    event = db.query(Event).filter(Event.proposal_id.in_([item.id for item in thread]), Event.status != 'cancelled').first()
    if not proposal.parent_proposal_id:
        validate_windows(db, proposal)
    # Revision acceptance is explicit consent to its new date/time, outside the original windows.
    venue(db, proposal.arena_id, proposal.arena_rink_id)
    assert_free(db, {proposal.home_team_id, proposal.away_team_id}, proposal.proposed_date,
        proposal.proposed_start_time, proposal.proposed_end_time, rink_id=proposal.arena_rink_id,
        exclude_event_id=event.id if event else None)
    values = dict(home_team_id=proposal.home_team_id, away_team_id=proposal.away_team_id,
        event_type=proposal.event_type, date=proposal.proposed_date, start_time=proposal.proposed_start_time,
        end_time=proposal.proposed_end_time, arena_id=proposal.arena_id, arena_rink_id=proposal.arena_rink_id,
        season_id=season_for(db, proposal.proposed_date), proposal_id=proposal.id,
        home_availability_window_id=proposal.home_availability_window_id,
        away_availability_window_id=proposal.away_availability_window_id, notes=proposal.message, status='scheduled')
    if event:
        for key, value in values.items():
            setattr(event, key, value)
    else:
        event = Event(**values)
        db.add(event)
    for previous in thread:
        if previous.id != proposal.id and previous.status in ['accepted', 'proposed']:
            previous.status, previous.active_pair_key = 'superseded', None
    proposal.status, proposal.responded_at = 'accepted', datetime.now(timezone.utc)
    for identity, opponent in [(proposal.home_availability_window_id, proposal.away_team_id),
        (proposal.away_availability_window_id, proposal.home_team_id)]:
        window = required(db, AvailabilityWindow, identity)
        window.status, window.opponent_team_id = 'scheduled', opponent
    notify(db, [proposal.home_team_id, proposal.away_team_id], 'Game agreed', f'{proposal.proposed_date}: proposal accepted')
    audit(db, context, 'proposal.accept', proposal)
    commit(db)
    return enrich(proposal, db)


@router.patch('/proposals/{proposal_id}/decline')
def decline_proposal(proposal_id: str, db: DB, context: CTX):
    proposal = locked_proposal(db, context, proposal_id, counterparty=True)
    if proposal.status != 'proposed':
        raise HTTPException(409, "This proposal is no longer awaiting a response")
    proposal.status, proposal.active_pair_key = 'declined', None
    proposal.responded_at = datetime.now(timezone.utc)
    notify(db, [proposal.proposed_by_team_id], 'Proposal declined', str(proposal.proposed_date))
    audit(db, context, 'proposal.decline', proposal)
    commit(db)
    return enrich(proposal, db)


@router.patch('/proposals/{proposal_id}/cancel')
def cancel_proposal_route(proposal_id: str, db: DB, context: CTX):
    proposal = locked_proposal(db, context, proposal_id)
    if proposal.status not in ['proposed', 'accepted']:
        raise HTTPException(409, "This proposal cannot be cancelled")
    cancel_proposal(db, proposal)
    notify(db, [proposal.home_team_id, proposal.away_team_id], 'Proposal cancelled', str(proposal.proposed_date))
    audit(db, context, 'proposal.cancel', proposal)
    commit(db)
    return enrich(proposal, db)


@router.post('/proposals/{proposal_id}/reschedule', status_code=201)
def request_reschedule(proposal_id: str, body: ProposalRevision, db: DB, context: CTX):
    base = locked_proposal(db, context, proposal_id)
    if base.status not in ['proposed', 'accepted']:
        raise HTTPException(409, "Only a pending or accepted proposal can be revised")
    if body.proposed_by_team_id not in [base.home_team_id, base.away_team_id]:
        raise HTTPException(400, "Proposing team must belong to the matchup")
    ensure_team_access(context, required(db, Team, body.proposed_by_team_id), 'team.manage_proposals')
    root = base.thread_root_proposal_id or base.id
    thread = db.query(Proposal).filter(or_(Proposal.id == root, Proposal.thread_root_proposal_id == root)).all()
    if any(item.status == 'proposed' and item.id != base.id for item in thread):
        raise HTTPException(409, "Respond to the pending revision first")
    event = db.query(Event).filter(Event.proposal_id.in_([item.id for item in thread]), Event.status != 'cancelled').first()
    venue(db, body.arena_id, body.arena_rink_id)
    season_for(db, body.proposed_date)
    assert_free(db, {base.home_team_id, base.away_team_id}, body.proposed_date,
        body.proposed_start_time, body.proposed_end_time, rink_id=body.arena_rink_id,
        exclude_event_id=event.id if event else None)
    base.active_pair_key = None
    if base.status == 'proposed':
        base.status, base.response_message = 'superseded', 'Counter-proposal sent'
    db.flush()  # release the pair key before inserting its next revision
    proposal = Proposal(**body.model_dump(), home_team_id=base.home_team_id, away_team_id=base.away_team_id,
        home_availability_window_id=base.home_availability_window_id,
        away_availability_window_id=base.away_availability_window_id, event_type=base.event_type,
        thread_root_proposal_id=root, parent_proposal_id=base.id,
        revision_number=max(item.revision_number for item in thread) + 1,
        active_pair_key=pair_key(base.home_availability_window_id, base.away_availability_window_id))
    db.add(proposal)
    db.flush()
    notify(db, [base.home_team_id, base.away_team_id], 'Reschedule proposed', str(body.proposed_date))
    audit(db, context, 'proposal.revise', proposal)
    commit(db)
    return enrich(proposal, db)


@router.get('/teams/{team_id}/notifications')
def notifications(team_id: str, db: DB, context: CTX):
    ensure_team_access(context, required(db, Team, team_id), 'team.view')
    return [row_out(row) for row in db.query(Notification).filter(Notification.team_id == team_id,
        Notification.read_at.is_(None)).order_by(Notification.created_at.desc()).limit(50).all()]


@router.patch('/notifications/{notification_id}/read')
def read_notification(notification_id: str, db: DB, context: CTX):
    row = required(db, Notification, notification_id)
    ensure_team_access(context, required(db, Team, row.team_id), 'team.view')
    row.read_at = datetime.now(timezone.utc)
    commit(db)
    return row_out(row)


def activate(db, user, team_id, role):
    user.status = 'active'
    membership = db.query(TeamMembership).filter(TeamMembership.team_id == team_id, TeamMembership.user_id == user.id).first()
    if membership:
        # An invitation must never downgrade an existing team administrator.
        if membership.role != 'team_admin':
            membership.role = role
    else:
        db.add(TeamMembership(user_id=user.id, team_id=team_id, role=role))
    _current_user_cache.pop(user.auth_id, None)


def invitation_out(db, invite):
    return {**row_out(invite), 'team_name': required(db, Team, invite.target_id).name,
        'url': f'{settings.frontend_url}/invite/{invite.token}'}


@router.get('/teams/{team_id}/staff')
def staff(team_id: str, db: DB, context: CTX):
    ensure_team_access(context, required(db, Team, team_id), 'team.manage_staff')
    return [{**row_out(membership), 'email': required(db, AppUser, membership.user_id).email}
        for membership in db.query(TeamMembership).filter(TeamMembership.team_id == team_id).all()]


@router.post('/invites', status_code=201)
def create_invite(body: InviteCreate, request: Request, db: DB, context: CTX):
    ensure_team_access(context, required(db, Team, body.target_id), 'team.manage_staff')
    enforce_rate_limit(request, user_id=context.user.id, route_key='invites', rule=RateLimitRule(20, 3600))
    invite = Invite(email=body.email.lower(), target_type='team', target_id=body.target_id, role=body.role,
        token=secrets.token_urlsafe(32), invited_by_user_id=context.user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=14))
    db.add(invite)
    db.flush()
    audit(db, context, 'invite.create', invite)
    commit(db)
    result = invitation_out(db, invite)
    send_email(to_email=invite.email, subject='RinkLink team invitation',
        text_body=f'You are invited to {result["team_name"]} as {invite.role}.\n{result["url"]}')
    return result


@router.get('/invites')
def invites(db: DB, context: CTX, team_id: str):
    ensure_team_access(context, required(db, Team, team_id), 'team.manage_staff')
    return [invitation_out(db, invite) for invite in db.query(Invite).filter(Invite.target_id == team_id).order_by(Invite.created_at.desc()).limit(100).all()]


@router.post('/invites/{token}/accept')
def accept_invite(token: str, db: DB, context: CURRENT):
    invite = db.query(Invite).filter(Invite.token == token).with_for_update().first()
    if not invite:
        raise HTTPException(404, "Invitation not found")
    if invite.email.lower() != context.user.email.lower():
        raise HTTPException(403, "Sign in with the email address this invitation was sent to")
    if invite.status != 'pending' or invite.expires_at.replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc):
        raise HTTPException(409, "Invitation has expired or is no longer pending")
    required(db, Team, invite.target_id)
    activate(db, context.user, invite.target_id, invite.role)
    invite.status, invite.accepted_at = 'accepted', datetime.now(timezone.utc)
    audit(db, context, 'invite.accept', invite)
    commit(db)
    return me_out(db, context.user)


@router.delete('/invites/{invite_id}', status_code=204)
def revoke_invite(invite_id: str, db: DB, context: CTX):
    invite = required(db, Invite, invite_id)
    ensure_team_access(context, required(db, Team, invite.target_id), 'team.manage_staff')
    invite.status = 'revoked'
    audit(db, context, 'invite.revoke', invite)
    commit(db)


@router.delete('/team-memberships/{membership_id}', status_code=204)
def revoke_membership(membership_id: str, db: DB, context: CTX):
    membership = required(db, TeamMembership, membership_id)
    ensure_team_access(context, required(db, Team, membership.team_id), 'team.manage_staff')
    lock_teams(db, {membership.team_id})
    if membership.role == 'team_admin' and not context.user.is_platform_admin:
        if db.query(TeamMembership).filter(TeamMembership.team_id == membership.team_id, TeamMembership.role == 'team_admin').count() <= 1:
            raise HTTPException(409, "Keep at least one team administrator")
    user = required(db, AppUser, membership.user_id)
    _current_user_cache.pop(user.auth_id, None)
    audit(db, context, 'membership.revoke', membership)
    db.delete(membership)
    commit(db)


def access_out(db, row):
    team = db.get(Team, row.target_id) if row.target_type == 'team' else None
    return {**row_out(row), 'user_email': required(db, AppUser, row.user_id).email,
        'team_name': team.name if team else (row.details_json or {}).get('name', 'New team')}


@router.post('/access-requests', status_code=201)
def create_access_request(body: AccessRequestCreate, request: Request, db: DB, context: CURRENT):
    enforce_rate_limit(request, user_id=context.user.id, route_key='access', rule=RateLimitRule(10, 3600))
    if body.target_type == 'team':
        required(db, Team, body.target_id)
        if body.target_id in context.team_ids:
            raise HTTPException(409, "You already have access to this team")
    duplicate = db.query(AccessRequest).filter(AccessRequest.user_id == context.user.id,
        AccessRequest.target_type == body.target_type, AccessRequest.target_id == body.target_id,
        AccessRequest.status == 'pending').first()
    if duplicate:
        raise HTTPException(409, "A request is already pending")
    row = AccessRequest(user_id=context.user.id, target_type=body.target_type, target_id=body.target_id,
        notes=body.notes, details_json=body.details.model_dump() if body.details else None)
    db.add(row)
    commit(db)
    return access_out(db, row)


@router.get('/access-requests')
def access_requests(db: DB, context: CURRENT, scope: str = 'mine'):
    query = db.query(AccessRequest)
    if scope == 'mine':
        query = query.filter(AccessRequest.user_id == context.user.id)
    elif context.user.is_platform_admin:
        pass
    else:
        ids = [identity for identity, role in context.team_roles.items() if role == 'team_admin']
        query = query.filter(AccessRequest.target_type == 'team', AccessRequest.target_id.in_(ids))
    return [access_out(db, row) for row in query.order_by(AccessRequest.created_at.desc()).limit(100).all()]


@router.post('/access-requests/{request_id}/{decision}')
def decide_access(request_id: str, decision: str, body: AccessDecision, db: DB, context: CTX):
    row = required(db, AccessRequest, request_id)
    if row.target_type == 'team_setup':
        ensure_capability(context, 'platform.manage')
    else:
        ensure_team_access(context, required(db, Team, row.target_id), 'team.manage_staff')
    row = db.query(AccessRequest).filter(AccessRequest.id == request_id).with_for_update().one()
    if row.status != 'pending' or decision not in ['approve', 'reject']:
        raise HTTPException(409, "Request is no longer pending or decision is invalid")
    if decision == 'approve':
        user = required(db, AppUser, row.user_id)
        if user.access_state != 'active' or user.auth_state != 'active':
            raise HTTPException(409, "This account is disabled")
        if row.target_type == 'team_setup':
            body_team = TeamCreate(**row.details_json)
            validate_team_venue(db, body_team)
            team = Team(**body_team.model_dump())
            db.add(team)
            db.flush()
            activate(db, user, team.id, 'team_admin')
        else:
            activate(db, user, row.target_id, body.role)
    row.status = 'approved' if decision == 'approve' else 'rejected'
    row.reviewed_by_user_id, row.reviewed_at = context.user.id, datetime.now(timezone.utc)
    audit(db, context, f'access.{decision}', row, {'reason': body.reason})
    commit(db)
    return access_out(db, row)


@router.post('/me/close-account', status_code=204)
def close_account(body: AccountAction, db: DB, context: CURRENT):
    if context.user.is_platform_admin:
        raise HTTPException(409, "Platform administrators cannot close their own account")
    user = context.user
    for membership in db.query(TeamMembership).filter(TeamMembership.user_id == user.id, TeamMembership.role == 'team_admin').all():
        if db.query(TeamMembership).filter(TeamMembership.team_id == membership.team_id, TeamMembership.role == 'team_admin').count() <= 1:
            raise HTTPException(409, "Transfer team administration before closing your account")
    user.access_state, user.revoked_at = 'disabled', datetime.now(timezone.utc)
    db.query(TeamMembership).filter(TeamMembership.user_id == user.id).delete()
    db.query(Invite).filter(Invite.email == user.email, Invite.status == 'pending').update({'status': 'revoked'})
    audit(db, context, 'account.close', user, {'reason': body.reason})
    _current_user_cache.pop(user.auth_id, None)
    commit(db)


@router.post('/contact', status_code=204)
def contact(body: ContactMessageCreate, request: Request, db: DB):
    enforce_rate_limit(request, user_id=request.client.host if request.client else 'unknown',
        route_key='contact', rule=RateLimitRule(5, 3600))
    emails = db.query(AppUser.email).filter(AppUser.is_platform_admin == True, AppUser.access_state == 'active').all()
    if not emails:
        raise HTTPException(503, "Contact delivery is not configured")
    delivered = [send_email(to_email=email, subject='RinkLink contact request',
        text_body=f'{body.name} <{body.email}>\n{body.message}') for (email,) in emails]
    if not any(delivered):
        raise HTTPException(503, "Contact delivery is not configured")
