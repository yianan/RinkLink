import uuid
from datetime import date, time, timedelta
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from ..database import Base
from ..models import (
    Arena,
    ArenaRink,
    Association,
    AvailabilityWindow,
    Competition,
    CompetitionDivision,
    Event,
    IceSlot,
    LockerRoom,
    Notification,
    Player,
    Proposal,
    Season,
    Team,
    TeamCompetitionMembership,
    TeamSeasonRecord,
    TeamSeasonVenueAssignment,
    ZipCode,
)
from ..services.records import recompute_team_records
from ..services.season_utils import canonical_season_bounds, canonical_season_name


def _id() -> str:
    return str(uuid.uuid4())


def _current_alembic_head() -> str:
    alembic_ini_path = Path(__file__).resolve().parents[2] / "alembic.ini"
    config = Config(str(alembic_ini_path))
    script = ScriptDirectory.from_config(config)
    return script.get_current_head()


def _stamp_alembic_head(db: Session) -> None:
    head = _current_alembic_head()
    bind = db.get_bind()
    with bind.begin() as conn:
        conn.exec_driver_sql(
            "CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY)"
        )
        conn.exec_driver_sql("DELETE FROM alembic_version")
        conn.execute(text("INSERT INTO alembic_version (version_num) VALUES (:version_num)"), {"version_num": head})


def _drop_all_tables(db: Session) -> None:
    bind = db.get_bind()
    with bind.begin() as conn:
        inspector = inspect(conn)
        table_names = inspector.get_table_names()
        if bind.dialect.name == "sqlite":
            conn.exec_driver_sql("PRAGMA foreign_keys=OFF")
        for table_name in table_names:
            if bind.dialect.name == "postgresql":
                conn.exec_driver_sql(f'DROP TABLE IF EXISTS "{table_name}" CASCADE')
            else:
                conn.exec_driver_sql(f'DROP TABLE IF EXISTS "{table_name}"')
        if bind.dialect.name == "sqlite":
            conn.exec_driver_sql("PRAGMA foreign_keys=ON")


def seed_zip_codes(db: Session):
    zips = [
        ("60091", "Wilmette", "IL", 42.0764, -87.7229),
        ("60106", "Bensenville", "IL", 41.9553, -87.9401),
        ("60134", "Geneva", "IL", 41.8872, -88.3054),
        ("60025", "Glenview", "IL", 42.0698, -87.7878),
        ("60062", "Northbrook", "IL", 42.1275, -87.8290),
    ]
    for zip_code, city, state, lat, lon in zips:
        if not db.get(ZipCode, zip_code):
            db.add(ZipCode(zip_code=zip_code, city=city, state=state, latitude=lat, longitude=lon))
    db.commit()


