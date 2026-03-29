from __future__ import annotations

import datetime as dt

from pydantic import BaseModel


class ArenaCreate(BaseModel):
    name: str
    address: str = ""
    city: str = ""
    state: str = ""
    zip_code: str = ""
    phone: str = ""
    contact_email: str = ""
    website: str | None = None
    notes: str | None = None


class ArenaUpdate(BaseModel):
    name: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None
    phone: str | None = None
    contact_email: str | None = None
    website: str | None = None
    notes: str | None = None


class ArenaOut(BaseModel):
    id: str
    name: str
    address: str
    city: str
    state: str
    zip_code: str
    phone: str
    contact_email: str
    logo_url: str | None = None
    website: str | None
    notes: str | None
    rink_count: int = 0
    created_at: dt.datetime
    updated_at: dt.datetime

    model_config = {"from_attributes": True}


class ArenaRinkCreate(BaseModel):
    name: str
    display_order: int = 0
    is_active: bool = True
    notes: str | None = None


class ArenaRinkUpdate(BaseModel):
    name: str | None = None
    display_order: int | None = None
    is_active: bool | None = None
    notes: str | None = None


class ArenaRinkOut(BaseModel):
    id: str
    arena_id: str
    name: str
    display_order: int
    is_active: bool
    notes: str | None
    arena_name: str | None = None
    locker_room_count: int = 0
    ice_slot_count: int = 0
    created_at: dt.datetime
    updated_at: dt.datetime

    model_config = {"from_attributes": True}


class LockerRoomCreate(BaseModel):
    name: str
    display_order: int = 0
    is_active: bool = True
    notes: str | None = None


class LockerRoomUpdate(BaseModel):
    name: str | None = None
    display_order: int | None = None
    is_active: bool | None = None
    notes: str | None = None


class LockerRoomOut(BaseModel):
    id: str
    arena_rink_id: str
    name: str
    display_order: int
    is_active: bool
    notes: str | None
    arena_id: str | None = None
    arena_name: str | None = None
    arena_rink_name: str | None = None
    created_at: dt.datetime
    updated_at: dt.datetime

    model_config = {"from_attributes": True}


class IceSlotCreate(BaseModel):
    date: dt.date
    start_time: dt.time
    end_time: dt.time | None = None
    status: str = "available"
    pricing_mode: str = "call_for_pricing"
    price_amount_cents: int | None = None
    currency: str = "USD"
    notes: str | None = None


class IceSlotUpdate(BaseModel):
    date: dt.date | None = None
    start_time: dt.time | None = None
    end_time: dt.time | None = None
    status: str | None = None
    pricing_mode: str | None = None
    price_amount_cents: int | None = None
    currency: str | None = None
    notes: str | None = None


class IceSlotOut(BaseModel):
    id: str
    arena_rink_id: str
    date: dt.date
    start_time: dt.time
    end_time: dt.time | None
    status: str
    pricing_mode: str
    price_amount_cents: int | None
    currency: str
    booked_by_team_id: str | None
    booked_by_team_name: str | None = None
    booked_event_id: str | None = None
    booked_event_type: str | None = None
    booked_event_home_team_name: str | None = None
    booked_event_away_team_name: str | None = None
    active_booking_request_id: str | None = None
    active_booking_request_status: str | None = None
    active_booking_request_team_name: str | None = None
    active_booking_request_event_type: str | None = None
    notes: str | None
    arena_id: str | None = None
    arena_name: str | None = None
    arena_rink_name: str | None = None
    created_at: dt.datetime
    updated_at: dt.datetime

    model_config = {"from_attributes": True}


class IceSlotUploadRow(BaseModel):
    date: dt.date
    start_time: dt.time
    end_time: dt.time | None = None
    notes: str | None = None


class IceSlotUploadPreview(BaseModel):
    entries: list[IceSlotUploadRow]
    warnings: list[str] = []


class IceSlotConfirmUpload(BaseModel):
    entries: list[IceSlotUploadRow]
