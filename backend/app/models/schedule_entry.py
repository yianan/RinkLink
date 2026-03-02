from __future__ import annotations

import uuid
from datetime import datetime, timezone, date, time

from sqlalchemy import String, Date, Time, Boolean, Text, DateTime, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class ScheduleEntry(Base):
    __tablename__ = "schedule_entries"
    __table_args__ = (
        Index("ix_schedule_team_date_status", "team_id", "date", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    team_id: Mapped[str] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    time: Mapped[time | None] = mapped_column(Time, nullable=True)
    entry_type: Mapped[str] = mapped_column(String(10), nullable=False)  # "home" or "away"
    status: Mapped[str] = mapped_column(String(20), default="open")  # "open", "scheduled", "confirmed"
    opponent_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    opponent_team_id: Mapped[str | None] = mapped_column(ForeignKey("teams.id"), nullable=True)
    location: Mapped[str | None] = mapped_column(String(500), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    weekly_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    team = relationship("Team", back_populates="schedule_entries", foreign_keys=[team_id])
    opponent_team = relationship("Team", foreign_keys=[opponent_team_id])
