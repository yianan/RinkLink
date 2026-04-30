from __future__ import annotations

import datetime as dt

from pydantic import BaseModel


class ProposalCreate(BaseModel):
    home_team_id: str
    away_team_id: str
    home_availability_window_id: str
    away_availability_window_id: str
    event_type: str
    proposed_date: dt.date
    proposed_start_time: dt.time | None = None
    proposed_end_time: dt.time | None = None
    proposed_by_team_id: str
    arena_id: str
    arena_rink_id: str
    ice_slot_id: str | None = None
    home_locker_room_id: str | None = None
    away_locker_room_id: str | None = None
    message: str | None = None


class ProposalRescheduleCreate(BaseModel):
    event_type: str
    proposed_date: dt.date
    proposed_start_time: dt.time | None = None
    proposed_end_time: dt.time | None = None
    proposed_by_team_id: str
    arena_id: str
    arena_rink_id: str
    ice_slot_id: str | None = None
    home_locker_room_id: str | None = None
    away_locker_room_id: str | None = None
    message: str | None = None


class ProposalOut(BaseModel):
    id: str
    home_team_id: str
    away_team_id: str
    thread_root_proposal_id: str | None
    parent_proposal_id: str | None
    revision_number: int
    home_availability_window_id: str
    away_availability_window_id: str
    event_type: str
    proposed_date: dt.date
    proposed_start_time: dt.time | None
    proposed_end_time: dt.time | None
    status: str
    proposed_by_team_id: str
    arena_id: str
    arena_rink_id: str
    ice_slot_id: str | None
    home_locker_room_id: str | None
    away_locker_room_id: str | None
    message: str | None
    response_message: str | None
    response_source: str | None
    responded_at: dt.datetime | None
    created_at: dt.datetime
    updated_at: dt.datetime

    home_team_name: str | None = None
    away_team_name: str | None = None
    home_team_logo_url: str | None = None
    away_team_logo_url: str | None = None
    home_team_association: str | None = None
    away_team_association: str | None = None
    arena_name: str | None = None
    arena_logo_url: str | None = None
    arena_rink_name: str | None = None
    home_locker_room_name: str | None = None
    away_locker_room_name: str | None = None
    ice_slot_date: dt.date | None = None
    ice_slot_start_time: dt.time | None = None
    ice_slot_end_time: dt.time | None = None
    ice_slot_notes: str | None = None
    location_label: str | None = None

    model_config = {"from_attributes": True}
