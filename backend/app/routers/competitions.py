from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import CompetitionDivision, Team
from ..schemas import CompetitionDivisionOut, CompetitionOut, StandingsEntry, TeamCompetitionMembershipOut
from ..services.competitions import division_standings, list_competitions, list_divisions, list_team_memberships
from ..services.season_utils import ensure_standard_seasons

router = APIRouter(tags=["competitions"])


@router.get("/competitions", response_model=list[CompetitionOut])
def get_competitions(
    season_id: str | None = Query(None),
    db: Session = Depends(get_db),
):
    ensure_standard_seasons(db)
    return list_competitions(db, season_id)


@router.get("/competition-divisions", response_model=list[CompetitionDivisionOut])
def get_competition_divisions(
    season_id: str = Query(...),
    standings_enabled: bool | None = Query(None),
    db: Session = Depends(get_db),
):
    ensure_standard_seasons(db)
    return list_divisions(db, season_id, standings_enabled=standings_enabled)


@router.get("/teams/{team_id}/competition-memberships", response_model=list[TeamCompetitionMembershipOut])
def get_team_competition_memberships(
    team_id: str,
    season_id: str | None = Query(None),
    db: Session = Depends(get_db),
):
    if not db.get(Team, team_id):
        raise HTTPException(404, "Team not found")
    ensure_standard_seasons(db)
    return list_team_memberships(db, team_id, season_id)


@router.get("/competition-divisions/{division_id}", response_model=CompetitionDivisionOut)
def get_competition_division(division_id: str, db: Session = Depends(get_db)):
    division = db.get(CompetitionDivision, division_id)
    if not division:
        raise HTTPException(404, "Competition division not found")
    divisions = list_divisions(db, division.season_id, standings_enabled=None)
    for item in divisions:
        if item.id == division_id:
            return item
    raise HTTPException(404, "Competition division not found")


@router.get("/competition-divisions/{division_id}/standings", response_model=list[StandingsEntry])
def get_competition_division_standings(division_id: str, db: Session = Depends(get_db)):
    division = db.get(CompetitionDivision, division_id)
    if not division:
        raise HTTPException(404, "Competition division not found")
    return division_standings(db, division_id)
