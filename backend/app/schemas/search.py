import datetime as dt
from typing import Optional

from pydantic import BaseModel


class OpponentResult(BaseModel):
    team_id: str
    team_name: str
    association_name: str
    age_group: str
    level: str
    myhockey_ranking: Optional[int]
    distance_miles: Optional[float]
    schedule_entry_id: str
    entry_date: dt.date
    entry_time: Optional[dt.time]
    entry_type: str


class AutoMatchResult(BaseModel):
    home_team_id: str
    home_team_name: str
    home_association_name: str
    away_team_id: str
    away_team_name: str
    away_association_name: str
    date: dt.date
    home_entry_id: str
    away_entry_id: str
    home_time: Optional[dt.time]
    away_time: Optional[dt.time]
    distance_miles: Optional[float]
