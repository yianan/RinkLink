from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from ..auth.context import (
    AuthorizationContext,
    authorization_context,
    ensure_proposal_counterparty_access,
    ensure_proposal_team_access,
    ensure_team_access,
)
from ..database import get_db
from ..models import Arena, ArenaRink, AvailabilityWindow, Event, IceSlot, LockerRoom, Proposal, Team
from ..schemas import ProposalCreate, ProposalOut, ProposalRescheduleCreate
from ..services.competitions import normalize_event_competition
from ..services.event_view import enrich_event
from ..services.season_utils import resolve_season_id
from ..services.arena_logos import arena_logo_url
from ..services.proposal_lifecycle import book_slot, cancel_proposal_record, hold_slot, release_slot
from ..services.schedule_conflicts import assert_no_event_conflicts
from ..services.team_logos import effective_team_logo_url

router = APIRouter(tags=["proposals"])


PROPOSAL_LIST_OPTIONS = (
    selectinload(Proposal.home_team).selectinload(Team.association),
    selectinload(Proposal.away_team).selectinload(Team.association),
    selectinload(Proposal.arena),
    selectinload(Proposal.arena_rink),
    selectinload(Proposal.ice_slot),
    selectinload(Proposal.home_locker_room),
    selectinload(Proposal.away_locker_room),
)


def _active_pair_key(home_window_id: str, away_window_id: str) -> str:
    return "|".join(sorted([home_window_id, away_window_id]))

def _validate_venue(
    db: Session,
    *,
    arena_id: str,
    arena_rink_id: str,
    ice_slot_id: str | None,
    locker_room_ids: tuple[str | None, str | None],
    proposal_date,
    proposed_start_time,
    proposed_end_time,
):
    arena = db.get(Arena, arena_id)
    if not arena:
        raise HTTPException(404, "Arena not found")
    arena_rink = db.get(ArenaRink, arena_rink_id)
    if not arena_rink or arena_rink.arena_id != arena.id:
        raise HTTPException(400, "Arena rink does not belong to arena")
    if not ice_slot_id:
        raise HTTPException(400, "An ice slot is required to send a proposal")
    slot = db.get(IceSlot, ice_slot_id)
    if not slot or slot.arena_rink_id != arena_rink.id:
        raise HTTPException(400, "Ice slot does not belong to arena rink")
    if slot.date != proposal_date:
        raise HTTPException(400, "Ice slot date must match proposal date")
    if slot.start_time != proposed_start_time or slot.end_time != proposed_end_time:
        raise HTTPException(400, "Proposal time must match the selected ice slot")
    if slot.status != "available":
        raise HTTPException(400, "Ice slot is not available")
    for locker_room_id in locker_room_ids:
        if not locker_room_id:
            continue
        locker_room = db.get(LockerRoom, locker_room_id)
        if not locker_room or locker_room.arena_rink_id != arena_rink.id:
            raise HTTPException(400, "Locker room does not belong to arena rink")
    return arena, arena_rink, slot


def _proposal_out(proposal: Proposal, db: Session) -> ProposalOut:
    out = ProposalOut.model_validate(proposal)
    out.home_team_name = proposal.home_team.name if proposal.home_team else None
    out.away_team_name = proposal.away_team.name if proposal.away_team else None
    out.home_team_logo_url = effective_team_logo_url(proposal.home_team, proposal.home_team.association if proposal.home_team else None)
    out.away_team_logo_url = effective_team_logo_url(proposal.away_team, proposal.away_team.association if proposal.away_team else None)
    out.home_team_association = proposal.home_team.association.name if proposal.home_team and proposal.home_team.association else None
    out.away_team_association = proposal.away_team.association.name if proposal.away_team and proposal.away_team.association else None
    out.arena_name = proposal.arena.name if proposal.arena else None
    out.arena_logo_url = arena_logo_url(
        proposal.arena.logo_asset_id if proposal.arena else None,
        proposal.arena.logo_path if proposal.arena else None,
    )
    out.arena_rink_name = proposal.arena_rink.name if proposal.arena_rink else None
    out.home_locker_room_name = proposal.home_locker_room.name if proposal.home_locker_room else None
    out.away_locker_room_name = proposal.away_locker_room.name if proposal.away_locker_room else None
    if proposal.ice_slot:
        out.ice_slot_date = proposal.ice_slot.date
        out.ice_slot_start_time = proposal.ice_slot.start_time
        out.ice_slot_end_time = proposal.ice_slot.end_time
        out.ice_slot_notes = proposal.ice_slot.notes
    if proposal.arena and proposal.arena_rink:
        out.location_label = f"{proposal.arena.name} > {proposal.arena_rink.name}"
    return out


