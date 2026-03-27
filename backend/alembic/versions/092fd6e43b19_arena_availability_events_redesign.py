"""arena availability events redesign

Revision ID: 092fd6e43b19
Revises: 7f2b6c8a91d3
Create Date: 2026-03-27 05:19:27.753775

"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
from sqlalchemy import MetaData

from app.database import Base
import app.models  # noqa: F401


# revision identifiers, used by Alembic.
revision: str = "092fd6e43b19"
down_revision: Union[str, Sequence[str], None] = "7f2b6c8a91d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    This migration is intentionally destructive. The arena / availability /
    events redesign replaced the earlier schedule / games / rinks model
    wholesale, and the product decision for this phase is to reset legacy
    application data rather than preserve it.

    Alembic history remains intact, but the application tables are recreated
    from the current SQLAlchemy metadata so fresh cloud databases and upgraded
    legacy databases end up on the same schema.
    """

    bind = op.get_bind()
    metadata = MetaData()
    metadata.reflect(bind=bind)

    for table in reversed(metadata.sorted_tables):
        if table.name == "alembic_version":
            continue
        table.drop(bind=bind, checkfirst=True)

    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    raise RuntimeError(
        "Downgrading 092fd6e43b19 is not supported because the redesign migration destructively resets the schema."
    )
