from __future__ import annotations

from collections import defaultdict

from sqlalchemy.orm import Session, joinedload

from ..models import Competition, CompetitionDivision, Game, Team, TeamCompetitionMembership
from ..schemas import CompetitionDivisionOut, CompetitionOut, StandingsEntry, TeamCompetitionMembershipOut

COMPETITION_ORDER = {
    "league": 0,
    "state_tournament": 1,
    "district": 2,
    "showcase": 3,
    "festival": 4,
}


def _membership_to_out(membership: TeamCompetitionMembership) -> TeamCompetitionMembershipOut:
    division = membership.competition_division
    competition = division.competition if division else None
    out = TeamCompetitionMembershipOut.model_validate(membership)
    if division:
        out.division_name = division.name
        out.age_group = division.age_group
        out.level = division.level
        out.standings_enabled = division.standings_enabled
    if competition:
        out.competition_name = competition.name
        out.competition_short_name = competition.short_name
        out.competition_type = competition.competition_type
    return out


def _division_to_out(division: CompetitionDivision, member_count: int = 0) -> CompetitionDivisionOut:
    competition = division.competition
    out = CompetitionDivisionOut.model_validate(division)
    out.member_count = member_count
    if competition:
        out.competition_name = competition.name
        out.competition_short_name = competition.short_name
        out.competition_type = competition.competition_type
    return out


def list_competitions(db: Session, season_id: str | None = None) -> list[CompetitionOut]:
    competitions = (
        db.query(Competition)
        .options(joinedload(Competition.divisions))
        .all()
    )
    count_rows = (
        db.query(TeamCompetitionMembership.competition_division_id, TeamCompetitionMembership.team_id)
        .filter(TeamCompetitionMembership.season_id == season_id)
        .all()
        if season_id
        else db.query(TeamCompetitionMembership.competition_division_id, TeamCompetitionMembership.team_id).all()
    )
    counts: dict[str, int] = defaultdict(int)
    for division_id, _team_id in count_rows:
        counts[division_id] += 1

    outputs: list[CompetitionOut] = []
    for competition in sorted(competitions, key=lambda item: (COMPETITION_ORDER.get(item.competition_type, 99), item.name)):
        out = CompetitionOut.model_validate(competition)
        divisions = sorted(
            [
                division for division in competition.divisions
                if season_id is None or division.season_id == season_id
            ],
            key=lambda division: (division.sort_order, division.name),
        )
        out.divisions = [_division_to_out(division, counts.get(division.id, 0)) for division in divisions]
        outputs.append(out)
    return outputs


def list_divisions(
    db: Session,
    season_id: str,
    *,
    standings_enabled: bool | None = None,
) -> list[CompetitionDivisionOut]:
    query = (
        db.query(CompetitionDivision)
        .options(joinedload(CompetitionDivision.competition))
        .filter(CompetitionDivision.season_id == season_id)
    )
    if standings_enabled is not None:
        query = query.filter(CompetitionDivision.standings_enabled == standings_enabled)
    divisions = query.order_by(CompetitionDivision.sort_order, CompetitionDivision.name).all()
    count_rows = (
        db.query(TeamCompetitionMembership.competition_division_id, TeamCompetitionMembership.team_id)
        .filter(TeamCompetitionMembership.season_id == season_id)
        .all()
    )
    counts: dict[str, int] = defaultdict(int)
    for division_id, _team_id in count_rows:
        counts[division_id] += 1
    return [_division_to_out(division, counts.get(division.id, 0)) for division in divisions]


def list_team_memberships(db: Session, team_id: str, season_id: str | None = None) -> list[TeamCompetitionMembershipOut]:
    query = (
        db.query(TeamCompetitionMembership)
        .options(joinedload(TeamCompetitionMembership.competition_division).joinedload(CompetitionDivision.competition))
        .filter(TeamCompetitionMembership.team_id == team_id)
    )
    if season_id:
        query = query.filter(TeamCompetitionMembership.season_id == season_id)
    memberships = query.order_by(
        TeamCompetitionMembership.is_primary.desc(),
        TeamCompetitionMembership.sort_order,
        TeamCompetitionMembership.created_at,
    ).all()
    return [_membership_to_out(membership) for membership in memberships]


def memberships_for_teams(
    db: Session,
    team_ids: list[str],
    season_id: str | None = None,
) -> dict[str, list[TeamCompetitionMembershipOut]]:
    if not team_ids:
        return {}
    query = (
        db.query(TeamCompetitionMembership)
        .options(joinedload(TeamCompetitionMembership.competition_division).joinedload(CompetitionDivision.competition))
        .filter(TeamCompetitionMembership.team_id.in_(team_ids))
    )
    if season_id:
        query = query.filter(TeamCompetitionMembership.season_id == season_id)
    memberships = query.order_by(
        TeamCompetitionMembership.team_id,
        TeamCompetitionMembership.is_primary.desc(),
        TeamCompetitionMembership.sort_order,
        TeamCompetitionMembership.created_at,
    ).all()
    grouped: dict[str, list[TeamCompetitionMembershipOut]] = defaultdict(list)
    for membership in memberships:
        grouped[membership.team_id].append(_membership_to_out(membership))
    return grouped


