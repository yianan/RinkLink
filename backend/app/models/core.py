"""Team matching and scheduling data, independent of arena inventory and players."""
import uuid
from datetime import date, datetime, time, timezone
from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..database import Base


def now():
    return datetime.now(timezone.utc)


class Identity:
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)


class Season(Identity, Base):
    __tablename__ = "seasons"
    name: Mapped[str] = mapped_column(String(100), unique=True)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)


class Arena(Identity, Base):
    __tablename__ = "arenas"
    name: Mapped[str] = mapped_column(String(200), unique=True)
    address: Mapped[str] = mapped_column(String(500), default="")
    city: Mapped[str] = mapped_column(String(100), default="")
    state: Mapped[str] = mapped_column(String(2), default="")
    zip_code: Mapped[str] = mapped_column(String(10), default="")
    rinks = relationship("ArenaRink", back_populates="arena")


class ArenaRink(Identity, Base):
    __tablename__ = "arena_rinks"
    __table_args__ = (UniqueConstraint("arena_id", "name"),)
    arena_id: Mapped[str] = mapped_column(ForeignKey("arenas.id"))
    name: Mapped[str] = mapped_column(String(200))
    arena = relationship("Arena", back_populates="rinks")


class Team(Identity, Base):
    __tablename__ = "teams"
    name: Mapped[str] = mapped_column(String(200))
    club_name: Mapped[str] = mapped_column(String(200), default="")
    age_group: Mapped[str] = mapped_column(String(20))
    level: Mapped[str] = mapped_column(String(50))
    home_zip_code: Mapped[str] = mapped_column(String(10), default="")
    home_arena_id: Mapped[str | None] = mapped_column(ForeignKey("arenas.id"))
    home_arena_rink_id: Mapped[str | None] = mapped_column(ForeignKey("arena_rinks.id"))
    manager_name: Mapped[str] = mapped_column(String(200), default="")
    manager_email: Mapped[str] = mapped_column(String(200), default="")
    manager_phone: Mapped[str] = mapped_column(String(30), default="")
    myhockey_ranking: Mapped[int | None] = mapped_column(Integer)


class AvailabilityWindow(Identity, Base):
    __tablename__ = "availability_windows"
    __table_args__ = (Index("ix_availability_team_date", "team_id", "date"),
                      Index("ix_availability_match", "date", "availability_type", "status"))
    team_id: Mapped[str] = mapped_column(ForeignKey("teams.id"))
    season_id: Mapped[str | None] = mapped_column(ForeignKey("seasons.id"))
    date: Mapped[date] = mapped_column(Date)
    start_time: Mapped[time | None] = mapped_column()
    end_time: Mapped[time | None] = mapped_column()
    availability_type: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(20), default="open")
    blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    opponent_team_id: Mapped[str | None] = mapped_column(ForeignKey("teams.id"))
    notes: Mapped[str | None] = mapped_column(Text)
    team = relationship("Team", foreign_keys=[team_id])


class Proposal(Identity, Base):
    __tablename__ = "proposals"
    __table_args__ = (UniqueConstraint("active_pair_key", name="uq_proposals_active_pair"),
                      Index("ix_proposals_team_status", "home_team_id", "away_team_id", "status"))
    home_team_id: Mapped[str] = mapped_column(ForeignKey("teams.id"))
    away_team_id: Mapped[str] = mapped_column(ForeignKey("teams.id"))
    home_availability_window_id: Mapped[str] = mapped_column(ForeignKey("availability_windows.id"))
    away_availability_window_id: Mapped[str] = mapped_column(ForeignKey("availability_windows.id"))
    proposed_by_team_id: Mapped[str] = mapped_column(ForeignKey("teams.id"))
    thread_root_proposal_id: Mapped[str | None] = mapped_column(ForeignKey("proposals.id"))
    parent_proposal_id: Mapped[str | None] = mapped_column(ForeignKey("proposals.id"))
    revision_number: Mapped[int] = mapped_column(Integer, default=1)
    active_pair_key: Mapped[str | None] = mapped_column(String(80))
    event_type: Mapped[str] = mapped_column(String(30), default="exhibition")
    proposed_date: Mapped[date] = mapped_column(Date)
    proposed_start_time: Mapped[time] = mapped_column()
    proposed_end_time: Mapped[time] = mapped_column()
    arena_id: Mapped[str] = mapped_column(ForeignKey("arenas.id"))
    arena_rink_id: Mapped[str] = mapped_column(ForeignKey("arena_rinks.id"))
    status: Mapped[str] = mapped_column(String(20), default="proposed")
    message: Mapped[str | None] = mapped_column(Text)
    response_message: Mapped[str | None] = mapped_column(Text)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime)
    home_team = relationship("Team", foreign_keys=[home_team_id])
    away_team = relationship("Team", foreign_keys=[away_team_id])


class Event(Identity, Base):
    __tablename__ = "events"
    __table_args__ = (Index("ix_events_home_date", "home_team_id", "date"),
                      Index("ix_events_away_date", "away_team_id", "date"),
                      Index("ix_events_rink_date", "arena_rink_id", "date"))
    home_team_id: Mapped[str] = mapped_column(ForeignKey("teams.id"))
    away_team_id: Mapped[str | None] = mapped_column(ForeignKey("teams.id"))
    opponent_name: Mapped[str | None] = mapped_column(String(200))
    event_type: Mapped[str] = mapped_column(String(30), default="exhibition")
    status: Mapped[str] = mapped_column(String(20), default="scheduled")
    season_id: Mapped[str | None] = mapped_column(ForeignKey("seasons.id"))
    proposal_id: Mapped[str | None] = mapped_column(ForeignKey("proposals.id"), unique=True)
    home_availability_window_id: Mapped[str | None] = mapped_column(ForeignKey("availability_windows.id"))
    away_availability_window_id: Mapped[str | None] = mapped_column(ForeignKey("availability_windows.id"))
    arena_id: Mapped[str] = mapped_column(ForeignKey("arenas.id"))
    arena_rink_id: Mapped[str] = mapped_column(ForeignKey("arena_rinks.id"))
    date: Mapped[date] = mapped_column(Date)
    start_time: Mapped[time] = mapped_column()
    end_time: Mapped[time] = mapped_column()
    notes: Mapped[str | None] = mapped_column(Text)
    home_team = relationship("Team", foreign_keys=[home_team_id])
    away_team = relationship("Team", foreign_keys=[away_team_id])
