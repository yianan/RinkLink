"""add blocked to schedule entries

Revision ID: b7d4e1a05c22
Revises: a3f8c2d91e07
Create Date: 2026-03-05 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b7d4e1a05c22'
down_revision: Union[str, Sequence[str], None] = 'a3f8c2d91e07'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('schedule_entries', schema=None) as batch_op:
        batch_op.add_column(sa.Column('blocked', sa.Boolean(), nullable=False, server_default='0'))


def downgrade() -> None:
    with op.batch_alter_table('schedule_entries', schema=None) as batch_op:
        batch_op.drop_column('blocked')
