"""add active proposal pair key

Revision ID: 3b9f4a8e2d77
Revises: 2a8d3f6b9c01
Create Date: 2026-04-29 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "3b9f4a8e2d77"
down_revision: Union[str, Sequence[str], None] = "2a8d3f6b9c01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("proposals")}
    if "active_pair_key" not in columns:
        op.add_column("proposals", sa.Column("active_pair_key", sa.String(length=80), nullable=True))
    op.create_index(
        "uq_proposals_active_pair_key",
        "proposals",
        ["active_pair_key"],
        unique=True,
        if_not_exists=True,
        sqlite_where=sa.text("status IN ('proposed', 'accepted') AND active_pair_key IS NOT NULL"),
        postgresql_where=sa.text("status IN ('proposed', 'accepted') AND active_pair_key IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_proposals_active_pair_key", table_name="proposals", if_exists=True)
    op.drop_column("proposals", "active_pair_key")
