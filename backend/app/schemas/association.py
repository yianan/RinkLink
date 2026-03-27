from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel


class AssociationCreate(BaseModel):
    name: str
    address: str = ""
    city: str = ""
    state: str = ""
    zip_code: str = ""


class AssociationUpdate(BaseModel):
    name: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None


class AssociationOut(BaseModel):
    id: str
    name: str
    address: str
    city: str
    state: str
    zip_code: str
    logo_url: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
