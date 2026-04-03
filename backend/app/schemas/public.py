from __future__ import annotations

import datetime as dt

from pydantic import BaseModel


class PublicSeasonOut(BaseModel):
    id: str
    name: str
    start_date: dt.date
    end_date: dt.date
    is_active: bool
    game_count: int


class PublicTeamOut(BaseModel):
    id: str
    association_id: str
    association_name: str | None = None
    name: str
    age_group: str
    level: str
    logo_url: str | None = None
    wins: int
    losses: int
    ties: int


class PublicEventOut(BaseModel):
    id: str
    event_type: str
    status: str
    date: dt.date
    start_time: dt.time | None
    end_time: dt.time | None
    home_team_id: str
    away_team_id: str | None
    home_team_name: str | None = None
    away_team_name: str | None = None
    home_team_logo_url: str | None = None
    away_team_logo_url: str | None = None
    arena_name: str | None = None
    arena_rink_name: str | None = None
    location_label: str | None = None
    competition_name: str | None = None
    competition_short_name: str | None = None
    division_name: str | None = None
