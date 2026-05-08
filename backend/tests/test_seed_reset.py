from __future__ import annotations

from app.models import AppUser, Arena, Association, Proposal, Team, TeamCompetitionMembership
from app.seed.seed_data import PreservedAppUser, seed_demo_data
from app.services.schedule_conflicts import find_event_conflicts


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
    assert intentional_conflict_count == 1
    assert db.query(TeamCompetitionMembership.team_id).distinct().count() == db.query(Team).count()
    assert result["preserved_users"] == 1
