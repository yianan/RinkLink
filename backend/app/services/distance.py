from __future__ import annotations

import math

from sqlalchemy.orm import Session

from ..models import ZipCode


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return distance in miles between two lat/lon points."""
    R = 3958.8  # Earth radius in miles
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    return R * 2 * math.asin(math.sqrt(a))


def get_distance(db: Session, zip1: str, zip2: str) -> float | None:
    """Return distance in miles between two zip codes, or None if either is unknown."""
    if not zip1 or not zip2:
        return None
    z1 = db.get(ZipCode, zip1)
    z2 = db.get(ZipCode, zip2)
    if not z1 or not z2:
        return None
    return round(haversine(z1.latitude, z1.longitude, z2.latitude, z2.longitude), 1)