def _thread_root_id(proposal: Proposal) -> str:
    return proposal.thread_root_proposal_id or proposal.id


def _next_revision_number(db: Session, root_id: str) -> int:
    revisions = (
        db.query(Proposal.revision_number)
        .filter((Proposal.id == root_id) | (Proposal.thread_root_proposal_id == root_id))
        .all()
    )
    return max((revision for (revision,) in revisions), default=1) + 1


def _validate_windows(db: Session, home_window_id: str, away_window_id: str):
    home_window = db.get(AvailabilityWindow, home_window_id)
    away_window = db.get(AvailabilityWindow, away_window_id)
    if not home_window or not away_window:
        raise HTTPException(400, "Availability windows not found")
    if home_window.status != "open" or away_window.status != "open":
        raise HTTPException(400, "One or both availability windows are no longer open")
    return home_window, away_window


@router.post("/proposals", response_model=ProposalOut, status_code=201)
def create_proposal(
    body: ProposalCreate,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    if body.proposed_by_team_id not in {body.home_team_id, body.away_team_id}:
        raise HTTPException(400, "Proposing team must be part of the proposal")
    proposing_team = db.get(Team, body.proposed_by_team_id)
    if not proposing_team:
        raise HTTPException(404, "Proposing team not found")
    ensure_team_access(context, proposing_team, "team.manage_proposals")
    home_window, away_window = _validate_windows(db, body.home_availability_window_id, body.away_availability_window_id)
    if home_window.team_id != body.home_team_id or away_window.team_id != body.away_team_id:
        raise HTTPException(400, "Availability windows must match the selected teams")
    _, _, slot = _validate_venue(
        db,
        arena_id=body.arena_id,
        arena_rink_id=body.arena_rink_id,
        ice_slot_id=body.ice_slot_id,
        locker_room_ids=(body.home_locker_room_id, body.away_locker_room_id),
        proposal_date=body.proposed_date,
        proposed_start_time=body.proposed_start_time,
        proposed_end_time=body.proposed_end_time,
    )
    existing = (
        db.query(Proposal)
        .filter(
            (
                (Proposal.home_availability_window_id == body.home_availability_window_id)
                & (Proposal.away_availability_window_id == body.away_availability_window_id)
            )
            | (
                (Proposal.home_availability_window_id == body.away_availability_window_id)
                & (Proposal.away_availability_window_id == body.home_availability_window_id)
            )
        )
        .filter(Proposal.status.in_(("proposed", "accepted")))
        .first()
    )
    if existing:
        raise HTTPException(409, "A proposal already exists for these availability windows")
    assert_no_event_conflicts(
        db,
        team_ids={body.home_team_id, body.away_team_id},
        event_date=body.proposed_date,
        start_time=body.proposed_start_time,
        end_time=body.proposed_end_time,
        ice_slot_id=body.ice_slot_id,
    )
    proposal = Proposal(**body.model_dump(), active_pair_key=_active_pair_key(body.home_availability_window_id, body.away_availability_window_id))
    hold_slot(slot, body.home_team_id)
    db.add(proposal)
    db.commit()
    db.refresh(proposal)
    return _proposal_out(proposal, db)


@router.post("/proposals/{proposal_id}/reschedule", response_model=ProposalOut, status_code=201)
def request_reschedule(
    proposal_id: str,
    body: ProposalRescheduleCreate,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    base = db.get(Proposal, proposal_id)
    if not base:
        raise HTTPException(404, "Proposal not found")
    ensure_proposal_team_access(context, base, "team.manage_proposals")
    if base.status not in {"accepted", "proposed"}:
        raise HTTPException(400, f"Cannot reschedule proposal with status '{base.status}'")
    _, _, slot = _validate_venue(
        db,
        arena_id=body.arena_id,
        arena_rink_id=body.arena_rink_id,
        ice_slot_id=body.ice_slot_id,
        locker_room_ids=(body.home_locker_room_id, body.away_locker_room_id),
        proposal_date=body.proposed_date,
        proposed_start_time=body.proposed_start_time,
        proposed_end_time=body.proposed_end_time,
    )
    assert_no_event_conflicts(
        db,
        team_ids={base.home_team_id, base.away_team_id},
        event_date=body.proposed_date,
        start_time=body.proposed_start_time,
        end_time=body.proposed_end_time,
        ice_slot_id=body.ice_slot_id,
    )
    root_id = _thread_root_id(base)
    proposal = Proposal(
        home_team_id=base.home_team_id,
        away_team_id=base.away_team_id,
        thread_root_proposal_id=root_id,
        parent_proposal_id=base.id,
        revision_number=_next_revision_number(db, root_id),
        home_availability_window_id=base.home_availability_window_id,
        away_availability_window_id=base.away_availability_window_id,
        active_pair_key=_active_pair_key(base.home_availability_window_id, base.away_availability_window_id),
        status="proposed",
        **body.model_dump(),
    )
    if base.status == "proposed":
        base.status = "declined"
        base.active_pair_key = None
        base.response_message = "Counter-proposal sent"
        base.response_source = "team"
        base.responded_at = datetime.now(timezone.utc)
        release_slot(base.ice_slot)
    hold_slot(slot, base.home_team_id)
    db.add(proposal)
    db.commit()
    db.refresh(proposal)
    return _proposal_out(proposal, db)


@router.get("/teams/{team_id}/proposals", response_model=list[ProposalOut])
def list_proposals(
    team_id: str,
    status: str | None = Query(None),
    direction: str = Query("all"),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    response: Response = None,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    ensure_team_access(context, team, "team.manage_proposals")
    query = db.query(Proposal)
    if direction == "incoming":
        query = query.filter(
            ((Proposal.home_team_id == team_id) | (Proposal.away_team_id == team_id)),
            Proposal.proposed_by_team_id != team_id,
        )
    elif direction == "outgoing":
        query = query.filter(Proposal.proposed_by_team_id == team_id)
    else:
        query = query.filter((Proposal.home_team_id == team_id) | (Proposal.away_team_id == team_id))
    if status:
        query = query.filter(Proposal.status == status)
    if date_from:
        query = query.filter(Proposal.proposed_date >= date_from)
    if date_to:
        query = query.filter(Proposal.proposed_date <= date_to)
    total = query.count()
    if response is not None:
        response.headers["X-Total-Count"] = str(total)
        response.headers["X-Limit"] = str(limit)
        response.headers["X-Offset"] = str(offset)
    proposals = (
        query.options(*PROPOSAL_LIST_OPTIONS)
        .order_by(Proposal.proposed_date.asc(), Proposal.proposed_start_time.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [_proposal_out(proposal, db) for proposal in proposals]


@router.get("/proposals/{proposal_id}/history", response_model=list[ProposalOut])
def proposal_history(
    proposal_id: str,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    proposal = db.get(Proposal, proposal_id)
    if not proposal:
        raise HTTPException(404, "Proposal not found")
    ensure_proposal_team_access(context, proposal, "team.manage_proposals")
    root_id = _thread_root_id(proposal)
    history = (
        db.query(Proposal)
        .options(*PROPOSAL_LIST_OPTIONS)
        .filter(or_(Proposal.id == root_id, Proposal.thread_root_proposal_id == root_id))
        .order_by(Proposal.revision_number.asc(), Proposal.created_at.asc())
        .all()
    )
    return [_proposal_out(item, db) for item in history]


@router.patch("/proposals/{proposal_id}/accept", response_model=ProposalOut)
def accept_proposal(
    proposal_id: str,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    proposal = db.get(Proposal, proposal_id)
    if not proposal:
        raise HTTPException(404, "Proposal not found")
    ensure_proposal_counterparty_access(context, proposal, "team.manage_proposals")
    if proposal.status != "proposed":
        raise HTTPException(400, f"Cannot accept proposal with status '{proposal.status}'")
    proposal.status = "accepted"
    proposal.responded_at = datetime.now(timezone.utc)

    event = (
        db.query(Event)
        .filter(
            (Event.proposal_id == proposal.id)
            | (
                (Event.home_availability_window_id == proposal.home_availability_window_id)
                & (Event.away_availability_window_id == proposal.away_availability_window_id)
            )
        )
        .first()
    )
    event_payload = {
        "event_type": proposal.event_type,
        "away_team_id": proposal.away_team_id,
        "home_availability_window_id": proposal.home_availability_window_id,
        "away_availability_window_id": proposal.away_availability_window_id,
        "season_id": resolve_season_id(db, proposal.proposed_date),
        "arena_id": proposal.arena_id,
        "arena_rink_id": proposal.arena_rink_id,
        "ice_slot_id": proposal.ice_slot_id,
        "home_locker_room_id": proposal.home_locker_room_id,
        "away_locker_room_id": proposal.away_locker_room_id,
        "date": proposal.proposed_date,
        "start_time": proposal.proposed_start_time,
        "end_time": proposal.proposed_end_time,
        "notes": proposal.message,
    }
    assert_no_event_conflicts(
        db,
        team_ids={proposal.home_team_id, proposal.away_team_id},
        event_date=proposal.proposed_date,
        start_time=proposal.proposed_start_time,
        end_time=proposal.proposed_end_time,
        ice_slot_id=proposal.ice_slot_id,
        exclude_event_id=event.id if event else None,
    )
    previous_slot_id = event.ice_slot_id if event else None
    if event:
        event.away_team_id = event_payload["away_team_id"]
        event.home_availability_window_id = event_payload["home_availability_window_id"]
        event.away_availability_window_id = event_payload["away_availability_window_id"]
        event.season_id = event_payload["season_id"]
        event.arena_id = event_payload["arena_id"]
        event.arena_rink_id = event_payload["arena_rink_id"]
        event.ice_slot_id = event_payload["ice_slot_id"]
        event.home_locker_room_id = event_payload["home_locker_room_id"]
        event.away_locker_room_id = event_payload["away_locker_room_id"]
        event.date = event_payload["date"]
        event.start_time = event_payload["start_time"]
        event.end_time = event_payload["end_time"]
        event.notes = event_payload["notes"]
        event.status = "scheduled"
        event.proposal_id = proposal.id
    else:
        event = Event(home_team_id=proposal.home_team_id, proposal_id=proposal.id, status="scheduled", **event_payload)
        db.add(event)
        db.flush()
    normalize_event_competition(event, db)
    if previous_slot_id and previous_slot_id != proposal.ice_slot_id:
        release_slot(db.get(IceSlot, previous_slot_id))
    if proposal.ice_slot_id:
        book_slot(db.get(IceSlot, proposal.ice_slot_id), proposal.home_team_id)
    for window_id, opponent_team_id in (
        (proposal.home_availability_window_id, proposal.away_team_id),
        (proposal.away_availability_window_id, proposal.home_team_id),
    ):
        window = db.get(AvailabilityWindow, window_id)
        if window:
            window.status = "scheduled"
            window.opponent_team_id = opponent_team_id
    db.commit()
    db.refresh(proposal)
    return _proposal_out(proposal, db)


@router.patch("/proposals/{proposal_id}/decline", response_model=ProposalOut)
def decline_proposal(
    proposal_id: str,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    proposal = db.get(Proposal, proposal_id)
    if not proposal:
        raise HTTPException(404, "Proposal not found")
    ensure_proposal_counterparty_access(context, proposal, "team.manage_proposals")
    if proposal.status != "proposed":
        raise HTTPException(400, f"Cannot decline proposal with status '{proposal.status}'")
    proposal.status = "declined"
    proposal.active_pair_key = None
    proposal.responded_at = datetime.now(timezone.utc)
    release_slot(proposal.ice_slot)
    db.commit()
    db.refresh(proposal)
    return _proposal_out(proposal, db)


@router.patch("/proposals/{proposal_id}/cancel", response_model=ProposalOut)
def cancel_proposal(
    proposal_id: str,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    proposal = db.get(Proposal, proposal_id)
    if not proposal:
        raise HTTPException(404, "Proposal not found")
    ensure_proposal_team_access(context, proposal, "team.manage_proposals")
    cancel_proposal_record(db, proposal)
    db.commit()
    db.refresh(proposal)
    return _proposal_out(proposal, db)
