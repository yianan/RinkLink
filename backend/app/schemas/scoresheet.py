from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, Field

from .game import GameOut


class GamePlayerStatUpsert(BaseModel):
    team_id: str
    player_id: str
    goals: int = 0
    assists: int = 0
    shots_on_goal: int = 0


class GamePlayerStatOut(BaseModel):
    id: str
    game_id: str
    team_id: str
    player_id: str
    goals: int
    assists: int
    shots_on_goal: int
    created_at: dt.datetime
    updated_at: dt.datetime

    model_config = {"from_attributes": True}


class UpsertPlayerStats(BaseModel):
    stats: list[GamePlayerStatUpsert] = Field(default_factory=list)


class GamePenaltyCreate(BaseModel):
    team_id: str
    player_id: str | None = None
    penalty_type: str
    minutes: int = 2


class GamePenaltyOut(BaseModel):
    id: str
    game_id: str
    team_id: str
    player_id: str | None
    penalty_type: str
    minutes: int
    created_at: dt.datetime
    updated_at: dt.datetime

    model_config = {"from_attributes": True}


class GameGoalieStatUpsert(BaseModel):
    team_id: str
    player_id: str
    saves: int = 0
    shootout_shots: int = 0
    shootout_saves: int = 0


class GameGoalieStatOut(BaseModel):
    id: str
    game_id: str
    team_id: str
    player_id: str
    saves: int
    shootout_shots: int
    shootout_saves: int
    created_at: dt.datetime
    updated_at: dt.datetime

    model_config = {"from_attributes": True}


class UpsertGoalieStats(BaseModel):
    stats: list[GameGoalieStatUpsert] = Field(default_factory=list)


class GameSignatureCreate(BaseModel):
    role: str
    signer_name: str
    team_id: str | None = None


class GameSignatureOut(BaseModel):
    id: str
    game_id: str
    team_id: str | None
    role: str
    signer_name: str
    signed_at: dt.datetime
    created_at: dt.datetime
    updated_at: dt.datetime

    model_config = {"from_attributes": True}


class GameScoresheetOut(BaseModel):
    game: GameOut
    player_stats: list[GamePlayerStatOut]
    penalties: list[GamePenaltyOut]
    goalie_stats: list[GameGoalieStatOut]
    signatures: list[GameSignatureOut]

