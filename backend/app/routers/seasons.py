from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Game, Team, Association, Season, TeamSeasonRecord
from ..schemas.season import SeasonCreate, SeasonUpdate, SeasonOut, StandingsEntry


def _season_with_game_count(db: Session, season: Season) -> dict:
    """Return a dict for SeasonOut including game_count."""
    count = db.query(func.count(Game.id)).filter(Game.season_id == season.id).scalar() or 0
    data = {c.key: getattr(season, c.key) for c in season.__table__.columns}
    data["game_count"] = count
    return data

router = APIRouter(tags=["seasons"])


@router.get("/seasons", response_model=list[SeasonOut])
def list_seasons(
    association_id: str = Query(...),
    db: Session = Depends(get_db),
):
    if not db.get(Association, association_id):
        raise HTTPException(404, "Association not found")
    seasons = (
        db.query(Season)
        .filter(Season.association_id == association_id)
        .order_by(Season.start_date.desc())
        .all()
    )
    return [_season_with_game_count(db, s) for s in seasons]


@router.get("/seasons/{id}", response_model=SeasonOut)
def get_season(id: str, db: Session = Depends(get_db)):
    s = db.get(Season, id)
    if not s:
        raise HTTPException(404, "Season not found")
    return _season_with_game_count(db, s)


@router.post("/seasons", response_model=SeasonOut, status_code=201)
def create_season(body: SeasonCreate, db: Session = Depends(get_db)):
    if not db.get(Association, body.association_id):
        raise HTTPException(404, "Association not found")
    if body.start_date >= body.end_date:
        raise HTTPException(400, "start_date must be before end_date")

    if body.is_active:
        db.query(Season).filter(
            Season.association_id == body.association_id,
            Season.is_active == True,  # noqa: E712
        ).update({"is_active": False})

    season = Season(**body.model_dump())
    db.add(season)
    db.commit()
    db.refresh(season)
    return _season_with_game_count(db, season)


@router.put("/seasons/{id}", response_model=SeasonOut)
def update_season(id: str, body: SeasonUpdate, db: Session = Depends(get_db)):
    s = db.get(Season, id)
    if not s:
        raise HTTPException(404, "Season not found")

    data = body.model_dump(exclude_unset=True)

    if "start_date" in data or "end_date" in data:
        start = data.get("start_date", s.start_date)
        end = data.get("end_date", s.end_date)
        if start >= end:
            raise HTTPException(400, "start_date must be before end_date")

    if data.get("is_active"):
        db.query(Season).filter(
            Season.association_id == s.association_id,
            Season.is_active == True,  # noqa: E712
            Season.id != s.id,
        ).update({"is_active": False})

    for k, v in data.items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return _season_with_game_count(db, s)


@router.delete("/seasons/{id}", status_code=204)
def delete_season(id: str, db: Session = Depends(get_db)):
    s = db.get(Season, id)
    if not s:
        raise HTTPException(404, "Season not found")

    game_count = db.query(Game).filter(Game.season_id == id).count()
    if game_count > 0:
        raise HTTPException(400, "Cannot delete season with existing games")

    db.delete(s)
    db.commit()


@router.get("/seasons/{id}/standings", response_model=list[StandingsEntry])
def get_standings(
    id: str,
    age_group: str | None = Query(None),
    level: str | None = Query(None),
    db: Session = Depends(get_db),
):
    season = db.get(Season, id)
    if not season:
        raise HTTPException(404, "Season not found")

    # Get all teams in this association
    q = db.query(Team).filter(Team.association_id == season.association_id)
    if age_group:
        q = q.filter(Team.age_group == age_group)
    if level:
        q = q.filter(Team.level == level)
    teams = q.all()

    if not teams:
        # Also look for teams from other associations that played games in this season
        pass

    team_ids = [t.id for t in teams]

    # Compute standings from final games in this season
    games = (
        db.query(Game)
        .filter(
            Game.season_id == id,
            Game.status == "final",
            Game.home_score.isnot(None),
            Game.away_score.isnot(None),
        )
        .all()
    )

    # Collect all team IDs that participated
    all_team_ids = set(team_ids)
    for g in games:
        all_team_ids.add(g.home_team_id)
        all_team_ids.add(g.away_team_id)

    # Build records
    records: dict[str, dict] = {}
    for tid in all_team_ids:
        records[tid] = {"wins": 0, "losses": 0, "ties": 0}

    for g in games:
        if g.home_team_id not in all_team_ids or g.away_team_id not in all_team_ids:
            continue
        if g.home_score > g.away_score:
            records[g.home_team_id]["wins"] += 1
            records[g.away_team_id]["losses"] += 1
        elif g.home_score < g.away_score:
            records[g.home_team_id]["losses"] += 1
            records[g.away_team_id]["wins"] += 1
        else:
            records[g.home_team_id]["ties"] += 1
            records[g.away_team_id]["ties"] += 1

    # Build standings entries
    entries = []
    team_cache: dict[str, Team] = {t.id: t for t in teams}
    for tid, rec in records.items():
        team = team_cache.get(tid) or db.get(Team, tid)
        if not team:
            continue
        # Apply age_group/level filters for teams not in the initial query
        if age_group and team.age_group != age_group:
            continue
        if level and team.level != level:
            continue
        assoc = db.get(Association, team.association_id)
        gp = rec["wins"] + rec["losses"] + rec["ties"]
        if gp == 0:
            continue
        entries.append(StandingsEntry(
            team_id=tid,
            team_name=team.name,
            association_name=assoc.name if assoc else None,
            age_group=team.age_group,
            level=team.level,
            wins=rec["wins"],
            losses=rec["losses"],
            ties=rec["ties"],
            points=2 * rec["wins"] + rec["ties"],
            games_played=gp,
        ))

    entries.sort(key=lambda e: (-e.points, -e.wins))
    return entries