def primary_membership_for_team(db: Session, team_id: str, season_id: str | None = None) -> TeamCompetitionMembershipOut | None:
    memberships = list_team_memberships(db, team_id, season_id)
    return memberships[0] if memberships else None


def shared_divisions_for_teams(
    db: Session,
    home_team_id: str,
    away_team_id: str,
    season_id: str | None,
    *,
    competition_type: str | None = None,
    standings_only: bool | None = None,
) -> list[CompetitionDivision]:
    if not season_id:
        return []
    home_rows = (
        db.query(TeamCompetitionMembership)
        .options(joinedload(TeamCompetitionMembership.competition_division).joinedload(CompetitionDivision.competition))
        .filter(TeamCompetitionMembership.team_id == home_team_id, TeamCompetitionMembership.season_id == season_id)
        .all()
    )
    away_rows = (
        db.query(TeamCompetitionMembership)
        .options(joinedload(TeamCompetitionMembership.competition_division).joinedload(CompetitionDivision.competition))
        .filter(TeamCompetitionMembership.team_id == away_team_id, TeamCompetitionMembership.season_id == season_id)
        .all()
    )
    away_division_ids = {row.competition_division_id for row in away_rows}
    shared: list[CompetitionDivision] = []
    for row in home_rows:
        if row.competition_division_id not in away_division_ids or not row.competition_division:
            continue
        competition = row.competition_division.competition
        if competition_type and (not competition or competition.competition_type != competition_type):
            continue
        if standings_only is not None and row.competition_division.standings_enabled != standings_only:
            continue
        shared.append(row.competition_division)
    shared.sort(key=lambda division: (division.sort_order, division.name))
    return shared


def normalize_game_competition(game: Game, db: Session) -> None:
    if not game.season_id or not game.game_type:
        game.competition_division_id = None
        game.counts_for_standings = False
        return
    competition_type = game.game_type
    if competition_type not in {"league", "district", "state_tournament", "showcase"}:
        game.competition_division_id = None
        game.counts_for_standings = False
        return
    shared = shared_divisions_for_teams(
        db,
        game.home_team_id,
        game.away_team_id,
        game.season_id,
        competition_type=competition_type,
        standings_only=True if competition_type == "league" else None,
    )
    if len(shared) == 1:
        game.competition_division_id = shared[0].id
        game.counts_for_standings = shared[0].standings_enabled
        return
    if game.competition_division_id:
        division = db.get(CompetitionDivision, game.competition_division_id)
        if division and division.season_id == game.season_id:
            competition = division.competition
            if competition and competition.competition_type == competition_type:
                game.counts_for_standings = division.standings_enabled
                return
    game.competition_division_id = None
    game.counts_for_standings = False


def division_standings(db: Session, division_id: str) -> list[StandingsEntry]:
    division = (
        db.query(CompetitionDivision)
        .options(joinedload(CompetitionDivision.competition))
        .filter(CompetitionDivision.id == division_id)
        .first()
    )
    if not division:
        return []
    memberships = (
        db.query(TeamCompetitionMembership)
        .filter(TeamCompetitionMembership.competition_division_id == division_id)
        .order_by(TeamCompetitionMembership.is_primary.desc(), TeamCompetitionMembership.sort_order)
        .all()
    )
    teams = {
        membership.team_id: db.get(Team, membership.team_id)
        for membership in memberships
    }
    records = {
        team_id: {"wins": 0, "losses": 0, "ties": 0}
        for team_id in teams
        if teams[team_id]
    }
    games = (
        db.query(Game)
        .filter(
            Game.competition_division_id == division_id,
            Game.counts_for_standings == True,  # noqa: E712
            Game.status == "final",
            Game.home_score.isnot(None),
            Game.away_score.isnot(None),
        )
        .all()
    )
    for game in games:
        if game.home_team_id not in records or game.away_team_id not in records:
            continue
        if game.home_score > game.away_score:
            records[game.home_team_id]["wins"] += 1
            records[game.away_team_id]["losses"] += 1
        elif game.home_score < game.away_score:
            records[game.home_team_id]["losses"] += 1
            records[game.away_team_id]["wins"] += 1
        else:
            records[game.home_team_id]["ties"] += 1
            records[game.away_team_id]["ties"] += 1

    entries: list[StandingsEntry] = []
    for team_id, record in records.items():
        team = teams.get(team_id)
        if not team:
            continue
        games_played = record["wins"] + record["losses"] + record["ties"]
        entries.append(
            StandingsEntry(
                team_id=team.id,
                team_name=team.name,
                association_name=team.association.name if team.association else None,
                age_group=team.age_group,
                level=team.level,
                wins=record["wins"],
                losses=record["losses"],
                ties=record["ties"],
                points=2 * record["wins"] + record["ties"],
                games_played=games_played,
            )
        )
    entries.sort(key=lambda entry: (-entry.points, -entry.wins, entry.team_name))
    return entries
