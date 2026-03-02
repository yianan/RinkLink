from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel


class AssociationCreate(BaseModel):
    name: str
    home_rink_address: str = ""
    city: str = ""
    state: str = ""
    zip_code: str = ""
    league_affiliation: str | None = None


class AssociationUpdate(BaseModel):
    name: str | None = None
    home_rink_address: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None
    league_affiliation: str | None = None


class AssociationOut(BaseModel):
    id: str
    name: str
    home_rink_address: str
    city: str
    state: str
    zip_code: str
    league_affiliation: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
