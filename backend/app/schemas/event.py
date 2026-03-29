from __future__ import annotations

import datetime as dt

from pydantic import BaseModel

from .attendance import EventAttendanceSummary


class EventCreate(BaseModel):
    event_type: str
    away_team_id: str | None = None
    home_availability_window_id: str | None = None
    away_availability_window_id: str | None = None
    season_id: str | None = None
    competition_division_id: str | None = None
    arena_id: str
    arena_rink_id: str
    ice_slot_id: str | None = None
    home_locker_room_id: str | None = None
    away_locker_room_id: str | None = None
    date: dt.date
    start_time: dt.time | None = None
    end_time: dt.time | None = None
    notes: str | None = None


class EventUpdate(BaseModel):
    event_type: str | None = None
    status: str | None = None
    away_team_id: str | None = None
    season_id: str | None = None
    competition_division_id: str | None = None
    arena_id: str | None = None
    arena_rink_id: str | None = None
    ice_slot_id: str | None = None
    home_locker_room_id: str | None = None
    away_locker_room_id: str | None = None
    date: dt.date | None = None
    start_time: dt.time | None = None
    end_time: dt.time | None = None
    notes: str | None = None
    counts_for_standings: bool | None = None
    home_score: int | None = None
    away_score: int | None = None


class WeeklyConfirmUpdate(BaseModel):
    team_id: str
    confirmed: bool


class EventLockerRoomUpdate(BaseModel):
    home_locker_room_id: str | None = None
    away_locker_room_id: str | None = None
    response_message: str | None = None


class EventOut(BaseModel):
    id: str
    event_type: str
    status: str
    home_team_id: str
    away_team_id: str | None
    home_availability_window_id: str | None
    away_availability_window_id: str | None
    proposal_id: str | None
    season_id: str | None
    competition_division_id: str | None
    arena_id: str
    arena_rink_id: str
    ice_slot_id: str | None
    home_locker_room_id: str | None
    away_locker_room_id: str | None
    date: dt.date
    start_time: dt.time | None
    end_time: dt.time | None
    notes: str | None
    counts_for_standings: bool
    home_weekly_confirmed: bool
    away_weekly_confirmed: bool
    home_score: int | None
    away_score: int | None
    created_at: dt.datetime
    updated_at: dt.datetime

    home_team_name: str | None = None
    away_team_name: str | None = None
    home_team_logo_url: str | None = None
    away_team_logo_url: str | None = None
    home_association_name: str | None = None
    away_association_name: str | None = None
    arena_name: str | None = None
    arena_logo_url: str | None = None
    arena_rink_name: str | None = None
    home_locker_room_name: str | None = None
    away_locker_room_name: str | None = None
    location_label: str | None = None
    competition_name: str | None = None
    competition_short_name: str | None = None
    division_name: str | None = None
    attendance_summary: EventAttendanceSummary | None = None

    model_config = {"from_attributes": True}
