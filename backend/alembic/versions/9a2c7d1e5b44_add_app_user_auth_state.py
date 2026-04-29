"""add app user auth state

Revision ID: 9a2c7d1e5b44
Revises: 4f1d2c3b8a90
Create Date: 2026-04-16 17:20:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9a2c7d1e5b44"
down_revision: str | None = "4f1d2c3b8a90"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "app_users",
        sa.Column("auth_state", sa.String(length=20), nullable=False, server_default="active"),
    )


def downgrade() -> None:
    op.drop_column("app_users", "auth_state")
