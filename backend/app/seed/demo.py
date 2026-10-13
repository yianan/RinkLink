"""Idempotent minimal demo seed. Never resets accounts or existing schedules."""
from datetime import date, timedelta, time
from ..database import SessionLocal, engine
from ..schema_guard import assert_minimal_database
from ..models import Arena, ArenaRink, Team, AvailabilityWindow, Event
from ..services.zip_reference import ensure_zip_reference
from ..services.season_utils import ensure_standard_seasons


def seed(db):
    ensure_zip_reference(db)
    if db.query(Team).first():
        return False
    seasons = ensure_standard_seasons(db)
    day = date.today() + timedelta(days=7)
    season = next(s for s in seasons if s.start_date <= day <= s.end_date)
    arena = Arena(name='Northbrook Sports Center', address='1730 Pfingsten Road', city='Northbrook', state='IL', zip_code='60062')
    db.add(arena)
    db.flush()
    rink = ArenaRink(arena_id=arena.id, name='Main rink')
    db.add(rink)
    db.flush()
    home = Team(name='Northbrook Bluehawks 14U AA', club_name='Northbrook', age_group='14U', level='AA',
        home_zip_code='60062', home_arena_id=arena.id, home_arena_rink_id=rink.id,
        manager_name='Demo Manager', manager_email='northbrook@example.com', myhockey_ranking=100)
    away = Team(name='Glenview Stars 14U AA', club_name='Glenview', age_group='14U', level='AA',
        home_zip_code='60025', home_arena_id=arena.id, home_arena_rink_id=rink.id,
        manager_name='Demo Manager', manager_email='glenview@example.com', myhockey_ranking=110)
    db.add_all([home, away])
    db.flush()
    db.add_all([
        AvailabilityWindow(team_id=home.id, season_id=season.id, date=day, start_time=time(18), end_time=time(19), availability_type='home'),
        AvailabilityWindow(team_id=away.id, season_id=season.id, date=day, start_time=time(17), end_time=time(20), availability_type='away'),
        Event(home_team_id=home.id, event_type='practice', date=day+timedelta(days=1), start_time=time(18), end_time=time(19),
            arena_id=arena.id, arena_rink_id=rink.id, season_id=season.id, notes='Example existing practice'),
    ])
    db.commit()
    return True


def main():
    assert_minimal_database(engine)
    with SessionLocal() as db:
        print('Minimal demo created' if seed(db) else 'Existing data kept; no reseed performed')


if __name__ == '__main__':
    main()
