from datetime import date, time

import pytest
from fastapi import HTTPException

from app.auth.context import build_authorization_context
from app.models import (
    AppUser, Arena, ArenaRink, Association, AvailabilityWindow, Event, IceSlot,
    Season, Team, TeamMembership,
)
from app.routers.proposals import accept_proposal, create_proposal
from app.routers.search import search_opponents
from app.schemas import ProposalCreate
from app.services.matching import find_auto_matches


DAY = date(2027, 1, 10)


@pytest.fixture()
def setup(db):
    association = Association(name="Matching Club")
    db.add(association)
    db.flush()
    season = Season(name="2026-27", start_date=date(2026, 8, 1), end_date=date(2027, 7, 31))
    home = Team(association_id=association.id, name="Home 14U", age_group="14U", level="AA")
    away = Team(association_id=association.id, name="Away 14U", age_group="14U", level="AA")
    arena = Arena(name="Match Arena")
    user = AppUser(auth_id="match-user", email="match@example.com", status="active")
    db.add_all([season, home, away, arena, user])
    db.flush()
    rink = ArenaRink(arena_id=arena.id, name="Main")
    db.add(rink)
    db.flush()
    home_window = AvailabilityWindow(team_id=home.id, season_id=season.id, date=DAY,
        start_time=time(18), end_time=time(19), availability_type="home")
    away_window = AvailabilityWindow(team_id=away.id, season_id=season.id, date=DAY,
        start_time=time(17), end_time=time(20), availability_type="away")
    slot = IceSlot(arena_rink_id=rink.id, date=DAY, start_time=time(18), end_time=time(19))
    db.add_all([home_window, away_window, slot,
        TeamMembership(user_id=user.id, team_id=home.id, role="scheduler"),
        TeamMembership(user_id=user.id, team_id=away.id, role="scheduler")])
    db.commit()
    return home, away, home_window, away_window, arena, rink, slot, user


def search(db, setup, side):
    home, away, home_window, away_window, _, _, _, user = setup
    team, window = (home, home_window) if side == "home" else (away, away_window)
    return search_opponents(team_id=team.id, availability_window_id=window.id,
        max_distance_miles=None, level=None, age_group=None, min_ranking=None,
        max_ranking=None, arena_id=None, context=build_authorization_context(db, user), db=db)


def assert_matches(db, setup, expected):
    home, away, home_window, away_window, *_ = setup
    for side, team in [("home", home), ("away", away)]:
        results = search(db, setup, side)
        assert len(results) == expected
        matches = find_auto_matches(db, team.id)
        assert len(matches) == expected
        if expected:
            assert matches[0].home_availability_window_id == home_window.id
            assert matches[0].away_availability_window_id == away_window.id


@pytest.mark.parametrize("start,end,expected", [
    (time(17), time(20), 1),  # full game inside a broader away window
    (time(18), time(19), 1),  # exact original match
    (time(18), time(20), 1),
    (time(17), time(19), 1),
    (time(18, 45), time(20), 0),  # only 15 minutes of overlap
    (time(17), time(18, 15), 0),
    (time(18), time(18, 15), 0),  # same start, insufficient duration
    (time(19), time(20), 0),  # touching intervals
    (time(16), time(18), 0),
    (time(20), time(21), 0),
])
def test_full_home_game_must_fit_away_window(db, setup, start, end, expected):
    setup[3].start_time, setup[3].end_time = start, end
    db.commit()
    assert_matches(db, setup, expected)


@pytest.mark.parametrize("start,end", [(None, None), (None, time(20)), (time(17), None)])
def test_unspecified_away_bounds_do_not_require_an_identical_start(db, setup, start, end):
    setup[3].start_time, setup[3].end_time = start, end
    db.commit()
    assert_matches(db, setup, 1)


@pytest.mark.parametrize("end", [None, time(18), time(17)])
def test_home_game_requires_a_positive_known_duration(db, setup, end):
    setup[2].end_time = end
    db.commit()
    assert_matches(db, setup, 0)


@pytest.mark.parametrize("changed", ["date", "season", "age", "type", "status", "blocked"])
def test_existing_candidate_rules_remain(db, setup, changed):
    # Use exact times so these regressions also exercise the original lookup.
    away, window = setup[1], setup[3]
    window.start_time, window.end_time = time(18), time(19)
    if changed == "date":
        window.date = date(2027, 1, 11)
    elif changed == "season":
        other = Season(name="Other", start_date=date(2027, 1, 1), end_date=date(2027, 12, 31))
        db.add(other)
        db.flush()
        window.season_id = other.id
    elif changed == "age":
        away.age_group = "12U"
    elif changed == "type":
        window.availability_type = "home"
    elif changed == "status":
        window.status = "scheduled"
    else:
        window.blocked = True
    db.commit()
    # Only search from the unchanged home team/window.
    assert search(db, setup, "home") == []
    assert find_auto_matches(db, setup[0].id) == []


