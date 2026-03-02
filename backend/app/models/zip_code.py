from sqlalchemy import String, Float
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class ZipCode(Base):
    __tablename__ = "zip_codes"

    zip_code: Mapped[str] = mapped_column(String(10), primary_key=True)
    city: Mapped[str] = mapped_column(String(100), default="")
    state: Mapped[str] = mapped_column(String(2), default="")
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
