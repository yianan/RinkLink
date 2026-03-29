from __future__ import annotations

import datetime as dt

from pydantic import BaseModel


class AppUserOut(BaseModel):
    id: str
    auth_id: str
    email: str
    display_name: str | None = None
    status: str
    is_platform_admin: bool
    default_team_id: str | None = None
    revoked_at: dt.datetime | None = None
    created_at: dt.datetime
    updated_at: dt.datetime

    model_config = {"from_attributes": True}


class AssociationMembershipOut(BaseModel):
    association_id: str
    role: str


class TeamMembershipOut(BaseModel):
    team_id: str
    role: str


class ArenaMembershipOut(BaseModel):
    arena_id: str
    role: str


class LinkedPlayerOut(BaseModel):
    player_id: str
    team_id: str
    season_id: str
    first_name: str
    last_name: str
    link_type: str


class AccessibleTeamOut(BaseModel):
    id: str
    association_id: str
    name: str
    age_group: str
    level: str


class MeOut(BaseModel):
    user: AppUserOut
    capabilities: list[str]
    associations: list[AssociationMembershipOut]
    teams: list[TeamMembershipOut]
    arenas: list[ArenaMembershipOut]
    linked_players: list[LinkedPlayerOut]
    accessible_teams: list[AccessibleTeamOut]
