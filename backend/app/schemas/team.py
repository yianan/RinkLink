from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel
from .competition import TeamCompetitionMembershipOut


class TeamCreate(BaseModel):
    association_id: str
    name: str
    age_group: str
    level: str
    manager_name: str = ""
    manager_email: str = ""
    manager_phone: str = ""
    myhockey_ranking: int | None = None


class TeamUpdate(BaseModel):
    name: str | None = None
    age_group: str | None = None
    level: str | None = None
    manager_name: str | None = None
    manager_email: str | None = None
    manager_phone: str | None = None
    myhockey_ranking: int | None = None


class TeamOut(BaseModel):
    id: str
    association_id: str
    name: str
    age_group: str
    level: str
    manager_name: str
    manager_email: str
    manager_phone: str
    logo_url: str | None = None
    myhockey_ranking: int | None
    wins: int
    losses: int
    ties: int
    association_name: str | None = None
    primary_membership: TeamCompetitionMembershipOut | None = None
    memberships: list[TeamCompetitionMembershipOut] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
