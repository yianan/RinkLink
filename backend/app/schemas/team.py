from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel


class TeamCreate(BaseModel):
    association_id: str
    name: str
    age_group: str
    level: str
    manager_name: str = ""
    manager_email: str = ""
    manager_phone: str = ""
    rink_city: str = ""
    rink_state: str = ""
    rink_zip: str = ""
    myhockey_ranking: int | None = None
    wins: int = 0
    losses: int = 0
    ties: int = 0


class TeamUpdate(BaseModel):
    name: str | None = None
    age_group: str | None = None
    level: str | None = None
    manager_name: str | None = None
    manager_email: str | None = None
    manager_phone: str | None = None
    rink_city: str | None = None
    rink_state: str | None = None
    rink_zip: str | None = None
    myhockey_ranking: int | None = None
    wins: int | None = None
    losses: int | None = None
    ties: int | None = None


class TeamOut(BaseModel):
    id: str
    association_id: str
    name: str
    age_group: str
    level: str
    manager_name: str
    manager_email: str
    manager_phone: str
    rink_city: str
    rink_state: str
    rink_zip: str
    myhockey_ranking: int | None
    wins: int
    losses: int
    ties: int
    association_name: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
