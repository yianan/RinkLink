from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import GameProposal, ScheduleEntry, Team, Association
from ..models.rink import IceSlot
from ..schemas import ProposalCreate, ProposalOut

router = APIRouter(tags=["proposals"])


def _enrich(p: GameProposal, db: Session) -> ProposalOut:
    home = db.get(Team, p.home_team_id)
    away = db.get(Team, p.away_team_id)
    home_assoc = db.get(Association, home.association_id) if home else None
    away_assoc = db.get(Association, away.association_id) if away else None
    out = ProposalOut.model_validate(p)
    out.home_team_name = home.name if home else None
    out.away_team_name = away.name if away else None
    out.home_team_association = home_assoc.name if home_assoc else None
    out.away_team_association = away_assoc.name if away_assoc else None
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

    proposal = GameProposal(**body.model_dump())
    db.add(proposal)
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

    proposals = q.order_by(GameProposal.created_at.desc()).all()
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

    # Mark ice slot as booked if one was attached
    if proposal.ice_slot_id:
        ice_slot = db.get(IceSlot, proposal.ice_slot_id)
        if ice_slot and ice_slot.status == "available":
            ice_slot.status = "booked"
            ice_slot.booked_by_team_id = proposal.home_team_id

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
    if proposal.status != "proposed":
        raise HTTPException(400, f"Cannot cancel proposal with status '{proposal.status}'")
    proposal.status = "cancelled"
    proposal.responded_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(proposal)
    return _enrich(proposal, db)
