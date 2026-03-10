from __future__ import annotations

from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..models import Game, Season, Team, TeamSeasonRecord


def is_recordable_game(game: Game) -> bool:
    return game.status == "final" and game.home_score is not None and game.away_score is not None


def compute_team_record(team_id: str, games: list[Game]) -> tuple[int, int, int]:
    wins = losses = ties = 0
    for game in games:
        my_score = game.home_score if game.home_team_id == team_id else game.away_score
        opp_score = game.away_score if game.home_team_id == team_id else game.home_score
        if my_score > opp_score:
            wins += 1
        elif my_score < opp_score:
            losses += 1
        else:
            ties += 1
    return wins, losses, ties


def final_games_for_team(db: Session, team_id: str) -> list[Game]:
    return (
        db.query(Game)
        .filter(
            or_(Game.home_team_id == team_id, Game.away_team_id == team_id),
            Game.status == "final",
            Game.home_score.isnot(None),
            Game.away_score.isnot(None),
        )
        .all()
    )


def final_games_for_team_in_season_window(db: Session, team_id: str, season: Season) -> list[Game]:
    return (
        db.query(Game)
        .filter(
            or_(Game.home_team_id == team_id, Game.away_team_id == team_id),
            Game.status == "final",
            Game.home_score.isnot(None),
            Game.away_score.isnot(None),
            Game.date >= season.start_date,
            Game.date <= season.end_date,
        )
        .all()
    )


def final_games_for_season_window(db: Session, season: Season, association_team_ids: list[str]) -> list[Game]:
    if not association_team_ids:
        return []
    return (
        db.query(Game)
        .filter(
            Game.status == "final",
            Game.home_score.isnot(None),
            Game.away_score.isnot(None),
            Game.date >= season.start_date,
            Game.date <= season.end_date,
            or_(Game.home_team_id.in_(association_team_ids), Game.away_team_id.in_(association_team_ids)),
        )
        .all()
    )


def recompute_team_records(db: Session, team_id: str) -> None:
    team = db.get(Team, team_id)
    if not team:
        return

    final_games = final_games_for_team(db, team_id)
    wins, losses, ties = compute_team_record(team_id, final_games)
    team.wins = wins
    team.losses = losses
    team.ties = ties

    seasons = db.query(Season).all()
    existing_records = {
        record.season_id: record
        for record in db.query(TeamSeasonRecord).filter(TeamSeasonRecord.team_id == team_id).all()
    }
    for season in seasons:
        season_games = final_games_for_team_in_season_window(db, team_id, season)
        season_wins, season_losses, season_ties = compute_team_record(team_id, season_games)
        record = existing_records.get(season.id)
        if record:
            record.wins = season_wins
            record.losses = season_losses
            record.ties = season_ties
        else:
            db.add(
                TeamSeasonRecord(
                    team_id=team_id,
                    season_id=season.id,
                    wins=season_wins,
                    losses=season_losses,
                    ties=season_ties,
                )
            )
