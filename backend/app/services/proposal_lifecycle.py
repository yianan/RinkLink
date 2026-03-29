from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from ..models import AvailabilityWindow, Event, IceSlot, Notification, Proposal


def hold_slot(slot: IceSlot | None, team_id: str | None) -> None:
    if not slot:
        return
    slot.status = "held"
    slot.booked_by_team_id = team_id


def release_slot(slot: IceSlot | None) -> None:
    if not slot:
        return
    slot.status = "available"
    slot.booked_by_team_id = None


def book_slot(slot: IceSlot | None, team_id: str | None) -> None:
    if not slot:
        return
    slot.status = "booked"
    slot.booked_by_team_id = team_id


def _proposal_matchup_label(proposal: Proposal) -> str:
    if proposal.home_team and proposal.away_team:
        return f"{proposal.home_team.name} vs {proposal.away_team.name}"
    if proposal.home_team:
        return proposal.home_team.name
    return "Scheduled proposal"


def _proposal_slot_time_label(proposal: Proposal) -> str:
    start = proposal.proposed_start_time.isoformat(timespec="minutes") if proposal.proposed_start_time else "Time TBD"
    end = proposal.proposed_end_time.isoformat(timespec="minutes") if proposal.proposed_end_time else None
    return f"{start}-{end}" if end else start


def notify_arena_slot_cancelled(db: Session, proposal: Proposal, response_message: str | None = None) -> None:
    venue_parts = [proposal.arena.name if proposal.arena else None, proposal.arena_rink.name if proposal.arena_rink else None]
    venue_label = " • ".join(part for part in venue_parts if part) or "Arena TBD"
    message_lines = [
        f"{_proposal_matchup_label(proposal)}",
        f"{proposal.proposed_date.isoformat()} {_proposal_slot_time_label(proposal)}",
        venue_label,
        f"Arena note: {(response_message or 'The arena cancelled this reserved slot.').strip()}",
    ]
    for team_id in {proposal.home_team_id, proposal.away_team_id}:
        db.add(
            Notification(
                team_id=team_id,
                notif_type="arena_slot_cancelled",
                title="Arena cancelled reserved slot",
                message="\n".join(message_lines),
            )
        )


def reopen_proposal_windows(db: Session, proposal: Proposal) -> None:
    for window_id in (proposal.home_availability_window_id, proposal.away_availability_window_id):
        window = db.get(AvailabilityWindow, window_id)
        if window:
            window.status = "open"
            window.opponent_team_id = None


def cancel_proposal_record(
    db: Session,
    proposal: Proposal,
    *,
    response_message: str | None = None,
    response_source: str | None = None,
    notify_teams: bool = False,
) -> Event | None:
    effective_response_message = response_message.strip() if response_message else None
    if response_source == "arena" and not effective_response_message:
        effective_response_message = "The arena cancelled this reserved slot."
    proposal.status = "cancelled"
    proposal.responded_at = datetime.now(timezone.utc)
    proposal.response_message = effective_response_message
    proposal.response_source = response_source

    event = db.query(Event).filter(Event.proposal_id == proposal.id).first()
    if event:
        event.status = "cancelled"
        if event.ice_slot_id:
            release_slot(db.get(IceSlot, event.ice_slot_id))
    else:
        release_slot(proposal.ice_slot)

    reopen_proposal_windows(db, proposal)
    if notify_teams and response_source == "arena":
        notify_arena_slot_cancelled(db, proposal, effective_response_message)
    return event
