from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Association
from ..schemas import AssociationCreate, AssociationUpdate, AssociationOut
from ..services.association_logos import (
    association_logo_file_path,
    association_logo_url,
    delete_association_logo_if_unused,
    save_association_logo_upload,
)

router = APIRouter(tags=["associations"])


def _association_out(association: Association) -> AssociationOut:
    out = AssociationOut.model_validate(association)
    out.logo_url = association_logo_url(association.logo_path)
    return out


@router.get("/association-logos/{filename}", include_in_schema=False)
def get_association_logo(filename: str):
    return FileResponse(association_logo_file_path(filename))


@router.get("/associations", response_model=list[AssociationOut])
def list_associations(db: Session = Depends(get_db)):
    return [_association_out(association) for association in db.query(Association).order_by(Association.name).all()]


@router.post("/associations", response_model=AssociationOut, status_code=201)
def create_association(body: AssociationCreate, db: Session = Depends(get_db)):
    assoc = Association(**body.model_dump())
    db.add(assoc)
    db.commit()
    db.refresh(assoc)
    return _association_out(assoc)


@router.get("/associations/{id}", response_model=AssociationOut)
def get_association(id: str, db: Session = Depends(get_db)):
    assoc = db.get(Association, id)
    if not assoc:
        raise HTTPException(404, "Association not found")
    return _association_out(assoc)


@router.put("/associations/{id}", response_model=AssociationOut)
def update_association(id: str, body: AssociationUpdate, db: Session = Depends(get_db)):
    assoc = db.get(Association, id)
    if not assoc:
        raise HTTPException(404, "Association not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(assoc, k, v)
    db.commit()
    db.refresh(assoc)
    return _association_out(assoc)


@router.post("/associations/{id}/logo", response_model=AssociationOut)
async def upload_association_logo(id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    assoc = db.get(Association, id)
    if not assoc:
        raise HTTPException(404, "Association not found")
    previous_logo_path = assoc.logo_path
    assoc.logo_path = await save_association_logo_upload(id, file)
    db.commit()
    db.refresh(assoc)
    delete_association_logo_if_unused(db, previous_logo_path, ignore_association_id=assoc.id)
    return _association_out(assoc)


@router.delete("/associations/{id}/logo", response_model=AssociationOut)
def delete_association_logo(id: str, db: Session = Depends(get_db)):
    assoc = db.get(Association, id)
    if not assoc:
        raise HTTPException(404, "Association not found")
    previous_logo_path = assoc.logo_path
    assoc.logo_path = None
    db.commit()
    db.refresh(assoc)
    delete_association_logo_if_unused(db, previous_logo_path, ignore_association_id=assoc.id)
    return _association_out(assoc)


@router.delete("/associations/{id}", status_code=204)
def delete_association(id: str, db: Session = Depends(get_db)):
    assoc = db.get(Association, id)
    if not assoc:
        raise HTTPException(404, "Association not found")
    db.delete(assoc)
    db.commit()
