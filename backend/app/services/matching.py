from sqlalchemy.orm import Session

from ..models import Team, ScheduleEntry, Association
from ..schemas.search import AutoMatchResult
from .distance import get_distance


def find_auto_matches(db: Session, team_id: str) -> list[AutoMatchResult]:
    """Find schedule entries from other teams that align on the same date
    where one side is home and the other is away, both open."""
    team = db.get(Team, team_id)
    if not team:
        return []

    # Get this team's open entries
    my_entries = (
        db.query(ScheduleEntry)
        .filter(ScheduleEntry.team_id == team_id, ScheduleEntry.status == "open")
        .all()
    )

    results: list[AutoMatchResult] = []
    for entry in my_entries:
        # Find opposite type on same date from other teams in same age group
        opposite_type = "away" if entry.entry_type == "home" else "home"
        matches = (
            db.query(ScheduleEntry)
            .join(Team, ScheduleEntry.team_id == Team.id)
            .filter(
                ScheduleEntry.date == entry.date,
                ScheduleEntry.entry_type == opposite_type,
                ScheduleEntry.status == "open",
                Team.id != team_id,
                Team.age_group == team.age_group,
            )
            .all()
        )

        for m in matches:
            opp_team = db.get(Team, m.team_id)
            if not opp_team:
                continue
            opp_assoc = db.get(Association, opp_team.association_id)
            my_assoc = db.get(Association, team.association_id)

            if entry.entry_type == "home":
                home_team, away_team = team, opp_team
                home_entry, away_entry = entry, m
                home_assoc, away_assoc = my_assoc, opp_assoc
            else:
                home_team, away_team = opp_team, team
                home_entry, away_entry = m, entry
                home_assoc, away_assoc = opp_assoc, my_assoc

            dist = get_distance(db, team.rink_zip, opp_team.rink_zip)

            results.append(AutoMatchResult(
                home_team_id=home_team.id,
                home_team_name=home_team.name,
                home_association_name=home_assoc.name if home_assoc else "",
                away_team_id=away_team.id,
                away_team_name=away_team.name,
                away_association_name=away_assoc.name if away_assoc else "",
                date=entry.date,
                home_entry_id=home_entry.id,
                away_entry_id=away_entry.id,
                home_time=home_entry.time,
                away_time=away_entry.time,
                distance_miles=dist,
            ))

    return results
