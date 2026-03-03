from __future__ import annotations

import datetime as dt

from pydantic import BaseModel


class PlayerCreate(BaseModel):
    first_name: str
    last_name: str
    jersey_number: int | None = None
    position: str | None = None


class PlayerUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    jersey_number: int | None = None
    position: str | None = None


class PlayerOut(BaseModel):
    id: str
    team_id: str
    first_name: str
    last_name: str
    jersey_number: int | None
    position: str | None
    created_at: dt.datetime
    updated_at: dt.datetime

    model_config = {"from_attributes": True}


class PlayerUploadRow(BaseModel):
    first_name: str
    last_name: str
    jersey_number: int | None = None
    position: str | None = None


class PlayerUploadPreview(BaseModel):
    entries: list[PlayerUploadRow]
    warnings: list[str]


class PlayerConfirmUpload(BaseModel):
    entries: list[PlayerUploadRow]
    replace_existing: bool = False

