from sqlalchemy.orm import Session

from ..models import Team, ScheduleEntry, Association, GameProposal
from ..schemas.search import AutoMatchResult
from .distance import get_distance
from .competitions import primary_membership_for_team


def find_auto_matches(db: Session, team_id: str) -> list[AutoMatchResult]:
    """Find schedule entries from other teams that align on the same date
    where one side is home and the other is away, both open, and times match exactly."""
    team = db.get(Team, team_id)
    if not team:
        return []

    # Get this team's open entries
    my_entries = (
        db.query(ScheduleEntry)
        .filter(ScheduleEntry.team_id == team_id, ScheduleEntry.status == "open", ScheduleEntry.blocked == False)  # noqa: E712
        .all()
    )

    results: list[AutoMatchResult] = []
    for entry in my_entries:
        if entry.time is None:
            continue
        # Find opposite type on same date from other teams in same age group
        opposite_type = "away" if entry.entry_type == "home" else "home"
        matches = (
            db.query(ScheduleEntry)
            .join(Team, ScheduleEntry.team_id == Team.id)
            .filter(
                ScheduleEntry.date == entry.date,
                ScheduleEntry.time == entry.time,
                ScheduleEntry.entry_type == opposite_type,
                ScheduleEntry.status == "open",
                ScheduleEntry.blocked == False,  # noqa: E712
                Team.id != team_id,
                Team.age_group == team.age_group,
            )
            .all()
        )
        if entry.season_id:
            matches = [match for match in matches if match.season_id == entry.season_id]

        for m in matches:
            opp_team = db.get(Team, m.team_id)
            if not opp_team:
                continue
            opp_assoc = db.get(Association, opp_team.association_id)
            my_assoc = db.get(Association, team.association_id)
            my_membership = primary_membership_for_team(db, team.id, entry.season_id)
            opp_membership = primary_membership_for_team(db, opp_team.id, m.season_id)

            if entry.entry_type == "home":
                home_team, away_team = team, opp_team
                home_entry, away_entry = entry, m
                home_assoc, away_assoc = my_assoc, opp_assoc
                home_membership, away_membership = my_membership, opp_membership
            else:
                home_team, away_team = opp_team, team
                home_entry, away_entry = m, entry
                home_assoc, away_assoc = opp_assoc, my_assoc
                home_membership, away_membership = opp_membership, my_membership

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
                home_primary_competition_short_name=home_membership.competition_short_name if home_membership else None,
                home_primary_division_name=home_membership.division_name if home_membership else None,
                away_primary_competition_short_name=away_membership.competition_short_name if away_membership else None,
                away_primary_division_name=away_membership.division_name if away_membership else None,
            ))

    if results:
        entry_ids: set[str] = set()
        for r in results:
            entry_ids.add(r.home_entry_id)
            entry_ids.add(r.away_entry_id)

        proposals = (
            db.query(GameProposal)
            .filter(
                GameProposal.status.in_(("proposed", "accepted")),
                GameProposal.home_schedule_entry_id.in_(entry_ids),
                GameProposal.away_schedule_entry_id.in_(entry_ids),
            )
            .order_by(GameProposal.updated_at.desc())
            .all()
        )
        existing_by_pair: dict[str, GameProposal] = {}
        for p in proposals:
            key = "|".join(sorted([p.home_schedule_entry_id, p.away_schedule_entry_id]))
            if key not in existing_by_pair:
                existing_by_pair[key] = p

        for r in results:
            key = "|".join(sorted([r.home_entry_id, r.away_entry_id]))
            p = existing_by_pair.get(key)
            if not p:
                continue
            r.has_existing_proposal = True
            r.existing_proposal_id = p.id
            r.existing_proposal_status = p.status

    return results
