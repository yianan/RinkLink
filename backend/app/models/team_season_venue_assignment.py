from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class TeamSeasonVenueAssignment(Base):
    __tablename__ = "team_season_venue_assignments"
    __table_args__ = (
        UniqueConstraint("team_id", "season_id", name="uq_team_season_venue_assignment"),
        Index("ix_team_season_venue_assignments_arena", "arena_id", "season_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    team_id: Mapped[str] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    season_id: Mapped[str] = mapped_column(ForeignKey("seasons.id", ondelete="CASCADE"), nullable=False)
    arena_id: Mapped[str] = mapped_column(ForeignKey("arenas.id"), nullable=False)
    arena_rink_id: Mapped[str] = mapped_column(ForeignKey("arena_rinks.id"), nullable=False)
    default_locker_room_id: Mapped[str | None] = mapped_column(ForeignKey("locker_rooms.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    team = relationship("Team", foreign_keys=[team_id])
    season = relationship("Season", foreign_keys=[season_id])
    arena = relationship("Arena", foreign_keys=[arena_id])
    arena_rink = relationship("ArenaRink", foreign_keys=[arena_rink_id])
    default_locker_room = relationship("LockerRoom", foreign_keys=[default_locker_room_id])
