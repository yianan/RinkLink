"""add app user access state

Revision ID: 4f1d2c3b8a90
Revises: 8c6d8f1d24a1
Create Date: 2026-04-16 15:45:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "4f1d2c3b8a90"
down_revision: str | None = "8c6d8f1d24a1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "app_users",
        sa.Column("access_state", sa.String(length=20), nullable=False, server_default="active"),
    )


def downgrade() -> None:
    op.drop_column("app_users", "access_state")
