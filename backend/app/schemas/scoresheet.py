from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, Field

from .event import EventOut


class EventPlayerStatUpsert(BaseModel):
    team_id: str
    player_id: str
    goals: int = 0
    assists: int = 0
    shots_on_goal: int = 0


class EventPlayerStatOut(BaseModel):
    id: str
    event_id: str
    team_id: str
    player_id: str
    goals: int
    assists: int
    shots_on_goal: int
    created_at: dt.datetime
    updated_at: dt.datetime

    model_config = {"from_attributes": True}


class UpsertPlayerStats(BaseModel):
    stats: list[EventPlayerStatUpsert] = Field(default_factory=list)


class EventPenaltyCreate(BaseModel):
    team_id: str
    player_id: str | None = None
    penalty_type: str
    minutes: int = 2


class EventPenaltyOut(BaseModel):
    id: str
    event_id: str
    team_id: str
    player_id: str | None
    penalty_type: str
    minutes: int
    created_at: dt.datetime
    updated_at: dt.datetime

    model_config = {"from_attributes": True}


class EventGoalieStatUpsert(BaseModel):
    team_id: str
    player_id: str
    saves: int = 0
    shootout_shots: int = 0
    shootout_saves: int = 0


class EventGoalieStatOut(BaseModel):
    id: str
    event_id: str
    team_id: str
    player_id: str
    saves: int
    shootout_shots: int
    shootout_saves: int
    created_at: dt.datetime
    updated_at: dt.datetime

    model_config = {"from_attributes": True}


class UpsertGoalieStats(BaseModel):
    stats: list[EventGoalieStatUpsert] = Field(default_factory=list)


class EventSignatureCreate(BaseModel):
    role: str
    signer_name: str
    team_id: str | None = None


class EventSignatureOut(BaseModel):
    id: str
    event_id: str
    team_id: str | None
    role: str
    signer_name: str
    signed_at: dt.datetime
    created_at: dt.datetime
    updated_at: dt.datetime

    model_config = {"from_attributes": True}


class EventScoresheetOut(BaseModel):
    event: EventOut
    player_stats: list[EventPlayerStatOut]
    penalties: list[EventPenaltyOut]
    goalie_stats: list[EventGoalieStatOut]
    signatures: list[EventSignatureOut]
