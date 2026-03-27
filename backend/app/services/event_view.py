from sqlalchemy.orm import Session

from ..models import Arena, ArenaRink, Association, Event, LockerRoom, Team
from ..schemas import EventOut
from .arena_logos import arena_logo_url
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

    out = EventOut.model_validate(event)
    out.home_team_name = home.name if home else None
    out.away_team_name = away.name if away else None
    out.home_team_logo_url = effective_team_logo_url(home, home_assoc)
    out.away_team_logo_url = effective_team_logo_url(away, away_assoc)
    out.home_association_name = home_assoc.name if home_assoc else None
    out.away_association_name = away_assoc.name if away_assoc else None
    out.arena_name = arena.name if arena else None
    out.arena_logo_url = arena_logo_url(arena.logo_path if arena else None)
    out.arena_rink_name = arena_rink.name if arena_rink else None
    out.home_locker_room_name = home_locker.name if home_locker else None
    out.away_locker_room_name = away_locker.name if away_locker else None
    out.location_label = _location_label(arena, arena_rink)

    if event.competition_division:
        out.competition_division_id = event.competition_division.id
        out.division_name = event.competition_division.name
        if event.competition_division.competition:
            out.competition_name = event.competition_division.competition.name
            out.competition_short_name = event.competition_division.competition.short_name
    return out
