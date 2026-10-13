from datetime import date, time
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class TeamCreate(Strict):
    name: str = Field(min_length=1, max_length=200)
    club_name: str = Field(default="", max_length=200)
    age_group: str = Field(min_length=1, max_length=20)
    level: str = Field(min_length=1, max_length=50)
    home_zip_code: str = Field(default="", max_length=10)
    home_arena_id: str | None = None
    home_arena_rink_id: str | None = None
    manager_name: str = Field(default="", max_length=200)
    manager_email: str = Field(default="", max_length=200)
    manager_phone: str = Field(default="", max_length=30)
    myhockey_ranking: int | None = Field(default=None, ge=1)


class VenueCreate(Strict):
    name: str = Field(min_length=1, max_length=200)
    address: str = Field(default="", max_length=500)
    city: str = Field(default="", max_length=100)
    state: str = Field(default="", max_length=2)
    zip_code: str = Field(default="", max_length=10)


class RinkCreate(Strict):
    name: str = Field(min_length=1, max_length=200)


class GameInterval(Strict):
    date: date
    start_time: time
    end_time: time

    @model_validator(mode="after")
    def validate_interval(self):
        if self.start_time.tzinfo or self.end_time.tzinfo or self.end_time <= self.start_time:
            raise ValueError("Enter a positive game duration within one local calendar day")
        return self


class EventCreate(GameInterval):
    event_type: Literal["exhibition", "league", "scrimmage", "showcase", "practice"] = "exhibition"
    away_team_id: str | None = None
    opponent_name: str | None = Field(default=None, max_length=200)
    arena_id: str
    arena_rink_id: str
    season_id: str | None = None
    notes: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def validate_opponent(self):
        if self.event_type == "practice" and (self.away_team_id or self.opponent_name):
            raise ValueError("A practice does not have an opponent")
        if self.event_type != "practice" and not (self.away_team_id or self.opponent_name):
            raise ValueError("Enter an opponent for a game")
        return self


class ProposalCreate(Strict):
    home_team_id: str
    away_team_id: str
    home_availability_window_id: str
    away_availability_window_id: str
    proposed_by_team_id: str
    event_type: Literal["exhibition", "league", "scrimmage", "showcase"] = "exhibition"
    proposed_date: date
    proposed_start_time: time
    proposed_end_time: time
    arena_id: str
    arena_rink_id: str
    message: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def validate_interval(self):
        GameInterval(date=self.proposed_date, start_time=self.proposed_start_time, end_time=self.proposed_end_time)
        if self.home_team_id == self.away_team_id:
            raise ValueError("Select two different teams")
        if self.proposed_by_team_id not in {self.home_team_id, self.away_team_id}:
            raise ValueError("Proposing team must be part of the matchup")
        return self


class ProposalRevision(Strict):
    proposed_by_team_id: str
    proposed_date: date
    proposed_start_time: time
    proposed_end_time: time
    arena_id: str
    arena_rink_id: str
    message: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def validate_interval(self):
        GameInterval(date=self.proposed_date, start_time=self.proposed_start_time, end_time=self.proposed_end_time)
        return self


class InviteCreate(Strict):
    email: str = Field(min_length=3, max_length=255, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    target_type: Literal["team"] = "team"
    target_id: str
    role: Literal["team_admin", "scheduler"] = "scheduler"


class AccessRequestCreate(Strict):
    target_type: Literal["team", "team_setup"]
    target_id: str = "new"
    notes: str | None = Field(default=None, max_length=1000)
    details: TeamCreate | None = None

    @model_validator(mode="after")
    def validate_details(self):
        if self.target_type == "team_setup" and self.details is None:
            raise ValueError("New team details are required")
        return self


class AccessDecision(Strict):
    role: Literal["team_admin", "scheduler"] = "scheduler"
    reason: str | None = Field(default=None, max_length=1000)


class AccountAction(Strict):
    reason: str | None = Field(default=None, max_length=1000)


class ContactMessageCreate(Strict):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=255, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    message: str = Field(min_length=1, max_length=2000)
