"""add request metadata to audit log

Revision ID: 8c6d8f1d24a1
Revises: 3a9d7c1b4e52
Create Date: 2026-04-14 10:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "8c6d8f1d24a1"
down_revision: str | None = "3a9d7c1b4e52"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("audit_log", sa.Column("ip_address", sa.String(length=255), nullable=True))
    op.add_column("audit_log", sa.Column("user_agent", sa.String(length=1000), nullable=True))


def downgrade() -> None:
    op.drop_column("audit_log", "user_agent")
    op.drop_column("audit_log", "ip_address")