@pytest.mark.parametrize("team_index", [0, 1])
@pytest.mark.parametrize("event_type", ["practice", "league"])
def test_existing_events_exclude_matches(db, setup, team_index, event_type):
    setup[3].start_time, setup[3].end_time = time(18), time(19)
    team = setup[team_index]
    db.add(Event(home_team_id=team.id, arena_id=setup[4].id, arena_rink_id=setup[5].id,
        date=DAY, start_time=time(18, 30), end_time=time(19, 30), event_type=event_type))
    db.commit()
    assert_matches(db, setup, 0)


def test_cancelled_event_does_not_prevent_matching(db, setup):
    db.add(Event(home_team_id=setup[1].id, arena_id=setup[4].id, arena_rink_id=setup[5].id,
        date=DAY, start_time=time(18, 30), end_time=time(19, 30),
        event_type="practice", status="cancelled"))
    db.commit()
    assert_matches(db, setup, 1)


def test_existing_proposal_is_still_identified_in_search_results(db, setup):
    proposal = create(db, setup)
    for side, team in [("home", setup[0]), ("away", setup[1])]:
        result = search(db, setup, side)[0]
        match = find_auto_matches(db, team.id)[0]
        assert result.has_existing_proposal and match.has_existing_proposal
        assert result.existing_proposal_id == match.existing_proposal_id == proposal.id


@pytest.mark.parametrize("start,end,expected", [
    (time(18, 30), time(19, 30), 0),
    (None, None, 0),  # all-day block
    (time(17), time(18), 1),  # adjacent block is not a conflict
    (time(19), time(20), 1),
])
def test_blocked_periods_constrain_both_search_paths(db, setup, start, end, expected):
    setup[3].start_time, setup[3].end_time = time(18), time(19)
    db.add(AvailabilityWindow(team_id=setup[1].id, date=DAY, start_time=start,
        end_time=end, availability_type="away", blocked=True))
    db.commit()
    assert_matches(db, setup, expected)


def proposal_body(setup):
    home, away, home_window, away_window, arena, rink, slot, _ = setup
    return ProposalCreate(home_team_id=home.id, away_team_id=away.id,
        home_availability_window_id=home_window.id, away_availability_window_id=away_window.id,
        event_type="league", proposed_date=DAY, proposed_start_time=slot.start_time,
        proposed_end_time=slot.end_time, proposed_by_team_id=home.id,
        arena_id=arena.id, arena_rink_id=rink.id, ice_slot_id=slot.id)


def create(db, setup):
    return create_proposal(proposal_body(setup), context=build_authorization_context(db, setup[7]), db=db)


def test_valid_overlap_can_be_proposed_and_accepted(db, setup):
    result = create(db, setup)
    accepted = accept_proposal(result.id, context=build_authorization_context(db, setup[7]), db=db)
    assert accepted.status == "accepted"
    event = db.query(Event).filter(Event.proposal_id == result.id).one()
    assert (event.start_time, event.end_time) == (time(18), time(19))
    assert setup[2].status == setup[3].status == "scheduled"


@pytest.mark.parametrize("change", ["too_early", "too_late", "wrong_date", "blocked", "wrong_type"])
def test_proposal_cannot_bypass_availability(db, setup, change):
    if change == "too_early":
        setup[6].start_time = time(16)
    elif change == "too_late":
        setup[6].end_time = time(21)
    elif change == "wrong_date":
        setup[3].date = date(2027, 1, 11)
    elif change == "blocked":
        setup[3].blocked = True
    else:
        setup[3].availability_type = "home"
    db.commit()
    with pytest.raises(HTTPException) as error:
        create(db, setup)
    assert error.value.status_code in (400, 409)
    assert setup[6].status == "available"
    assert db.query(Event).count() == 0


@pytest.mark.parametrize("change", ["shortened", "blocked", "new_block"])
def test_acceptance_rechecks_availability(db, setup, change):
    result = create(db, setup)
    if change == "shortened":
        setup[3].end_time = time(18, 15)
    elif change == "blocked":
        setup[3].blocked = True
    else:
        db.add(AvailabilityWindow(team_id=setup[1].id, date=DAY, start_time=time(18, 30),
            end_time=time(19), availability_type="away", blocked=True))
    db.commit()
    with pytest.raises(HTTPException) as error:
        accept_proposal(result.id, context=build_authorization_context(db, setup[7]), db=db)
    assert error.value.status_code in (400, 409)
    assert setup[6].status == "held"
    assert db.query(Event).count() == 0
