import datetime as dt
from typing import Optional

from pydantic import BaseModel


class ScheduleEntryCreate(BaseModel):
    date: dt.date
    time: Optional[dt.time] = None
    entry_type: str
    status: str = "open"
    opponent_name: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None


class ScheduleEntryUpdate(BaseModel):
    date: Optional[dt.date] = None
    time: Optional[dt.time] = None
    entry_type: Optional[str] = None
    status: Optional[str] = None
    opponent_name: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None
    blocked: Optional[bool] = None


class ScheduleEntryOut(BaseModel):
    id: str
    team_id: str
    date: dt.date
    time: Optional[dt.time]
    entry_type: str
    status: str
    opponent_name: Optional[str]
    opponent_team_id: Optional[str]
    location: Optional[str]
    notes: Optional[str]
    weekly_confirmed: bool
    blocked: bool
    created_at: dt.datetime
    updated_at: dt.datetime

    model_config = {"from_attributes": True}


class ScheduleUploadRow(BaseModel):
    date: dt.date
    time: Optional[dt.time] = None
    entry_type: str
    opponent_name: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None
    status: str = "open"


class ScheduleUploadPreview(BaseModel):
    entries: list[ScheduleUploadRow]
    warnings: list[str] = []


class ScheduleConfirmUpload(BaseModel):
    entries: list[ScheduleUploadRow]
