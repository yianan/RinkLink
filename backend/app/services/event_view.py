import math
from datetime import datetime

from sqlalchemy.orm import Session, joinedload

from ..models import Arena, ArenaRink, Association, CompetitionDivision, Event, IceBookingRequest, LockerRoom, Proposal, Team
from ..schemas import EventOut
from .arena_logos import arena_logo_url
from .distance import get_distance, get_distance_lookup
from .team_logos import effective_team_logo_url


def event_enrichment_options():
    return (
        joinedload(Event.home_team).joinedload(Team.association),
        joinedload(Event.away_team).joinedload(Team.association),
        joinedload(Event.arena),
        joinedload(Event.arena_rink),
        joinedload(Event.home_locker_room),
        joinedload(Event.away_locker_room),
        joinedload(Event.proposal),
        joinedload(Event.competition_division).joinedload(CompetitionDivision.competition),
    )


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

    booking_requests = {
        request.event_id: request
        for request in db.query(IceBookingRequest).filter(IceBookingRequest.event_id.in_([event.id for event in events])).all()
        if request.event_id
    }
    arenas = {event.arena_id: event.arena for event in events if event.arena}
    distance_lookup = get_distance_lookup(db, {arena.zip_code for arena in arenas.values()})

    outputs: list[EventOut] = []
    output_by_event_id: dict[str, EventOut] = {}
    for event in events:
        home = event.home_team
        away = event.away_team
        home_assoc = home.association if home else None
        away_assoc = away.association if away else None
        arena = event.arena
        arena_rink = event.arena_rink
        home_locker = event.home_locker_room
        away_locker = event.away_locker_room
        proposal = event.proposal
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

        division = event.competition_division
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
            previous_arena = previous.arena
            current_arena = current.arena
            if not previous_arena or not current_arena:
                continue
            distance = None
            if previous_arena.zip_code and current_arena.zip_code:
                distance_key = tuple(sorted((previous_arena.zip_code, current_arena.zip_code)))
                distance = distance_lookup.get(distance_key)
            warning = None
            if previous_arena.id != current_arena.id:
                if distance is None:
                    warning = _travel_warning(previous_arena, current_arena, int(gap_minutes), db)
                else:
                    estimated_travel_minutes = math.ceil((distance / 35) * 60) + 30
                    if int(gap_minutes) < estimated_travel_minutes:
                        warning = (
                            f"Travel warning: only {int(gap_minutes)} minutes between {previous_arena.name} "
                            f"and {current_arena.name} ({distance:.1f} miles, about {estimated_travel_minutes} minutes needed)."
                        )
            if warning:
                output_by_event_id[previous.id].schedule_warnings.append(warning)
                output_by_event_id[current.id].schedule_warnings.append(warning)
    return outputs
