from __future__ import annotations

import uuid
from datetime import date, datetime, time, timezone

from sqlalchemy import Date, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class Proposal(Base):
    __tablename__ = "proposals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    home_team_id: Mapped[str] = mapped_column(ForeignKey("teams.id"), nullable=False)
    away_team_id: Mapped[str] = mapped_column(ForeignKey("teams.id"), nullable=False)
    home_availability_window_id: Mapped[str] = mapped_column(ForeignKey("availability_windows.id"), nullable=False)
    away_availability_window_id: Mapped[str] = mapped_column(ForeignKey("availability_windows.id"), nullable=False)
    event_type: Mapped[str] = mapped_column(String(30), nullable=False)
    proposed_date: Mapped[date] = mapped_column(Date, nullable=False)
    proposed_start_time: Mapped[time | None] = mapped_column(nullable=True)
    proposed_end_time: Mapped[time | None] = mapped_column(nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="proposed")
    proposed_by_team_id: Mapped[str] = mapped_column(ForeignKey("teams.id"), nullable=False)
    arena_id: Mapped[str] = mapped_column(ForeignKey("arenas.id"), nullable=False)
    arena_rink_id: Mapped[str] = mapped_column(ForeignKey("arena_rinks.id"), nullable=False)
    ice_slot_id: Mapped[str | None] = mapped_column(ForeignKey("ice_slots.id"), nullable=True)
    home_locker_room_id: Mapped[str | None] = mapped_column(ForeignKey("locker_rooms.id"), nullable=True)
    away_locker_room_id: Mapped[str | None] = mapped_column(ForeignKey("locker_rooms.id"), nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
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
    proposed_by_team = relationship("Team", foreign_keys=[proposed_by_team_id])
    arena = relationship("Arena", foreign_keys=[arena_id])
    arena_rink = relationship("ArenaRink", foreign_keys=[arena_rink_id])
    ice_slot = relationship("IceSlot", foreign_keys=[ice_slot_id])
    home_locker_room = relationship("LockerRoom", foreign_keys=[home_locker_room_id])
    away_locker_room = relationship("LockerRoom", foreign_keys=[away_locker_room_id])
