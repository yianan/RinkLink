from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from app.auth.context import build_authorization_context
from app.models import AppUser, Association, Competition, CompetitionDivision, Season, Team, TeamCompetitionMembership
from app.routers.teams import list_team_summaries, list_teams


def test_team_summaries_omit_heavy_memberships(db: Session):
    association = Association(name="Summary Association", city="Chicago", state="IL", zip_code="60601")
    db.add(association)
    db.flush()

    team = Team(
        association_id=association.id,
        name="Summary Team",
        age_group="14U",
        level="AA",
        manager_name="Demo Manager",
        manager_email="manager@example.com",
        manager_phone="555-0100",
        wins=9,
        losses=2,
        ties=1,
    )
    db.add(team)
    db.flush()

    season = Season(name="2026", start_date=date(2026, 1, 1), end_date=date(2026, 12, 31), is_active=True)
    db.add(season)
    db.flush()

    competition = Competition(name="Demo League", short_name="DL", competition_type="league")
    db.add(competition)
    db.flush()

    division = CompetitionDivision(
        competition_id=competition.id,
        season_id=season.id,
        name="14U AA",
        age_group="14U",
        level="AA",
    )
    db.add(division)
    db.flush()

    db.add(
        TeamCompetitionMembership(
            team_id=team.id,
            competition_division_id=division.id,
            season_id=season.id,
            is_primary=True,
        )
    )
    admin = AppUser(auth_id="auth-summary-admin", email="summary-admin@example.com", status="active", is_platform_admin=True)
    db.add(admin)
    db.commit()

    context = build_authorization_context(db, admin)

    summary = list_team_summaries(association_id=None, age_group=None, level=None, context=context, db=db)[0]
    full = list_teams(
        association_id=None,
        age_group=None,
        level=None,
        season_id=season.id,
        context=context,
        db=db,
    )[0]

    assert summary.id == team.id
    assert summary.association_name == association.name
    assert not hasattr(summary, "memberships")
    assert not hasattr(summary, "manager_email")
    assert full.memberships
