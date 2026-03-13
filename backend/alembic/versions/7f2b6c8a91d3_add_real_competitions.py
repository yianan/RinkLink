"""add real competitions

Revision ID: 7f2b6c8a91d3
Revises: c6d8e6f4ab72
Create Date: 2026-03-11 13:20:00.000000

"""

from __future__ import annotations

import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "7f2b6c8a91d3"
down_revision: Union[str, Sequence[str], None] = "c6d8e6f4ab72"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _id() -> str:
    return str(uuid.uuid4())


def _upsert_competition(
    bind,
    competitions,
    *,
    name: str,
    short_name: str,
    governing_body: str,
    competition_type: str,
    region: str,
    website: str | None,
    notes: str | None,
):
    existing = bind.execute(
        sa.select(competitions.c.id).where(competitions.c.short_name == short_name)
    ).scalar_one_or_none()
    if existing:
        return existing
    competition_id = _id()
    bind.execute(
        sa.insert(competitions).values(
            id=competition_id,
            name=name,
            short_name=short_name,
            governing_body=governing_body,
            competition_type=competition_type,
            region=region,
            website=website,
            notes=notes,
        )
    )
    return competition_id


def _upsert_division(
    bind,
    competition_divisions,
    *,
    competition_id: str,
    season_id: str,
    name: str,
    age_group: str,
    level: str,
    standings_enabled: bool,
    sort_order: int,
    notes: str | None,
):
    existing = bind.execute(
        sa.select(competition_divisions.c.id).where(
            competition_divisions.c.competition_id == competition_id,
            competition_divisions.c.season_id == season_id,
            competition_divisions.c.name == name,
        )
    ).scalar_one_or_none()
    if existing:
        return existing
    division_id = _id()
    bind.execute(
        sa.insert(competition_divisions).values(
            id=division_id,
            competition_id=competition_id,
            season_id=season_id,
            name=name,
            age_group=age_group,
            level=level,
            standings_enabled=standings_enabled,
            sort_order=sort_order,
            notes=notes,
        )
    )
    return division_id


def _insert_membership(
    bind,
    memberships,
    *,
    team_id: str,
    season_id: str,
    competition_division_id: str,
    membership_role: str,
    is_primary: bool,
    sort_order: int,
):
    exists = bind.execute(
        sa.select(memberships.c.id).where(
            memberships.c.team_id == team_id,
            memberships.c.season_id == season_id,
            memberships.c.competition_division_id == competition_division_id,
        )
    ).scalar_one_or_none()
    if exists:
        return
    bind.execute(
        sa.insert(memberships).values(
            id=_id(),
            team_id=team_id,
            season_id=season_id,
            competition_division_id=competition_division_id,
            membership_role=membership_role,
            is_primary=is_primary,
            sort_order=sort_order,
        )
    )


