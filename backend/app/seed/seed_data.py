import uuid
from dataclasses import dataclass
from datetime import date, time, timedelta
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from ..database import Base
from ..models import (
    AppUser,
    Arena,
    ArenaRink,
    Association,
    AvailabilityWindow,
    Competition,
    CompetitionDivision,
    Event,
    EventAttendance,
    EventGoalieStat,
    EventPlayerStat,
    IceBookingRequest,
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
from ..services.logo_assets import create_bundled_media_asset
from ..services.records import recompute_team_records
from ..services.season_utils import canonical_season_bounds, canonical_season_name


def _id() -> str:
    return str(uuid.uuid4())


@dataclass(slots=True)
class PreservedAppUser:
    auth_id: str
    email: str
    display_name: str | None
    is_platform_admin: bool = True
    status: str = "active"


def preserve_app_user(user: AppUser) -> PreservedAppUser:
    return PreservedAppUser(
        auth_id=user.auth_id,
        email=user.email,
        display_name=user.display_name,
        is_platform_admin=user.is_platform_admin,
        status=user.status,
    )


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


def _restore_preserved_users(db: Session, preserved_users: list[PreservedAppUser]) -> None:
    if not preserved_users:
        return

    for preserved_user in preserved_users:
        db.add(
            AppUser(
                auth_id=preserved_user.auth_id,
                email=preserved_user.email,
                display_name=preserved_user.display_name,
                status=preserved_user.status,
                is_platform_admin=preserved_user.is_platform_admin,
            )
        )
    db.commit()


def _seed_demo_logo_asset(db: Session, *, kind: str, bundled_kind: str, filename: str) -> str:
    asset = create_bundled_media_asset(
        db,
        kind=kind,
        bundled_kind=bundled_kind,
        filename=filename,
    )
    return asset.id


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


def _assert_seed_event_links(db: Session, events: list[Event]) -> None:
    for event in events:
        if not event.ice_slot_id:
            continue
        slot = db.get(IceSlot, event.ice_slot_id)
        if not slot:
            raise RuntimeError(f"Seed event {event.id} references a missing ice slot")
        arena_rink = db.get(ArenaRink, slot.arena_rink_id)
        if not arena_rink:
            raise RuntimeError(f"Seed slot {slot.id} references a missing rink")
        if arena_rink.id != event.arena_rink_id or arena_rink.arena_id != event.arena_id:
            raise RuntimeError(f"Seed event {event.id} does not match its slot arena/rink")
        if slot.date != event.date or slot.start_time != event.start_time or slot.end_time != event.end_time:
            raise RuntimeError(f"Seed event {event.id} does not match its slot date/time")
        linked_request = db.query(IceBookingRequest).filter(IceBookingRequest.event_id == event.id).first()
        if event.proposal_id and linked_request:
            raise RuntimeError(f"Seed event {event.id} should not be linked to both a proposal and a booking request")
        if not event.proposal_id and not linked_request:
            raise RuntimeError(f"Seed event {event.id} must be linked to a proposal or booking request")


def _assert_seed_proposal_links(db: Session, proposals: list[Proposal]) -> None:
    for proposal in proposals:
        if not proposal.ice_slot_id:
            continue
        slot = db.get(IceSlot, proposal.ice_slot_id)
        if not slot:
            raise RuntimeError(f"Seed proposal {proposal.id} references a missing ice slot")
        arena_rink = db.get(ArenaRink, slot.arena_rink_id)
        if not arena_rink:
            raise RuntimeError(f"Seed slot {slot.id} references a missing rink")
        if arena_rink.id != proposal.arena_rink_id or arena_rink.arena_id != proposal.arena_id:
            raise RuntimeError(f"Seed proposal {proposal.id} does not match its slot arena/rink")
        if slot.date != proposal.proposed_date or slot.start_time != proposal.proposed_start_time or slot.end_time != proposal.proposed_end_time:
            raise RuntimeError(f"Seed proposal {proposal.id} does not match its slot date/time")
        if proposal.status == "proposed" and slot.status != "held":
            raise RuntimeError(f"Seed proposal {proposal.id} should hold its slot")
        if proposal.status == "accepted":
            event = db.query(Event).filter(Event.proposal_id == proposal.id).first()
            if not event:
                raise RuntimeError(f"Seed proposal {proposal.id} should have an accepted event")


def _assert_seed_booking_request_links(db: Session, booking_requests: list[IceBookingRequest]) -> None:
    for request in booking_requests:
        slot = db.get(IceSlot, request.ice_slot_id)
        if not slot:
            raise RuntimeError(f"Seed booking request {request.id} references a missing ice slot")
        arena_rink = db.get(ArenaRink, slot.arena_rink_id)
        if not arena_rink:
            raise RuntimeError(f"Seed slot {slot.id} references a missing rink")
        if arena_rink.id != request.arena_rink_id or arena_rink.arena_id != request.arena_id:
            raise RuntimeError(f"Seed booking request {request.id} does not match its slot arena/rink")
        if request.event_id:
            event = db.get(Event, request.event_id)
            if not event:
                raise RuntimeError(f"Seed booking request {request.id} references a missing event")
            if event.ice_slot_id != request.ice_slot_id:
                raise RuntimeError(f"Seed booking request {request.id} does not match its accepted event slot")


def _assert_seed_team_competitions(teams: list[Team], memberships: list[TeamCompetitionMembership]) -> None:
    membership_counts: dict[str, int] = {}
    for membership in memberships:
        membership_counts[membership.team_id] = membership_counts.get(membership.team_id, 0) + 1

    unassigned_team_names = [team.name for team in teams if membership_counts.get(team.id, 0) == 0]
    if unassigned_team_names:
        joined_names = ", ".join(sorted(unassigned_team_names))
        raise RuntimeError(f"Seed teams missing competition memberships: {joined_names}")


def seed_demo_data(
    db: Session,
    *,
    preserved_users: list[PreservedAppUser] | None = None,
):
    preserved_users = preserved_users or []
    db.rollback()
    db.expunge_all()
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

    association_logo_assets = {
        "northshore": _seed_demo_logo_asset(db, kind="association-logo", bundled_kind="association-logos", filename="northshore-club-demo.svg"),
        "mission": _seed_demo_logo_asset(db, kind="association-logo", bundled_kind="association-logos", filename="mission-club-official.png"),
        "team_illinois": _seed_demo_logo_asset(db, kind="association-logo", bundled_kind="association-logos", filename="team-illinois-club-official.png"),
    }
    team_logo_assets = {
        "northshore": _seed_demo_logo_asset(db, kind="team-logo", bundled_kind="team-logos", filename="northshore-demo.svg"),
        "mission": _seed_demo_logo_asset(db, kind="team-logo", bundled_kind="team-logos", filename="mission-official.png"),
        "team_illinois": _seed_demo_logo_asset(db, kind="team-logo", bundled_kind="team-logos", filename="team-illinois-official.png"),
    }
    arena_logo_assets = {
        "centennial": _seed_demo_logo_asset(db, kind="arena-logo", bundled_kind="arena-logos", filename="centennial-demo.svg"),
        "edge": _seed_demo_logo_asset(db, kind="arena-logo", bundled_kind="arena-logos", filename="edge-demo.svg"),
        "fox": _seed_demo_logo_asset(db, kind="arena-logo", bundled_kind="arena-logos", filename="foxvalley-demo.svg"),
    }

    associations = [
        Association(id=_id(), name="Northshore Youth Hockey", address="1215 Wilmette Ave", city="Wilmette", state="IL", zip_code="60091", logo_asset_id=association_logo_assets["northshore"]),
        Association(id=_id(), name="Chicago Mission", address="900 W Devon Ave", city="Bensenville", state="IL", zip_code="60106", logo_asset_id=association_logo_assets["mission"]),
        Association(id=_id(), name="Team Illinois", address="710 Western Ave", city="Geneva", state="IL", zip_code="60134", logo_asset_id=association_logo_assets["team_illinois"]),
    ]
    db.add_all(associations)
    db.flush()

    teams = [
        Team(id=_id(), association_id=associations[0].id, name="Northshore 14U AA", age_group="14U", level="AA", manager_name="Mike Johnson", manager_email="mike@northshore.org", manager_phone="847-555-0101", logo_asset_id=team_logo_assets["northshore"], myhockey_ranking=15),
        Team(id=_id(), association_id=associations[0].id, name="Northshore 12U A", age_group="12U", level="A", manager_name="Sarah Chen", manager_email="sarah@northshore.org", manager_phone="847-555-0102", logo_asset_id=team_logo_assets["northshore"], myhockey_ranking=25),
        Team(id=_id(), association_id=associations[1].id, name="Mission 14U AA", age_group="14U", level="AA", manager_name="Tom Williams", manager_email="tom@mission.org", manager_phone="630-555-0201", logo_asset_id=team_logo_assets["mission"], myhockey_ranking=8),
        Team(id=_id(), association_id=associations[1].id, name="Mission 12U A", age_group="12U", level="A", manager_name="Lisa Park", manager_email="lisa@mission.org", manager_phone="630-555-0202", logo_asset_id=team_logo_assets["mission"], myhockey_ranking=12),
        Team(id=_id(), association_id=associations[2].id, name="Team IL 14U AA", age_group="14U", level="AA", manager_name="Dave Brown", manager_email="dave@teamil.org", manager_phone="630-555-0301", logo_asset_id=team_logo_assets["team_illinois"], myhockey_ranking=20),
        Team(id=_id(), association_id=associations[2].id, name="Team IL 12U A", age_group="12U", level="A", manager_name="Amy White", manager_email="amy@teamil.org", manager_phone="630-555-0302", logo_asset_id=team_logo_assets["team_illinois"], myhockey_ranking=30),
    ]
    db.add_all(teams)
    db.flush()

    arenas = [
        Arena(id=_id(), name="Centennial Ice Arena", address="2300 Old Glenview Rd", city="Wilmette", state="IL", zip_code="60091", phone="847-555-1100", contact_email="ops@centennialice.com", logo_asset_id=arena_logo_assets["centennial"], website="https://centennial.example.com"),
        Arena(id=_id(), name="Edge Ice Center", address="4500 Devon Ave", city="Bensenville", state="IL", zip_code="60106", phone="630-555-1200", contact_email="ops@edgeice.com", logo_asset_id=arena_logo_assets["edge"], website="https://edge.example.com"),
        Arena(id=_id(), name="Fox Valley Ice House", address="710 Western Ave", city="Geneva", state="IL", zip_code="60134", phone="630-555-1300", contact_email="ops@foxvalleyice.com", logo_asset_id=arena_logo_assets["fox"], website="https://foxvalley.example.com"),
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
    request_pending_date = anchor_date + timedelta(days=7)
    request_accepted_date = anchor_date + timedelta(days=8)
    request_pending_opponent_date = anchor_date + timedelta(days=9)
    request_practice_accepted_date = anchor_date + timedelta(days=11)
    request_cancelled_date = anchor_date + timedelta(days=12)
    live_game_date = today
    completed_game_date = anchor_date - timedelta(days=14)
    completed_aa_game_date = anchor_date - timedelta(days=10)
    completed_team_il_12u_date = anchor_date - timedelta(days=8)
    completed_team_il_14u_date = anchor_date - timedelta(days=6)

    arena_rinks: list[ArenaRink] = []
    locker_rooms: list[LockerRoom] = []
    arena_rink_by_key: dict[tuple[str, str], ArenaRink] = {}
    locker_room_by_key: dict[tuple[str, str, str], LockerRoom] = {}
    for arena in arenas:
        for idx, rink_name in enumerate(("Rink A", "Rink B"), start=1):
            arena_rink = ArenaRink(id=_id(), arena_id=arena.id, name=rink_name, display_order=idx)
            arena_rinks.append(arena_rink)
            arena_rink_by_key[(arena.name, rink_name)] = arena_rink
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
                locker_room_by_key[(arena.name, rink_name, room_name)] = locker_room
                db.add(locker_room)
    db.flush()

    slots: list[IceSlot] = []
    slot_by_key: dict[str, IceSlot] = {}
    slot_specs = {
        "centennial_confirmed_game": ("Centennial Ice Arena", "Rink A", confirmed_game_date, time(17, 0), time(18, 15), "fixed_price", 46500),
        "centennial_proposal": ("Centennial Ice Arena", "Rink B", proposal_date, time(18, 0), time(19, 15), "fixed_price", 45000),
        "centennial_open_afternoon": ("Centennial Ice Arena", "Rink A", open_date, time(15, 45), time(17, 0), "fixed_price", 42500),
        "centennial_direct_practice": ("Centennial Ice Arena", "Rink B", open_date, time(18, 15), time(19, 30), "call_for_pricing", None),
        "edge_open_early": ("Edge Ice Center", "Rink B", open_date, time(16, 30), time(17, 45), "fixed_price", 47500),
        "edge_open_late": ("Edge Ice Center", "Rink A", open_date, time(19, 0), time(20, 15), "fixed_price", 51000),
        "edge_live_game": ("Edge Ice Center", "Rink A", live_game_date, time(18, 0), time(19, 15), "fixed_price", 50000),
        "fox_practice": ("Fox Valley Ice House", "Rink A", practice_date, time(19, 0), time(20, 15), "fixed_price", 44000),
        "fox_open_afternoon": ("Fox Valley Ice House", "Rink A", open_date, time(17, 30), time(18, 45), "fixed_price", 45500),
        "fox_open_evening": ("Fox Valley Ice House", "Rink B", open_date, time(20, 0), time(21, 15), "call_for_pricing", None),
        "fox_showcase": ("Fox Valley Ice House", "Rink B", showcase_date, time(17, 30), time(18, 45), "fixed_price", 52000),
        "edge_search_demo": ("Edge Ice Center", "Rink A", search_demo_date, time(18, 30), time(19, 45), "fixed_price", 49500),
        "centennial_request_pending": ("Centennial Ice Arena", "Rink B", request_pending_date, time(20, 0), time(21, 15), "fixed_price", 48500),
        "edge_request_accepted": ("Edge Ice Center", "Rink B", request_accepted_date, time(17, 15), time(18, 30), "call_for_pricing", None),
        "fox_request_pending": ("Fox Valley Ice House", "Rink A", request_pending_opponent_date, time(18, 0), time(19, 15), "fixed_price", 51500),
        "centennial_request_practice_accepted": ("Centennial Ice Arena", "Rink A", request_practice_accepted_date, time(20, 15), time(21, 30), "fixed_price", 43500),
        "fox_request_cancelled": ("Fox Valley Ice House", "Rink B", request_cancelled_date, time(19, 15), time(20, 30), "fixed_price", 56000),
    }
    for slot_key, (arena_name, rink_name, slot_date, start_time, end_time, pricing_mode, price_amount_cents) in slot_specs.items():
        arena_rink = arena_rink_by_key[(arena_name, rink_name)]
        slot = IceSlot(
            id=_id(),
            arena_rink_id=arena_rink.id,
            date=slot_date,
            start_time=start_time,
            end_time=end_time,
            pricing_mode=pricing_mode,
            price_amount_cents=price_amount_cents,
            currency="USD",
        )
        slots.append(slot)
        slot_by_key[slot_key] = slot
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
    _assert_seed_team_competitions(teams, memberships)

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
        arena_rink_id=arena_rink_by_key[("Centennial Ice Arena", "Rink B")].id,
        ice_slot_id=slot_by_key["centennial_proposal"].id,
        message="Can you do Sunday evening at Centennial?",
    )
    db.add(proposal)
    db.flush()

    accepted_confirmed_proposal = Proposal(
        id=_id(),
        home_team_id=teams[0].id,
        away_team_id=teams[2].id,
        home_availability_window_id=availability[0].id,
        away_availability_window_id=availability[1].id,
        event_type="league",
        proposed_date=confirmed_game_date,
        proposed_start_time=time(17, 0),
        proposed_end_time=time(18, 15),
        status="accepted",
        proposed_by_team_id=teams[0].id,
        arena_id=arenas[0].id,
        arena_rink_id=arena_rink_by_key[("Centennial Ice Arena", "Rink A")].id,
        ice_slot_id=slot_by_key["centennial_confirmed_game"].id,
        home_locker_room_id=locker_room_by_key[("Centennial Ice Arena", "Rink A", "Home")].id,
        away_locker_room_id=locker_room_by_key[("Centennial Ice Arena", "Rink A", "Away")].id,
        message="Confirmed for Saturday evening at Centennial.",
    )
    db.add(accepted_confirmed_proposal)
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
            proposal_id=accepted_confirmed_proposal.id,
            season_id=season_id,
            competition_division_id=divisions[0].id,
            arena_id=arenas[0].id,
            arena_rink_id=arena_rink_by_key[("Centennial Ice Arena", "Rink A")].id,
            ice_slot_id=slot_by_key["centennial_confirmed_game"].id,
            home_locker_room_id=locker_room_by_key[("Centennial Ice Arena", "Rink A", "Home")].id,
            away_locker_room_id=locker_room_by_key[("Centennial Ice Arena", "Rink A", "Away")].id,
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
            arena_id=arenas[0].id,
            arena_rink_id=arena_rink_by_key[("Centennial Ice Arena", "Rink B")].id,
            ice_slot_id=slot_by_key["centennial_direct_practice"].id,
            home_locker_room_id=locker_room_by_key[("Centennial Ice Arena", "Rink B", "Practice")].id,
            away_locker_room_id=None,
            date=open_date,
            start_time=time(18, 15),
            end_time=time(19, 30),
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
            arena_rink_id=arena_rink_by_key[("Fox Valley Ice House", "Rink B")].id,
            ice_slot_id=slot_by_key["fox_showcase"].id,
            home_locker_room_id=locker_room_by_key[("Fox Valley Ice House", "Rink B", "Home")].id,
            away_locker_room_id=locker_room_by_key[("Fox Valley Ice House", "Rink B", "Away")].id,
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
            arena_rink_id=arena_rink_by_key[("Edge Ice Center", "Rink A")].id,
            ice_slot_id=slot_by_key["edge_live_game"].id,
            home_locker_room_id=locker_room_by_key[("Edge Ice Center", "Rink A", "Home")].id,
            away_locker_room_id=locker_room_by_key[("Edge Ice Center", "Rink A", "Away")].id,
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
            arena_rink_id=arena_rink_by_key[("Edge Ice Center", "Rink B")].id,
            home_locker_room_id=locker_room_by_key[("Edge Ice Center", "Rink B", "Home")].id,
            away_locker_room_id=locker_room_by_key[("Edge Ice Center", "Rink B", "Away")].id,
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
            arena_rink_id=arena_rink_by_key[("Centennial Ice Arena", "Rink A")].id,
            home_locker_room_id=locker_room_by_key[("Centennial Ice Arena", "Rink A", "Home")].id,
            away_locker_room_id=locker_room_by_key[("Centennial Ice Arena", "Rink A", "Away")].id,
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
            arena_rink_id=arena_rink_by_key[("Fox Valley Ice House", "Rink A")].id,
            home_locker_room_id=locker_room_by_key[("Fox Valley Ice House", "Rink A", "Home")].id,
            away_locker_room_id=locker_room_by_key[("Fox Valley Ice House", "Rink A", "Away")].id,
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
            away_team_id=None,
            season_id=season_id,
            arena_id=arenas[2].id,
            arena_rink_id=arena_rink_by_key[("Fox Valley Ice House", "Rink B")].id,
            home_locker_room_id=locker_room_by_key[("Fox Valley Ice House", "Rink B", "Home")].id,
            away_locker_room_id=None,
            date=completed_team_il_14u_date,
            start_time=time(17, 45),
            end_time=time(19, 0),
            home_score=2,
            away_score=None,
        ),
    ]
    db.add_all(events)
    db.flush()

    accepted_request_event = Event(
        id=_id(),
        event_type="league",
        status="scheduled",
        home_team_id=teams[0].id,
        away_team_id=teams[4].id,
        season_id=season_id,
        competition_division_id=divisions[0].id,
        arena_id=arenas[1].id,
        arena_rink_id=arena_rink_by_key[("Edge Ice Center", "Rink B")].id,
        ice_slot_id=slot_by_key["edge_request_accepted"].id,
        home_locker_room_id=locker_room_by_key[("Edge Ice Center", "Rink B", "Home")].id,
        away_locker_room_id=locker_room_by_key[("Edge Ice Center", "Rink B", "Away")].id,
        date=request_accepted_date,
        start_time=time(17, 15),
        end_time=time(18, 30),
        counts_for_standings=True,
    )
    db.add(accepted_request_event)
    db.flush()

    accepted_practice_request_event = Event(
        id=_id(),
        event_type="practice",
        status="scheduled",
        home_team_id=teams[5].id,
        away_team_id=None,
        season_id=season_id,
        arena_id=arenas[0].id,
        arena_rink_id=arena_rink_by_key[("Centennial Ice Arena", "Rink A")].id,
        ice_slot_id=slot_by_key["centennial_request_practice_accepted"].id,
        home_locker_room_id=locker_room_by_key[("Centennial Ice Arena", "Rink A", "Practice")].id,
        away_locker_room_id=None,
        date=request_practice_accepted_date,
        start_time=time(20, 15),
        end_time=time(21, 30),
        notes="Accepted ice rental for extra team training.",
    )
    db.add(accepted_practice_request_event)
    db.flush()

    cancelled_request_event = Event(
        id=_id(),
        event_type="tournament",
        status="cancelled",
        home_team_id=teams[2].id,
        away_team_id=teams[0].id,
        season_id=season_id,
        competition_division_id=divisions[2].id,
        arena_id=arenas[2].id,
        arena_rink_id=arena_rink_by_key[("Fox Valley Ice House", "Rink B")].id,
        ice_slot_id=slot_by_key["fox_request_cancelled"].id,
        home_locker_room_id=locker_room_by_key[("Fox Valley Ice House", "Rink B", "Home")].id,
        away_locker_room_id=locker_room_by_key[("Fox Valley Ice House", "Rink B", "Away")].id,
        date=request_cancelled_date,
        start_time=time(19, 15),
        end_time=time(20, 30),
        notes="Cancelled after bracket change.",
    )
    db.add(cancelled_request_event)
    db.flush()

    booking_requests = [
        IceBookingRequest(
            id=_id(),
            requester_team_id=teams[3].id,
            away_team_id=None,
            season_id=season_id,
            event_type="practice",
            status="requested",
            arena_id=arenas[0].id,
            arena_rink_id=arena_rink_by_key[("Centennial Ice Arena", "Rink B")].id,
            ice_slot_id=slot_by_key["centennial_request_pending"].id,
            pricing_mode=slot_by_key["centennial_request_pending"].pricing_mode,
            price_amount_cents=slot_by_key["centennial_request_pending"].price_amount_cents,
            currency=slot_by_key["centennial_request_pending"].currency,
            message="Looking for a late-week skills slot.",
        ),
        IceBookingRequest(
            id=_id(),
            requester_team_id=teams[3].id,
            away_team_id=None,
            season_id=season_id,
            event_type="practice",
            status="accepted",
            arena_id=arenas[0].id,
            arena_rink_id=arena_rink_by_key[("Centennial Ice Arena", "Rink B")].id,
            ice_slot_id=slot_by_key["centennial_direct_practice"].id,
            event_id=events[1].id,
            pricing_mode=slot_by_key["centennial_direct_practice"].pricing_mode,
            price_amount_cents=slot_by_key["centennial_direct_practice"].price_amount_cents,
            currency=slot_by_key["centennial_direct_practice"].currency,
            final_price_amount_cents=None,
            final_currency=None,
            home_locker_room_id=locker_room_by_key[("Centennial Ice Arena", "Rink B", "Practice")].id,
            away_locker_room_id=None,
            message="Looking for a weekday skills session.",
            response_message="Accepted. Practice Rink B is assigned.",
        ),
        IceBookingRequest(
            id=_id(),
            requester_team_id=teams[0].id,
            away_team_id=teams[4].id,
            season_id=season_id,
            event_type="showcase",
            status="accepted",
            arena_id=arenas[2].id,
            arena_rink_id=arena_rink_by_key[("Fox Valley Ice House", "Rink B")].id,
            ice_slot_id=slot_by_key["fox_showcase"].id,
            event_id=events[2].id,
            pricing_mode=slot_by_key["fox_showcase"].pricing_mode,
            price_amount_cents=slot_by_key["fox_showcase"].price_amount_cents,
            currency=slot_by_key["fox_showcase"].currency,
            final_price_amount_cents=slot_by_key["fox_showcase"].price_amount_cents,
            final_currency=slot_by_key["fox_showcase"].currency,
            home_locker_room_id=locker_room_by_key[("Fox Valley Ice House", "Rink B", "Home")].id,
            away_locker_room_id=locker_room_by_key[("Fox Valley Ice House", "Rink B", "Away")].id,
            message="Need the showcase slot locked in for both teams.",
            response_message="Accepted. Home in Home Rink B, away in Away Rink B.",
        ),
        IceBookingRequest(
            id=_id(),
            requester_team_id=teams[3].id,
            away_team_id=teams[1].id,
            season_id=season_id,
            event_type="league",
            status="accepted",
            arena_id=arenas[1].id,
            arena_rink_id=arena_rink_by_key[("Edge Ice Center", "Rink A")].id,
            ice_slot_id=slot_by_key["edge_live_game"].id,
            event_id=events[3].id,
            pricing_mode=slot_by_key["edge_live_game"].pricing_mode,
            price_amount_cents=slot_by_key["edge_live_game"].price_amount_cents,
            currency=slot_by_key["edge_live_game"].currency,
            final_price_amount_cents=slot_by_key["edge_live_game"].price_amount_cents,
            final_currency=slot_by_key["edge_live_game"].currency,
            home_locker_room_id=locker_room_by_key[("Edge Ice Center", "Rink A", "Home")].id,
            away_locker_room_id=locker_room_by_key[("Edge Ice Center", "Rink A", "Away")].id,
            message="Same-day league booking.",
            response_message="Accepted. Home in Home Rink A, away in Away Rink A.",
        ),
        IceBookingRequest(
            id=_id(),
            requester_team_id=teams[1].id,
            away_team_id=teams[5].id,
            season_id=season_id,
            event_type="league",
            status="requested",
            arena_id=arenas[2].id,
            arena_rink_id=arena_rink_by_key[("Fox Valley Ice House", "Rink A")].id,
            ice_slot_id=slot_by_key["fox_request_pending"].id,
            pricing_mode=slot_by_key["fox_request_pending"].pricing_mode,
            price_amount_cents=slot_by_key["fox_request_pending"].price_amount_cents,
            currency=slot_by_key["fox_request_pending"].currency,
            message="Need a reschedule option if possible. Opponent prefers after 6 PM.",
        ),
        IceBookingRequest(
            id=_id(),
            requester_team_id=teams[0].id,
            away_team_id=teams[4].id,
            season_id=season_id,
            event_type="league",
            status="accepted",
            arena_id=arenas[1].id,
            arena_rink_id=arena_rink_by_key[("Edge Ice Center", "Rink B")].id,
            ice_slot_id=slot_by_key["edge_request_accepted"].id,
            event_id=accepted_request_event.id,
            pricing_mode=slot_by_key["edge_request_accepted"].pricing_mode,
            price_amount_cents=slot_by_key["edge_request_accepted"].price_amount_cents,
            currency=slot_by_key["edge_request_accepted"].currency,
            final_price_amount_cents=53500,
            final_currency="USD",
            home_locker_room_id=locker_room_by_key[("Edge Ice Center", "Rink B", "Home")].id,
            away_locker_room_id=locker_room_by_key[("Edge Ice Center", "Rink B", "Away")].id,
            message="Need a full game slot for a league makeup.",
            response_message="Accepted. Home in Home Rink B, away in Away Rink B.",
        ),
        IceBookingRequest(
            id=_id(),
            requester_team_id=teams[5].id,
            away_team_id=None,
            season_id=season_id,
            event_type="practice",
            status="accepted",
            arena_id=arenas[0].id,
            arena_rink_id=arena_rink_by_key[("Centennial Ice Arena", "Rink A")].id,
            ice_slot_id=slot_by_key["centennial_request_practice_accepted"].id,
            event_id=accepted_practice_request_event.id,
            pricing_mode=slot_by_key["centennial_request_practice_accepted"].pricing_mode,
            price_amount_cents=slot_by_key["centennial_request_practice_accepted"].price_amount_cents,
            currency=slot_by_key["centennial_request_practice_accepted"].currency,
            final_price_amount_cents=43500,
            final_currency="USD",
            home_locker_room_id=locker_room_by_key[("Centennial Ice Arena", "Rink A", "Practice")].id,
            away_locker_room_id=None,
            message="Looking for an extra late practice.",
            response_message="Accepted. Practice Rink A is assigned.",
        ),
        IceBookingRequest(
            id=_id(),
            requester_team_id=teams[2].id,
            away_team_id=teams[0].id,
            season_id=season_id,
            event_type="tournament",
            status="cancelled",
            arena_id=arenas[2].id,
            arena_rink_id=arena_rink_by_key[("Fox Valley Ice House", "Rink B")].id,
            ice_slot_id=slot_by_key["fox_request_cancelled"].id,
            event_id=cancelled_request_event.id,
            pricing_mode=slot_by_key["fox_request_cancelled"].pricing_mode,
            price_amount_cents=slot_by_key["fox_request_cancelled"].price_amount_cents,
            currency=slot_by_key["fox_request_cancelled"].currency,
            final_price_amount_cents=56000,
            final_currency="USD",
            home_locker_room_id=locker_room_by_key[("Fox Valley Ice House", "Rink B", "Home")].id,
            away_locker_room_id=locker_room_by_key[("Fox Valley Ice House", "Rink B", "Away")].id,
            message="Tournament overflow game request.",
            response_message="Cancelled after the event was moved to another sheet.",
        ),
    ]
    db.add_all(booking_requests)
    db.flush()

    slot_by_key["centennial_confirmed_game"].status = "booked"
    slot_by_key["centennial_confirmed_game"].booked_by_team_id = teams[0].id
    slot_by_key["centennial_proposal"].status = "held"
    slot_by_key["centennial_proposal"].booked_by_team_id = teams[1].id
    slot_by_key["centennial_direct_practice"].status = "booked"
    slot_by_key["centennial_direct_practice"].booked_by_team_id = teams[3].id
    slot_by_key["edge_live_game"].status = "booked"
    slot_by_key["edge_live_game"].booked_by_team_id = teams[3].id
    slot_by_key["fox_showcase"].status = "booked"
    slot_by_key["fox_showcase"].booked_by_team_id = teams[0].id
    slot_by_key["centennial_request_pending"].status = "held"
    slot_by_key["centennial_request_pending"].booked_by_team_id = teams[3].id
    slot_by_key["edge_request_accepted"].status = "booked"
    slot_by_key["edge_request_accepted"].booked_by_team_id = teams[0].id
    slot_by_key["fox_request_pending"].status = "held"
    slot_by_key["fox_request_pending"].booked_by_team_id = teams[1].id
    slot_by_key["centennial_request_practice_accepted"].status = "booked"
    slot_by_key["centennial_request_practice_accepted"].booked_by_team_id = teams[5].id
    slot_by_key["fox_request_cancelled"].status = "available"
    slot_by_key["fox_request_cancelled"].booked_by_team_id = None

    availability[0].status = "scheduled"
    availability[0].opponent_team_id = teams[2].id
    availability[1].status = "scheduled"
    availability[1].opponent_team_id = teams[0].id

    seeded_events = [*events, accepted_request_event, accepted_practice_request_event, cancelled_request_event]
    _assert_seed_event_links(db, seeded_events)
    _assert_seed_proposal_links(db, [proposal, accepted_confirmed_proposal])
    _assert_seed_booking_request_links(db, booking_requests)

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

    db.flush()

    roster_by_team: dict[str, list[Player]] = {}
    players = db.query(Player).filter(Player.season_id == season_id).order_by(Player.team_id, Player.jersey_number).all()
    for player in players:
        roster_by_team.setdefault(player.team_id, []).append(player)

    def mark_attendance(event_id: str, team_id: str, attending: int, tentative: int = 0, absent: int = 0):
        roster = roster_by_team.get(team_id, [])
        statuses = (
            ["attending"] * min(attending, len(roster))
            + ["tentative"] * min(tentative, max(len(roster) - attending, 0))
            + ["absent"] * min(absent, max(len(roster) - attending - tentative, 0))
        )
        for player, status in zip(roster, statuses):
            db.add(EventAttendance(event_id=event_id, player_id=player.id, status=status))

    def add_box_score(
        event_index: int,
        team_index: int,
        skater_lines: list[tuple[int, int, int]],
        goalie_saves: int,
        shootout_shots: int = 0,
        shootout_saves: int = 0,
    ):
        event = events[event_index]
        team = teams[team_index]
        roster = roster_by_team.get(team.id, [])
        skaters = [player for player in roster if player.position != "G"]
        goalie = next((player for player in roster if player.position == "G"), None)

        for player, (goals, assists, shots_on_goal) in zip(skaters, skater_lines):
            db.add(
                EventPlayerStat(
                    event_id=event.id,
                    team_id=team.id,
                    player_id=player.id,
                    goals=goals,
                    assists=assists,
                    shots_on_goal=shots_on_goal,
                )
            )

        if goalie:
            db.add(
                EventGoalieStat(
                    event_id=event.id,
                    team_id=team.id,
                    player_id=goalie.id,
                    saves=goalie_saves,
                    shootout_shots=shootout_shots,
                    shootout_saves=shootout_saves,
                )
            )

    add_box_score(4, 3, [(1, 0, 4), (0, 1, 2), (0, 0, 1)], goalie_saves=24)
    add_box_score(4, 1, [(2, 1, 5), (1, 1, 4), (1, 0, 3), (0, 2, 2)], goalie_saves=18)
    add_box_score(5, 0, [(1, 1, 4), (1, 0, 3), (1, 1, 2)], goalie_saves=27)
    add_box_score(5, 2, [(1, 1, 4), (1, 0, 3), (0, 1, 2)], goalie_saves=25)
    add_box_score(6, 5, [(2, 1, 5), (1, 1, 3), (1, 0, 4)], goalie_saves=21)
    add_box_score(6, 1, [(1, 1, 4), (1, 1, 3), (1, 0, 2)], goalie_saves=19)
    add_box_score(7, 4, [(1, 1, 4), (1, 0, 3), (0, 1, 2)], goalie_saves=22, shootout_shots=2, shootout_saves=2)
    add_box_score(7, 0, [(1, 1, 4), (1, 0, 3), (0, 1, 2)], goalie_saves=22, shootout_shots=2, shootout_saves=2)

    mark_attendance(events[0].id, teams[0].id, attending=9, tentative=1, absent=1)
    mark_attendance(events[0].id, teams[2].id, attending=8, tentative=2, absent=1)
    mark_attendance(events[1].id, teams[3].id, attending=11, tentative=0, absent=1)
    mark_attendance(events[2].id, teams[0].id, attending=8, tentative=2, absent=1)
    mark_attendance(events[3].id, teams[3].id, attending=10, tentative=1, absent=1)
    mark_attendance(events[3].id, teams[1].id, attending=9, tentative=2, absent=0)
    mark_attendance(accepted_request_event.id, teams[0].id, attending=10, tentative=1, absent=1)
    mark_attendance(accepted_request_event.id, teams[4].id, attending=9, tentative=2, absent=1)
    mark_attendance(accepted_practice_request_event.id, teams[5].id, attending=11, tentative=0, absent=1)

    notifications = [
        Notification(
            team_id=teams[0].id,
            notif_type="locker_room_update",
            title="Locker rooms assigned",
            message=f"{teams[0].name} vs {teams[4].name}\n{request_accepted_date.isoformat()} 17:15\n{arenas[1].name} • Rink B\nHome: Home Rink B | Away: Away Rink B\nNote: Accepted. Home in Home Rink B, away in Away Rink B.",
        ),
        Notification(
            team_id=teams[4].id,
            notif_type="locker_room_update",
            title="Locker rooms assigned",
            message=f"{teams[0].name} vs {teams[4].name}\n{request_accepted_date.isoformat()} 17:15\n{arenas[1].name} • Rink B\nHome: Home Rink B | Away: Away Rink B\nNote: Accepted. Home in Home Rink B, away in Away Rink B.",
        ),
        Notification(
            team_id=teams[5].id,
            notif_type="locker_room_update",
            title="Locker rooms assigned",
            message=f"{teams[5].name} Practice\n{request_practice_accepted_date.isoformat()} 20:15\n{arenas[0].name} • Rink A\nHome: Practice Rink A\nNote: Accepted. Practice Rink A is assigned.",
        ),
        Notification(
            team_id=teams[2].id,
            notif_type="locker_room_update",
            title="Locker rooms updated",
            message=f"{teams[2].name} vs {teams[0].name}\n{request_cancelled_date.isoformat()} 19:15\n{arenas[2].name} • Rink B\nHome: Home Rink B | Away: Away Rink B\nNote: Cancelled after the event was moved to another sheet.",
        ),
        Notification(
            team_id=teams[0].id,
            notif_type="locker_room_update",
            title="Locker rooms updated",
            message=f"{teams[2].name} vs {teams[0].name}\n{request_cancelled_date.isoformat()} 19:15\n{arenas[2].name} • Rink B\nHome: Home Rink B | Away: Away Rink B\nNote: Cancelled after the event was moved to another sheet.",
        ),
    ]
    db.add_all(notifications)

    db.commit()

    for team in teams:
        recompute_team_records(db, team.id)
    db.commit()

    _restore_preserved_users(db, preserved_users)

    return {
        "associations": len(associations),
        "teams": len(teams),
        "arenas": len(arenas),
        "arena_rinks": len(arena_rinks),
        "locker_rooms": len(locker_rooms),
        "ice_slots": len(slots),
        "availability_windows": len(availability),
        "events": len(seeded_events),
        "event_attendance": db.query(EventAttendance).count(),
        "proposals": 2,
        "booking_requests": len(booking_requests),
        "notifications": len(notifications),
        "preserved_users": len(preserved_users),
    }
