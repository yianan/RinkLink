from datetime import date
from app.models import AppUser, Arena, ArenaRink, AvailabilityWindow, Event, MediaAsset, Proposal, Team
from app.seed.demo import seed
from app.services.scheduling import contains, conflicts


def test_original_demo_seed_is_additive_idempotent_and_has_usable_matches(db):
    owner = AppUser(auth_id='existing-owner', email='owner@example.test', status='active', is_platform_admin=True)
    custom = Team(name='Existing user team', club_name='User club', age_group='10U', level='B')
    db.add_all([owner, custom]); db.commit()
    added = seed(db, today=date(2026, 10, 14))
    assert added['teams'] == 18 and added['arenas'] == 9 and added['arena_rinks'] == 18
    assert added['events'] == 68 and added['proposals'] == 14
    assert db.query(MediaAsset).count() == 27
    from app.routers.minimal import pair_key
    for proposal in db.query(Proposal).filter(Proposal.status == 'proposed'):
        assert proposal.active_pair_key == pair_key(proposal.home_availability_window_id, proposal.away_availability_window_id)
    assert db.get(AppUser, owner.id).email == 'owner@example.test'
    assert db.get(Team, custom.id).club_name == 'User club'
    assert db.query(Team).count() == 19
    windows = db.query(AvailabilityWindow).filter(AvailabilityWindow.notes == 'Demo availability for team matching.').all()
    assert len(windows) == 18
    for age in ['14U', '12U']:
        group = [w for w in windows if db.get(Team, w.team_id).age_group == age]
        home = next(w for w in group if w.availability_type == 'home')
        away = next(w for w in group if w.availability_type == 'away')
        assert contains(away, home.date, home.start_time, home.end_time)
        assert not conflicts(db, {home.team_id, away.team_id}, home.date, home.start_time, home.end_time,
            rink_id=db.get(Team, home.team_id).home_arena_rink_id)
    event = db.query(Event).first(); event.notes = 'User-edited event'; db.commit()
    second = seed(db, today=date(2026, 10, 15))
    assert not any(second.values())
    assert db.get(Event, event.id).notes == 'User-edited event'
    assert db.query(AppUser).count() == 1