def _backfill_demo_data(bind) -> None:
    metadata = sa.MetaData()
    seasons = sa.Table("seasons", metadata, autoload_with=bind)
    teams = sa.Table("teams", metadata, autoload_with=bind)
    competitions = sa.Table("competitions", metadata, autoload_with=bind)
    competition_divisions = sa.Table("competition_divisions", metadata, autoload_with=bind)
    memberships = sa.Table("team_competition_memberships", metadata, autoload_with=bind)
    games = sa.Table("games", metadata, autoload_with=bind)

    season = bind.execute(
        sa.select(seasons.c.id, seasons.c.name)
        .where(seasons.c.is_active == True)  # noqa: E712
        .order_by(seasons.c.start_date.asc())
        .limit(1)
    ).mappings().first()
    if not season:
        season = bind.execute(
            sa.select(seasons.c.id, seasons.c.name).order_by(seasons.c.start_date.asc()).limit(1)
        ).mappings().first()
    if not season:
        return

    csdhl_id = _upsert_competition(
        bind,
        competitions,
        name="Central States Development Hockey League",
        short_name="CSDHL",
        governing_body="AHAI",
        competition_type="league",
        region="Illinois",
        website="https://www.csdhl.org",
        notes="Primary league for the seeded 14U AA travel teams.",
    )
    nihl_id = _upsert_competition(
        bind,
        competitions,
        name="Northern Illinois Hockey League",
        short_name="NIHL",
        governing_body="AHAI",
        competition_type="league",
        region="Illinois",
        website="https://www.nihl.info",
        notes="Primary league for the seeded 12U A teams.",
    )
    cuhl_id = _upsert_competition(
        bind,
        competitions,
        name="Chicago United Hockey League",
        short_name="CUHL",
        governing_body="AHAI",
        competition_type="league",
        region="Illinois",
        website="https://www.cuhl.org",
        notes="ADM/jamboree structure for young 8U teams; standings are intentionally disabled.",
    )
    ahai_state_id = _upsert_competition(
        bind,
        competitions,
        name="AHAI State Championship",
        short_name="AHAI State",
        governing_body="AHAI",
        competition_type="state_tournament",
        region="Illinois",
        website="https://www.ahai2.org",
        notes="Secondary postseason competition for seeded travel teams.",
    )
    central_district_id = _upsert_competition(
        bind,
        competitions,
        name="USA Hockey Central District Championship",
        short_name="Central District",
        governing_body="USA Hockey",
        competition_type="district",
        region="Central District",
        website="https://www.usahockey.com/centraldistrict",
        notes="District-level postseason pathway for top seeded 14U teams.",
    )
    ccm_showcase_id = _upsert_competition(
        bind,
        competitions,
        name="CCM Windy City Showcase",
        short_name="CCM Showcase",
        governing_body="Independent",
        competition_type="showcase",
        region="Chicago",
        website=None,
        notes="Showcase weekends that do not count toward standings.",
    )
    six_u_jamboree_id = _upsert_competition(
        bind,
        competitions,
        name="AHAI 6U Jamboree Circuit",
        short_name="6U Jamboree",
        governing_body="AHAI",
        competition_type="festival",
        region="Illinois",
        website="https://www.ahai2.org",
        notes="Developmental competition for 6U teams with no standings.",
    )

    csdhl_14u_id = _upsert_division(
        bind,
        competition_divisions,
        competition_id=csdhl_id,
        season_id=season["id"],
        name="14U Prospects AA",
        age_group="14U",
        level="AA",
        standings_enabled=True,
        sort_order=10,
        notes="Standings-enabled seeded 14U division.",
    )
    nihl_12u_id = _upsert_division(
        bind,
        competition_divisions,
        competition_id=nihl_id,
        season_id=season["id"],
        name="12U A Gold",
        age_group="12U",
        level="A",
        standings_enabled=True,
        sort_order=20,
        notes="Standings-enabled seeded 12U division.",
    )
    cuhl_8u_id = _upsert_division(
        bind,
        competition_divisions,
        competition_id=cuhl_id,
        season_id=season["id"],
        name="8U ADM Jamboree",
        age_group="8U",
        level="Mixed",
        standings_enabled=False,
        sort_order=30,
        notes="8U seeded teams play here without formal standings.",
    )
    ahai_state_14u_id = _upsert_division(
        bind,
        competition_divisions,
        competition_id=ahai_state_id,
        season_id=season["id"],
        name="14U AA State Playoffs",
        age_group="14U",
        level="AA",
        standings_enabled=False,
        sort_order=40,
        notes="Postseason bracket play.",
    )
    ahai_state_12u_id = _upsert_division(
        bind,
        competition_divisions,
        competition_id=ahai_state_id,
        season_id=season["id"],
        name="12U A State Playoffs",
        age_group="12U",
        level="A",
        standings_enabled=False,
        sort_order=41,
        notes="Postseason bracket play.",
    )
    central_district_14u_id = _upsert_division(
        bind,
        competition_divisions,
        competition_id=central_district_id,
        season_id=season["id"],
        name="14U AA District Qualifier",
        age_group="14U",
        level="AA",
        standings_enabled=False,
        sort_order=50,
        notes="Secondary postseason pathway for the top 14U teams.",
    )
    ccm_showcase_14u_id = _upsert_division(
        bind,
        competition_divisions,
        competition_id=ccm_showcase_id,
        season_id=season["id"],
        name="14U Invite Division",
        age_group="14U",
        level="AA",
        standings_enabled=False,
        sort_order=60,
        notes="Showcase games that do not affect standings.",
    )
    six_u_jamboree_division_id = _upsert_division(
        bind,
        competition_divisions,
        competition_id=six_u_jamboree_id,
        season_id=season["id"],
        name="6U Beginner Circuit",
        age_group="6U",
        level="Beginner",
        standings_enabled=False,
        sort_order=70,
        notes="Developmental play for 6U beginner teams.",
    )

    team_rows = bind.execute(sa.select(teams.c.id, teams.c.name, teams.c.age_group, teams.c.level)).mappings().all()
    team_ids = {row["name"]: row["id"] for row in team_rows}

    for team_name in ("Northshore 14U AA", "Mission 14U AA", "Team IL 14U AA"):
        team_id = team_ids.get(team_name)
        if not team_id:
            continue
        _insert_membership(bind, memberships, team_id=team_id, season_id=season["id"], competition_division_id=csdhl_14u_id, membership_role="primary", is_primary=True, sort_order=10)
        _insert_membership(bind, memberships, team_id=team_id, season_id=season["id"], competition_division_id=ahai_state_14u_id, membership_role="postseason", is_primary=False, sort_order=20)
        _insert_membership(bind, memberships, team_id=team_id, season_id=season["id"], competition_division_id=central_district_14u_id, membership_role="district", is_primary=False, sort_order=30)
        _insert_membership(bind, memberships, team_id=team_id, season_id=season["id"], competition_division_id=ccm_showcase_14u_id, membership_role="showcase", is_primary=False, sort_order=40)

    for team_name in ("Northshore 12U A", "Mission 12U A", "Team IL 12U A"):
        team_id = team_ids.get(team_name)
        if not team_id:
            continue
        _insert_membership(bind, memberships, team_id=team_id, season_id=season["id"], competition_division_id=nihl_12u_id, membership_role="primary", is_primary=True, sort_order=10)
        _insert_membership(bind, memberships, team_id=team_id, season_id=season["id"], competition_division_id=ahai_state_12u_id, membership_role="postseason", is_primary=False, sort_order=20)

    for team_name in ("Northshore 8U Intermediate", "Mission 8U Beginner", "Team IL 8U Advanced"):
        team_id = team_ids.get(team_name)
        if not team_id:
            continue
        _insert_membership(bind, memberships, team_id=team_id, season_id=season["id"], competition_division_id=cuhl_8u_id, membership_role="primary", is_primary=True, sort_order=10)

    six_u_team_id = team_ids.get("Northshore 6U Beginner")
    if six_u_team_id:
        _insert_membership(bind, memberships, team_id=six_u_team_id, season_id=season["id"], competition_division_id=six_u_jamboree_division_id, membership_role="primary", is_primary=True, sort_order=10)

    team_meta = {row["id"]: row for row in team_rows}
    game_rows = bind.execute(sa.select(games.c.id, games.c.home_team_id, games.c.away_team_id, games.c.game_type)).mappings().all()
    for game in game_rows:
        home = team_meta.get(game["home_team_id"])
        away = team_meta.get(game["away_team_id"])
        if not home or not away:
            continue
        values: dict[str, object] = {}
        if game["game_type"] == "league":
            if home["age_group"] == away["age_group"] == "14U" and home["level"] == away["level"] == "AA":
                values = {"competition_division_id": csdhl_14u_id, "counts_for_standings": True}
            elif home["age_group"] == away["age_group"] == "12U" and home["level"] == away["level"] == "A":
                values = {"competition_division_id": nihl_12u_id, "counts_for_standings": True}
            elif home["age_group"] == away["age_group"] == "8U":
                values = {"competition_division_id": cuhl_8u_id, "counts_for_standings": False}
            elif home["age_group"] == away["age_group"] == "6U":
                values = {"competition_division_id": six_u_jamboree_division_id, "counts_for_standings": False}
        elif game["game_type"] == "showcase" and home["age_group"] == away["age_group"] == "14U":
            values = {"competition_division_id": ccm_showcase_14u_id, "counts_for_standings": False}
        elif game["game_type"] == "state_tournament":
            if home["age_group"] == away["age_group"] == "14U":
                values = {"competition_division_id": ahai_state_14u_id, "counts_for_standings": False}
            elif home["age_group"] == away["age_group"] == "12U":
                values = {"competition_division_id": ahai_state_12u_id, "counts_for_standings": False}
        elif game["game_type"] == "district" and home["age_group"] == away["age_group"] == "14U":
            values = {"competition_division_id": central_district_14u_id, "counts_for_standings": False}
        if values:
            bind.execute(sa.update(games).where(games.c.id == game["id"]).values(**values))


