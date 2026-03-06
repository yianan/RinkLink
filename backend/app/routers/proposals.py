from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import GameProposal, ScheduleEntry, Team, Association, Game, ProposalRinkPreference
from ..models.rink import IceSlot, Rink
from ..schemas import ProposalCreate, ProposalOut, ProposalRescheduleCreate

router = APIRouter(tags=["proposals"])

def _location_label_from_rink(rink: Rink) -> str:
    city_state = ", ".join([p for p in [rink.city, rink.state] if p])
    return f"{rink.name} — {city_state}" if city_state else rink.name


def _location_label_from_association(a: Association) -> str | None:
    parts: list[str] = []
    if a.home_rink_address:
        parts.append(a.home_rink_address)
    city_state = ", ".join([p for p in [a.city, a.state] if p])
    if city_state and a.zip_code:
        city_state = f"{city_state} {a.zip_code}"
    if city_state:
        parts.append(city_state)
    elif a.zip_code:
        parts.append(a.zip_code)

    if not parts:
        return None
    return f"{a.name} Home Rink — {', '.join(parts)}" if a.name else ", ".join(parts)

def _enrich(p: GameProposal, db: Session) -> ProposalOut:
    home = db.get(Team, p.home_team_id)
    away = db.get(Team, p.away_team_id)
    home_assoc = db.get(Association, home.association_id) if home else None
    away_assoc = db.get(Association, away.association_id) if away else None

    home_entry = db.get(ScheduleEntry, p.home_schedule_entry_id)
    away_entry = db.get(ScheduleEntry, p.away_schedule_entry_id)

    slot = db.get(IceSlot, p.ice_slot_id) if p.ice_slot_id else None
    rink = db.get(Rink, slot.rink_id) if slot else None
    if not rink:
        pref = db.get(ProposalRinkPreference, p.id)
        if pref:
            rink = db.get(Rink, pref.rink_id)

    out = ProposalOut.model_validate(p)
    if out.proposed_time is None:
        out.proposed_time = home_entry.time if home_entry and home_entry.time is not None else (away_entry.time if away_entry else None)
    out.home_team_name = home.name if home else None
    out.away_team_name = away.name if away else None
    out.home_team_association = home_assoc.name if home_assoc else None
    out.away_team_association = away_assoc.name if away_assoc else None

    if rink:
        out.rink_name = rink.name
        out.rink_address = rink.address
        out.rink_city = rink.city
        out.rink_state = rink.state
        out.rink_zip = rink.zip_code

    if slot:
        out.ice_slot_date = slot.date
        out.ice_slot_start_time = slot.start_time
        out.ice_slot_end_time = slot.end_time
        out.ice_slot_notes = slot.notes

    if rink:
        out.location_label = _location_label_from_rink(rink)
    elif home_entry and home_entry.location:
        out.location_label = home_entry.location
    elif away_entry and away_entry.location:
        out.location_label = away_entry.location
    elif home_assoc:
        out.location_label = _location_label_from_association(home_assoc)

    return out


@router.post("/proposals", response_model=ProposalOut, status_code=201)
def create_proposal(body: ProposalCreate, db: Session = Depends(get_db)):
    # Validate entries exist and are open
    home_entry = db.get(ScheduleEntry, body.home_schedule_entry_id)
    away_entry = db.get(ScheduleEntry, body.away_schedule_entry_id)
    if not home_entry or not away_entry:
        raise HTTPException(400, "Schedule entries not found")
    if home_entry.status != "open" or away_entry.status != "open":
        raise HTTPException(400, "One or both schedule entries are no longer open")

    existing = (
        db.query(GameProposal)
        .filter(
            (
                (GameProposal.home_schedule_entry_id == body.home_schedule_entry_id)
                & (GameProposal.away_schedule_entry_id == body.away_schedule_entry_id)
            )
            | (
                (GameProposal.home_schedule_entry_id == body.away_schedule_entry_id)
                & (GameProposal.away_schedule_entry_id == body.home_schedule_entry_id)
            )
        )
        .filter(GameProposal.status.in_(("proposed", "accepted")))
        .first()
    )
    if existing:
        raise HTTPException(409, "A proposal already exists for these schedule entries")

    data = body.model_dump()
    rink_id = data.pop("rink_id", None)
    if rink_id and data.get("ice_slot_id") is None and not db.get(Rink, rink_id):
        raise HTTPException(404, "Rink not found")

    proposal = GameProposal(**data)
    db.add(proposal)

    if rink_id and proposal.ice_slot_id is None:
        db.flush()
        db.add(ProposalRinkPreference(proposal_id=proposal.id, rink_id=rink_id))

    db.commit()
    db.refresh(proposal)
    return _enrich(proposal, db)


