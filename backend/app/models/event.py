from __future__ import annotations

import uuid
from datetime import date, datetime, time, timezone

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (
        Index("ix_events_home_team_date", "home_team_id", "date"),
        Index("ix_events_away_team_date", "away_team_id", "date"),
        Index("ix_events_arena_date_status", "arena_id", "date", "status"),
        Index("ix_events_season_date", "season_id", "date"),
        Index("ix_events_home_window_status", "home_availability_window_id", "status"),
        Index("ix_events_away_window_status", "away_availability_window_id", "status"),
        Index("ix_events_ice_slot_status", "ice_slot_id", "status"),
        Index("ix_events_date", "date"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    event_type: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="scheduled")

    home_team_id: Mapped[str] = mapped_column(ForeignKey("teams.id"), nullable=False)
    away_team_id: Mapped[str | None] = mapped_column(ForeignKey("teams.id"), nullable=True)

    home_availability_window_id: Mapped[str | None] = mapped_column(
        ForeignKey("availability_windows.id"),
        nullable=True,
    )
    away_availability_window_id: Mapped[str | None] = mapped_column(
        ForeignKey("availability_windows.id"),
        nullable=True,
    )
    proposal_id: Mapped[str | None] = mapped_column(ForeignKey("proposals.id"), nullable=True, unique=True)

    season_id: Mapped[str | None] = mapped_column(ForeignKey("seasons.id"), nullable=True, index=True)
    competition_division_id: Mapped[str | None] = mapped_column(
        ForeignKey("competition_divisions.id"),
        nullable=True,
        index=True,
    )

    arena_id: Mapped[str] = mapped_column(ForeignKey("arenas.id"), nullable=False)
    arena_rink_id: Mapped[str] = mapped_column(ForeignKey("arena_rinks.id"), nullable=False)
    ice_slot_id: Mapped[str | None] = mapped_column(ForeignKey("ice_slots.id"), nullable=True)
    home_locker_room_id: Mapped[str | None] = mapped_column(ForeignKey("locker_rooms.id"), nullable=True)
    away_locker_room_id: Mapped[str | None] = mapped_column(ForeignKey("locker_rooms.id"), nullable=True)

    date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[time | None] = mapped_column(nullable=True)
    end_time: Mapped[time | None] = mapped_column(nullable=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)

    counts_for_standings: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    home_weekly_confirmed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    away_weekly_confirmed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    home_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    away_score: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    home_team = relationship("Team", foreign_keys=[home_team_id])
    away_team = relationship("Team", foreign_keys=[away_team_id])
    home_availability_window = relationship("AvailabilityWindow", foreign_keys=[home_availability_window_id])
    away_availability_window = relationship("AvailabilityWindow", foreign_keys=[away_availability_window_id])
    proposal = relationship("Proposal", foreign_keys=[proposal_id])
    arena = relationship("Arena", foreign_keys=[arena_id])
    arena_rink = relationship("ArenaRink", foreign_keys=[arena_rink_id])
    ice_slot = relationship("IceSlot", foreign_keys=[ice_slot_id])
    home_locker_room = relationship("LockerRoom", foreign_keys=[home_locker_room_id])
    away_locker_room = relationship("LockerRoom", foreign_keys=[away_locker_room_id])
    competition_division = relationship("CompetitionDivision", foreign_keys=[competition_division_id])
