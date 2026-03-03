from __future__ import annotations

import uuid
from datetime import datetime, timezone, date, time

from sqlalchemy import String, Date, Time, Boolean, Integer, DateTime, ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class Game(Base):
    __tablename__ = "games"
    __table_args__ = (
        UniqueConstraint("proposal_id", name="uq_games_proposal_id"),
        Index("ix_games_home_team_date", "home_team_id", "date"),
        Index("ix_games_away_team_date", "away_team_id", "date"),
        Index("ix_games_date", "date"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    home_team_id: Mapped[str] = mapped_column(ForeignKey("teams.id"), nullable=False)
    away_team_id: Mapped[str] = mapped_column(ForeignKey("teams.id"), nullable=False)

    # Links back to the schedule entries that were matched, for convenience.
    home_schedule_entry_id: Mapped[str | None] = mapped_column(ForeignKey("schedule_entries.id"), nullable=True)
    away_schedule_entry_id: Mapped[str | None] = mapped_column(ForeignKey("schedule_entries.id"), nullable=True)

    proposal_id: Mapped[str | None] = mapped_column(ForeignKey("game_proposals.id"), nullable=True)
    ice_slot_id: Mapped[str | None] = mapped_column(ForeignKey("ice_slots.id"), nullable=True)

    date: Mapped[date] = mapped_column(Date, nullable=False)
    time: Mapped[time | None] = mapped_column(Time, nullable=True)

    status: Mapped[str] = mapped_column(String(20), default="scheduled")  # scheduled, confirmed, final, cancelled

    home_weekly_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    away_weekly_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)

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
    home_schedule_entry = relationship("ScheduleEntry", foreign_keys=[home_schedule_entry_id])
    away_schedule_entry = relationship("ScheduleEntry", foreign_keys=[away_schedule_entry_id])
    proposal = relationship("GameProposal", foreign_keys=[proposal_id])
    ice_slot = relationship("IceSlot", foreign_keys=[ice_slot_id])

