from __future__ import annotations

import datetime as dt

from pydantic import BaseModel


class NotificationOut(BaseModel):
    id: str
    team_id: str
    notif_type: str
    title: str
    message: str | None
    week_start: dt.date | None
    read_at: dt.datetime | None
    created_at: dt.datetime
    updated_at: dt.datetime

    model_config = {"from_attributes": True}

