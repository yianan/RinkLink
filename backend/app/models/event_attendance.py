from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class EventAttendance(Base):
    __tablename__ = "event_attendance"
    __table_args__ = (
        Index("ix_event_attendance_event_status", "event_id", "status"),
        Index("ix_event_attendance_player", "player_id"),
    )

    event_id: Mapped[str] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), primary_key=True)
    player_id: Mapped[str] = mapped_column(ForeignKey("players.id", ondelete="CASCADE"), primary_key=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    responded_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    event = relationship("Event", foreign_keys=[event_id])
    player = relationship("Player", foreign_keys=[player_id])
