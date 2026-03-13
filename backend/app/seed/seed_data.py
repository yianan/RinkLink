import uuid
from datetime import date, time

from sqlalchemy.orm import Session

from ..models import (
    Association,
    Competition,
    CompetitionDivision,
    TeamCompetitionMembership,
    Team,
    ScheduleEntry,
    GameProposal,
    Game,
    Notification,
    Player,
    ZipCode,
    Season,
    TeamSeasonRecord,
)
from ..models.rink import Rink, IceSlot
from ..models.practice_booking import PracticeBooking
from ..services.records import recompute_team_records
from ..services.season_utils import canonical_season_bounds, canonical_season_name


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
    # Clear existing data (order matters: delete dependents before parents)
    db.query(TeamSeasonRecord).delete()
    db.query(Game).delete()
    db.query(GameProposal).delete()
    db.query(Notification).delete()
    db.query(Player).delete()
    db.query(PracticeBooking).delete()
    db.query(IceSlot).delete()
    db.query(Rink).delete()
    db.query(ScheduleEntry).delete()
    db.query(TeamCompetitionMembership).delete()
    db.query(CompetitionDivision).delete()
    db.query(Competition).delete()
    db.query(Season).delete()
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

    # Shared season for all associations and teams
    global_season_id = _id()
    season_start_date, season_end_date = canonical_season_bounds(2025)
    season_name = canonical_season_name(2025)
    db.add(
        Season(
            id=global_season_id,
            name=season_name,
            start_date=season_start_date,
            end_date=season_end_date,
            is_active=True,
        )
    )
    db.commit()

    # Teams (3 per association)
    t1_id, t2_id, t3_id, t4_id, t5_id, t6_id, t7_id, t8_id, t9_id, t10_id = [_id() for _ in range(10)]
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
        # 8U teams
        Team(id=t7_id, association_id=a1_id, name="Northshore 8U Intermediate", age_group="8U", level="Intermediate",
             manager_name="Karen Mills", manager_email="karen@northshore.org", manager_phone="847-555-0103",
             rink_city="Wilmette", rink_state="IL", rink_zip="60091"),
        Team(id=t8_id, association_id=a2_id, name="Mission 8U Beginner", age_group="8U", level="Beginner",
             manager_name="Carlos Rivera", manager_email="carlos@chimission.org", manager_phone="630-555-0203",
             rink_city="Bensenville", rink_state="IL", rink_zip="60106"),
        Team(id=t9_id, association_id=a3_id, name="Team IL 8U Advanced", age_group="8U", level="Advanced",
             manager_name="Jen Kowalski", manager_email="jen@teamil.org", manager_phone="630-555-0303",
             rink_city="Geneva", rink_state="IL", rink_zip="60134"),
        # 6U team
        Team(id=t10_id, association_id=a1_id, name="Northshore 6U Beginner", age_group="6U", level="Beginner",
             manager_name="Rachel Kim", manager_email="rachel@northshore.org", manager_phone="847-555-0104",
             rink_city="Wilmette", rink_state="IL", rink_zip="60091"),
    ]
    db.add_all(teams)
    db.commit()

    csdhl_id = _id()
    nihl_id = _id()
    cuhl_id = _id()
    ahai_state_id = _id()
    central_district_id = _id()
    ccm_showcase_id = _id()
    six_u_jamboree_id = _id()
    competitions = [
        Competition(
            id=csdhl_id,
            name="Central States Development Hockey League",
            short_name="CSDHL",
            governing_body="AHAI",
            competition_type="league",
            region="Illinois",
            website="https://www.csdhl.org",
            notes="Primary travel league for the seeded 14U AA teams.",
        ),
        Competition(
            id=nihl_id,
            name="Northern Illinois Hockey League",
            short_name="NIHL",
            governing_body="AHAI",
            competition_type="league",
            region="Illinois",
            website="https://www.nihl.info",
            notes="Primary travel league for the seeded 12U A teams.",
        ),
        Competition(
            id=cuhl_id,
            name="Chicago United Hockey League",
            short_name="CUHL",
            governing_body="AHAI",
            competition_type="league",
            region="Illinois",
            website="https://www.cuhl.org",
            notes="ADM-style 8U competition that does not keep standings.",
        ),
        Competition(
            id=ahai_state_id,
            name="AHAI State Championship",
            short_name="AHAI State",
            governing_body="AHAI",
            competition_type="state_tournament",
            region="Illinois",
            website="https://www.ahai2.org",
            notes="Secondary postseason competition for seeded travel teams.",
        ),
        Competition(
            id=central_district_id,
            name="USA Hockey Central District Championship",
            short_name="Central District",
            governing_body="USA Hockey",
            competition_type="district",
            region="Central District",
            website="https://www.usahockey.com/centraldistrict",
            notes="District pathway for the seeded 14U AA teams.",
        ),
        Competition(
            id=ccm_showcase_id,
            name="CCM Windy City Showcase",
            short_name="CCM Showcase",
            governing_body="Independent",
            competition_type="showcase",
            region="Chicago",
            notes="Showcase weekends that do not affect standings.",
        ),
        Competition(
            id=six_u_jamboree_id,
            name="AHAI 6U Jamboree Circuit",
            short_name="6U Jamboree",
            governing_body="AHAI",
            competition_type="festival",
            region="Illinois",
            website="https://www.ahai2.org",
            notes="Developmental play for beginner 6U teams.",
        ),
    ]
    db.add_all(competitions)
    db.commit()

    csdhl_14u_division_id = _id()
    nihl_12u_division_id = _id()
    cuhl_8u_division_id = _id()
    ahai_state_14u_division_id = _id()
    ahai_state_12u_division_id = _id()
    central_district_14u_division_id = _id()
    ccm_showcase_14u_division_id = _id()
    six_u_jamboree_division_id = _id()
    divisions = [
        CompetitionDivision(
            id=csdhl_14u_division_id,
            competition_id=csdhl_id,
            season_id=global_season_id,
            name="14U Prospects AA",
            age_group="14U",
            level="AA",
            standings_enabled=True,
            sort_order=10,
            notes="Standings-enabled division for the seeded 14U AA teams.",
        ),
        CompetitionDivision(
            id=nihl_12u_division_id,
            competition_id=nihl_id,
            season_id=global_season_id,
            name="12U A Gold",
            age_group="12U",
            level="A",
            standings_enabled=True,
            sort_order=20,
            notes="Standings-enabled division for the seeded 12U A teams.",
        ),
        CompetitionDivision(
            id=cuhl_8u_division_id,
            competition_id=cuhl_id,
            season_id=global_season_id,
            name="8U ADM Jamboree",
            age_group="8U",
            level="Mixed",
            standings_enabled=False,
            sort_order=30,
            notes="8U teams play jamboree-style games with no standings.",
        ),
        CompetitionDivision(
            id=ahai_state_14u_division_id,
            competition_id=ahai_state_id,
            season_id=global_season_id,
            name="14U AA State Playoffs",
            age_group="14U",
            level="AA",
            standings_enabled=False,
            sort_order=40,
            notes="Postseason bracket play.",
        ),
        CompetitionDivision(
            id=ahai_state_12u_division_id,
            competition_id=ahai_state_id,
            season_id=global_season_id,
            name="12U A State Playoffs",
            age_group="12U",
            level="A",
            standings_enabled=False,
            sort_order=41,
            notes="Postseason bracket play.",
        ),
        CompetitionDivision(
            id=central_district_14u_division_id,
            competition_id=central_district_id,
            season_id=global_season_id,
            name="14U AA District Qualifier",
            age_group="14U",
            level="AA",
            standings_enabled=False,
            sort_order=50,
            notes="District play for high-performing 14U AA teams.",
        ),
        CompetitionDivision(
            id=ccm_showcase_14u_division_id,
            competition_id=ccm_showcase_id,
            season_id=global_season_id,
            name="14U Invite Division",
            age_group="14U",
            level="AA",
            standings_enabled=False,
            sort_order=60,
            notes="Showcase competition for seeded 14U teams.",
        ),
        CompetitionDivision(
            id=six_u_jamboree_division_id,
            competition_id=six_u_jamboree_id,
            season_id=global_season_id,
            name="6U Beginner Circuit",
            age_group="6U",
            level="Beginner",
            standings_enabled=False,
            sort_order=70,
            notes="Developmental schedule for beginner 6U teams.",
        ),
    ]
    db.add_all(divisions)
    db.commit()

    memberships = []
    for team_id in (t1_id, t3_id, t5_id):
        memberships.extend([
            TeamCompetitionMembership(team_id=team_id, season_id=global_season_id, competition_division_id=csdhl_14u_division_id, membership_role="primary", is_primary=True, sort_order=10),
            TeamCompetitionMembership(team_id=team_id, season_id=global_season_id, competition_division_id=ahai_state_14u_division_id, membership_role="postseason", is_primary=False, sort_order=20),
            TeamCompetitionMembership(team_id=team_id, season_id=global_season_id, competition_division_id=central_district_14u_division_id, membership_role="district", is_primary=False, sort_order=30),
            TeamCompetitionMembership(team_id=team_id, season_id=global_season_id, competition_division_id=ccm_showcase_14u_division_id, membership_role="showcase", is_primary=False, sort_order=40),
        ])
    for team_id in (t2_id, t4_id, t6_id):
        memberships.extend([
            TeamCompetitionMembership(team_id=team_id, season_id=global_season_id, competition_division_id=nihl_12u_division_id, membership_role="primary", is_primary=True, sort_order=10),
            TeamCompetitionMembership(team_id=team_id, season_id=global_season_id, competition_division_id=ahai_state_12u_division_id, membership_role="postseason", is_primary=False, sort_order=20),
        ])
    for team_id in (t7_id, t8_id, t9_id):
        memberships.append(
            TeamCompetitionMembership(team_id=team_id, season_id=global_season_id, competition_division_id=cuhl_8u_division_id, membership_role="primary", is_primary=True, sort_order=10)
        )
    memberships.append(
        TeamCompetitionMembership(team_id=t10_id, season_id=global_season_id, competition_division_id=six_u_jamboree_division_id, membership_role="primary", is_primary=True, sort_order=10)
    )
    db.add_all(memberships)
    db.commit()

    # Seed basic USA Hockey-style rosters (for scoresheet demo)
    players: list[Player] = []
    team_season = {
        t1_id: global_season_id,
        t2_id: global_season_id,
        t3_id: global_season_id,
        t4_id: global_season_id,
        t5_id: global_season_id,
        t6_id: global_season_id,
        t7_id: global_season_id,
        t8_id: global_season_id,
        t9_id: global_season_id,
        t10_id: global_season_id,
    }

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
            players.append(
                Player(
                    id=_id(),
                    team_id=team_id,
                    season_id=team_season[team_id],
                    first_name=first,
                    last_name=last,
                    jersey_number=num,
                    position=pos,
                )
            )

    add_roster(t1_id, "NS-")
    add_roster(t2_id, "NS-")
    add_roster(t3_id, "MI-")
    add_roster(t4_id, "MI-")
    add_roster(t5_id, "TI-")
    add_roster(t6_id, "TI-")
    add_roster(t7_id, "NS8-")
    add_roster(t8_id, "MI8-")
    add_roster(t9_id, "TI8-")
    add_roster(t10_id, "NS6-")

    db.add_all(players)
    db.commit()

    # Schedule entries with deliberate overlaps for auto-match
    entries = []
    # Northshore 14U AA (apr_26 blocked — team already committed that weekend)
    se = [
        ("home", date(2026, 3, 8), time(17, 0), False),
        ("away", date(2026, 3, 15), time(14, 0), False),
        ("home", date(2026, 3, 22), time(10, 0), False),
        ("away", date(2026, 3, 29), time(16, 0), False),
        ("home", date(2026, 4, 5), time(12, 0), False),
        ("away", date(2026, 4, 12), time(15, 0), False),
        ("home", date(2026, 4, 19), time(17, 0), False),
        ("away", date(2026, 4, 26), time(11, 0), True),   # blocked
        ("home", date(2026, 5, 3), time(14, 0), False),
        ("away", date(2026, 5, 10), time(16, 0), False),
    ]
    for et, d, t, blocked in se:
        entries.append(ScheduleEntry(id=_id(), team_id=t1_id, season_id=team_season[t1_id], date=d, time=t, entry_type=et, blocked=blocked))

    # Mission 14U AA - overlapping dates with opposite types (may_3 blocked — tournament weekend)
    se = [
        ("away", date(2026, 3, 8), time(17, 0), False),   # matches Northshore home
        ("home", date(2026, 3, 15), time(14, 0), False),   # matches Northshore away
        ("away", date(2026, 3, 22), time(10, 0), False),   # matches Northshore home
        ("home", date(2026, 3, 29), time(16, 0), False),   # matches Northshore away
        ("away", date(2026, 4, 5), time(12, 0), False),    # matches Northshore home
        ("home", date(2026, 4, 12), time(15, 0), False),   # matches Northshore away
        ("away", date(2026, 4, 19), time(17, 0), False),   # matches Northshore home
        ("home", date(2026, 4, 26), time(11, 0), False),   # matches Northshore away
        ("away", date(2026, 5, 3), time(14, 0), True),     # blocked — tournament weekend
        ("home", date(2026, 5, 10), time(16, 0), False),   # matches Northshore away
    ]
    for et, d, t, blocked in se:
        entries.append(ScheduleEntry(id=_id(), team_id=t3_id, season_id=team_season[t3_id], date=d, time=t, entry_type=et, blocked=blocked))

    # Team IL 14U AA (apr_19 blocked — school event)
    se = [
        ("home", date(2026, 3, 8), time(16, 0), False),
        ("away", date(2026, 3, 15), time(14, 0), False),
        ("away", date(2026, 3, 22), time(10, 0), False),   # matches Northshore home
        ("away", date(2026, 3, 29), time(16, 0), False),   # matches Mission home
        ("home", date(2026, 4, 5), time(12, 0), False),
        ("away", date(2026, 4, 12), time(15, 0), False),   # matches Mission home
        ("home", date(2026, 4, 19), time(17, 0), True),    # blocked — school event
        ("away", date(2026, 4, 26), time(11, 0), False),   # matches Mission home
        ("home", date(2026, 5, 3), time(14, 0), False),
        ("away", date(2026, 5, 10), time(16, 0), False),   # matches Mission home
    ]
    for et, d, t, blocked in se:
        entries.append(ScheduleEntry(id=_id(), team_id=t5_id, season_id=team_season[t5_id], date=d, time=t, entry_type=et, blocked=blocked))

    # 12U teams
    # Northshore 12U A
    se = [
        ("home", date(2026, 3, 7), time(9, 0), False),
        ("away", date(2026, 3, 14), time(11, 0), False),
        ("home", date(2026, 3, 21), time(10, 0), False),
        ("away", date(2026, 3, 28), time(13, 0), False),
        ("home", date(2026, 4, 4), time(9, 30), False),
        ("away", date(2026, 4, 11), time(12, 0), False),
        ("home", date(2026, 4, 18), time(10, 0), False),
        ("away", date(2026, 4, 25), time(14, 0), False),
        ("home", date(2026, 5, 2), time(9, 0), False),
        ("away", date(2026, 5, 9), time(11, 0), False),
    ]
    for et, d, t, blocked in se:
        entries.append(ScheduleEntry(id=_id(), team_id=t2_id, season_id=team_season[t2_id], date=d, time=t, entry_type=et, blocked=blocked))

    # Mission 12U A
    se = [
        ("away", date(2026, 3, 7), time(9, 0), False),      # matches Northshore 12U home
        ("home", date(2026, 3, 14), time(11, 0), False),    # matches Northshore 12U away
        ("away", date(2026, 3, 21), time(10, 0), False),    # matches Northshore 12U home
        ("home", date(2026, 3, 28), time(13, 0), False),    # matches Northshore 12U away
        ("away", date(2026, 4, 4), time(9, 30), False),     # matches Northshore 12U home
        ("home", date(2026, 4, 11), time(12, 0), False),    # matches Northshore 12U away
        ("away", date(2026, 4, 18), time(10, 0), False),    # matches Northshore 12U home
        ("home", date(2026, 4, 25), time(14, 0), False),    # matches Northshore 12U away
        ("away", date(2026, 5, 2), time(9, 0), False),      # matches Northshore 12U home
        ("home", date(2026, 5, 9), time(11, 0), False),     # matches Northshore 12U away
    ]
    for et, d, t, blocked in se:
        entries.append(ScheduleEntry(id=_id(), team_id=t4_id, season_id=team_season[t4_id], date=d, time=t, entry_type=et, blocked=blocked))

    # Team IL 12U A
    se = [
        ("home", date(2026, 3, 7), time(9, 0), False),
        ("away", date(2026, 3, 14), time(11, 0), False),
        ("home", date(2026, 3, 21), time(10, 0), False),
        ("away", date(2026, 3, 28), time(13, 0), False),
        ("home", date(2026, 4, 4), time(9, 30), False),
        ("away", date(2026, 4, 11), time(12, 0), False),
        ("home", date(2026, 4, 18), time(10, 0), False),
        ("away", date(2026, 4, 25), time(14, 0), False),
        ("home", date(2026, 5, 2), time(9, 0), False),
        ("away", date(2026, 5, 9), time(11, 0), False),
    ]
    for et, d, t, blocked in se:
        entries.append(ScheduleEntry(id=_id(), team_id=t6_id, season_id=team_season[t6_id], date=d, time=t, entry_type=et, blocked=blocked))

    # 8U teams — shorter schedules, Saturday mornings
    # Northshore 8U Intermediate
    se = [
        ("home", date(2026, 3, 7), time(8, 0), False),
        ("away", date(2026, 3, 14), time(8, 30), False),
        ("home", date(2026, 3, 21), time(8, 0), False),
        ("away", date(2026, 3, 28), time(9, 0), False),
        ("home", date(2026, 4, 4), time(8, 0), False),
        ("away", date(2026, 4, 11), time(8, 30), False),
    ]
    for et, d, t, blocked in se:
        entries.append(ScheduleEntry(id=_id(), team_id=t7_id, season_id=team_season[t7_id], date=d, time=t, entry_type=et, blocked=blocked))

    # Mission 8U Beginner
    se = [
        ("away", date(2026, 3, 7), time(8, 0), False),   # matches Northshore 8U home
        ("home", date(2026, 3, 14), time(8, 30), False),  # matches Northshore 8U away
        ("away", date(2026, 3, 21), time(8, 0), False),   # matches Northshore 8U home
        ("home", date(2026, 3, 28), time(9, 0), False),
        ("away", date(2026, 4, 4), time(8, 0), False),    # matches Northshore 8U home
        ("home", date(2026, 4, 11), time(8, 30), False),  # matches Northshore 8U away
    ]
    for et, d, t, blocked in se:
        entries.append(ScheduleEntry(id=_id(), team_id=t8_id, season_id=team_season[t8_id], date=d, time=t, entry_type=et, blocked=blocked))

    # Team IL 8U Advanced
    se = [
        ("home", date(2026, 3, 7), time(9, 0), False),
        ("away", date(2026, 3, 14), time(8, 30), False),
        ("home", date(2026, 3, 28), time(9, 0), False),   # matches Mission 8U away
        ("away", date(2026, 4, 4), time(8, 0), False),
        ("home", date(2026, 4, 11), time(8, 30), False),
        ("away", date(2026, 4, 18), time(9, 0), False),
    ]
    for et, d, t, blocked in se:
        entries.append(ScheduleEntry(id=_id(), team_id=t9_id, season_id=team_season[t9_id], date=d, time=t, entry_type=et, blocked=blocked))

    # Northshore 6U Beginner — just a handful of fun skates
    se = [
        ("home", date(2026, 3, 7), time(7, 30), False),
        ("away", date(2026, 3, 21), time(7, 30), False),
        ("home", date(2026, 4, 4), time(7, 30), False),
        ("away", date(2026, 4, 18), time(7, 30), False),
    ]
    for et, d, t, blocked in se:
        entries.append(ScheduleEntry(id=_id(), team_id=t10_id, season_id=team_season[t10_id], date=d, time=t, entry_type=et, blocked=blocked))

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
        Rink(id=r1_id, name="Johnny's IceHouse East", address="1350 W Madison St",
             city="Chicago", state="IL", zip_code="60607",
             phone="312-226-5555", contact_email="info@johnnysicehouse.com",
             website="https://www.johnnysicehouse.com"),
        Rink(id=r2_id, name="Centennial Ice Rink", address="2300 Old Glenview Rd",
             city="Wilmette", state="IL", zip_code="60091",
             phone="847-256-9666", contact_email="centennialice@wilmettepark.org",
             website="https://wilmettepark.org/ice-skating-and-hockey/"),
        Rink(id=r3_id, name="Northbrook Sports Center", address="1730 Pfingsten Rd",
             city="Northbrook", state="IL", zip_code="60062",
             phone="847-291-2980", contact_email="ice@nbparks.org",
             website="https://www.nbparks.org/location/sportscenter/"),
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

    # Seed a couple of active practices so the Practice page has demo content.
    ns_practice_slot = db.query(IceSlot).filter(
        IceSlot.rink_id == r1_id,
        IceSlot.date == date(2026, 3, 22),
        IceSlot.start_time == time(12, 0),
    ).first()
    mission_practice_slot = db.query(IceSlot).filter(
        IceSlot.rink_id == r2_id,
        IceSlot.date == date(2026, 4, 12),
        IceSlot.start_time == time(15, 0),
    ).first()

    practice_bookings: list[PracticeBooking] = []
    if ns_practice_slot:
        ns_practice_slot.status = "booked"
        ns_practice_slot.booked_by_team_id = t1_id
        practice_bookings.append(
            PracticeBooking(
                team_id=t1_id,
                ice_slot_id=ns_practice_slot.id,
                notes="Full-sheet skills skate and goalie work",
                status="active",
            )
        )
    if mission_practice_slot:
        mission_practice_slot.status = "booked"
        mission_practice_slot.booked_by_team_id = t4_id
        practice_bookings.append(
            PracticeBooking(
                team_id=t4_id,
                ice_slot_id=mission_practice_slot.id,
                notes="Pre-tournament tune-up practice",
                status="active",
            )
        )
    if practice_bookings:
        db.add_all(practice_bookings)
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

    team_name_map = {team.id: team.name for team in teams}

    def find_schedule_entry(team_id: str, game_date: date, game_time: time | None, entry_type: str) -> ScheduleEntry | None:
        query = db.query(ScheduleEntry).filter(
            ScheduleEntry.team_id == team_id,
            ScheduleEntry.date == game_date,
            ScheduleEntry.entry_type == entry_type,
        )
        if game_time is None:
            query = query.filter(ScheduleEntry.time.is_(None))
        else:
            query = query.filter(ScheduleEntry.time == game_time)
        return query.first()

    def sync_game_schedule_links(game: Game) -> None:
        home_entry = db.get(ScheduleEntry, game.home_schedule_entry_id) if game.home_schedule_entry_id else None
        away_entry = db.get(ScheduleEntry, game.away_schedule_entry_id) if game.away_schedule_entry_id else None

        if home_entry is None:
            home_entry = find_schedule_entry(game.home_team_id, game.date, game.time, "home")
            if home_entry:
                game.home_schedule_entry_id = home_entry.id

        if away_entry is None:
            away_entry = find_schedule_entry(game.away_team_id, game.date, game.time, "away")
            if away_entry:
                game.away_schedule_entry_id = away_entry.id

        home_weekly_confirmed = bool(game.home_weekly_confirmed)
        away_weekly_confirmed = bool(game.away_weekly_confirmed)
        if game.status == "confirmed":
            home_weekly_confirmed = True
            away_weekly_confirmed = True
        game.home_weekly_confirmed = home_weekly_confirmed
        game.away_weekly_confirmed = away_weekly_confirmed

        status_value = "confirmed" if game.status == "confirmed" else "scheduled"
        if home_entry:
            home_entry.status = status_value
            home_entry.opponent_team_id = game.away_team_id
            home_entry.opponent_name = team_name_map[game.away_team_id]
            home_entry.weekly_confirmed = home_weekly_confirmed

        if away_entry:
            away_entry.status = status_value
            away_entry.opponent_team_id = game.home_team_id
            away_entry.opponent_name = team_name_map[game.home_team_id]
            away_entry.weekly_confirmed = away_weekly_confirmed

    games = [
        # Upcoming game from accepted proposal (non_league)
        Game(
            home_team_id=p_accepted.home_team_id,
            away_team_id=p_accepted.away_team_id,
            home_schedule_entry_id=p_accepted.home_schedule_entry_id,
            away_schedule_entry_id=p_accepted.away_schedule_entry_id,
            proposal_id=p_accepted.id,
            ice_slot_id=accepted_slot.id if accepted_slot else None,
            date=p_accepted.proposed_date,
            time=p_accepted.proposed_time,
            status="scheduled",
            game_type="non_league",
            season_id=team_season[p_accepted.home_team_id],
        ),
        # Additional upcoming games so more team dashboards have live future data.
        Game(
            home_team_id=t4_id,
            away_team_id=t2_id,
            date=date(2026, 3, 14),
            time=time(11, 0),
            status="confirmed",
            game_type="league",
            season_id=global_season_id,
            competition_division_id=nihl_12u_division_id,
            counts_for_standings=True,
            home_weekly_confirmed=True,
            away_weekly_confirmed=True,
        ),
        Game(
            home_team_id=t6_id,
            away_team_id=t4_id,
            date=date(2026, 3, 21),
            time=time(10, 0),
            status="scheduled",
            game_type="non_league",
            season_id=global_season_id,
        ),
        Game(
            home_team_id=t8_id,
            away_team_id=t7_id,
            date=date(2026, 3, 28),
            time=time(9, 0),
            status="scheduled",
            game_type="league",
            season_id=global_season_id,
            competition_division_id=cuhl_8u_division_id,
            counts_for_standings=False,
        ),
        Game(
            home_team_id=t9_id,
            away_team_id=t7_id,
            date=date(2026, 4, 11),
            time=time(8, 30),
            status="confirmed",
            game_type="league",
            season_id=global_season_id,
            competition_division_id=cuhl_8u_division_id,
            counts_for_standings=False,
            home_weekly_confirmed=True,
            away_weekly_confirmed=True,
        ),
        # ── 14U AA season (t1=Northshore, t3=Mission, t5=Team IL) ──────────────
        # Target records: t1 4-4-1 | t3 7-1-1 | t5 1-7-0
        Game(home_team_id=t3_id, away_team_id=t1_id, date=date(2025, 10, 5),  time=time(17, 0), status="final", game_type="league",     home_score=4, away_score=1, season_id=global_season_id, competition_division_id=csdhl_14u_division_id, counts_for_standings=True),
        Game(home_team_id=t5_id, away_team_id=t3_id, date=date(2025, 10, 5),  time=time(16, 0), status="final", game_type="league",     home_score=0, away_score=4, season_id=global_season_id, competition_division_id=csdhl_14u_division_id, counts_for_standings=True),
        Game(home_team_id=t1_id, away_team_id=t5_id, date=date(2025, 10, 12), time=time(17, 0), status="final", game_type="league",     home_score=4, away_score=1, season_id=global_season_id, competition_division_id=csdhl_14u_division_id, counts_for_standings=True),
        Game(home_team_id=t3_id, away_team_id=t1_id, date=date(2025, 10, 19), time=time(17, 0), status="final", game_type="league",     home_score=3, away_score=2, season_id=global_season_id, competition_division_id=csdhl_14u_division_id, counts_for_standings=True),
        Game(home_team_id=t1_id, away_team_id=t5_id, date=date(2025, 10, 26), time=time(17, 0), status="final", game_type="non_league", home_score=3, away_score=2, season_id=global_season_id),
        Game(home_team_id=t3_id, away_team_id=t1_id, date=date(2025, 11, 2),  time=time(17, 0), status="final", game_type="non_league", home_score=5, away_score=2, season_id=global_season_id),
        Game(home_team_id=t5_id, away_team_id=t1_id, date=date(2025, 11, 9),  time=time(17, 0), status="final", game_type="league",     home_score=2, away_score=3, season_id=global_season_id, competition_division_id=csdhl_14u_division_id, counts_for_standings=True),
        Game(home_team_id=t1_id, away_team_id=t3_id, date=date(2025, 11, 16), time=time(17, 0), status="final", game_type="league",     home_score=3, away_score=3, season_id=global_season_id, competition_division_id=csdhl_14u_division_id, counts_for_standings=True),
        Game(home_team_id=t3_id, away_team_id=t5_id, date=date(2025, 11, 23), time=time(17, 0), status="final", game_type="non_league", home_score=3, away_score=1, season_id=global_season_id),
        Game(home_team_id=t5_id, away_team_id=t3_id, date=date(2025, 12, 7),  time=time(17, 0), status="final", game_type="league",     home_score=1, away_score=3, season_id=global_season_id, competition_division_id=csdhl_14u_division_id, counts_for_standings=True),
        # Feb 2026 (recent)
        Game(home_team_id=t1_id, away_team_id=t5_id, date=date(2026, 2, 8),   time=time(10, 0), status="final", game_type="showcase",   home_score=2, away_score=3, season_id=global_season_id, competition_division_id=ccm_showcase_14u_division_id, counts_for_standings=False),
        Game(home_team_id=t1_id, away_team_id=t3_id, date=date(2026, 2, 15),  time=time(17, 0), status="final", game_type="league",     home_score=3, away_score=2, season_id=global_season_id, competition_division_id=csdhl_14u_division_id, counts_for_standings=True),
        Game(home_team_id=t3_id, away_team_id=t5_id, date=date(2026, 2, 22),  time=time(14, 0), status="final", game_type="non_league", home_score=4, away_score=1, season_id=global_season_id),

        # ── 12U A season (t2=Northshore, t4=Mission, t6=Team IL) ────────────────
        # Target records: t2 4-4-0 | t4 7-1-0 | t6 0-6-0
        Game(home_team_id=t4_id, away_team_id=t2_id, date=date(2025, 10, 5),  time=time(9, 0),  status="final", game_type="league",     home_score=4, away_score=2, season_id=global_season_id, competition_division_id=nihl_12u_division_id, counts_for_standings=True),
        Game(home_team_id=t2_id, away_team_id=t6_id, date=date(2025, 10, 5),  time=time(10, 0), status="final", game_type="non_league", home_score=4, away_score=2, season_id=global_season_id),
        Game(home_team_id=t4_id, away_team_id=t6_id, date=date(2025, 10, 12), time=time(9, 0),  status="final", game_type="league",     home_score=5, away_score=2, season_id=global_season_id, competition_division_id=nihl_12u_division_id, counts_for_standings=True),
        Game(home_team_id=t4_id, away_team_id=t2_id, date=date(2025, 10, 19), time=time(9, 0),  status="final", game_type="league",     home_score=3, away_score=1, season_id=global_season_id, competition_division_id=nihl_12u_division_id, counts_for_standings=True),
        Game(home_team_id=t2_id, away_team_id=t6_id, date=date(2025, 10, 26), time=time(9, 0),  status="final", game_type="league",     home_score=3, away_score=1, season_id=global_season_id, competition_division_id=nihl_12u_division_id, counts_for_standings=True),
        Game(home_team_id=t4_id, away_team_id=t2_id, date=date(2025, 11, 2),  time=time(9, 0),  status="final", game_type="non_league", home_score=5, away_score=3, season_id=global_season_id),
        Game(home_team_id=t6_id, away_team_id=t2_id, date=date(2025, 11, 9),  time=time(9, 0),  status="final", game_type="non_league", home_score=2, away_score=3, season_id=global_season_id),
        Game(home_team_id=t2_id, away_team_id=t4_id, date=date(2025, 11, 16), time=time(9, 0),  status="final", game_type="league",     home_score=2, away_score=3, season_id=global_season_id, competition_division_id=nihl_12u_division_id, counts_for_standings=True),
        Game(home_team_id=t4_id, away_team_id=t6_id, date=date(2025, 11, 23), time=time(9, 0),  status="final", game_type="league",     home_score=4, away_score=1, season_id=global_season_id, competition_division_id=nihl_12u_division_id, counts_for_standings=True),
        Game(home_team_id=t6_id, away_team_id=t4_id, date=date(2025, 12, 7),  time=time(9, 0),  status="final", game_type="non_league", home_score=0, away_score=3, season_id=global_season_id),
        # Feb 2026 (recent)
        Game(home_team_id=t2_id, away_team_id=t4_id, date=date(2026, 2, 14),  time=time(9, 0),  status="final", game_type="league",     home_score=5, away_score=3, season_id=global_season_id, competition_division_id=nihl_12u_division_id, counts_for_standings=True),

        # ── 8U season (t7=Northshore Intermediate, t8=Mission Beginner, t9=Team IL Advanced) ──
        # Target records: t7 3-2-0 | t8 0-5-0 | t9 4-0-0
        Game(home_team_id=t9_id, away_team_id=t7_id, date=date(2025, 10, 11), time=time(8, 0),  status="final", game_type="league", home_score=3, away_score=1, season_id=global_season_id, competition_division_id=cuhl_8u_division_id, counts_for_standings=False),
        Game(home_team_id=t7_id, away_team_id=t8_id, date=date(2025, 10, 18), time=time(8, 0),  status="final", game_type="league", home_score=3, away_score=1, season_id=global_season_id, competition_division_id=cuhl_8u_division_id, counts_for_standings=False),
        Game(home_team_id=t9_id, away_team_id=t8_id, date=date(2025, 10, 25), time=time(8, 0),  status="final", game_type="league", home_score=4, away_score=1, season_id=global_season_id, competition_division_id=cuhl_8u_division_id, counts_for_standings=False),
        Game(home_team_id=t7_id, away_team_id=t8_id, date=date(2025, 11, 1),  time=time(8, 0),  status="final", game_type="league", home_score=2, away_score=1, season_id=global_season_id, competition_division_id=cuhl_8u_division_id, counts_for_standings=False),
        Game(home_team_id=t8_id, away_team_id=t7_id, date=date(2025, 11, 15), time=time(8, 0),  status="final", game_type="league", home_score=1, away_score=3, season_id=global_season_id, competition_division_id=cuhl_8u_division_id, counts_for_standings=False),
        Game(home_team_id=t8_id, away_team_id=t9_id, date=date(2025, 12, 6),  time=time(8, 0),  status="final", game_type="league", home_score=0, away_score=3, season_id=global_season_id, competition_division_id=cuhl_8u_division_id, counts_for_standings=False),
        # Feb 2026 (recent)
        Game(home_team_id=t7_id, away_team_id=t9_id, date=date(2026, 2, 21),  time=time(8, 0),  status="final", game_type="league", home_score=2, away_score=4, season_id=global_season_id, competition_division_id=cuhl_8u_division_id, counts_for_standings=False),
    ]
    for game in games:
        sync_game_schedule_links(game)
    db.add_all(games)
    db.commit()

    # Compute canonical overall + per-season records from the seeded final games.
    all_team_ids = [t1_id, t2_id, t3_id, t4_id, t5_id, t6_id, t7_id, t8_id, t9_id, t10_id]
    for team_id in all_team_ids:
        recompute_team_records(db, team_id)
    db.commit()

    return {
        "associations": 3,
        "teams": 10,
        "players": len(players),
        "schedule_entries": len(entries),
        "proposals": len(proposals),
        "games": len(games),
        "seasons": 1,
        "competitions": len(competitions),
        "competition_divisions": len(divisions),
        "competition_memberships": len(memberships),
        "rinks": 3,
        "ice_slots": len(ice_slots),
        "practice_bookings": len(practice_bookings),
    }
