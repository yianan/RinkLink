from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class Competition(Base):
    __tablename__ = "competitions"
    __table_args__ = (
        UniqueConstraint("name", name="uq_competitions_name"),
        UniqueConstraint("short_name", name="uq_competitions_short_name"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    short_name: Mapped[str] = mapped_column(String(50), nullable=False)
    governing_body: Mapped[str] = mapped_column(String(100), default="")
    competition_type: Mapped[str] = mapped_column(String(30), default="league")
    region: Mapped[str] = mapped_column(String(100), default="")
    website: Mapped[str | None] = mapped_column(String(500), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    divisions = relationship("CompetitionDivision", back_populates="competition", cascade="all, delete-orphan")


class CompetitionDivision(Base):
    __tablename__ = "competition_divisions"
    __table_args__ = (
        UniqueConstraint("competition_id", "season_id", "name", name="uq_competition_division_season_name"),
        Index("ix_competition_divisions_season_sort", "season_id", "sort_order"),
        Index("ix_competition_divisions_standings", "season_id", "standings_enabled"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    competition_id: Mapped[str] = mapped_column(ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False)
    season_id: Mapped[str] = mapped_column(ForeignKey("seasons.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    age_group: Mapped[str] = mapped_column(String(20), default="")
    level: Mapped[str] = mapped_column(String(50), default="")
    standings_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    competition = relationship("Competition", back_populates="divisions")
    season = relationship("Season", foreign_keys=[season_id])
    memberships = relationship("TeamCompetitionMembership", back_populates="competition_division", cascade="all, delete-orphan")


class TeamCompetitionMembership(Base):
    __tablename__ = "team_competition_memberships"
    __table_args__ = (
        UniqueConstraint("team_id", "season_id", "competition_division_id", name="uq_team_competition_membership"),
        Index("ix_team_competition_memberships_team_season", "team_id", "season_id"),
        Index("ix_team_competition_memberships_division", "competition_division_id"),
        Index("ix_team_competition_memberships_primary", "season_id", "is_primary"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    team_id: Mapped[str] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    season_id: Mapped[str] = mapped_column(ForeignKey("seasons.id", ondelete="CASCADE"), nullable=False)
    competition_division_id: Mapped[str] = mapped_column(ForeignKey("competition_divisions.id", ondelete="CASCADE"), nullable=False)
    membership_role: Mapped[str] = mapped_column(String(30), default="primary")
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    team = relationship("Team", back_populates="competition_memberships", foreign_keys=[team_id])
    season = relationship("Season", foreign_keys=[season_id])
    competition_division = relationship("CompetitionDivision", back_populates="memberships")
