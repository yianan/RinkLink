from __future__ import annotations

import datetime as dt

from pydantic import BaseModel


class CompetitionDivisionOut(BaseModel):
    id: str
    competition_id: str
    season_id: str
    name: str
    age_group: str
    level: str
    standings_enabled: bool
    sort_order: int
    notes: str | None
    created_at: dt.datetime
    updated_at: dt.datetime
    competition_name: str | None = None
    competition_short_name: str | None = None
    competition_type: str | None = None
    member_count: int = 0

    model_config = {"from_attributes": True}


class TeamCompetitionMembershipOut(BaseModel):
    id: str
    team_id: str
    season_id: str
    competition_division_id: str
    membership_role: str
    is_primary: bool
    sort_order: int
    created_at: dt.datetime
    updated_at: dt.datetime
    competition_name: str | None = None
    competition_short_name: str | None = None
    competition_type: str | None = None
    division_name: str | None = None
    age_group: str | None = None
    level: str | None = None
    standings_enabled: bool = False

    model_config = {"from_attributes": True}


class CompetitionOut(BaseModel):
    id: str
    name: str
    short_name: str
    governing_body: str
    competition_type: str
    region: str
    website: str | None
    notes: str | None
    created_at: dt.datetime
    updated_at: dt.datetime
    divisions: list[CompetitionDivisionOut] = []

    model_config = {"from_attributes": True}
