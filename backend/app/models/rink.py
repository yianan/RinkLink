from __future__ import annotations

import uuid
from datetime import datetime, timezone, date, time

from sqlalchemy import String, Date, Time, Text, DateTime, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class Rink(Base):
    __tablename__ = "rinks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    address: Mapped[str] = mapped_column(String(500), default="")
    city: Mapped[str] = mapped_column(String(100), default="")
    state: Mapped[str] = mapped_column(String(2), default="")
    zip_code: Mapped[str] = mapped_column(String(10), default="")
    phone: Mapped[str] = mapped_column(String(30), default="")
    contact_email: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    ice_slots = relationship("IceSlot", back_populates="rink", cascade="all, delete-orphan")


class IceSlot(Base):
    __tablename__ = "ice_slots"
    __table_args__ = (
        Index("ix_ice_slots_rink_date_status", "rink_id", "date", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    rink_id: Mapped[str] = mapped_column(ForeignKey("rinks.id", ondelete="CASCADE"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="available")  # "available", "held", "booked"
    booked_by_team_id: Mapped[str | None] = mapped_column(ForeignKey("teams.id"), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    rink = relationship("Rink", back_populates="ice_slots")
    booked_by_team = relationship("Team", foreign_keys=[booked_by_team_id])
