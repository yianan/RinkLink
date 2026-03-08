from __future__ import annotations

import datetime as dt

from pydantic import BaseModel


class SeasonCreate(BaseModel):
    association_id: str
    name: str
    start_date: dt.date
    end_date: dt.date
    is_active: bool = False


class SeasonUpdate(BaseModel):
    name: str | None = None
    start_date: dt.date | None = None
    end_date: dt.date | None = None
    is_active: bool | None = None


class SeasonOut(BaseModel):
    id: str
    association_id: str
    name: str
    start_date: dt.date
    end_date: dt.date
    is_active: bool
    game_count: int = 0
    created_at: dt.datetime
    updated_at: dt.datetime

    model_config = {"from_attributes": True}


class TeamSeasonRecordOut(BaseModel):
    id: str
    team_id: str
    season_id: str
    wins: int
    losses: int
    ties: int
    created_at: dt.datetime
    updated_at: dt.datetime

    model_config = {"from_attributes": True}


class StandingsEntry(BaseModel):
    team_id: str
    team_name: str
    association_name: str | None = None
    age_group: str
    level: str
    wins: int
    losses: int
    ties: int
    points: int
    games_played: int
