"""add proposal response fields

Revision ID: e2f1c7a9b4d3
Revises: c4b9a5930f12
Create Date: 2026-03-29 12:10:00.000000

"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e2f1c7a9b4d3"
down_revision: Union[str, Sequence[str], None] = "c4b9a5930f12"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = _column_names(inspector, "proposals")

    if "response_message" not in existing_columns:
        op.add_column("proposals", sa.Column("response_message", sa.Text(), nullable=True))
    if "response_source" not in existing_columns:
        op.add_column("proposals", sa.Column("response_source", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("proposals", "response_source")
    op.drop_column("proposals", "response_message")
