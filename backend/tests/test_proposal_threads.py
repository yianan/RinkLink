from __future__ import annotations

from datetime import date, time

from sqlalchemy.orm import Session

from app.auth.context import build_authorization_context
from app.models import AppUser, Arena, ArenaRink, Association, AvailabilityWindow, IceSlot, Proposal, Team, TeamMembership
from app.routers.proposals import proposal_history, request_reschedule
from app.schemas import ProposalRescheduleCreate


def make_setup(db: Session):
    association = Association(name="Thread Association", city="Boston", state="MA", zip_code="02108")
    db.add(association)
    db.flush()
    home = Team(
        association_id=association.id,
        name="Thread Home",
        age_group="14U",
        level="AA",
        manager_name="Manager",
        manager_email="manager@example.com",
        manager_phone="555-0100",
    )
    away = Team(
        association_id=association.id,
        name="Thread Away",
        age_group="14U",
        level="AA",
        manager_name="Manager",
        manager_email="manager@example.com",
        manager_phone="555-0101",
    )
    arena = Arena(name="Thread Arena", city="Boston", state="MA", zip_code="02108")
    db.add_all([home, away, arena])
    db.flush()
    rink = ArenaRink(arena_id=arena.id, name="Main")
    db.add(rink)
    db.flush()
    old_slot = IceSlot(
        arena_rink_id=rink.id,
        date=date(2026, 5, 1),
        start_time=time(10, 0),
        end_time=time(11, 0),
        status="held",
        booked_by_team_id=home.id,
    )
    new_slot = IceSlot(
        arena_rink_id=rink.id,
        date=date(2026, 5, 1),
        start_time=time(12, 0),
        end_time=time(13, 0),
        status="available",
    )
    home_window = AvailabilityWindow(
        team_id=home.id,
        date=date(2026, 5, 1),
        start_time=time(10, 0),
        end_time=time(11, 0),
        availability_type="home",
        status="open",
    )
    away_window = AvailabilityWindow(
        team_id=away.id,
        date=date(2026, 5, 1),
        start_time=time(10, 0),
        end_time=time(11, 0),
        availability_type="away",
        status="open",
    )
    user = AppUser(auth_id="auth-thread", email="thread@example.com", status="active", is_platform_admin=False)
    db.add_all([old_slot, new_slot, home_window, away_window, user])
    db.flush()
    db.add(TeamMembership(user_id=user.id, team_id=away.id, role="team_admin"))
    base = Proposal(
        home_team_id=home.id,
        away_team_id=away.id,
        home_availability_window_id=home_window.id,
        away_availability_window_id=away_window.id,
        event_type="league",
        proposed_date=date(2026, 5, 1),
        proposed_start_time=time(10, 0),
        proposed_end_time=time(11, 0),
        status="proposed",
        proposed_by_team_id=home.id,
        arena_id=arena.id,
        arena_rink_id=rink.id,
        ice_slot_id=old_slot.id,
    )
    db.add(base)
    db.commit()
    return user, base, arena, rink, old_slot, new_slot


def test_counter_proposal_creates_thread_revision_and_declines_base(db: Session) -> None:
    user, base, arena, rink, old_slot, new_slot = make_setup(db)
    context = build_authorization_context(db, user)

    counter = request_reschedule(
        base.id,
        ProposalRescheduleCreate(
            event_type="league",
            proposed_date=date(2026, 5, 1),
            proposed_start_time=time(12, 0),
            proposed_end_time=time(13, 0),
            proposed_by_team_id=base.away_team_id,
            arena_id=arena.id,
            arena_rink_id=rink.id,
            ice_slot_id=new_slot.id,
            message="Noon works better",
        ),
        context=context,
        db=db,
    )

    db.refresh(base)
    db.refresh(old_slot)
    db.refresh(new_slot)
    assert base.status == "declined"
    assert old_slot.status == "available"
    assert new_slot.status == "held"
    assert counter.parent_proposal_id == base.id
    assert counter.thread_root_proposal_id == base.id
    assert counter.revision_number == 2

    history = proposal_history(counter.id, context=context, db=db)
    assert [item.id for item in history] == [base.id, counter.id]