@router.post("/proposals/{id}/reschedule", response_model=ProposalOut, status_code=201)
def request_reschedule(id: str, body: ProposalRescheduleCreate, db: Session = Depends(get_db)):
    base = db.get(GameProposal, id)
    if not base:
        raise HTTPException(404, "Proposal not found")
    if base.status != "accepted":
        raise HTTPException(400, f"Cannot reschedule proposal with status '{base.status}'")
    if body.proposed_by_team_id not in (base.home_team_id, base.away_team_id):
        raise HTTPException(400, "Team is not part of this proposal")

    existing = (
        db.query(GameProposal)
        .filter(
            GameProposal.home_schedule_entry_id == base.home_schedule_entry_id,
            GameProposal.away_schedule_entry_id == base.away_schedule_entry_id,
            GameProposal.status == "proposed",
        )
        .first()
    )
    if existing:
        raise HTTPException(400, "A reschedule request is already pending for this game")

    requested_rink_id = body.rink_id
    if requested_rink_id and body.ice_slot_id is None and not db.get(Rink, requested_rink_id):
        raise HTTPException(404, "Rink not found")

    # Create a new proposal that reuses the same schedule entries and teams.
    proposal = GameProposal(
        home_team_id=base.home_team_id,
        away_team_id=base.away_team_id,
        home_schedule_entry_id=base.home_schedule_entry_id,
        away_schedule_entry_id=base.away_schedule_entry_id,
        proposed_date=body.proposed_date,
        proposed_time=body.proposed_time,
        status="proposed",
        proposed_by_team_id=body.proposed_by_team_id,
        ice_slot_id=body.ice_slot_id,
        message=body.message,
    )
    db.add(proposal)

    if requested_rink_id and proposal.ice_slot_id is None:
        db.flush()
        db.add(ProposalRinkPreference(proposal_id=proposal.id, rink_id=requested_rink_id))

    db.commit()
    db.refresh(proposal)
    return _enrich(proposal, db)


@router.get("/teams/{team_id}/proposals", response_model=list[ProposalOut])
def list_proposals(
    team_id: str,
    status: str | None = Query(None),
    direction: str = Query("all"),
    db: Session = Depends(get_db),
):
    if not db.get(Team, team_id):
        raise HTTPException(404, "Team not found")

    q = db.query(GameProposal)
    if direction == "incoming":
        # Proposals where this team needs to respond (they didn't propose it)
        q = q.filter(
            ((GameProposal.home_team_id == team_id) | (GameProposal.away_team_id == team_id)),
            GameProposal.proposed_by_team_id != team_id,
        )
    elif direction == "outgoing":
        q = q.filter(GameProposal.proposed_by_team_id == team_id)
    else:
        q = q.filter(
            (GameProposal.home_team_id == team_id) | (GameProposal.away_team_id == team_id)
        )

    if status:
        q = q.filter(GameProposal.status == status)

    proposals = q.order_by(GameProposal.proposed_date.asc()).all()
    return [_enrich(p, db) for p in proposals]