def seed_demo_data(db: Session):
    db.rollback()
    _drop_all_tables(db)
    bind = db.get_bind()
    Base.metadata.create_all(bind=bind)
    _stamp_alembic_head(db)

    seed_zip_codes(db)

    season_id = _id()
    season_start, season_end = canonical_season_bounds(2025)
    season = Season(
        id=season_id,
        name=canonical_season_name(2025),
        start_date=season_start,
        end_date=season_end,
        is_active=True,
    )
    db.add(season)

    associations = [
        Association(id=_id(), name="Northshore Youth Hockey", address="1215 Wilmette Ave", city="Wilmette", state="IL", zip_code="60091", logo_path="northshore-club-demo.svg"),
        Association(id=_id(), name="Chicago Mission", address="900 W Devon Ave", city="Bensenville", state="IL", zip_code="60106", logo_path="mission-club-official.png"),
        Association(id=_id(), name="Team Illinois", address="710 Western Ave", city="Geneva", state="IL", zip_code="60134", logo_path="team-illinois-club-official.png"),
    ]
    db.add_all(associations)
    db.flush()

    teams = [
        Team(id=_id(), association_id=associations[0].id, name="Northshore 14U AA", age_group="14U", level="AA", manager_name="Mike Johnson", manager_email="mike@northshore.org", manager_phone="847-555-0101", logo_path="northshore-demo.svg", myhockey_ranking=15),
        Team(id=_id(), association_id=associations[0].id, name="Northshore 12U A", age_group="12U", level="A", manager_name="Sarah Chen", manager_email="sarah@northshore.org", manager_phone="847-555-0102", logo_path="northshore-demo.svg", myhockey_ranking=25),
        Team(id=_id(), association_id=associations[1].id, name="Mission 14U AA", age_group="14U", level="AA", manager_name="Tom Williams", manager_email="tom@mission.org", manager_phone="630-555-0201", logo_path="mission-official.png", myhockey_ranking=8),
        Team(id=_id(), association_id=associations[1].id, name="Mission 12U A", age_group="12U", level="A", manager_name="Lisa Park", manager_email="lisa@mission.org", manager_phone="630-555-0202", logo_path="mission-official.png", myhockey_ranking=12),
        Team(id=_id(), association_id=associations[2].id, name="Team IL 14U AA", age_group="14U", level="AA", manager_name="Dave Brown", manager_email="dave@teamil.org", manager_phone="630-555-0301", logo_path="team-illinois-official.png", myhockey_ranking=20),
        Team(id=_id(), association_id=associations[2].id, name="Team IL 12U A", age_group="12U", level="A", manager_name="Amy White", manager_email="amy@teamil.org", manager_phone="630-555-0302", logo_path="team-illinois-official.png", myhockey_ranking=30),
    ]
    db.add_all(teams)
    db.flush()

    arenas = [
        Arena(id=_id(), name="Centennial Ice Arena", address="2300 Old Glenview Rd", city="Wilmette", state="IL", zip_code="60091", phone="847-555-1100", contact_email="ops@centennialice.com", logo_path="centennial-demo.svg", website="https://centennial.example.com"),
        Arena(id=_id(), name="Edge Ice Center", address="4500 Devon Ave", city="Bensenville", state="IL", zip_code="60106", phone="630-555-1200", contact_email="ops@edgeice.com", logo_path="edge-demo.svg", website="https://edge.example.com"),
        Arena(id=_id(), name="Fox Valley Ice House", address="710 Western Ave", city="Geneva", state="IL", zip_code="60134", phone="630-555-1300", contact_email="ops@foxvalleyice.com", logo_path="foxvalley-demo.svg", website="https://foxvalley.example.com"),
    ]
    db.add_all(arenas)
    db.flush()

    today = date.today()
    anchor_date = min(max(today, season_start + timedelta(days=30)), season_end - timedelta(days=14))
    confirmed_game_date = anchor_date + timedelta(days=2)
    proposal_date = anchor_date + timedelta(days=3)
    practice_date = anchor_date + timedelta(days=1)
    open_date = anchor_date + timedelta(days=5)
    search_demo_date = anchor_date + timedelta(days=6)
    showcase_date = anchor_date + timedelta(days=10)
    live_game_date = today
    completed_game_date = anchor_date - timedelta(days=14)
    completed_aa_game_date = anchor_date - timedelta(days=10)
    completed_team_il_12u_date = anchor_date - timedelta(days=8)
    completed_team_il_14u_date = anchor_date - timedelta(days=6)

    arena_rinks: list[ArenaRink] = []
    locker_rooms: list[LockerRoom] = []
    for arena in arenas:
        for idx, rink_name in enumerate(("Rink A", "Rink B"), start=1):
            arena_rink = ArenaRink(id=_id(), arena_id=arena.id, name=rink_name, display_order=idx)
            arena_rinks.append(arena_rink)
            db.add(arena_rink)
            db.flush()
            for locker_idx, room_name in enumerate(("Home", "Away", "Practice"), start=1):
                locker_room = LockerRoom(
                    id=_id(),
                    arena_rink_id=arena_rink.id,
                    name=f"{room_name} {rink_name}",
                    display_order=locker_idx,
                )
                locker_rooms.append(locker_room)
                db.add(locker_room)
    db.flush()

    slots: list[IceSlot] = []
    slot_specs = [
        (arenas[0], "Rink A", confirmed_game_date, time(17, 0), time(18, 15)),
        (arenas[0], "Rink B", proposal_date, time(18, 0), time(19, 15)),
        (arenas[1], "Rink B", open_date, time(16, 30), time(17, 45)),
        (arenas[1], "Rink A", search_demo_date, time(18, 30), time(19, 45)),
        (arenas[2], "Rink A", practice_date, time(19, 0), time(20, 15)),
        (arenas[2], "Rink B", showcase_date, time(17, 30), time(18, 45)),
        (arenas[1], "Rink A", live_game_date, time(18, 0), time(19, 15)),
    ]
    for arena, rink_name, slot_date, start_time, end_time in slot_specs:
        arena_rink = next(rink for rink in arena_rinks if rink.arena_id == arena.id and rink.name == rink_name)
        slot = IceSlot(id=_id(), arena_rink_id=arena_rink.id, date=slot_date, start_time=start_time, end_time=end_time)
        slots.append(slot)
        db.add(slot)
    db.flush()

    league_id = _id()
    showcase_id = _id()
    tournament_id = _id()
    competitions = [
        Competition(id=league_id, name="Central States Development Hockey League", short_name="CSDHL", governing_body="AHAI", competition_type="league", region="Illinois", website="https://csdhl.example.com"),
        Competition(id=showcase_id, name="CCM Windy City Showcase", short_name="CCM Showcase", governing_body="Independent", competition_type="showcase", region="Chicago"),
        Competition(id=tournament_id, name="AHAI Invitational Tournament", short_name="AHAI Invite", governing_body="AHAI", competition_type="tournament", region="Illinois"),
    ]
    db.add_all(competitions)
    db.flush()

    divisions = [
        CompetitionDivision(id=_id(), competition_id=league_id, season_id=season_id, name="14U AA", age_group="14U", level="AA", standings_enabled=True, sort_order=10),
        CompetitionDivision(id=_id(), competition_id=league_id, season_id=season_id, name="12U A", age_group="12U", level="A", standings_enabled=True, sort_order=20),
        CompetitionDivision(id=_id(), competition_id=showcase_id, season_id=season_id, name="14U Invite", age_group="14U", level="AA", standings_enabled=False, sort_order=30),
        CompetitionDivision(id=_id(), competition_id=tournament_id, season_id=season_id, name="12U Qualifier", age_group="12U", level="A", standings_enabled=False, sort_order=40),
    ]
    db.add_all(divisions)
    db.flush()

    memberships = [
        TeamCompetitionMembership(team_id=teams[0].id, season_id=season_id, competition_division_id=divisions[0].id, membership_role="primary", is_primary=True, sort_order=10),
        TeamCompetitionMembership(team_id=teams[2].id, season_id=season_id, competition_division_id=divisions[0].id, membership_role="primary", is_primary=True, sort_order=10),
        TeamCompetitionMembership(team_id=teams[4].id, season_id=season_id, competition_division_id=divisions[0].id, membership_role="primary", is_primary=True, sort_order=10),
        TeamCompetitionMembership(team_id=teams[1].id, season_id=season_id, competition_division_id=divisions[1].id, membership_role="primary", is_primary=True, sort_order=10),
        TeamCompetitionMembership(team_id=teams[3].id, season_id=season_id, competition_division_id=divisions[1].id, membership_role="primary", is_primary=True, sort_order=10),
        TeamCompetitionMembership(team_id=teams[5].id, season_id=season_id, competition_division_id=divisions[1].id, membership_role="primary", is_primary=True, sort_order=10),
        TeamCompetitionMembership(team_id=teams[0].id, season_id=season_id, competition_division_id=divisions[2].id, membership_role="showcase", is_primary=False, sort_order=20),
        TeamCompetitionMembership(team_id=teams[2].id, season_id=season_id, competition_division_id=divisions[2].id, membership_role="showcase", is_primary=False, sort_order=20),
        TeamCompetitionMembership(team_id=teams[1].id, season_id=season_id, competition_division_id=divisions[3].id, membership_role="tournament", is_primary=False, sort_order=20),
        TeamCompetitionMembership(team_id=teams[3].id, season_id=season_id, competition_division_id=divisions[3].id, membership_role="tournament", is_primary=False, sort_order=20),
    ]
    db.add_all(memberships)
    db.flush()

    assignments = [
        TeamSeasonVenueAssignment(team_id=teams[0].id, season_id=season_id, arena_id=arenas[0].id, arena_rink_id=arena_rinks[0].id, default_locker_room_id=locker_rooms[0].id),
        TeamSeasonVenueAssignment(team_id=teams[1].id, season_id=season_id, arena_id=arenas[0].id, arena_rink_id=arena_rinks[1].id, default_locker_room_id=locker_rooms[3].id),
        TeamSeasonVenueAssignment(team_id=teams[2].id, season_id=season_id, arena_id=arenas[1].id, arena_rink_id=arena_rinks[2].id, default_locker_room_id=locker_rooms[6].id),
        TeamSeasonVenueAssignment(team_id=teams[3].id, season_id=season_id, arena_id=arenas[1].id, arena_rink_id=arena_rinks[3].id, default_locker_room_id=locker_rooms[9].id),
        TeamSeasonVenueAssignment(team_id=teams[4].id, season_id=season_id, arena_id=arenas[2].id, arena_rink_id=arena_rinks[4].id, default_locker_room_id=locker_rooms[12].id),
        TeamSeasonVenueAssignment(team_id=teams[5].id, season_id=season_id, arena_id=arenas[2].id, arena_rink_id=arena_rinks[5].id, default_locker_room_id=locker_rooms[15].id),
    ]
    db.add_all(assignments)
    db.flush()

    availability = [
        AvailabilityWindow(id=_id(), team_id=teams[0].id, season_id=season_id, date=confirmed_game_date, start_time=time(17, 0), end_time=time(18, 15), availability_type="home"),
        AvailabilityWindow(id=_id(), team_id=teams[2].id, season_id=season_id, date=confirmed_game_date, start_time=time(17, 0), end_time=time(18, 15), availability_type="away"),
        AvailabilityWindow(id=_id(), team_id=teams[1].id, season_id=season_id, date=proposal_date, start_time=time(18, 0), end_time=time(19, 15), availability_type="home"),
        AvailabilityWindow(id=_id(), team_id=teams[3].id, season_id=season_id, date=proposal_date, start_time=time(18, 0), end_time=time(19, 15), availability_type="away"),
        AvailabilityWindow(id=_id(), team_id=teams[4].id, season_id=season_id, date=open_date, start_time=time(17, 30), end_time=time(18, 45), availability_type="home"),
        AvailabilityWindow(id=_id(), team_id=teams[0].id, season_id=season_id, date=open_date, start_time=None, end_time=None, availability_type="away"),
        AvailabilityWindow(id=_id(), team_id=teams[3].id, season_id=season_id, date=search_demo_date, start_time=time(18, 30), end_time=time(19, 45), availability_type="home"),
        AvailabilityWindow(id=_id(), team_id=teams[5].id, season_id=season_id, date=search_demo_date, start_time=time(18, 30), end_time=time(19, 45), availability_type="away"),
    ]
    db.add_all(availability)
    db.flush()

    proposal = Proposal(
        id=_id(),
        home_team_id=teams[1].id,
        away_team_id=teams[3].id,
        home_availability_window_id=availability[2].id,
        away_availability_window_id=availability[3].id,
        event_type="league",
        proposed_date=proposal_date,
        proposed_start_time=time(18, 0),
        proposed_end_time=time(19, 15),
        status="proposed",
        proposed_by_team_id=teams[1].id,
        arena_id=arenas[0].id,
        arena_rink_id=arena_rinks[1].id,
        ice_slot_id=slots[1].id,
        message="Can you do Sunday evening at Centennial?",
    )
    db.add(proposal)
    db.flush()

    events = [
        Event(
            id=_id(),
            event_type="league",
            status="confirmed",
            home_team_id=teams[0].id,
            away_team_id=teams[2].id,
            home_availability_window_id=availability[0].id,
            away_availability_window_id=availability[1].id,
            season_id=season_id,
            competition_division_id=divisions[0].id,
            arena_id=arenas[0].id,
            arena_rink_id=arena_rinks[0].id,
            ice_slot_id=slots[0].id,
            home_locker_room_id=locker_rooms[0].id,
            away_locker_room_id=locker_rooms[1].id,
            date=confirmed_game_date,
            start_time=time(17, 0),
            end_time=time(18, 15),
            counts_for_standings=True,
            home_weekly_confirmed=True,
            away_weekly_confirmed=True,
        ),
        Event(
            id=_id(),
            event_type="practice",
            status="scheduled",
            home_team_id=teams[3].id,
            away_team_id=None,
            season_id=season_id,
            arena_id=arenas[1].id,
            arena_rink_id=arena_rinks[3].id,
            ice_slot_id=slots[3].id,
            home_locker_room_id=locker_rooms[11].id,
            away_locker_room_id=None,
            date=practice_date,
            start_time=time(19, 0),
            end_time=time(20, 15),
            notes="Skills session",
        ),
        Event(
            id=_id(),
            event_type="showcase",
            status="scheduled",
            home_team_id=teams[0].id,
            away_team_id=teams[4].id,
            season_id=season_id,
            competition_division_id=divisions[2].id,
            arena_id=arenas[2].id,
            arena_rink_id=arena_rinks[5].id,
            ice_slot_id=slots[4].id,
            home_locker_room_id=locker_rooms[15].id,
            away_locker_room_id=locker_rooms[16].id,
            date=showcase_date,
            start_time=time(17, 30),
            end_time=time(18, 45),
        ),
        Event(
            id=_id(),
            event_type="league",
            status="confirmed",
            home_team_id=teams[3].id,
            away_team_id=teams[1].id,
            season_id=season_id,
            competition_division_id=divisions[1].id,
            arena_id=arenas[1].id,
            arena_rink_id=arena_rinks[2].id,
            ice_slot_id=slots[6].id,
            home_locker_room_id=locker_rooms[6].id,
            away_locker_room_id=locker_rooms[7].id,
            date=live_game_date,
            start_time=time(18, 0),
            end_time=time(19, 15),
            counts_for_standings=True,
            home_weekly_confirmed=True,
            away_weekly_confirmed=True,
        ),
        Event(
            id=_id(),
            event_type="league",
            status="final",
            home_team_id=teams[3].id,
            away_team_id=teams[1].id,
            season_id=season_id,
            competition_division_id=divisions[1].id,
            arena_id=arenas[1].id,
            arena_rink_id=arena_rinks[3].id,
            home_locker_room_id=locker_rooms[9].id,
            away_locker_room_id=locker_rooms[10].id,
            date=completed_game_date,
            start_time=time(18, 0),
            end_time=time(19, 15),
            home_score=1,
            away_score=4,
            counts_for_standings=True,
        ),
        Event(
            id=_id(),
            event_type="league",
            status="final",
            home_team_id=teams[0].id,
            away_team_id=teams[2].id,
            season_id=season_id,
            competition_division_id=divisions[0].id,
            arena_id=arenas[0].id,
            arena_rink_id=arena_rinks[0].id,
            home_locker_room_id=locker_rooms[0].id,
            away_locker_room_id=locker_rooms[1].id,
            date=completed_aa_game_date,
            start_time=time(17, 15),
            end_time=time(18, 30),
            home_score=3,
            away_score=2,
            counts_for_standings=True,
        ),
        Event(
            id=_id(),
            event_type="exhibition",
            status="final",
            home_team_id=teams[5].id,
            away_team_id=teams[1].id,
            season_id=season_id,
            arena_id=arenas[2].id,
            arena_rink_id=arena_rinks[4].id,
            home_locker_room_id=locker_rooms[12].id,
            away_locker_room_id=locker_rooms[13].id,
            date=completed_team_il_12u_date,
            start_time=time(18, 15),
            end_time=time(19, 30),
            home_score=4,
            away_score=3,
        ),
        Event(
            id=_id(),
            event_type="scrimmage",
            status="final",
            home_team_id=teams[4].id,
            away_team_id=teams[0].id,
            season_id=season_id,
            arena_id=arenas[2].id,
            arena_rink_id=arena_rinks[5].id,
            home_locker_room_id=locker_rooms[15].id,
            away_locker_room_id=locker_rooms[16].id,
            date=completed_team_il_14u_date,
            start_time=time(17, 45),
            end_time=time(19, 0),
            home_score=2,
            away_score=2,
        ),
    ]
    db.add_all(events)
    db.flush()

    slots[0].status = "booked"
    slots[0].booked_by_team_id = teams[0].id
    slots[3].status = "booked"
    slots[3].booked_by_team_id = teams[3].id
    slots[6].status = "booked"
    slots[6].booked_by_team_id = teams[3].id

    availability[0].status = "scheduled"
    availability[0].opponent_team_id = teams[2].id
    availability[1].status = "scheduled"
    availability[1].opponent_team_id = teams[0].id

    def add_roster(team_id: str, last_name_prefix: str):
        roster = [
            (1, "Jake", f"{last_name_prefix}Miller", "G"),
            (2, "Ethan", f"{last_name_prefix}Davis", "D"),
            (3, "Noah", f"{last_name_prefix}Wilson", "D"),
            (4, "Liam", f"{last_name_prefix}Martinez", "D"),
            (5, "Mason", f"{last_name_prefix}Anderson", "D"),
            (7, "Logan", f"{last_name_prefix}Thompson", "F"),
            (9, "Aiden", f"{last_name_prefix}Moore", "F"),
            (11, "Lucas", f"{last_name_prefix}Taylor", "F"),
            (12, "Jack", f"{last_name_prefix}Thomas", "F"),
            (15, "Henry", f"{last_name_prefix}Jackson", "F"),
            (17, "Owen", f"{last_name_prefix}White", "F"),
            (19, "Caleb", f"{last_name_prefix}Harris", "F"),
        ]
        for jersey_number, first_name, last_name, position in roster:
            db.add(
                Player(
                    id=_id(),
                    team_id=team_id,
                    season_id=season_id,
                    first_name=first_name,
                    last_name=last_name,
                    position=position,
                    jersey_number=jersey_number,
                )
            )

    add_roster(teams[0].id, "NS14-")
    add_roster(teams[1].id, "NS12-")
    add_roster(teams[2].id, "MI14-")
    add_roster(teams[3].id, "MI12-")
    add_roster(teams[4].id, "TI14-")
    add_roster(teams[5].id, "TI12-")

    db.commit()

    for team in teams:
        recompute_team_records(db, team.id)
    db.commit()

    return {
        "associations": len(associations),
        "teams": len(teams),
        "arenas": len(arenas),
        "arena_rinks": len(arena_rinks),
        "locker_rooms": len(locker_rooms),
        "ice_slots": len(slots),
        "availability_windows": len(availability),
        "events": len(events),
        "proposals": 1,
    }
