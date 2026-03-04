import datetime as dt
from typing import Optional

from pydantic import BaseModel


class PracticeBookingCreate(BaseModel):
    ice_slot_id: str
    notes: Optional[str] = None


class PracticeBookingOut(BaseModel):
    id: str
    team_id: str
    ice_slot_id: str
    notes: Optional[str]
    status: str
    created_at: dt.datetime
    updated_at: dt.datetime
    # Enriched fields
    team_name: Optional[str] = None
    slot_date: Optional[dt.date] = None
    slot_start_time: Optional[dt.time] = None
    slot_end_time: Optional[dt.time] = None
    slot_notes: Optional[str] = None
    rink_id: Optional[str] = None
    rink_name: Optional[str] = None
    rink_city: Optional[str] = None
    rink_state: Optional[str] = None

    model_config = {"from_attributes": True}
