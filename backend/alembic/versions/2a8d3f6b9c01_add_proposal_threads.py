"""add proposal threads

Revision ID: 2a8d3f6b9c01
Revises: 1d7c8e9f0a12
Create Date: 2026-04-29 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "2a8d3f6b9c01"
down_revision: Union[str, Sequence[str], None] = "1d7c8e9f0a12"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("proposals", sa.Column("thread_root_proposal_id", sa.String(length=36), nullable=True))
    op.add_column("proposals", sa.Column("parent_proposal_id", sa.String(length=36), nullable=True))
    op.add_column("proposals", sa.Column("revision_number", sa.Integer(), server_default="1", nullable=False))
    op.create_index("ix_proposals_thread_root_proposal_id", "proposals", ["thread_root_proposal_id"])
    op.create_index("ix_proposals_parent_proposal_id", "proposals", ["parent_proposal_id"])
    op.create_foreign_key(
        "fk_proposals_thread_root_proposal_id_proposals",
        "proposals",
        "proposals",
        ["thread_root_proposal_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_proposals_parent_proposal_id_proposals",
        "proposals",
        "proposals",
        ["parent_proposal_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_proposals_parent_proposal_id_proposals", "proposals", type_="foreignkey")
    op.drop_constraint("fk_proposals_thread_root_proposal_id_proposals", "proposals", type_="foreignkey")
    op.drop_index("ix_proposals_parent_proposal_id", table_name="proposals")
    op.drop_index("ix_proposals_thread_root_proposal_id", table_name="proposals")
    op.drop_column("proposals", "revision_number")
    op.drop_column("proposals", "parent_proposal_id")
    op.drop_column("proposals", "thread_root_proposal_id")
