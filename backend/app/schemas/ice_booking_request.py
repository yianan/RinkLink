from __future__ import annotations

import datetime as dt

from pydantic import BaseModel


class IceBookingRequestCreate(BaseModel):
    event_type: str
    away_team_id: str | None = None
    season_id: str | None = None
    ice_slot_id: str
    message: str | None = None


class IceBookingRequestAccept(BaseModel):
    home_locker_room_id: str | None = None
    away_locker_room_id: str | None = None
    final_price_amount_cents: int | None = None
    final_currency: str | None = None
    response_message: str | None = None


class IceBookingRequestAction(BaseModel):
    response_message: str | None = None


class IceBookingRequestOut(BaseModel):
    id: str
    requester_team_id: str
    away_team_id: str | None
    season_id: str | None
    event_type: str
    status: str
    arena_id: str
    arena_rink_id: str
    ice_slot_id: str
    event_id: str | None
    pricing_mode: str
    price_amount_cents: int | None
    currency: str
    final_price_amount_cents: int | None
    final_currency: str | None
    home_locker_room_id: str | None
    away_locker_room_id: str | None
    message: str | None
    response_message: str | None
    responded_at: dt.datetime | None
    created_at: dt.datetime
    updated_at: dt.datetime

    requester_team_name: str | None = None
    requester_team_logo_url: str | None = None
    requester_association_name: str | None = None
    away_team_name: str | None = None
    away_team_logo_url: str | None = None
    away_association_name: str | None = None
    arena_name: str | None = None
    arena_logo_url: str | None = None
    arena_rink_name: str | None = None
    home_locker_room_name: str | None = None
    away_locker_room_name: str | None = None
    ice_slot_date: dt.date | None = None
    ice_slot_start_time: dt.time | None = None
    ice_slot_end_time: dt.time | None = None
    ice_slot_notes: str | None = None
    event_status: str | None = None
    location_label: str | None = None

    model_config = {"from_attributes": True}
