from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Team, Association
from ..schemas import TeamCreate, TeamUpdate, TeamOut

router = APIRouter(tags=["teams"])


def _enrich(team: Team, db: Session) -> TeamOut:
    assoc = db.get(Association, team.association_id)
    out = TeamOut.model_validate(team)
    out.association_name = assoc.name if assoc else None
    return out


@router.get("/teams", response_model=list[TeamOut])
def list_teams(
    association_id: str | None = Query(None),
    age_group: str | None = Query(None),
    level: str | None = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(Team)
    if association_id:
        q = q.filter(Team.association_id == association_id)
    if age_group:
        q = q.filter(Team.age_group == age_group)
    if level:
        q = q.filter(Team.level == level)
    teams = q.order_by(Team.name).all()
    return [_enrich(t, db) for t in teams]


@router.post("/teams", response_model=TeamOut, status_code=201)
def create_team(body: TeamCreate, db: Session = Depends(get_db)):
    if not db.get(Association, body.association_id):
        raise HTTPException(400, "Association not found")
    team = Team(**body.model_dump())
    db.add(team)
    db.commit()
    db.refresh(team)
    return _enrich(team, db)


@router.get("/teams/{id}", response_model=TeamOut)
def get_team(id: str, db: Session = Depends(get_db)):
    team = db.get(Team, id)
    if not team:
        raise HTTPException(404, "Team not found")
    return _enrich(team, db)


@router.put("/teams/{id}", response_model=TeamOut)
def update_team(id: str, body: TeamUpdate, db: Session = Depends(get_db)):
    team = db.get(Team, id)
    if not team:
        raise HTTPException(404, "Team not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(team, k, v)
    db.commit()
    db.refresh(team)
    return _enrich(team, db)


@router.delete("/teams/{id}", status_code=204)
def delete_team(id: str, db: Session = Depends(get_db)):
    team = db.get(Team, id)
    if not team:
        raise HTTPException(404, "Team not found")
    db.delete(team)
    db.commit()
