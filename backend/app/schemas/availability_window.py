from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, model_validator


def _validate_time_range(start_time: dt.time | None, end_time: dt.time | None) -> None:
    if start_time is not None and end_time is not None and end_time < start_time:
        raise ValueError("End time must be the same as or later than start time")


class AvailabilityWindowCreate(BaseModel):
    date: dt.date
    start_time: dt.time | None = None
    end_time: dt.time | None = None
    availability_type: str
    status: str = "open"
    notes: str | None = None
    season_id: str | None = None

    @model_validator(mode="after")
    def validate_time_range(self):
        _validate_time_range(self.start_time, self.end_time)
        return self


class AvailabilityWindowUpdate(BaseModel):
    date: dt.date | None = None
    start_time: dt.time | None = None
    end_time: dt.time | None = None
    availability_type: str | None = None
    status: str | None = None
    notes: str | None = None
    blocked: bool | None = None

    @model_validator(mode="after")
    def validate_time_range(self):
        if self.start_time is not None and self.end_time is not None:
            _validate_time_range(self.start_time, self.end_time)
        return self


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

    @model_validator(mode="after")
    def validate_time_range(self):
        _validate_time_range(self.start_time, self.end_time)
        return self


class AvailabilityUploadPreview(BaseModel):
    entries: list[AvailabilityUploadRow]
    warnings: list[str] = []


class AvailabilityConfirmUpload(BaseModel):
    entries: list[AvailabilityUploadRow]
