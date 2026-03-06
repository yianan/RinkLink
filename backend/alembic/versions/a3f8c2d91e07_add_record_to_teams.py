"""add record to teams

Revision ID: a3f8c2d91e07
Revises: cd71b93b406b
Create Date: 2026-03-05 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a3f8c2d91e07'
down_revision: Union[str, Sequence[str], None] = 'cd71b93b406b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('teams', schema=None) as batch_op:
        batch_op.add_column(sa.Column('wins', sa.Integer(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('losses', sa.Integer(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('ties', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    with op.batch_alter_table('teams', schema=None) as batch_op:
        batch_op.drop_column('ties')
        batch_op.drop_column('losses')
        batch_op.drop_column('wins')
