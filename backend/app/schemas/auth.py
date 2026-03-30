from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, Field


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


class AccessTargetOut(BaseModel):
    type: str
    id: str
    name: str
    context: str | None = None


class InviteCreate(BaseModel):
    email: str
    target_type: str
    target_id: str
    role: str | None = None
    expires_in_days: int = Field(default=14, ge=1, le=90)


class InviteOut(BaseModel):
    id: str
    token: str
    email: str
    role: str | None = None
    status: str
    expires_at: dt.datetime
    accepted_at: dt.datetime | None = None
    created_at: dt.datetime
    updated_at: dt.datetime
    invited_by_user_id: str
    invited_by_email: str | None = None
    target: AccessTargetOut


class AccessRequestCreate(BaseModel):
    target_type: str
    target_id: str
    notes: str | None = Field(default=None, max_length=1000)


class AccessRequestDecision(BaseModel):
    role: str | None = None


class AccessRequestOut(BaseModel):
    id: str
    status: str
    notes: str | None = None
    created_at: dt.datetime
    updated_at: dt.datetime
    reviewed_at: dt.datetime | None = None
    user_id: str
    user_email: str | None = None
    reviewed_by_user_id: str | None = None
    reviewed_by_email: str | None = None
    target: AccessTargetOut
