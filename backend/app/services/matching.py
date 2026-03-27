from sqlalchemy.orm import Session

from ..models import Association, AvailabilityWindow, Proposal, Team, TeamSeasonVenueAssignment
from ..schemas.search import AutoMatchResult
from .distance import get_distance
from .competitions import primary_membership_for_team
from .team_logos import effective_team_logo_url


def _team_origin_zip(db: Session, team: Team, season_id: str | None) -> str | None:
    if season_id:
        assignment = (
            db.query(TeamSeasonVenueAssignment)
            .filter(
                TeamSeasonVenueAssignment.team_id == team.id,
                TeamSeasonVenueAssignment.season_id == season_id,
            )
            .first()
        )
        if assignment and assignment.arena and assignment.arena.zip_code:
            return assignment.arena.zip_code
    assoc = db.get(Association, team.association_id)
    return assoc.zip_code if assoc else None


def find_auto_matches(db: Session, team_id: str) -> list[AutoMatchResult]:
    team = db.get(Team, team_id)
    if not team:
        return []

    my_windows = (
        db.query(AvailabilityWindow)
        .filter(
            AvailabilityWindow.team_id == team_id,
            AvailabilityWindow.status == "open",
            AvailabilityWindow.blocked == False,  # noqa: E712
        )
        .all()
    )

    results: list[AutoMatchResult] = []
    for window in my_windows:
        if window.start_time is None:
            continue
        opposite_type = "away" if window.availability_type == "home" else "home"
        matches = (
            db.query(AvailabilityWindow)
            .join(Team, AvailabilityWindow.team_id == Team.id)
            .filter(
                AvailabilityWindow.date == window.date,
                AvailabilityWindow.start_time == window.start_time,
                AvailabilityWindow.availability_type == opposite_type,
                AvailabilityWindow.status == "open",
                AvailabilityWindow.blocked == False,  # noqa: E712
                Team.id != team_id,
                Team.age_group == team.age_group,
            )
            .all()
        )
        if window.season_id:
            matches = [match for match in matches if match.season_id == window.season_id]

        for match in matches:
            opp_team = db.get(Team, match.team_id)
            if not opp_team:
                continue
            my_assoc = db.get(Association, team.association_id)
            opp_assoc = db.get(Association, opp_team.association_id)
            my_membership = primary_membership_for_team(db, team.id, window.season_id)
            opp_membership = primary_membership_for_team(db, opp_team.id, match.season_id)
            dist = get_distance(db, _team_origin_zip(db, team, window.season_id), _team_origin_zip(db, opp_team, match.season_id))

            if window.availability_type == "home":
                home_team, away_team = team, opp_team
                home_window, away_window = window, match
                home_assoc, away_assoc = my_assoc, opp_assoc
                home_membership, away_membership = my_membership, opp_membership
            else:
                home_team, away_team = opp_team, team
                home_window, away_window = match, window
                home_assoc, away_assoc = opp_assoc, my_assoc
                home_membership, away_membership = opp_membership, my_membership

            results.append(
                AutoMatchResult(
                    home_team_id=home_team.id,
                    home_team_name=home_team.name,
                    home_team_logo_url=effective_team_logo_url(home_team, home_assoc),
                    home_association_name=home_assoc.name if home_assoc else "",
                    away_team_id=away_team.id,
                    away_team_name=away_team.name,
                    away_team_logo_url=effective_team_logo_url(away_team, away_assoc),
                    away_association_name=away_assoc.name if away_assoc else "",
                    date=window.date,
                    home_availability_window_id=home_window.id,
                    away_availability_window_id=away_window.id,
                    home_start_time=home_window.start_time,
                    home_end_time=home_window.end_time,
                    away_start_time=away_window.start_time,
                    away_end_time=away_window.end_time,
                    distance_miles=dist,
                    home_primary_competition_short_name=home_membership.competition_short_name if home_membership else None,
                    home_primary_division_name=home_membership.division_name if home_membership else None,
                    away_primary_competition_short_name=away_membership.competition_short_name if away_membership else None,
                    away_primary_division_name=away_membership.division_name if away_membership else None,
                )
            )

    if results:
        window_ids: set[str] = set()
        for result in results:
            window_ids.add(result.home_availability_window_id)
            window_ids.add(result.away_availability_window_id)
        proposals = (
            db.query(Proposal)
            .filter(
                Proposal.status.in_(("proposed", "accepted")),
                Proposal.home_availability_window_id.in_(window_ids),
                Proposal.away_availability_window_id.in_(window_ids),
            )
            .order_by(Proposal.updated_at.desc())
            .all()
        )
        existing_by_pair: dict[str, Proposal] = {}
        for proposal in proposals:
            key = "|".join(sorted([proposal.home_availability_window_id, proposal.away_availability_window_id]))
            existing_by_pair.setdefault(key, proposal)

        for result in results:
            key = "|".join(sorted([result.home_availability_window_id, result.away_availability_window_id]))
            existing = existing_by_pair.get(key)
            if existing:
                result.has_existing_proposal = True
                result.existing_proposal_id = existing.id
                result.existing_proposal_status = existing.status

    return results
