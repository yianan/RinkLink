from __future__ import annotations

import datetime as dt

from pydantic import BaseModel


class TeamSeasonVenueAssignmentCreate(BaseModel):
    season_id: str
    arena_id: str
    arena_rink_id: str
    default_locker_room_id: str | None = None


class TeamSeasonVenueAssignmentUpdate(BaseModel):
    arena_id: str | None = None
    arena_rink_id: str | None = None
    default_locker_room_id: str | None = None


class TeamSeasonVenueAssignmentOut(BaseModel):
    id: str
    team_id: str
    season_id: str
    arena_id: str
    arena_rink_id: str
    default_locker_room_id: str | None
    team_name: str | None = None
    arena_name: str | None = None
    arena_rink_name: str | None = None
    default_locker_room_name: str | None = None
    created_at: dt.datetime
    updated_at: dt.datetime

    model_config = {"from_attributes": True}
