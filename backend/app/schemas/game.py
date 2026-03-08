from __future__ import annotations

import datetime as dt

from pydantic import BaseModel


class GameOut(BaseModel):
    id: str
    home_team_id: str
    away_team_id: str
    home_schedule_entry_id: str | None
    away_schedule_entry_id: str | None
    proposal_id: str | None
    ice_slot_id: str | None
    season_id: str | None = None
    date: dt.date
    time: dt.time | None
    status: str
    game_type: str | None
    home_weekly_confirmed: bool
    away_weekly_confirmed: bool
    home_score: int | None
    away_score: int | None
    created_at: dt.datetime
    updated_at: dt.datetime

    home_team_name: str | None = None
    away_team_name: str | None = None
    home_association_name: str | None = None
    away_association_name: str | None = None

    rink_name: str | None = None
    rink_address: str | None = None
    rink_city: str | None = None
    rink_state: str | None = None
    rink_zip: str | None = None
    location_label: str | None = None

    model_config = {"from_attributes": True}


class GameUpdate(BaseModel):
    status: str | None = None
    game_type: str | None = None
    home_score: int | None = None
    away_score: int | None = None


class WeeklyConfirmUpdate(BaseModel):
    team_id: str
    confirmed: bool
