import datetime as dt
from typing import Optional

from pydantic import BaseModel


class OpponentResult(BaseModel):
    team_id: str
    team_name: str
    team_logo_url: Optional[str] = None
    association_name: str
    age_group: str
    level: str
    myhockey_ranking: Optional[int]
    distance_miles: Optional[float]
    availability_window_id: str
    entry_date: dt.date
    start_time: Optional[dt.time]
    end_time: Optional[dt.time]
    availability_type: str
    primary_competition_short_name: Optional[str] = None
    primary_division_name: Optional[str] = None
    has_existing_proposal: bool = False
    existing_proposal_id: Optional[str] = None
    existing_proposal_status: Optional[str] = None


class AutoMatchResult(BaseModel):
    home_team_id: str
    home_team_name: str
    home_team_logo_url: Optional[str] = None
    home_association_name: str
    away_team_id: str
    away_team_name: str
    away_team_logo_url: Optional[str] = None
    away_association_name: str
    date: dt.date
    home_availability_window_id: str
    away_availability_window_id: str
    home_start_time: Optional[dt.time]
    home_end_time: Optional[dt.time]
    away_start_time: Optional[dt.time]
    away_end_time: Optional[dt.time]
    distance_miles: Optional[float]
    home_primary_competition_short_name: Optional[str] = None
    home_primary_division_name: Optional[str] = None
    away_primary_competition_short_name: Optional[str] = None
    away_primary_division_name: Optional[str] = None
    has_existing_proposal: bool = False
    existing_proposal_id: Optional[str] = None
    existing_proposal_status: Optional[str] = None
