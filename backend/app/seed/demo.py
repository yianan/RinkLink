"""Additive original-demo fixtures; never reset accounts or existing records."""
import base64
import json
import uuid
from datetime import date, datetime, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from sqlalchemy import Date, DateTime, LargeBinary, Time, text

from ..database import SessionLocal, engine
from ..models import Arena, ArenaRink, AvailabilityWindow, Event, MediaAsset, Proposal, Season, Team
from ..schema_guard import assert_minimal_database
from ..services.scheduling import conflicts
from ..services.season_utils import ensure_standard_seasons
from ..services.zip_reference import ensure_zip_reference

FIXTURE_PATH = Path(__file__).parent / 'fixtures' / 'original_demo.json'
DEMO_NAMESPACE = uuid.UUID('226a12fa-af46-4dd1-ab59-9fc54c7df65a')


def _decode(model, values):
    result = dict(values)
    for column in model.__table__.columns:
        value = result.get(column.key)
        if value is None:
            continue
        if isinstance(column.type, DateTime):
            result[column.key] = datetime.fromisoformat(value)
        elif isinstance(column.type, Date):
            result[column.key] = date.fromisoformat(value)
        elif isinstance(column.type, Time):
            result[column.key] = time.fromisoformat(value)
        elif isinstance(column.type, LargeBinary):
            result[column.key] = base64.b64decode(value)
    return result


def seed(db, *, today=None):
    today = today or datetime.now(ZoneInfo('America/New_York')).date()
    ensure_zip_reference(db)
    ensure_standard_seasons(db, today=today)
    if db.get_bind().dialect.name == 'postgresql':
        db.execute(text('SELECT pg_advisory_xact_lock(734920261014)'))
    fixture = json.loads(FIXTURE_PATH.read_text())
    identities = {}
    added = {}
    groups = [
        ('media_assets', MediaAsset), ('seasons', Season), ('arenas', Arena),
        ('arena_rinks', ArenaRink), ('teams', Team),
        ('availability_windows', AvailabilityWindow), ('proposals', Proposal), ('events', Event),
    ]
    try:
        for table, model in groups:
            added[table] = 0
            for source in fixture[table]:
                values = dict(source)
                for key, value in values.items():
                    if key.endswith('_id') and value:
                        values[key] = identities.get(value, value)
                existing = db.get(model, values['id'])
                if existing is None and model in [Season, Arena, Team]:
                    existing = db.query(model).filter(model.name == values['name']).first()
                if existing is None and model is ArenaRink:
                    existing = db.query(model).filter(model.arena_id == values['arena_id'], model.name == values['name']).first()
                if existing is not None:
                    identities[source['id']] = existing.id
                    continue
                if model is Proposal and values['active_pair_key']:
                    values['active_pair_key'] = ':'.join(sorted([values['home_availability_window_id'], values['away_availability_window_id']]))
                db.add(model(**_decode(model, values)))
                identities[source['id']] = values['id']
                added[table] += 1
            db.flush()

        # Keep the original seasonal history and add immediately usable full-game
        # home/away windows for both original age/level groups.
        added['upcoming_windows'] = 0
        for group_index, age in enumerate(['14U', '12U']):
            teams = [db.get(Team, identities[row['id']]) for row in fixture['teams'] if row['age_group'] == age]
            day = today + timedelta(days=7 + group_index)
            for _ in range(30):
                if not any(conflicts(db, {team.id}, day, time(17), time(21), rink_id=team.home_arena_rink_id) for team in teams):
                    break
                day += timedelta(days=1)
            else:
                continue
            season = db.query(Season).filter(Season.start_date <= day, Season.end_date >= day).first()
            if season is None:
                continue
            for index, team in enumerate(teams):
                identity = str(uuid.uuid5(DEMO_NAMESPACE, f'upcoming-v1:{team.id}'))
                if db.get(AvailabilityWindow, identity):
                    continue
                home = index % 2 == 0
                db.add(AvailabilityWindow(id=identity, team_id=team.id, season_id=season.id,
                    date=day, start_time=time(18) if home else time(17),
                    end_time=time(19, 15) if home else time(21),
                    availability_type='home' if home else 'away',
                    notes='Demo availability for team matching.'))
                added['upcoming_windows'] += 1
            db.flush()
        db.commit()
        return added
    except Exception:
        db.rollback()
        raise


def main():
    assert_minimal_database(engine)
    with SessionLocal() as db:
        print(json.dumps({'added': seed(db)}))


if __name__ == '__main__':
    main()
