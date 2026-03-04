import uuid
from datetime import date, time

from sqlalchemy.orm import Session

from ..models import (
    Association,
    Team,
    ScheduleEntry,
    GameProposal,
    Game,
    Notification,
    Player,
    ZipCode,
)
from ..models.rink import Rink, IceSlot


def _id():
    return str(uuid.uuid4())


def seed_zip_codes(db: Session):
    """Seed a small set of Illinois zip codes for demo purposes."""
    zips = [
        ("60091", "Wilmette", "IL", 42.0764, -87.7229),
        ("60106", "Bensenville", "IL", 41.9553, -87.9401),
        ("60134", "Geneva", "IL", 41.8872, -88.3054),
        ("60025", "Glenview", "IL", 42.0698, -87.7878),
        ("60062", "Northbrook", "IL", 42.1275, -87.8290),
        ("60068", "Park Ridge", "IL", 42.0111, -87.8406),
        ("60005", "Arlington Heights", "IL", 42.0884, -87.9806),
        ("60016", "Des Plaines", "IL", 42.0334, -87.8834),
        ("60090", "Wheeling", "IL", 42.1392, -87.9290),
        ("60056", "Mount Prospect", "IL", 42.0664, -87.9373),
    ]
    for z, city, state, lat, lon in zips:
        if not db.get(ZipCode, z):
            db.add(ZipCode(zip_code=z, city=city, state=state, latitude=lat, longitude=lon))
    db.commit()


