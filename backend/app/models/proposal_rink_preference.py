from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class ProposalRinkPreference(Base):
    __tablename__ = "proposal_rink_preferences"
    __table_args__ = (Index("ix_proposal_rink_preferences_rink_id", "rink_id"),)

    proposal_id: Mapped[str] = mapped_column(
        ForeignKey("game_proposals.id", ondelete="CASCADE"),
        primary_key=True,
    )
    rink_id: Mapped[str] = mapped_column(
        ForeignKey("rinks.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    proposal = relationship("GameProposal", foreign_keys=[proposal_id])
    rink = relationship("Rink", foreign_keys=[rink_id])

