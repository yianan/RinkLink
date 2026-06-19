from __future__ import annotations

from datetime import date

import pytest

from app.models import AppUser, Arena, Association, Competition, Event, IceBookingRequest, Proposal, Season, Team, TeamCompetitionMembership
from app.seed.pinned_admins import pinned_platform_admin_emails, repair_pinned_platform_admins
from app.seed.seed_data import PreservedAppUser, seed_demo_data
from app.services.season_utils import ensure_standard_seasons
from app.services.schedule_conflicts import find_event_conflicts


def test_demo_reseed_pins_justin_as_platform_admin_by_default(monkeypatch) -> None:
    monkeypatch.delenv("RINKLINK_PINNED_PLATFORM_ADMIN_EMAILS", raising=False)

    assert "justin.visconti@gmail.com" in pinned_platform_admin_emails()


@pytest.mark.parametrize(
    ("configured", "expected"),
    [
        ("admin@example.com, other@example.com", {"admin@example.com", "other@example.com"}),
        ("", set()),
    ],
)
def test_demo_reseed_pinned_admins_can_be_configured(monkeypatch, configured: str, expected: set[str]) -> None:
    monkeypatch.setenv("RINKLINK_PINNED_PLATFORM_ADMIN_EMAILS", configured)

    assert pinned_platform_admin_emails() == expected


def test_repair_pinned_platform_admins_promotes_existing_user(db, monkeypatch) -> None:
    monkeypatch.setenv("RINKLINK_PINNED_PLATFORM_ADMIN_EMAILS", "justin.visconti@gmail.com")
    user = AppUser(
        auth_id="auth-justin",
        email="justin.visconti@gmail.com",
        display_name="Justin Visconti",
        status="pending",
        access_state="disabled",
        auth_state="disabled",
        is_platform_admin=False,
    )
    db.add(user)
    db.commit()

    repaired = repair_pinned_platform_admins(db)
    db.refresh(user)

    assert repaired == 1
    assert user.status == "active"
    assert user.access_state == "active"
    assert user.auth_state == "active"
    assert user.is_platform_admin is True


def test_standard_seasons_default_to_next_planning_season_in_june(db) -> None:
    seasons = ensure_standard_seasons(db, today=date(2026, 6, 17))

    assert [(season.name, season.is_active) for season in seasons] == [("2026-2027", True), ("2025-2026", False)]


def test_seed_demo_data_restores_preserved_platform_admin(db) -> None:
    user = AppUser(
        auth_id="auth-render-admin",
        email="render-admin@example.com",
        display_name="Render Admin",
        status="pending",
        is_platform_admin=False,
    )
    db.add(user)
    db.commit()
    auth_id = user.auth_id
    email = user.email
    display_name = user.display_name

    result = seed_demo_data(
        db,
        preserved_users=[
            PreservedAppUser(
                auth_id=auth_id,
                email=email,
                display_name=display_name,
                status="active",
                is_platform_admin=True,
            )
        ],
    )

    restored_user = db.query(AppUser).filter(AppUser.auth_id == auth_id).one()

    assert restored_user.email == email
    assert restored_user.display_name == display_name
    assert restored_user.status == "active"
    assert restored_user.is_platform_admin is True
    assert db.query(Association).count() > 0
    assert db.query(Team).count() > 0
    associations = db.query(Association).all()
    arenas = db.query(Arena).all()
    teams = db.query(Team).all()
    assert len({association.logo_asset_id for association in associations}) == len(associations)
    assert len({arena.logo_asset_id for arena in arenas}) == len(arenas)
    assert len({team.logo_asset_id for team in teams}) == len(teams)
    proposed_proposals = db.query(Proposal).filter(Proposal.status == "proposed").all()
    intentional_conflict_count = 0
    for proposal in proposed_proposals:
        conflicts = find_event_conflicts(
            db,
            team_ids={proposal.home_team_id, proposal.away_team_id},
            event_date=proposal.proposed_date,
            start_time=proposal.proposed_start_time,
            end_time=proposal.proposed_end_time,
            ice_slot_id=proposal.ice_slot_id,
        )
        if proposal.message and proposal.message.startswith("Conflict demo:"):
            intentional_conflict_count += 1
            assert conflicts, proposal.message
        else:
            assert conflicts == [], proposal.message
    seasons = db.query(Season).order_by(Season.start_date).all()
    assert [(season.name, season.is_active) for season in seasons] == [("2025-2026", False), ("2026-2027", True)]
    assert db.query(Event).filter(Event.season_id == seasons[0].id).count() > 0
    assert db.query(Event).filter(Event.season_id == seasons[1].id).count() > 0
    completed_league_counts = [
        db.query(Event)
        .filter(
            Event.season_id == season.id,
            Event.event_type == "league",
            Event.status == "final",
            Event.home_score.isnot(None),
            Event.away_score.isnot(None),
        )
        .count()
        for season in seasons
    ]
    assert completed_league_counts[0] > completed_league_counts[1]
    assert completed_league_counts[1] == 2
    latest_active_final = (
        db.query(Event.date)
        .filter(
            Event.season_id == seasons[1].id,
            Event.event_type == "league",
            Event.status == "final",
        )
        .order_by(Event.date.desc())
        .first()
    )
    assert latest_active_final is not None
    assert latest_active_final.date <= date(2026, 9, 30)
    assert (
        db.query(Event)
        .filter(
            Event.season_id == seasons[1].id,
            Event.event_type == "league",
            Event.status == "scheduled",
            Event.date > date(2026, 9, 30),
        )
        .count()
        > 0
    )
    for season in seasons:
        assert (
            db.query(TeamCompetitionMembership.team_id)
            .filter(TeamCompetitionMembership.season_id == season.id)
            .distinct()
            .count()
        ) == db.query(Team).count()
    assert intentional_conflict_count == 2
    assert db.query(Competition).filter(Competition.competition_type.in_(("tournament", "state_tournament"))).count() == 0
    assert db.query(Event).filter(Event.event_type.in_(("tournament", "state_tournament"))).count() == 0
    assert db.query(IceBookingRequest).filter(IceBookingRequest.event_type.in_(("tournament", "state_tournament"))).count() == 0
    assert db.query(TeamCompetitionMembership.team_id).distinct().count() == db.query(Team).count()
    assert result["seasons"] == 2
    assert result["preserved_users"] == 1