def seed_demo_data(db: Session):
    """Seed associations, teams, schedule entries, and sample proposals."""
    # Clear existing data
    db.query(Game).delete()
    db.query(GameProposal).delete()
    db.query(Notification).delete()
    db.query(Player).delete()
    db.query(IceSlot).delete()
    db.query(Rink).delete()
    db.query(ScheduleEntry).delete()
    db.query(Team).delete()
    db.query(Association).delete()
    db.commit()

    seed_zip_codes(db)

    # Associations
    a1_id, a2_id, a3_id = _id(), _id(), _id()
    assocs = [
        Association(id=a1_id, name="Northshore Youth Hockey", home_rink_address="1215 Wilmette Ave", city="Wilmette", state="IL", zip_code="60091"),
        Association(id=a2_id, name="Chicago Mission", home_rink_address="900 W Devon Ave", city="Bensenville", state="IL", zip_code="60106"),
        Association(id=a3_id, name="Team Illinois", home_rink_address="710 Western Ave", city="Geneva", state="IL", zip_code="60134"),
    ]
    db.add_all(assocs)
    db.commit()

    # Teams (2 per association)
    t1_id, t2_id, t3_id, t4_id, t5_id, t6_id = [_id() for _ in range(6)]
    teams = [
        Team(id=t1_id, association_id=a1_id, name="Northshore 14U AA", age_group="14U", level="AA",
             manager_name="Mike Johnson", manager_email="mike@northshore.org", manager_phone="847-555-0101",
             rink_city="Wilmette", rink_state="IL", rink_zip="60091", myhockey_ranking=15),
        Team(id=t2_id, association_id=a1_id, name="Northshore 12U A", age_group="12U", level="A",
             manager_name="Sarah Chen", manager_email="sarah@northshore.org", manager_phone="847-555-0102",
             rink_city="Wilmette", rink_state="IL", rink_zip="60091", myhockey_ranking=25),
        Team(id=t3_id, association_id=a2_id, name="Mission 14U AA", age_group="14U", level="AA",
             manager_name="Tom Williams", manager_email="tom@chimission.org", manager_phone="630-555-0201",
             rink_city="Bensenville", rink_state="IL", rink_zip="60106", myhockey_ranking=8),
        Team(id=t4_id, association_id=a2_id, name="Mission 12U A", age_group="12U", level="A",
             manager_name="Lisa Park", manager_email="lisa@chimission.org", manager_phone="630-555-0202",
             rink_city="Bensenville", rink_state="IL", rink_zip="60106", myhockey_ranking=12),
        Team(id=t5_id, association_id=a3_id, name="Team IL 14U AA", age_group="14U", level="AA",
             manager_name="Dave Brown", manager_email="dave@teamil.org", manager_phone="630-555-0301",
             rink_city="Geneva", rink_state="IL", rink_zip="60134", myhockey_ranking=20),
        Team(id=t6_id, association_id=a3_id, name="Team IL 12U A", age_group="12U", level="A",
             manager_name="Amy White", manager_email="amy@teamil.org", manager_phone="630-555-0302",
             rink_city="Geneva", rink_state="IL", rink_zip="60134", myhockey_ranking=30),
    ]
    db.add_all(teams)
    db.commit()

    # Seed basic USA Hockey-style rosters (for scoresheet demo)
    players: list[Player] = []

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
        for num, first, last, pos in roster:
            players.append(Player(id=_id(), team_id=team_id, first_name=first, last_name=last, jersey_number=num, position=pos))

    add_roster(t1_id, "NS-")
    add_roster(t2_id, "NS-")
    add_roster(t3_id, "MI-")
    add_roster(t4_id, "MI-")
    add_roster(t5_id, "TI-")
    add_roster(t6_id, "TI-")

    db.add_all(players)
    db.commit()

    # Schedule entries with deliberate overlaps for auto-match
    entries = []
    # Northshore 14U AA
    se = [
        ("home", date(2026, 3, 8), time(17, 0)),
        ("away", date(2026, 3, 15), time(14, 0)),
        ("home", date(2026, 3, 22), time(10, 0)),
        ("away", date(2026, 3, 29), time(16, 0)),
        ("home", date(2026, 4, 5), time(12, 0)),
        ("away", date(2026, 4, 12), time(15, 0)),
        ("home", date(2026, 4, 19), time(17, 0)),
        ("away", date(2026, 4, 26), time(11, 0)),
        ("home", date(2026, 5, 3), time(14, 0)),
        ("away", date(2026, 5, 10), time(16, 0)),
    ]
    for et, d, t in se:
        entries.append(ScheduleEntry(id=_id(), team_id=t1_id, date=d, time=t, entry_type=et))

    # Mission 14U AA - overlapping dates with opposite types
    se = [
        ("away", date(2026, 3, 8), time(17, 0)),   # matches Northshore home
        ("home", date(2026, 3, 15), time(14, 0)),   # matches Northshore away
        ("away", date(2026, 3, 22), time(10, 0)),   # matches Northshore home
        ("home", date(2026, 3, 29), time(16, 0)),   # matches Northshore away
        ("away", date(2026, 4, 5), time(12, 0)),    # matches Northshore home
        ("home", date(2026, 4, 12), time(15, 0)),   # matches Northshore away
        ("away", date(2026, 4, 19), time(17, 0)),   # matches Northshore home
        ("home", date(2026, 4, 26), time(11, 0)),   # matches Northshore away
        ("away", date(2026, 5, 3), time(14, 0)),    # matches Northshore home
        ("home", date(2026, 5, 10), time(16, 0)),   # matches Northshore away
    ]
    for et, d, t in se:
        entries.append(ScheduleEntry(id=_id(), team_id=t3_id, date=d, time=t, entry_type=et))

    # Team IL 14U AA
    se = [
        ("home", date(2026, 3, 8), time(16, 0)),
        ("away", date(2026, 3, 15), time(14, 0)),
        ("away", date(2026, 3, 22), time(10, 0)),   # matches Northshore home
        ("away", date(2026, 3, 29), time(16, 0)),   # matches Mission home
        ("home", date(2026, 4, 5), time(12, 0)),
        ("away", date(2026, 4, 12), time(15, 0)),   # matches Mission home
        ("home", date(2026, 4, 19), time(17, 0)),
        ("away", date(2026, 4, 26), time(11, 0)),   # matches Mission home
        ("home", date(2026, 5, 3), time(14, 0)),
        ("away", date(2026, 5, 10), time(16, 0)),   # matches Mission home
    ]
    for et, d, t in se:
        entries.append(ScheduleEntry(id=_id(), team_id=t5_id, date=d, time=t, entry_type=et))

    # 12U teams
    # Northshore 12U A
    se = [
        ("home", date(2026, 3, 7), time(9, 0)),
        ("away", date(2026, 3, 14), time(11, 0)),
        ("home", date(2026, 3, 21), time(10, 0)),
        ("away", date(2026, 3, 28), time(13, 0)),
        ("home", date(2026, 4, 4), time(9, 30)),
        ("away", date(2026, 4, 11), time(12, 0)),
        ("home", date(2026, 4, 18), time(10, 0)),
        ("away", date(2026, 4, 25), time(14, 0)),
        ("home", date(2026, 5, 2), time(9, 0)),
        ("away", date(2026, 5, 9), time(11, 0)),
    ]
    for et, d, t in se:
        entries.append(ScheduleEntry(id=_id(), team_id=t2_id, date=d, time=t, entry_type=et))

    # Mission 12U A
    se = [
        ("away", date(2026, 3, 7), time(9, 0)),      # matches Northshore 12U home
        ("home", date(2026, 3, 14), time(11, 0)),    # matches Northshore 12U away
        ("away", date(2026, 3, 21), time(10, 0)),    # matches Northshore 12U home
        ("home", date(2026, 3, 28), time(13, 0)),    # matches Northshore 12U away
        ("away", date(2026, 4, 4), time(9, 30)),     # matches Northshore 12U home
        ("home", date(2026, 4, 11), time(12, 0)),    # matches Northshore 12U away
        ("away", date(2026, 4, 18), time(10, 0)),    # matches Northshore 12U home
        ("home", date(2026, 4, 25), time(14, 0)),    # matches Northshore 12U away
        ("away", date(2026, 5, 2), time(9, 0)),      # matches Northshore 12U home
        ("home", date(2026, 5, 9), time(11, 0)),     # matches Northshore 12U away
    ]
    for et, d, t in se:
        entries.append(ScheduleEntry(id=_id(), team_id=t4_id, date=d, time=t, entry_type=et))

    # Team IL 12U A
    se = [
        ("home", date(2026, 3, 7), time(9, 0)),
        ("away", date(2026, 3, 14), time(11, 0)),
        ("home", date(2026, 3, 21), time(10, 0)),
        ("away", date(2026, 3, 28), time(13, 0)),
        ("home", date(2026, 4, 4), time(9, 30)),
        ("away", date(2026, 4, 11), time(12, 0)),
        ("home", date(2026, 4, 18), time(10, 0)),
        ("away", date(2026, 4, 25), time(14, 0)),
        ("home", date(2026, 5, 2), time(9, 0)),
        ("away", date(2026, 5, 9), time(11, 0)),
    ]
    for et, d, t in se:
        entries.append(ScheduleEntry(id=_id(), team_id=t6_id, date=d, time=t, entry_type=et))

    db.add_all(entries)
    db.commit()

    # Get actual entry IDs for proposals / games
    ns14_home_mar8 = db.query(ScheduleEntry).filter(
        ScheduleEntry.team_id == t1_id, ScheduleEntry.date == date(2026, 3, 8), ScheduleEntry.entry_type == "home"
    ).first()
    mi14_away_mar8 = db.query(ScheduleEntry).filter(
        ScheduleEntry.team_id == t3_id, ScheduleEntry.date == date(2026, 3, 8), ScheduleEntry.entry_type == "away"
    ).first()

    mi14_home_mar29 = db.query(ScheduleEntry).filter(
        ScheduleEntry.team_id == t3_id, ScheduleEntry.date == date(2026, 3, 29), ScheduleEntry.entry_type == "home"
    ).first()
    ti14_away_mar29 = db.query(ScheduleEntry).filter(
        ScheduleEntry.team_id == t5_id, ScheduleEntry.date == date(2026, 3, 29), ScheduleEntry.entry_type == "away"
    ).first()

    ns14_home_mar22 = db.query(ScheduleEntry).filter(
        ScheduleEntry.team_id == t1_id, ScheduleEntry.date == date(2026, 3, 22), ScheduleEntry.entry_type == "home"
    ).first()
    ti14_away_mar22 = db.query(ScheduleEntry).filter(
        ScheduleEntry.team_id == t5_id, ScheduleEntry.date == date(2026, 3, 22), ScheduleEntry.entry_type == "away"
    ).first()

    proposals: list[GameProposal] = []

    # Accepted game this week (drives weekly-confirm reminder on app load)
    p_accepted = GameProposal(
        id=_id(),
        home_team_id=t1_id,
        away_team_id=t3_id,
        home_schedule_entry_id=ns14_home_mar8.id,
        away_schedule_entry_id=mi14_away_mar8.id,
        proposed_date=date(2026, 3, 8),
        proposed_time=time(17, 0),
        status="accepted",
        proposed_by_team_id=t1_id,
        message="Booked ice — see you Sunday!",
    )
    proposals.append(p_accepted)

    # Proposed: Mission requests a game with Team IL (shows proposal workflow)
    if mi14_home_mar29 and ti14_away_mar29:
        proposals.append(GameProposal(
            id=_id(),
            home_team_id=t3_id,
            away_team_id=t5_id,
            home_schedule_entry_id=mi14_home_mar29.id,
            away_schedule_entry_id=ti14_away_mar29.id,
            proposed_date=date(2026, 3, 29),
            proposed_time=time(16, 0),
            status="proposed",
            proposed_by_team_id=t3_id,
            message="Looking for a competitive matchup — interested?",
        ))

    # Declined: Team IL proposed to Northshore, declined
    if ns14_home_mar22 and ti14_away_mar22:
        proposals.append(GameProposal(
            id=_id(),
            home_team_id=t1_id,
            away_team_id=t5_id,
            home_schedule_entry_id=ns14_home_mar22.id,
            away_schedule_entry_id=ti14_away_mar22.id,
            proposed_date=date(2026, 3, 22),
            proposed_time=time(10, 0),
            status="declined",
            proposed_by_team_id=t5_id,
            message="Too far to travel this week.",
        ))

    db.add_all(proposals)
    db.commit()

    # Mark accepted game entries as scheduled (as if the proposal was accepted)
    if ns14_home_mar8 and mi14_away_mar8:
        ns14_home_mar8.status = "scheduled"
        ns14_home_mar8.opponent_team_id = t3_id
        ns14_home_mar8.opponent_name = "Mission 14U AA"
        ns14_home_mar8.time = time(17, 0)

        mi14_away_mar8.status = "scheduled"
        mi14_away_mar8.opponent_team_id = t1_id
        mi14_away_mar8.opponent_name = "Northshore 14U AA"
        mi14_away_mar8.time = time(17, 0)

    db.commit()

    # --- Rinks & Ice Slots ---
    r1_id, r2_id, r3_id = _id(), _id(), _id()
    rinks = [
        Rink(id=r1_id, name="Johnny's IceHouse West", address="1350 W Madison St",
             city="Chicago", state="IL", zip_code="60607",
             phone="312-226-5555", contact_email="info@johnnysicehouse.com",
             website="https://www.johnnysicehouse.com"),
        Rink(id=r2_id, name="Centennial Ice Rink", address="2300 Old Glenview Rd",
             city="Wilmette", state="IL", zip_code="60091",
             phone="847-256-9666", contact_email="centennialice@wilmettepark.org",
             website="https://www.wilmettepark.org/parks-facilities/centennial-ice-rink"),
        Rink(id=r3_id, name="Northbrook Sports Center", address="1730 Pfingsten Rd",
             city="Northbrook", state="IL", zip_code="60062",
             phone="847-291-2980", contact_email="icerink@northbrook.il.us",
             website="https://www.northbrookil.gov/departments/parks-recreation/northbrook-sports-center"),
    ]
    db.add_all(rinks)
    db.commit()

    # Ice slots: 5-8 per rink overlapping with team schedule dates
    ice_slots = []
    # Centennial (Wilmette) - matches Northshore dates
    for d, st, et, notes in [
        (date(2026, 3, 8), time(17, 0), time(18, 30), "Full sheet"),
        (date(2026, 3, 8), time(19, 0), time(20, 30), None),
        (date(2026, 3, 15), time(14, 0), time(15, 30), "Full sheet"),
        (date(2026, 3, 22), time(10, 0), time(11, 30), None),
        (date(2026, 3, 22), time(12, 0), time(13, 30), "Half sheet"),
        (date(2026, 3, 29), time(16, 0), time(17, 30), None),
        (date(2026, 4, 5), time(12, 0), time(13, 30), "Full sheet"),
        (date(2026, 4, 19), time(17, 0), time(18, 30), None),
    ]:
        ice_slots.append(IceSlot(id=_id(), rink_id=r1_id, date=d, start_time=st, end_time=et, notes=notes))

    # The Edge (Bensenville) - matches Mission dates
    for d, st, et, notes in [
        (date(2026, 3, 8), time(18, 0), time(19, 30), None),
        (date(2026, 3, 15), time(14, 0), time(15, 30), "Full sheet"),
        (date(2026, 3, 29), time(16, 0), time(17, 30), None),
        (date(2026, 4, 12), time(15, 0), time(16, 30), "Full sheet"),
        (date(2026, 4, 26), time(11, 0), time(12, 30), None),
        (date(2026, 5, 10), time(16, 0), time(17, 30), None),
    ]:
        ice_slots.append(IceSlot(id=_id(), rink_id=r2_id, date=d, start_time=st, end_time=et, notes=notes))

    # Fox Valley (Geneva) - matches Team IL dates
    for d, st, et, notes in [
        (date(2026, 3, 8), time(16, 0), time(17, 30), "Full sheet"),
        (date(2026, 3, 15), time(14, 0), time(15, 30), "Half sheet"),
        (date(2026, 3, 22), time(10, 0), time(11, 30), None),
        (date(2026, 3, 29), time(16, 0), time(17, 30), None),
        (date(2026, 4, 5), time(12, 0), time(13, 30), "Full sheet"),
        (date(2026, 4, 19), time(17, 0), time(18, 30), None),
        (date(2026, 5, 3), time(14, 0), time(15, 30), None),
    ]:
        ice_slots.append(IceSlot(id=_id(), rink_id=r3_id, date=d, start_time=st, end_time=et, notes=notes))

    db.add_all(ice_slots)
    db.commit()

    # Create the Game record for the accepted proposal (enables scoresheet + weekly confirm UI)
    accepted_slot = db.query(IceSlot).filter(
        IceSlot.rink_id == r1_id,
        IceSlot.date == date(2026, 3, 8),
        IceSlot.start_time == time(17, 0),
    ).first()
    if accepted_slot:
        accepted_slot.status = "booked"
        accepted_slot.booked_by_team_id = t1_id
        p_accepted.ice_slot_id = accepted_slot.id

    db.add(Game(
        home_team_id=p_accepted.home_team_id,
        away_team_id=p_accepted.away_team_id,
        home_schedule_entry_id=p_accepted.home_schedule_entry_id,
        away_schedule_entry_id=p_accepted.away_schedule_entry_id,
        proposal_id=p_accepted.id,
        ice_slot_id=accepted_slot.id if accepted_slot else None,
        date=p_accepted.proposed_date,
        time=p_accepted.proposed_time,
        status="scheduled",
    ))
    db.commit()

    return {
        "associations": 3,
        "teams": 6,
        "players": len(players),
        "schedule_entries": len(entries),
        "proposals": len(proposals),
        "games": 1,
        "rinks": 3,
        "ice_slots": len(ice_slots),
    }
