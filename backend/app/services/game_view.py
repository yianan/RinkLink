from sqlalchemy.orm import Session

from ..models import Game, Team, Association, ScheduleEntry, ProposalRinkPreference
from ..models.rink import IceSlot, Rink
from ..schemas import GameOut


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


def enrich_game(g: Game, db: Session) -> GameOut:
    home = db.get(Team, g.home_team_id)
    away = db.get(Team, g.away_team_id)
    home_assoc = db.get(Association, home.association_id) if home else None
    away_assoc = db.get(Association, away.association_id) if away else None

    rink = None
    if g.ice_slot_id:
        slot = db.get(IceSlot, g.ice_slot_id)
        if slot:
            rink = db.get(Rink, slot.rink_id)
    if not rink and g.proposal_id:
        pref = db.get(ProposalRinkPreference, g.proposal_id)
        if pref:
            rink = db.get(Rink, pref.rink_id)

    out = GameOut.model_validate(g)
    out.home_team_name = home.name if home else None
    out.away_team_name = away.name if away else None
    out.home_association_name = home_assoc.name if home_assoc else None
    out.away_association_name = away_assoc.name if away_assoc else None

    if rink:
        out.rink_name = rink.name
        out.rink_address = rink.address
        out.rink_city = rink.city
        out.rink_state = rink.state
        out.rink_zip = rink.zip_code
        out.location_label = _location_label_from_rink(rink)
    else:
        home_entry = db.get(ScheduleEntry, g.home_schedule_entry_id) if g.home_schedule_entry_id else None
        away_entry = db.get(ScheduleEntry, g.away_schedule_entry_id) if g.away_schedule_entry_id else None

        if home_entry and home_entry.location:
            out.location_label = home_entry.location
        elif away_entry and away_entry.location:
            out.location_label = away_entry.location
        elif home_assoc:
            out.location_label = _location_label_from_association(home_assoc)

    return out
