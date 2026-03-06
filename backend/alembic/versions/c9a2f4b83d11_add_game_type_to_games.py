"""add game_type to games

Revision ID: c9a2f4b83d11
Revises: b7d4e1a05c22
Create Date: 2026-03-05 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c9a2f4b83d11'
down_revision: Union[str, Sequence[str], None] = 'b7d4e1a05c22'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('games', schema=None) as batch_op:
        batch_op.add_column(sa.Column('game_type', sa.String(length=20), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('games', schema=None) as batch_op:
        batch_op.drop_column('game_type')
