from __future__ import annotations

import datetime as dt
from typing import Literal

from pydantic import BaseModel


AttendanceStatus = Literal["unknown", "attending", "tentative", "absent"]
StoredAttendanceStatus = Literal["attending", "tentative", "absent"]


class EventAttendanceSummary(BaseModel):
    attending_count: int
    tentative_count: int
    absent_count: int
    unknown_count: int
    total_players: int


class EventAttendancePlayer(BaseModel):
    player_id: str
    first_name: str
    last_name: str
    jersey_number: int | None
    position: str | None
    status: AttendanceStatus
    responded_at: dt.datetime | None = None


class EventAttendanceUpdate(BaseModel):
    player_id: str
    status: AttendanceStatus


class BulkEventAttendanceUpdate(BaseModel):
    updates: list[EventAttendanceUpdate]
