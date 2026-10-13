import datetime as dt
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class AvailabilityWindowCreate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    date: dt.date
    start_time: dt.time | None = None
    end_time: dt.time | None = None
    availability_type: Literal['home', 'away']
    notes: str | None = Field(default=None, max_length=1000)
    season_id: str | None = None
    blocked: bool = False

    @model_validator(mode='after')
    def time_range(self):
        if any(value and value.tzinfo for value in [self.start_time, self.end_time]):
            raise ValueError('Use local times without a timezone suffix')
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValueError('End time must be later than start time')
        return self


class AvailabilityWindowUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    date: dt.date | None = None
    start_time: dt.time | None = None
    end_time: dt.time | None = None
    availability_type: Literal['home', 'away'] | None = None
    notes: str | None = Field(default=None, max_length=1000)
    season_id: str | None = None
    blocked: bool | None = None


class AvailabilityWindowOut(AvailabilityWindowCreate):
    model_config = ConfigDict(from_attributes=True)
    id: str
    team_id: str
    status: str
    event_id: str | None = None


class AvailabilityUploadRow(AvailabilityWindowCreate):
    pass


class AvailabilityUploadPreview(BaseModel):
    entries: list[AvailabilityUploadRow]
    warnings: list[str] = []


class AvailabilityConfirmUpload(BaseModel):
    entries: list[AvailabilityUploadRow] = Field(max_length=500)
