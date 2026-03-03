from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.rink import Rink, IceSlot
from ..schemas.rink import (
    RinkCreate, RinkUpdate, RinkOut,
    IceSlotCreate, IceSlotUpdate, IceSlotOut,
    IceSlotUploadPreview, IceSlotConfirmUpload,
)
from ..services.ice_slot_csv_parser import parse_ice_slot_csv

router = APIRouter(tags=["rinks"])


# --- Rink CRUD ---

@router.get("/rinks", response_model=list[RinkOut])
def list_rinks(db: Session = Depends(get_db)):
    return db.query(Rink).order_by(Rink.name).all()


@router.post("/rinks", response_model=RinkOut, status_code=201)
def create_rink(body: RinkCreate, db: Session = Depends(get_db)):
    rink = Rink(**body.model_dump())
    db.add(rink)
    db.commit()
    db.refresh(rink)
    return rink


@router.get("/rinks/{id}", response_model=RinkOut)
def get_rink(id: str, db: Session = Depends(get_db)):
    rink = db.get(Rink, id)
    if not rink:
        raise HTTPException(404, "Rink not found")
    return rink


@router.put("/rinks/{id}", response_model=RinkOut)
def update_rink(id: str, body: RinkUpdate, db: Session = Depends(get_db)):
    rink = db.get(Rink, id)
    if not rink:
        raise HTTPException(404, "Rink not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(rink, k, v)
    db.commit()
    db.refresh(rink)
    return rink


@router.delete("/rinks/{id}", status_code=204)
def delete_rink(id: str, db: Session = Depends(get_db)):
    rink = db.get(Rink, id)
    if not rink:
        raise HTTPException(404, "Rink not found")
    db.delete(rink)
    db.commit()


# --- Ice Slot endpoints ---

def _enrich_slot(slot: IceSlot, db: Session) -> IceSlotOut:
    rink = db.get(Rink, slot.rink_id)
    out = IceSlotOut.model_validate(slot)
    out.rink_name = rink.name if rink else None
    return out


@router.get("/rinks/{rink_id}/slots", response_model=list[IceSlotOut])
def list_slots(
    rink_id: str,
    status: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    db: Session = Depends(get_db),
):
    if not db.get(Rink, rink_id):
        raise HTTPException(404, "Rink not found")
    q = db.query(IceSlot).filter(IceSlot.rink_id == rink_id)
    if status:
        q = q.filter(IceSlot.status == status)
    if date_from:
        q = q.filter(IceSlot.date >= date_from)
    if date_to:
        q = q.filter(IceSlot.date <= date_to)
    slots = q.order_by(IceSlot.date, IceSlot.start_time).all()
    return [_enrich_slot(s, db) for s in slots]


@router.post("/rinks/{rink_id}/slots", response_model=IceSlotOut, status_code=201)
def create_slot(rink_id: str, body: IceSlotCreate, db: Session = Depends(get_db)):
    if not db.get(Rink, rink_id):
        raise HTTPException(404, "Rink not found")
    slot = IceSlot(rink_id=rink_id, **body.model_dump())
    db.add(slot)
    db.commit()
    db.refresh(slot)
    return _enrich_slot(slot, db)


@router.post("/rinks/{rink_id}/slots/upload", response_model=IceSlotUploadPreview)
async def upload_slots(rink_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not db.get(Rink, rink_id):
        raise HTTPException(404, "Rink not found")
    content = (await file.read()).decode("utf-8-sig")
    return parse_ice_slot_csv(content)


@router.post("/rinks/{rink_id}/slots/confirm-upload", response_model=list[IceSlotOut], status_code=201)
def confirm_upload(rink_id: str, body: IceSlotConfirmUpload, db: Session = Depends(get_db)):
    if not db.get(Rink, rink_id):
        raise HTTPException(404, "Rink not found")
    created = []
    for row in body.entries:
        slot = IceSlot(rink_id=rink_id, **row.model_dump())
        db.add(slot)
        created.append(slot)
    db.commit()
    for s in created:
        db.refresh(s)
    return [_enrich_slot(s, db) for s in created]


@router.put("/ice-slots/{id}", response_model=IceSlotOut)
def update_slot(id: str, body: IceSlotUpdate, db: Session = Depends(get_db)):
    slot = db.get(IceSlot, id)
    if not slot:
        raise HTTPException(404, "Ice slot not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(slot, k, v)
    db.commit()
    db.refresh(slot)
    return _enrich_slot(slot, db)


@router.delete("/ice-slots/{id}", status_code=204)
def delete_slot(id: str, db: Session = Depends(get_db)):
    slot = db.get(IceSlot, id)
    if not slot:
        raise HTTPException(404, "Ice slot not found")
    db.delete(slot)
    db.commit()


# --- Available slots quick lookup ---

@router.get("/rinks/{rink_id}/available-slots", response_model=list[IceSlotOut])
def available_slots(
    rink_id: str,
    date: date = Query(...),
    db: Session = Depends(get_db),
):
    if not db.get(Rink, rink_id):
        raise HTTPException(404, "Rink not found")
    slots = (
        db.query(IceSlot)
        .filter(IceSlot.rink_id == rink_id, IceSlot.date == date, IceSlot.status == "available")
        .order_by(IceSlot.start_time)
        .all()
    )
    return [_enrich_slot(s, db) for s in slots]
