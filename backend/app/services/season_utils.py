from datetime import date
import uuid

from sqlalchemy.orm import Session

from ..models.season import Season


SEASON_START_MONTH = 8
PRECREATE_NEXT_SEASON_MONTH = 7


def season_start_year_for_date(target_date: date) -> int:
    return target_date.year if target_date.month >= SEASON_START_MONTH else target_date.year - 1


def canonical_season_bounds(start_year: int) -> tuple[date, date]:
    return date(start_year, SEASON_START_MONTH, 1), date(start_year + 1, SEASON_START_MONTH - 1, 31)


def canonical_season_name(start_year: int) -> str:
    return f"{start_year}-{start_year + 1}"


def infer_season_start_year(start_date: date, end_date: date) -> int:
    return start_date.year if start_date.month >= SEASON_START_MONTH else end_date.year - 1


def ensure_standard_seasons(
    db: Session,
    *,
    today: date | None = None,
) -> list[Season]:
    current_date = today or date.today()
    current_start_year = season_start_year_for_date(current_date)
    required_start_years = {current_start_year}
    if current_date.month == PRECREATE_NEXT_SEASON_MONTH:
        required_start_years.add(current_start_year + 1)

    seasons = db.query(Season).order_by(Season.start_date.desc(), Season.created_at.desc()).all()

    seasons_by_start_year: dict[int, Season] = {}
    changed = False

    for season in seasons:
        start_year = infer_season_start_year(season.start_date, season.end_date)
        seasons_by_start_year.setdefault(start_year, season)

    for start_year, season in seasons_by_start_year.items():
        expected_start, expected_end = canonical_season_bounds(start_year)
        expected_name = canonical_season_name(start_year)
        expected_active = start_year == current_start_year

        if season.name != expected_name:
            season.name = expected_name
            changed = True
        if season.start_date != expected_start:
            season.start_date = expected_start
            changed = True
        if season.end_date != expected_end:
            season.end_date = expected_end
            changed = True
        if season.is_active != expected_active:
            season.is_active = expected_active
            changed = True

    for start_year in sorted(required_start_years):
        if start_year in seasons_by_start_year:
            continue
        start_date, end_date = canonical_season_bounds(start_year)
        season = Season(
            id=str(uuid.uuid4()),
            name=canonical_season_name(start_year),
            start_date=start_date,
            end_date=end_date,
            is_active=start_year == current_start_year,
        )
        db.add(season)
        seasons_by_start_year[start_year] = season
        changed = True

    if changed:
        db.commit()

    return db.query(Season).order_by(Season.start_date.desc()).all()


def resolve_season_id(db: Session, game_date: date) -> str | None:
    """Find the global season that contains the given date."""
    ensure_standard_seasons(db)
    season = (
        db.query(Season)
        .filter(
            Season.start_date <= game_date,
            Season.end_date >= game_date,
        )
        .first()
    )
    return season.id if season else None
