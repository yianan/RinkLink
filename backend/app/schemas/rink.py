from __future__ import annotations

import datetime as dt
from typing import Optional

from pydantic import BaseModel


# --- Rink schemas ---

class RinkCreate(BaseModel):
    name: str
    address: str = ""
    city: str = ""
    state: str = ""
    zip_code: str = ""
    phone: str = ""
    contact_email: str = ""
    website: Optional[str] = None


class RinkUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    phone: Optional[str] = None
    contact_email: Optional[str] = None
    website: Optional[str] = None


class RinkOut(BaseModel):
    id: str
    name: str
    address: str
    city: str
    state: str
    zip_code: str
    phone: str
    contact_email: str
    website: Optional[str]
    created_at: dt.datetime
    updated_at: dt.datetime

    model_config = {"from_attributes": True}


# --- IceSlot schemas ---

class IceSlotCreate(BaseModel):
    date: dt.date
    start_time: dt.time
    end_time: Optional[dt.time] = None
    status: str = "available"
    notes: Optional[str] = None


class IceSlotUpdate(BaseModel):
    date: Optional[dt.date] = None
    start_time: Optional[dt.time] = None
    end_time: Optional[dt.time] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class IceSlotOut(BaseModel):
    id: str
    rink_id: str
    date: dt.date
    start_time: dt.time
    end_time: Optional[dt.time]
    status: str
    booked_by_team_id: Optional[str]
    notes: Optional[str]
    created_at: dt.datetime
    updated_at: dt.datetime
    rink_name: Optional[str] = None

    model_config = {"from_attributes": True}


# --- CSV upload schemas ---

class IceSlotUploadRow(BaseModel):
    date: dt.date
    start_time: dt.time
    end_time: Optional[dt.time] = None
    notes: Optional[str] = None


class IceSlotUploadPreview(BaseModel):
    entries: list[IceSlotUploadRow]
    warnings: list[str] = []


class IceSlotConfirmUpload(BaseModel):
    entries: list[IceSlotUploadRow]
