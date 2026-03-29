from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class IceBookingRequest(Base):
    __tablename__ = "ice_booking_requests"
    __table_args__ = (
        Index("ix_ice_booking_requests_team_status", "requester_team_id", "status"),
        Index("ix_ice_booking_requests_arena_status", "arena_id", "status"),
        Index("ix_ice_booking_requests_slot_status", "ice_slot_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    requester_team_id: Mapped[str] = mapped_column(ForeignKey("teams.id"), nullable=False, index=True)
    away_team_id: Mapped[str | None] = mapped_column(ForeignKey("teams.id"), nullable=True)
    season_id: Mapped[str | None] = mapped_column(ForeignKey("seasons.id"), nullable=True, index=True)

    event_type: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="requested", server_default="requested")

    arena_id: Mapped[str] = mapped_column(ForeignKey("arenas.id"), nullable=False, index=True)
    arena_rink_id: Mapped[str] = mapped_column(ForeignKey("arena_rinks.id"), nullable=False)
    ice_slot_id: Mapped[str] = mapped_column(ForeignKey("ice_slots.id"), nullable=False, index=True)
    event_id: Mapped[str | None] = mapped_column(ForeignKey("events.id"), nullable=True, unique=True)

    pricing_mode: Mapped[str] = mapped_column(String(30), nullable=False)
    price_amount_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), default="USD", server_default="USD")
    final_price_amount_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    final_currency: Mapped[str | None] = mapped_column(String(3), nullable=True)

    home_locker_room_id: Mapped[str | None] = mapped_column(ForeignKey("locker_rooms.id"), nullable=True)
    away_locker_room_id: Mapped[str | None] = mapped_column(ForeignKey("locker_rooms.id"), nullable=True)

    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    requester_team = relationship("Team", foreign_keys=[requester_team_id])
    away_team = relationship("Team", foreign_keys=[away_team_id])
    season = relationship("Season", foreign_keys=[season_id])
    arena = relationship("Arena", foreign_keys=[arena_id])
    arena_rink = relationship("ArenaRink", foreign_keys=[arena_rink_id])
    ice_slot = relationship("IceSlot", foreign_keys=[ice_slot_id])
    event = relationship("Event", foreign_keys=[event_id])
    home_locker_room = relationship("LockerRoom", foreign_keys=[home_locker_room_id])
    away_locker_room = relationship("LockerRoom", foreign_keys=[away_locker_room_id])
