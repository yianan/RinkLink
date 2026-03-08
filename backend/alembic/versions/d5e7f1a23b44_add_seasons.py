"""add seasons

Revision ID: d5e7f1a23b44
Revises: c9a2f4b83d11
Create Date: 2026-03-07 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd5e7f1a23b44'
down_revision: Union[str, Sequence[str], None] = 'c9a2f4b83d11'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create seasons table
    op.create_table(
        'seasons',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('association_id', sa.String(36), sa.ForeignKey('associations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('start_date', sa.Date, nullable=False),
        sa.Column('end_date', sa.Date, nullable=False),
        sa.Column('is_active', sa.Boolean, default=False),
        sa.Column('created_at', sa.DateTime),
        sa.Column('updated_at', sa.DateTime),
        sa.UniqueConstraint('association_id', 'name', name='uq_seasons_assoc_name'),
    )
    op.create_index('ix_seasons_assoc_active', 'seasons', ['association_id', 'is_active'])

    # Create team_season_records table
    op.create_table(
        'team_season_records',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('team_id', sa.String(36), sa.ForeignKey('teams.id', ondelete='CASCADE'), nullable=False),
        sa.Column('season_id', sa.String(36), sa.ForeignKey('seasons.id', ondelete='CASCADE'), nullable=False),
        sa.Column('wins', sa.Integer, default=0),
        sa.Column('losses', sa.Integer, default=0),
        sa.Column('ties', sa.Integer, default=0),
        sa.Column('created_at', sa.DateTime),
        sa.Column('updated_at', sa.DateTime),
        sa.UniqueConstraint('team_id', 'season_id', name='uq_team_season'),
    )

    # Add season_id to games
    with op.batch_alter_table('games') as batch_op:
        batch_op.add_column(sa.Column('season_id', sa.String(36), nullable=True))
        batch_op.create_foreign_key('fk_games_season_id', 'seasons', ['season_id'], ['id'])
        batch_op.create_index('ix_games_season_id', ['season_id'])

    # Add season_id to schedule_entries
    with op.batch_alter_table('schedule_entries') as batch_op:
        batch_op.add_column(sa.Column('season_id', sa.String(36), nullable=True))
        batch_op.create_foreign_key('fk_schedule_entries_season_id', 'seasons', ['season_id'], ['id'])
        batch_op.create_index('ix_schedule_entries_season_id', ['season_id'])


def downgrade() -> None:
    with op.batch_alter_table('schedule_entries') as batch_op:
        batch_op.drop_index('ix_schedule_entries_season_id')
        batch_op.drop_constraint('fk_schedule_entries_season_id', type_='foreignkey')
        batch_op.drop_column('season_id')

    with op.batch_alter_table('games') as batch_op:
        batch_op.drop_index('ix_games_season_id')
        batch_op.drop_constraint('fk_games_season_id', type_='foreignkey')
        batch_op.drop_column('season_id')

    op.drop_table('team_season_records')
    op.drop_index('ix_seasons_assoc_active', 'seasons')
    op.drop_table('seasons')
