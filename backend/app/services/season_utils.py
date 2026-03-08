from datetime import date

from sqlalchemy.orm import Session

from ..models.season import Season


def resolve_season_id(db: Session, association_id: str, game_date: date) -> str | None:
    """Find the season for an association that contains the given date."""
    season = (
        db.query(Season)
        .filter(
            Season.association_id == association_id,
            Season.start_date <= game_date,
            Season.end_date >= game_date,
        )
        .first()
    )
    return season.id if season else None
