from __future__ import annotations

import datetime as dt

from pydantic import BaseModel


class AvailabilityWindowCreate(BaseModel):
    date: dt.date
    start_time: dt.time | None = None
    end_time: dt.time | None = None
    availability_type: str
    status: str = "open"
    notes: str | None = None
    season_id: str | None = None


class AvailabilityWindowUpdate(BaseModel):
    date: dt.date | None = None
    start_time: dt.time | None = None
    end_time: dt.time | None = None
    availability_type: str | None = None
    status: str | None = None
    notes: str | None = None
    blocked: bool | None = None


class AvailabilityWindowOut(BaseModel):
    id: str
    team_id: str
    season_id: str | None
    date: dt.date
    start_time: dt.time | None
    end_time: dt.time | None
    availability_type: str
    status: str
    blocked: bool
    opponent_team_id: str | None
    notes: str | None
    event_id: str | None = None
    created_at: dt.datetime
    updated_at: dt.datetime

    model_config = {"from_attributes": True}


class AvailabilityUploadRow(BaseModel):
    date: dt.date
    start_time: dt.time | None = None
    end_time: dt.time | None = None
    availability_type: str
    notes: str | None = None
    status: str = "open"


class AvailabilityUploadPreview(BaseModel):
    entries: list[AvailabilityUploadRow]
    warnings: list[str] = []


class AvailabilityConfirmUpload(BaseModel):
    entries: list[AvailabilityUploadRow]
