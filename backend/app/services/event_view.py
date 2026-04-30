import math
from datetime import datetime

from sqlalchemy.orm import Session

from ..models import Arena, ArenaRink, Association, CompetitionDivision, Event, IceBookingRequest, LockerRoom, Proposal, Team
from ..schemas import EventOut
from .arena_logos import arena_logo_url
from .distance import get_distance
from .team_logos import effective_team_logo_url


def _location_label(arena: Arena | None, arena_rink: ArenaRink | None) -> str | None:
    if not arena and not arena_rink:
        return None
    if arena and arena_rink:
        return f"{arena.name} > {arena_rink.name}"
    return arena.name if arena else arena_rink.name


def enrich_event(event: Event, db: Session) -> EventOut:
    home = db.get(Team, event.home_team_id)
    away = db.get(Team, event.away_team_id) if event.away_team_id else None
    home_assoc = db.get(Association, home.association_id) if home else None
    away_assoc = db.get(Association, away.association_id) if away else None
    arena = db.get(Arena, event.arena_id)
    arena_rink = db.get(ArenaRink, event.arena_rink_id)
    home_locker = db.get(LockerRoom, event.home_locker_room_id) if event.home_locker_room_id else None
    away_locker = db.get(LockerRoom, event.away_locker_room_id) if event.away_locker_room_id else None
    booking_request = db.query(IceBookingRequest).filter(IceBookingRequest.event_id == event.id).first()

    out = EventOut.model_validate(event)
    out.home_team_name = home.name if home else None
    out.away_team_name = away.name if away else None
    out.home_team_logo_url = effective_team_logo_url(home, home_assoc)
    out.away_team_logo_url = effective_team_logo_url(away, away_assoc)
    out.home_association_name = home_assoc.name if home_assoc else None
    out.away_association_name = away_assoc.name if away_assoc else None
    out.arena_name = arena.name if arena else None
    out.arena_logo_url = arena_logo_url(arena.logo_asset_id if arena else None, arena.logo_path if arena else None)
    out.arena_rink_name = arena_rink.name if arena_rink else None
    out.home_locker_room_name = home_locker.name if home_locker else None
    out.away_locker_room_name = away_locker.name if away_locker else None
    out.location_label = _location_label(arena, arena_rink)
    if event.proposal:
        out.response_message = event.proposal.response_message
        out.response_source = event.proposal.response_source
        out.responded_at = event.proposal.responded_at
    elif booking_request:
        out.response_message = booking_request.response_message
        out.response_source = "arena" if booking_request.response_message else None
        out.responded_at = booking_request.responded_at

    if event.competition_division:
        out.competition_division_id = event.competition_division.id
        out.division_name = event.competition_division.name
        if event.competition_division.competition:
            out.competition_name = event.competition_division.competition.name
            out.competition_short_name = event.competition_division.competition.short_name
    return out


def _travel_warning(previous_arena: Arena, current_arena: Arena, gap_minutes: int, db: Session) -> str | None:
    if previous_arena.id == current_arena.id:
        return None
    distance = get_distance(db, previous_arena.zip_code, current_arena.zip_code)
    if distance is None:
        if gap_minutes > 90:
            return None
        return (
            f"Travel warning: only {gap_minutes} minutes between "
            f"{previous_arena.name} and {current_arena.name}; distance is unavailable."
        )
    estimated_travel_minutes = math.ceil((distance / 35) * 60) + 30
    if gap_minutes >= estimated_travel_minutes:
        return None
    return (
        f"Travel warning: only {gap_minutes} minutes between {previous_arena.name} "
        f"and {current_arena.name} ({distance:.1f} miles, about {estimated_travel_minutes} minutes needed)."
    )


