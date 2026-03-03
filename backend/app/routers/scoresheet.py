from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    Game,
    Team,
    Player,
    GamePlayerStat,
    GamePenalty,
    GameGoalieStat,
    GameSignature,
)
from ..schemas.scoresheet import (
    GameScoresheetOut,
    UpsertPlayerStats,
    GamePenaltyCreate,
    UpsertGoalieStats,
    GameSignatureCreate,
    GamePlayerStatOut,
    GamePenaltyOut,
    GameGoalieStatOut,
    GameSignatureOut,
)
from ..services.game_view import enrich_game

router = APIRouter(tags=["scoresheet"])


def _require_team_in_game(team_id: str, g: Game):
    if team_id not in (g.home_team_id, g.away_team_id):
        raise HTTPException(400, "Team is not part of this game")


def _require_player_on_team(player_id: str, team_id: str, db: Session):
    p = db.get(Player, player_id)
    if not p:
        raise HTTPException(400, "Player not found")
    if p.team_id != team_id:
        raise HTTPException(400, "Player does not belong to team")


@router.get("/games/{game_id}/scoresheet", response_model=GameScoresheetOut)
def get_scoresheet(game_id: str, db: Session = Depends(get_db)):
    g = db.get(Game, game_id)
    if not g:
        raise HTTPException(404, "Game not found")

    return GameScoresheetOut(
        game=enrich_game(g, db),
        player_stats=db.query(GamePlayerStat).filter(GamePlayerStat.game_id == game_id).all(),
        penalties=db.query(GamePenalty).filter(GamePenalty.game_id == game_id).all(),
        goalie_stats=db.query(GameGoalieStat).filter(GameGoalieStat.game_id == game_id).all(),
        signatures=db.query(GameSignature).filter(GameSignature.game_id == game_id).all(),
    )


@router.put("/games/{game_id}/player-stats", response_model=list[GamePlayerStatOut])
def upsert_player_stats(game_id: str, body: UpsertPlayerStats, db: Session = Depends(get_db)):
    g = db.get(Game, game_id)
    if not g:
        raise HTTPException(404, "Game not found")

    for s in body.stats:
        _require_team_in_game(s.team_id, g)
        _require_player_on_team(s.player_id, s.team_id, db)

        existing = (
            db.query(GamePlayerStat)
            .filter(GamePlayerStat.game_id == game_id, GamePlayerStat.player_id == s.player_id)
            .first()
        )
        if existing:
            existing.team_id = s.team_id
            existing.goals = s.goals
            existing.assists = s.assists
            existing.shots_on_goal = s.shots_on_goal
        else:
            db.add(GamePlayerStat(
                game_id=game_id,
                team_id=s.team_id,
                player_id=s.player_id,
                goals=s.goals,
                assists=s.assists,
                shots_on_goal=s.shots_on_goal,
            ))

    db.commit()
    return db.query(GamePlayerStat).filter(GamePlayerStat.game_id == game_id).all()


@router.get("/games/{game_id}/penalties", response_model=list[GamePenaltyOut])
def list_penalties(game_id: str, db: Session = Depends(get_db)):
    if not db.get(Game, game_id):
        raise HTTPException(404, "Game not found")
    return db.query(GamePenalty).filter(GamePenalty.game_id == game_id).order_by(GamePenalty.created_at).all()


@router.post("/games/{game_id}/penalties", response_model=GamePenaltyOut, status_code=201)
def create_penalty(game_id: str, body: GamePenaltyCreate, db: Session = Depends(get_db)):
    g = db.get(Game, game_id)
    if not g:
        raise HTTPException(404, "Game not found")
    _require_team_in_game(body.team_id, g)
    if body.player_id:
        _require_player_on_team(body.player_id, body.team_id, db)

    p = GamePenalty(
        game_id=game_id,
        team_id=body.team_id,
        player_id=body.player_id,
        penalty_type=body.penalty_type,
        minutes=body.minutes,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@router.delete("/game-penalties/{id}", status_code=204)
def delete_penalty(id: str, db: Session = Depends(get_db)):
    p = db.get(GamePenalty, id)
    if not p:
        raise HTTPException(404, "Penalty not found")
    db.delete(p)
    db.commit()


@router.put("/games/{game_id}/goalie-stats", response_model=list[GameGoalieStatOut])
def upsert_goalie_stats(game_id: str, body: UpsertGoalieStats, db: Session = Depends(get_db)):
    g = db.get(Game, game_id)
    if not g:
        raise HTTPException(404, "Game not found")

    for s in body.stats:
        _require_team_in_game(s.team_id, g)
        _require_player_on_team(s.player_id, s.team_id, db)

        existing = (
            db.query(GameGoalieStat)
            .filter(GameGoalieStat.game_id == game_id, GameGoalieStat.player_id == s.player_id)
            .first()
        )
        if existing:
            existing.team_id = s.team_id
            existing.saves = s.saves
            existing.shootout_shots = s.shootout_shots
            existing.shootout_saves = s.shootout_saves
        else:
            db.add(GameGoalieStat(
                game_id=game_id,
                team_id=s.team_id,
                player_id=s.player_id,
                saves=s.saves,
                shootout_shots=s.shootout_shots,
                shootout_saves=s.shootout_saves,
            ))

    db.commit()
    return db.query(GameGoalieStat).filter(GameGoalieStat.game_id == game_id).all()


@router.get("/games/{game_id}/signatures", response_model=list[GameSignatureOut])
def list_signatures(game_id: str, db: Session = Depends(get_db)):
    if not db.get(Game, game_id):
        raise HTTPException(404, "Game not found")
    return db.query(GameSignature).filter(GameSignature.game_id == game_id).order_by(GameSignature.created_at).all()


@router.post("/games/{game_id}/signatures", response_model=GameSignatureOut, status_code=201)
def sign(game_id: str, body: GameSignatureCreate, db: Session = Depends(get_db)):
    g = db.get(Game, game_id)
    if not g:
        raise HTTPException(404, "Game not found")

    if body.team_id:
        _require_team_in_game(body.team_id, g)

    existing = (
        db.query(GameSignature)
        .filter(GameSignature.game_id == game_id, GameSignature.role == body.role)
        .first()
    )
    if existing:
        existing.signer_name = body.signer_name
        from datetime import datetime, timezone

        existing.signed_at = datetime.now(timezone.utc)
        existing.team_id = body.team_id
        db.commit()
        db.refresh(existing)
        return existing

    s = GameSignature(game_id=game_id, role=body.role, signer_name=body.signer_name, team_id=body.team_id)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s