@router.patch("/proposals/{id}/accept", response_model=ProposalOut)
def accept_proposal(id: str, db: Session = Depends(get_db)):
    proposal = db.get(GameProposal, id)
    if not proposal:
        raise HTTPException(404, "Proposal not found")
    if proposal.status != "proposed":
        raise HTTPException(400, f"Cannot accept proposal with status '{proposal.status}'")

    proposal.status = "accepted"
    proposal.responded_at = datetime.now(timezone.utc)

    # Update schedule entries
    home_entry = db.get(ScheduleEntry, proposal.home_schedule_entry_id)
    away_entry = db.get(ScheduleEntry, proposal.away_schedule_entry_id)

    home_team = db.get(Team, proposal.home_team_id)
    away_team = db.get(Team, proposal.away_team_id)

    if home_entry:
        home_entry.status = "scheduled"
        home_entry.opponent_team_id = proposal.away_team_id
        home_entry.opponent_name = away_team.name if away_team else None
    if away_entry:
        away_entry.status = "scheduled"
        away_entry.opponent_team_id = proposal.home_team_id
        away_entry.opponent_name = home_team.name if home_team else None

    if proposal.proposed_time:
        if home_entry:
            home_entry.time = proposal.proposed_time
        if away_entry:
            away_entry.time = proposal.proposed_time
    if home_entry:
        home_entry.date = proposal.proposed_date
    if away_entry:
        away_entry.date = proposal.proposed_date

    # Keep schedule entries' location in sync with the chosen rink/slot.
    label = None
    if proposal.ice_slot_id:
        slot = db.get(IceSlot, proposal.ice_slot_id)
        rink = db.get(Rink, slot.rink_id) if slot else None
        if rink:
            label = _location_label_from_rink(rink)
    else:
        pref = db.get(ProposalRinkPreference, proposal.id)
        if pref:
            rink = db.get(Rink, pref.rink_id)
            if rink:
                label = _location_label_from_rink(rink)

    if label is None:
        home_assoc = db.get(Association, home_team.association_id) if home_team else None
        if home_assoc:
            label = _location_label_from_association(home_assoc)

    if label:
        if home_entry:
            home_entry.location = label
        if away_entry:
            away_entry.location = label

    # Mark ice slot as booked if one was attached
    # If we are rescheduling to a new slot, free the old one (best-effort).
    existing_game = (
        db.query(Game)
        .filter((Game.proposal_id == proposal.id) | (
            (Game.home_schedule_entry_id == proposal.home_schedule_entry_id)
            & (Game.away_schedule_entry_id == proposal.away_schedule_entry_id)
        ))
        .first()
    )
    if existing_game and existing_game.ice_slot_id and existing_game.ice_slot_id != proposal.ice_slot_id:
        old_slot = db.get(IceSlot, existing_game.ice_slot_id)
        if old_slot and old_slot.status == "booked":
            old_slot.status = "available"
            old_slot.booked_by_team_id = None

    if proposal.ice_slot_id:
        ice_slot = db.get(IceSlot, proposal.ice_slot_id)
        if ice_slot and ice_slot.status == "available":
            ice_slot.status = "booked"
            ice_slot.booked_by_team_id = proposal.home_team_id

    # Create a game record for scoresheet + weekly confirmation
    if existing_game:
        game_time = proposal.proposed_time
        if game_time is None and home_entry and home_entry.time is not None:
            game_time = home_entry.time
        if game_time is None and away_entry and away_entry.time is not None:
            game_time = away_entry.time

        existing_game.date = proposal.proposed_date
        existing_game.time = game_time
        existing_game.status = "scheduled"
        existing_game.ice_slot_id = proposal.ice_slot_id
        existing_game.proposal_id = proposal.id
        existing_game.home_weekly_confirmed = False
        existing_game.away_weekly_confirmed = False
    else:
        game_time = proposal.proposed_time
        if game_time is None and home_entry and home_entry.time is not None:
            game_time = home_entry.time
        if game_time is None and away_entry and away_entry.time is not None:
            game_time = away_entry.time
        db.add(Game(
            home_team_id=proposal.home_team_id,
            away_team_id=proposal.away_team_id,
            home_schedule_entry_id=proposal.home_schedule_entry_id,
            away_schedule_entry_id=proposal.away_schedule_entry_id,
            proposal_id=proposal.id,
            ice_slot_id=proposal.ice_slot_id,
            date=proposal.proposed_date,
            time=game_time,
            status="scheduled",
        ))

    db.commit()
    db.refresh(proposal)
    return _enrich(proposal, db)


@router.patch("/proposals/{id}/decline", response_model=ProposalOut)
def decline_proposal(id: str, db: Session = Depends(get_db)):
    proposal = db.get(GameProposal, id)
    if not proposal:
        raise HTTPException(404, "Proposal not found")
    if proposal.status != "proposed":
        raise HTTPException(400, f"Cannot decline proposal with status '{proposal.status}'")
    proposal.status = "declined"
    proposal.responded_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(proposal)
    return _enrich(proposal, db)


@router.patch("/proposals/{id}/cancel", response_model=ProposalOut)
def cancel_proposal(id: str, db: Session = Depends(get_db)):
    proposal = db.get(GameProposal, id)
    if not proposal:
        raise HTTPException(404, "Proposal not found")
    if proposal.status not in ("proposed", "accepted"):
        raise HTTPException(400, f"Cannot cancel proposal with status '{proposal.status}'")
    proposal.status = "cancelled"
    proposal.responded_at = datetime.now(timezone.utc)

    # If it was already accepted, cancel the game + reopen schedule entries (best-effort).
    if proposal.status == "cancelled":
        home_entry = db.get(ScheduleEntry, proposal.home_schedule_entry_id)
        away_entry = db.get(ScheduleEntry, proposal.away_schedule_entry_id)
        for se in (home_entry, away_entry):
            if not se:
                continue
            se.status = "open"
            se.opponent_team_id = None
            se.opponent_name = None
            se.weekly_confirmed = False

        g = (
            db.query(Game)
            .filter(
                (Game.proposal_id == proposal.id)
                | (
                    (Game.home_schedule_entry_id == proposal.home_schedule_entry_id)
                    & (Game.away_schedule_entry_id == proposal.away_schedule_entry_id)
                )
            )
            .first()
        )
        if g:
            g.status = "cancelled"
            g.home_weekly_confirmed = False
            g.away_weekly_confirmed = False

        slot_id = g.ice_slot_id if g and g.ice_slot_id else proposal.ice_slot_id
        if slot_id:
            slot = db.get(IceSlot, slot_id)
            if slot and slot.status == "booked":
                slot.status = "available"
                slot.booked_by_team_id = None

    db.commit()
    db.refresh(proposal)
    return _enrich(proposal, db)
