from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Integer, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class Team(Base):
    __tablename__ = "teams"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    association_id: Mapped[str] = mapped_column(ForeignKey("associations.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    age_group: Mapped[str] = mapped_column(String(20), nullable=False)
    level: Mapped[str] = mapped_column(String(50), nullable=False)
    manager_name: Mapped[str] = mapped_column(String(200), default="")
    manager_email: Mapped[str] = mapped_column(String(200), default="")
    manager_phone: Mapped[str] = mapped_column(String(30), default="")
    rink_city: Mapped[str] = mapped_column(String(100), default="")
    rink_state: Mapped[str] = mapped_column(String(2), default="")
    rink_zip: Mapped[str] = mapped_column(String(10), default="")
    myhockey_ranking: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    association = relationship("Association", back_populates="teams")
    schedule_entries = relationship("ScheduleEntry", back_populates="team", cascade="all, delete-orphan", foreign_keys="[ScheduleEntry.team_id]")
