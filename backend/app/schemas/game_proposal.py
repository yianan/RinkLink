import datetime as dt
from typing import Optional

from pydantic import BaseModel


class ProposalCreate(BaseModel):
    home_team_id: str
    away_team_id: str
    home_schedule_entry_id: str
    away_schedule_entry_id: str
    proposed_date: dt.date
    proposed_time: Optional[dt.time] = None
    proposed_by_team_id: str
    message: Optional[str] = None


class ProposalOut(BaseModel):
    id: str
    home_team_id: str
    away_team_id: str
    home_schedule_entry_id: str
    away_schedule_entry_id: str
    proposed_date: dt.date
    proposed_time: Optional[dt.time]
    status: str
    proposed_by_team_id: str
    message: Optional[str]
    responded_at: Optional[dt.datetime]
    created_at: dt.datetime
    updated_at: dt.datetime
    home_team_name: Optional[str] = None
    away_team_name: Optional[str] = None
    home_team_association: Optional[str] = None
    away_team_association: Optional[str] = None

    model_config = {"from_attributes": True}
