from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Association
from ..schemas import AssociationCreate, AssociationUpdate, AssociationOut

router = APIRouter(tags=["associations"])


@router.get("/associations", response_model=list[AssociationOut])
def list_associations(db: Session = Depends(get_db)):
    return db.query(Association).order_by(Association.name).all()


@router.post("/associations", response_model=AssociationOut, status_code=201)
def create_association(body: AssociationCreate, db: Session = Depends(get_db)):
    assoc = Association(**body.model_dump())
    db.add(assoc)
    db.commit()
    db.refresh(assoc)
    return assoc


@router.get("/associations/{id}", response_model=AssociationOut)
def get_association(id: str, db: Session = Depends(get_db)):
    assoc = db.get(Association, id)
    if not assoc:
        raise HTTPException(404, "Association not found")
    return assoc


@router.put("/associations/{id}", response_model=AssociationOut)
def update_association(id: str, body: AssociationUpdate, db: Session = Depends(get_db)):
    assoc = db.get(Association, id)
    if not assoc:
        raise HTTPException(404, "Association not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(assoc, k, v)
    db.commit()
    db.refresh(assoc)
    return assoc


@router.delete("/associations/{id}", status_code=204)
def delete_association(id: str, db: Session = Depends(get_db)):
    assoc = db.get(Association, id)
    if not assoc:
        raise HTTPException(404, "Association not found")
    db.delete(assoc)
    db.commit()
