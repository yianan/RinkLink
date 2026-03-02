from __future__ import annotations

import uuid
from datetime import datetime, timezone, date, time

from sqlalchemy import String, Date, Time, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class GameProposal(Base):
    __tablename__ = "game_proposals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    home_team_id: Mapped[str] = mapped_column(ForeignKey("teams.id"), nullable=False)
    away_team_id: Mapped[str] = mapped_column(ForeignKey("teams.id"), nullable=False)
    home_schedule_entry_id: Mapped[str] = mapped_column(ForeignKey("schedule_entries.id"), nullable=False)
    away_schedule_entry_id: Mapped[str] = mapped_column(ForeignKey("schedule_entries.id"), nullable=False)
    proposed_date: Mapped[date] = mapped_column(Date, nullable=False)
    proposed_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="proposed")
    proposed_by_team_id: Mapped[str] = mapped_column(ForeignKey("teams.id"), nullable=False)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    home_team = relationship("Team", foreign_keys=[home_team_id])
    away_team = relationship("Team", foreign_keys=[away_team_id])
    home_schedule_entry = relationship("ScheduleEntry", foreign_keys=[home_schedule_entry_id])
    away_schedule_entry = relationship("ScheduleEntry", foreign_keys=[away_schedule_entry_id])
    proposed_by_team = relationship("Team", foreign_keys=[proposed_by_team_id])