def upgrade() -> None:
    op.create_table(
        "competitions",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("short_name", sa.String(length=50), nullable=False),
        sa.Column("governing_body", sa.String(length=100), nullable=False, server_default=""),
        sa.Column("competition_type", sa.String(length=30), nullable=False, server_default="league"),
        sa.Column("region", sa.String(length=100), nullable=False, server_default=""),
        sa.Column("website", sa.String(length=500), nullable=True),
        sa.Column("notes", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.UniqueConstraint("name", name="uq_competitions_name"),
        sa.UniqueConstraint("short_name", name="uq_competitions_short_name"),
    )
    op.create_table(
        "competition_divisions",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("competition_id", sa.String(length=36), nullable=False),
        sa.Column("season_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("age_group", sa.String(length=20), nullable=False, server_default=""),
        sa.Column("level", sa.String(length=50), nullable=False, server_default=""),
        sa.Column("standings_enabled", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("notes", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.ForeignKeyConstraint(["competition_id"], ["competitions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["season_id"], ["seasons.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("competition_id", "season_id", "name", name="uq_competition_division_season_name"),
    )
    op.create_index("ix_competition_divisions_season_sort", "competition_divisions", ["season_id", "sort_order"], unique=False)
    op.create_index("ix_competition_divisions_standings", "competition_divisions", ["season_id", "standings_enabled"], unique=False)

    op.create_table(
        "team_competition_memberships",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("team_id", sa.String(length=36), nullable=False),
        sa.Column("season_id", sa.String(length=36), nullable=False),
        sa.Column("competition_division_id", sa.String(length=36), nullable=False),
        sa.Column("membership_role", sa.String(length=30), nullable=False, server_default="primary"),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["season_id"], ["seasons.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["competition_division_id"], ["competition_divisions.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("team_id", "season_id", "competition_division_id", name="uq_team_competition_membership"),
    )
    op.create_index("ix_team_competition_memberships_team_season", "team_competition_memberships", ["team_id", "season_id"], unique=False)
    op.create_index("ix_team_competition_memberships_division", "team_competition_memberships", ["competition_division_id"], unique=False)
    op.create_index("ix_team_competition_memberships_primary", "team_competition_memberships", ["season_id", "is_primary"], unique=False)

    with op.batch_alter_table("games") as batch_op:
        batch_op.add_column(sa.Column("competition_division_id", sa.String(length=36), nullable=True))
        batch_op.add_column(sa.Column("counts_for_standings", sa.Boolean(), nullable=False, server_default="0"))
        batch_op.create_foreign_key("fk_games_competition_division_id", "competition_divisions", ["competition_division_id"], ["id"])
        batch_op.create_index("ix_games_competition_division_id", ["competition_division_id"], unique=False)

    with op.batch_alter_table("associations") as batch_op:
        batch_op.drop_column("league_affiliation")

    _backfill_demo_data(op.get_bind())

    with op.batch_alter_table("games") as batch_op:
        batch_op.alter_column("counts_for_standings", server_default=None)


def downgrade() -> None:
    with op.batch_alter_table("associations") as batch_op:
        batch_op.add_column(sa.Column("league_affiliation", sa.String(length=200), nullable=True))

    with op.batch_alter_table("games") as batch_op:
        batch_op.drop_index("ix_games_competition_division_id")
        batch_op.drop_constraint("fk_games_competition_division_id", type_="foreignkey")
        batch_op.drop_column("counts_for_standings")
        batch_op.drop_column("competition_division_id")

    op.drop_index("ix_team_competition_memberships_primary", table_name="team_competition_memberships")
    op.drop_index("ix_team_competition_memberships_division", table_name="team_competition_memberships")
    op.drop_index("ix_team_competition_memberships_team_season", table_name="team_competition_memberships")
    op.drop_table("team_competition_memberships")

    op.drop_index("ix_competition_divisions_standings", table_name="competition_divisions")
    op.drop_index("ix_competition_divisions_season_sort", table_name="competition_divisions")
    op.drop_table("competition_divisions")
    op.drop_table("competitions")
