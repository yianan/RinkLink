import uuid
from datetime import date, time

from sqlalchemy.orm import Session

from ..models import Association, Team, ScheduleEntry, GameProposal, ZipCode
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
    db.query(GameProposal).delete()
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

    # Schedule entries with deliberate overlaps for auto-match
    entries = []
    # Northshore 14U AA
    se = [
        ("home", date(2026, 3, 8), time(17, 30)),
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
        ("away", date(2026, 3, 8), time(18, 0)),   # matches Northshore home
        ("home", date(2026, 3, 15), time(15, 0)),   # matches Northshore away
        ("away", date(2026, 3, 22), time(11, 0)),   # matches Northshore home
        ("home", date(2026, 3, 29), time(14, 0)),
        ("away", date(2026, 4, 5), time(13, 0)),    # matches Northshore home
        ("home", date(2026, 4, 12), time(16, 0)),
        ("away", date(2026, 4, 19), time(18, 0)),   # matches Northshore home
        ("home", date(2026, 4, 26), time(10, 0)),
        ("away", date(2026, 5, 3), time(15, 0)),    # matches Northshore home
        ("home", date(2026, 5, 10), time(14, 0)),
    ]
    for et, d, t in se:
        entries.append(ScheduleEntry(id=_id(), team_id=t3_id, date=d, time=t, entry_type=et))

    # Team IL 14U AA
    se = [
        ("home", date(2026, 3, 8), time(16, 0)),
        ("away", date(2026, 3, 15), time(13, 0)),
        ("home", date(2026, 3, 22), time(14, 0)),
        ("away", date(2026, 3, 29), time(15, 0)),   # matches Mission home
        ("home", date(2026, 4, 5), time(11, 0)),
        ("away", date(2026, 4, 12), time(17, 0)),   # matches Mission home
        ("home", date(2026, 4, 19), time(16, 0)),
        ("away", date(2026, 4, 26), time(12, 0)),   # matches Mission home
        ("home", date(2026, 5, 3), time(13, 0)),
        ("away", date(2026, 5, 10), time(15, 0)),   # matches Mission home
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
        ("away", date(2026, 3, 7), time(10, 0)),
        ("home", date(2026, 3, 14), time(12, 0)),
        ("away", date(2026, 3, 21), time(11, 0)),
        ("home", date(2026, 3, 28), time(14, 0)),
        ("away", date(2026, 4, 4), time(10, 0)),
        ("home", date(2026, 4, 11), time(13, 0)),
        ("away", date(2026, 4, 18), time(11, 0)),
        ("home", date(2026, 4, 25), time(15, 0)),
        ("away", date(2026, 5, 2), time(10, 0)),
        ("home", date(2026, 5, 9), time(12, 0)),
    ]
    for et, d, t in se:
        entries.append(ScheduleEntry(id=_id(), team_id=t4_id, date=d, time=t, entry_type=et))

    # Team IL 12U A
    se = [
        ("home", date(2026, 3, 7), time(14, 0)),
        ("away", date(2026, 3, 14), time(10, 0)),
        ("home", date(2026, 3, 21), time(13, 0)),
        ("away", date(2026, 3, 28), time(15, 0)),
        ("home", date(2026, 4, 4), time(14, 0)),
        ("away", date(2026, 4, 11), time(11, 0)),
        ("home", date(2026, 4, 18), time(13, 0)),
        ("away", date(2026, 4, 25), time(16, 0)),
        ("home", date(2026, 5, 2), time(14, 0)),
        ("away", date(2026, 5, 9), time(10, 0)),
    ]
    for et, d, t in se:
        entries.append(ScheduleEntry(id=_id(), team_id=t6_id, date=d, time=t, entry_type=et))

    db.add_all(entries)
    db.commit()

    # Get actual entry IDs for proposals
    ns14_home_mar8 = db.query(ScheduleEntry).filter(
        ScheduleEntry.team_id == t1_id, ScheduleEntry.date == date(2026, 3, 8)
    ).first()
    mi14_away_mar8 = db.query(ScheduleEntry).filter(
        ScheduleEntry.team_id == t3_id, ScheduleEntry.date == date(2026, 3, 8)
    ).first()
    ns14_away_mar15 = db.query(ScheduleEntry).filter(
        ScheduleEntry.team_id == t1_id, ScheduleEntry.date == date(2026, 3, 15)
    ).first()
    mi14_home_mar15 = db.query(ScheduleEntry).filter(
        ScheduleEntry.team_id == t3_id, ScheduleEntry.date == date(2026, 3, 15)
    ).first()
    ns14_home_mar22 = db.query(ScheduleEntry).filter(
        ScheduleEntry.team_id == t1_id, ScheduleEntry.date == date(2026, 3, 22)
    ).first()
    mi14_away_mar22 = db.query(ScheduleEntry).filter(
        ScheduleEntry.team_id == t3_id, ScheduleEntry.date == date(2026, 3, 22)
    ).first()

    proposals = []

    # Proposed: Northshore proposes to Mission for March 8
    proposals.append(GameProposal(
        id=_id(), home_team_id=t1_id, away_team_id=t3_id,
        home_schedule_entry_id=ns14_home_mar8.id, away_schedule_entry_id=mi14_away_mar8.id,
        proposed_date=date(2026, 3, 8), proposed_time=time(17, 30),
        status="proposed", proposed_by_team_id=t1_id,
        message="Looking forward to a good game!",
    ))

    # Accepted: Mission accepted Northshore for March 15
    p_accepted = GameProposal(
        id=_id(), home_team_id=t3_id, away_team_id=t1_id,
        home_schedule_entry_id=mi14_home_mar15.id, away_schedule_entry_id=ns14_away_mar15.id,
        proposed_date=date(2026, 3, 15), proposed_time=time(15, 0),
        status="accepted", proposed_by_team_id=t3_id,
        message="Great matchup, see you there!",
    )
    proposals.append(p_accepted)

    # Mark those entries as scheduled
    mi14_home_mar15.status = "scheduled"
    mi14_home_mar15.opponent_team_id = t1_id
    mi14_home_mar15.opponent_name = "Northshore 14U AA"
    ns14_away_mar15.status = "scheduled"
    ns14_away_mar15.opponent_team_id = t3_id
    ns14_away_mar15.opponent_name = "Mission 14U AA"

    # Declined: Team IL proposed to Northshore for March 22, declined
    ti14_away_mar22 = db.query(ScheduleEntry).filter(
        ScheduleEntry.team_id == t5_id, ScheduleEntry.date == date(2026, 3, 22)
    ).first()
    if ti14_away_mar22:
        proposals.append(GameProposal(
            id=_id(), home_team_id=t1_id, away_team_id=t5_id,
            home_schedule_entry_id=ns14_home_mar22.id, away_schedule_entry_id=ti14_away_mar22.id,
            proposed_date=date(2026, 3, 22), proposed_time=time(10, 0),
            status="declined", proposed_by_team_id=t5_id,
            message="Too far to travel this week.",
        ))

    db.add_all(proposals)
    db.commit()

    # --- Rinks & Ice Slots ---
    r1_id, r2_id, r3_id = _id(), _id(), _id()
    rinks = [
        Rink(id=r1_id, name="Centennial Ice Rink", address="2300 Old Glenview Rd",
             city="Wilmette", state="IL", zip_code="60091",
             phone="847-256-9666", contact_email="ice@centennialrink.com"),
        Rink(id=r2_id, name="The Edge Ice Arena", address="735 E Jefferson St",
             city="Bensenville", state="IL", zip_code="60106",
             phone="630-350-3434", contact_email="bookings@edgeicearena.com"),
        Rink(id=r3_id, name="Fox Valley Ice Arena", address="1996 S Kirk Rd",
             city="Geneva", state="IL", zip_code="60134",
             phone="630-232-0200", contact_email="schedule@foxvalleyice.com"),
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
        (date(2026, 3, 15), time(15, 0), time(16, 30), "Full sheet"),
        (date(2026, 3, 29), time(14, 0), time(15, 30), None),
        (date(2026, 4, 12), time(16, 0), time(17, 30), "Full sheet"),
        (date(2026, 4, 26), time(10, 0), time(11, 30), None),
        (date(2026, 5, 10), time(14, 0), time(15, 30), None),
    ]:
        ice_slots.append(IceSlot(id=_id(), rink_id=r2_id, date=d, start_time=st, end_time=et, notes=notes))

    # Fox Valley (Geneva) - matches Team IL dates
    for d, st, et, notes in [
        (date(2026, 3, 8), time(16, 0), time(17, 30), "Full sheet"),
        (date(2026, 3, 22), time(14, 0), time(15, 30), None),
        (date(2026, 4, 5), time(11, 0), time(12, 30), "Full sheet"),
        (date(2026, 4, 19), time(16, 0), time(17, 30), None),
        (date(2026, 5, 3), time(13, 0), time(14, 30), None),
        (date(2026, 3, 15), time(13, 0), time(14, 30), "Half sheet"),
        (date(2026, 3, 29), time(15, 0), time(16, 30), None),
    ]:
        ice_slots.append(IceSlot(id=_id(), rink_id=r3_id, date=d, start_time=st, end_time=et, notes=notes))

    db.add_all(ice_slots)
    db.commit()

    return {
        "associations": 3,
        "teams": 6,
        "schedule_entries": len(entries),
        "proposals": len(proposals),
        "rinks": 3,
        "ice_slots": len(ice_slots),
    }
