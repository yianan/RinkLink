from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    String,
    Integer,
    DateTime,
    ForeignKey,
    Index,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class GamePlayerStat(Base):
    __tablename__ = "game_player_stats"
    __table_args__ = (
        UniqueConstraint("game_id", "player_id", name="uq_game_player_stats_game_player"),
        Index("ix_game_player_stats_game_team", "game_id", "team_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    game_id: Mapped[str] = mapped_column(ForeignKey("games.id", ondelete="CASCADE"), nullable=False)
    team_id: Mapped[str] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    player_id: Mapped[str] = mapped_column(ForeignKey("players.id", ondelete="CASCADE"), nullable=False)

    goals: Mapped[int] = mapped_column(Integer, default=0)
    assists: Mapped[int] = mapped_column(Integer, default=0)
    shots_on_goal: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    game = relationship("Game", foreign_keys=[game_id])
    team = relationship("Team", foreign_keys=[team_id])
    player = relationship("Player", foreign_keys=[player_id])


class GamePenalty(Base):
    __tablename__ = "game_penalties"
    __table_args__ = (
        Index("ix_game_penalties_game_team", "game_id", "team_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    game_id: Mapped[str] = mapped_column(ForeignKey("games.id", ondelete="CASCADE"), nullable=False)
    team_id: Mapped[str] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    player_id: Mapped[str | None] = mapped_column(ForeignKey("players.id", ondelete="SET NULL"), nullable=True)

    penalty_type: Mapped[str] = mapped_column(String(100), nullable=False)
    minutes: Mapped[int] = mapped_column(Integer, default=2)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    game = relationship("Game", foreign_keys=[game_id])
    team = relationship("Team", foreign_keys=[team_id])
    player = relationship("Player", foreign_keys=[player_id])


class GameGoalieStat(Base):
    __tablename__ = "game_goalie_stats"
    __table_args__ = (
        UniqueConstraint("game_id", "player_id", name="uq_game_goalie_stats_game_player"),
        Index("ix_game_goalie_stats_game_team", "game_id", "team_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    game_id: Mapped[str] = mapped_column(ForeignKey("games.id", ondelete="CASCADE"), nullable=False)
    team_id: Mapped[str] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    player_id: Mapped[str] = mapped_column(ForeignKey("players.id", ondelete="CASCADE"), nullable=False)

    saves: Mapped[int] = mapped_column(Integer, default=0)
    shootout_shots: Mapped[int] = mapped_column(Integer, default=0)
    shootout_saves: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    game = relationship("Game", foreign_keys=[game_id])
    team = relationship("Team", foreign_keys=[team_id])
    player = relationship("Player", foreign_keys=[player_id])


class GameSignature(Base):
    __tablename__ = "game_signatures"
    __table_args__ = (
        UniqueConstraint("game_id", "role", name="uq_game_signatures_game_role"),
        Index("ix_game_signatures_game", "game_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    game_id: Mapped[str] = mapped_column(ForeignKey("games.id", ondelete="CASCADE"), nullable=False)
    team_id: Mapped[str | None] = mapped_column(ForeignKey("teams.id", ondelete="SET NULL"), nullable=True)

    role: Mapped[str] = mapped_column(String(50), nullable=False)
    signer_name: Mapped[str] = mapped_column(String(200), nullable=False)
    signed_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    game = relationship("Game", foreign_keys=[game_id])
    team = relationship("Team", foreign_keys=[team_id])