def enrich_events(events: list[Event], db: Session) -> list[EventOut]:
    if not events:
        return []

    team_ids = {event.home_team_id for event in events}
    team_ids.update(event.away_team_id for event in events if event.away_team_id)
    arena_ids = {event.arena_id for event in events}
    rink_ids = {event.arena_rink_id for event in events}
    locker_ids = {
        locker_id
        for event in events
        for locker_id in (event.home_locker_room_id, event.away_locker_room_id)
        if locker_id
    }
    proposal_ids = {event.proposal_id for event in events if event.proposal_id}
    division_ids = {event.competition_division_id for event in events if event.competition_division_id}

    teams = {team.id: team for team in db.query(Team).filter(Team.id.in_(team_ids)).all()} if team_ids else {}
    association_ids = {team.association_id for team in teams.values()}
    associations = {association.id: association for association in db.query(Association).filter(Association.id.in_(association_ids)).all()} if association_ids else {}
    arenas = {arena.id: arena for arena in db.query(Arena).filter(Arena.id.in_(arena_ids)).all()} if arena_ids else {}
    rinks = {rink.id: rink for rink in db.query(ArenaRink).filter(ArenaRink.id.in_(rink_ids)).all()} if rink_ids else {}
    lockers = {locker.id: locker for locker in db.query(LockerRoom).filter(LockerRoom.id.in_(locker_ids)).all()} if locker_ids else {}
    proposals = {proposal.id: proposal for proposal in db.query(Proposal).filter(Proposal.id.in_(proposal_ids)).all()} if proposal_ids else {}
    booking_requests = {
        request.event_id: request
        for request in db.query(IceBookingRequest).filter(IceBookingRequest.event_id.in_([event.id for event in events])).all()
        if request.event_id
    }
    divisions = {
        division.id: division
        for division in db.query(CompetitionDivision).filter(CompetitionDivision.id.in_(division_ids)).all()
    } if division_ids else {}

    outputs: list[EventOut] = []
    output_by_event_id: dict[str, EventOut] = {}
    for event in events:
        home = teams.get(event.home_team_id)
        away = teams.get(event.away_team_id) if event.away_team_id else None
        home_assoc = associations.get(home.association_id) if home else None
        away_assoc = associations.get(away.association_id) if away else None
        arena = arenas.get(event.arena_id)
        arena_rink = rinks.get(event.arena_rink_id)
        home_locker = lockers.get(event.home_locker_room_id) if event.home_locker_room_id else None
        away_locker = lockers.get(event.away_locker_room_id) if event.away_locker_room_id else None
        proposal = proposals.get(event.proposal_id) if event.proposal_id else None
        booking_request = booking_requests.get(event.id)

        out = EventOut.model_validate(event)
        out.home_team_name = home.name if home else None
        out.away_team_name = away.name if away else None
        out.home_team_logo_url = effective_team_logo_url(home, home_assoc)
        out.away_team_logo_url = effective_team_logo_url(away, away_assoc)
        out.home_association_name = home_assoc.name if home_assoc else None
        out.away_association_name = away_assoc.name if away_assoc else None
        out.arena_name = arena.name if arena else None
        out.arena_logo_url = arena_logo_url(arena.logo_asset_id if arena else None, arena.logo_path if arena else None)
        out.arena_rink_name = arena_rink.name if arena_rink else None
        out.home_locker_room_name = home_locker.name if home_locker else None
        out.away_locker_room_name = away_locker.name if away_locker else None
        out.location_label = _location_label(arena, arena_rink)
        if proposal:
            out.response_message = proposal.response_message
            out.response_source = proposal.response_source
            out.responded_at = proposal.responded_at
        elif booking_request:
            out.response_message = booking_request.response_message
            out.response_source = "arena" if booking_request.response_message else None
            out.responded_at = booking_request.responded_at

        division = divisions.get(event.competition_division_id) if event.competition_division_id else None
        if division:
            out.competition_division_id = division.id
            out.division_name = division.name
            if division.competition:
                out.competition_name = division.competition.name
                out.competition_short_name = division.competition.short_name
        outputs.append(out)
        output_by_event_id[event.id] = out

    by_team_date: dict[tuple[str, object], list[Event]] = {}
    for event in events:
        by_team_date.setdefault((event.home_team_id, event.date), []).append(event)
        if event.away_team_id:
            by_team_date.setdefault((event.away_team_id, event.date), []).append(event)
    for same_day_events in by_team_date.values():
        ordered = sorted(same_day_events, key=lambda event: event.start_time or event.end_time or datetime.min.time())
        for previous, current in zip(ordered, ordered[1:], strict=False):
            if not previous.end_time or not current.start_time:
                continue
            gap_minutes = (
                datetime.combine(current.date, current.start_time)
                - datetime.combine(previous.date, previous.end_time)
            ).total_seconds() / 60
            if gap_minutes < 0 or gap_minutes > 180:
                continue
            previous_arena = arenas.get(previous.arena_id)
            current_arena = arenas.get(current.arena_id)
            if not previous_arena or not current_arena:
                continue
            warning = _travel_warning(previous_arena, current_arena, int(gap_minutes), db)
            if warning:
                output_by_event_id[previous.id].schedule_warnings.append(warning)
                output_by_event_id[current.id].schedule_warnings.append(warning)
    return outputs
