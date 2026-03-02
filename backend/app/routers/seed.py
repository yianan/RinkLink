from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..seed.seed_data import seed_demo_data

router = APIRouter(tags=["seed"])


@router.post("/seed")
def seed(db: Session = Depends(get_db)):
    result = seed_demo_data(db)
    return {"message": "Demo data seeded", **result}
