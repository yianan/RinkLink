from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from app.models import AppUser, Arena, ArenaRink, Association, Event, Season, Team, TeamCompetitionMembership, Competition, CompetitionDivision
from app.routers.public import list_public_standings, list_public_team_events, list_public_teams


def make_association(db: Session, name: str) -> Association:
    association = Association(name=name, city="Boston", state="MA", zip_code="02108")
    db.add(association)
    db.flush()
    return association


def make_team(db: Session, association: Association, name: str, *, age_group: str = "14U", level: str = "AA") -> Team:
    team = Team(
        association_id=association.id,
        name=name,
        age_group=age_group,
        level=level,
        manager_name="Manager",
        manager_email="manager@example.com",
        manager_phone="555-0100",
    )
    db.add(team)
    db.flush()
    return team


def make_season(db: Session) -> Season:
    season = Season(
        name="2026 Season",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
        is_active=True,
    )
    db.add(season)
    db.flush()
    return season


def make_pending_user(db: Session) -> AppUser:
    user = AppUser(
        auth_id="auth-pending-public",
        email="pending-public@example.com",
        status="pending",
        is_platform_admin=False,
    )
    db.add(user)
    db.flush()
    return user


def make_arena(db: Session, name: str) -> tuple[Arena, ArenaRink]:
    arena = Arena(name=name, city="Boston", state="MA", zip_code="02108")
    db.add(arena)
    db.flush()
    rink = ArenaRink(arena_id=arena.id, name=f"{name} Rink")
    db.add(rink)
    db.flush()
    return arena, rink


def make_competition_membership(db: Session, team: Team, season: Season) -> None:
    competition = Competition(
        name="Central League",
        short_name="CL",
        governing_body="League",
        competition_type="league",
        region="Midwest",
    )
    db.add(competition)
    db.flush()
    division = CompetitionDivision(
        competition_id=competition.id,
        season_id=season.id,
        name="14U AA",
        age_group=team.age_group,
        level=team.level,
        standings_enabled=True,
        sort_order=0,
    )
    db.add(division)
    db.flush()
    db.add(
        TeamCompetitionMembership(
            team_id=team.id,
            season_id=season.id,
            competition_division_id=division.id,
            membership_role="participant",
            is_primary=True,
            sort_order=0,
        )
    )
    db.flush()


def test_pending_user_public_team_browse_is_filtered_by_season_membership(db: Session) -> None:
    association = make_association(db, "Browse Association")
    season = make_season(db)
    in_season_team = make_team(db, association, "In Season Team")
    out_of_season_team = make_team(db, association, "Out Of Season Team")
    make_competition_membership(db, in_season_team, season)
    pending_user = make_pending_user(db)
    db.commit()

    teams = list_public_teams(season_id=season.id, _=pending_user, db=db)

    assert [team.id for team in teams] == [in_season_team.id]
    assert teams[0].association_name == association.name


def test_pending_user_public_schedule_excludes_cancelled_events(db: Session) -> None:
    association = make_association(db, "Schedule Association")
    season = make_season(db)
    home_team = make_team(db, association, "Home Team")
    away_team = make_team(db, association, "Away Team")
    arena, rink = make_arena(db, "Browse Arena")
    pending_user = make_pending_user(db)
    db.add_all([
        Event(
            event_type="league",
            status="scheduled",
            home_team_id=home_team.id,
            away_team_id=away_team.id,
            season_id=season.id,
            arena_id=arena.id,
            arena_rink_id=rink.id,
            date=date(2026, 4, 4),
        ),
        Event(
            event_type="league",
            status="cancelled",
            home_team_id=home_team.id,
            away_team_id=away_team.id,
            season_id=season.id,
            arena_id=arena.id,
            arena_rink_id=rink.id,
            date=date(2026, 4, 5),
        ),
    ])
    db.commit()

    events = list_public_team_events(team_id=home_team.id, season_id=season.id, _=pending_user, db=db)

    assert len(events) == 1
    assert events[0].status == "scheduled"
    assert events[0].arena_name == arena.name


def test_pending_user_public_standings_are_available_for_matching_group(db: Session) -> None:
    association = make_association(db, "Standings Association")
    season = make_season(db)
    team_a = make_team(db, association, "Team A")
    team_b = make_team(db, association, "Team B")
    arena, rink = make_arena(db, "Standings Arena")
    pending_user = make_pending_user(db)
    db.add(
        Event(
            event_type="league",
            status="final",
            home_team_id=team_a.id,
            away_team_id=team_b.id,
            season_id=season.id,
            arena_id=arena.id,
            arena_rink_id=rink.id,
            date=date(2026, 2, 20),
            home_score=3,
            away_score=1,
            counts_for_standings=True,
        )
    )
    db.commit()

    standings = list_public_standings(
        season_id=season.id,
        association_id=association.id,
        age_group=team_a.age_group,
        level=team_a.level,
        _=pending_user,
        db=db,
    )

    assert [entry.team_name for entry in standings] == ["Team A", "Team B"]
    assert standings[0].points > standings[1].points
