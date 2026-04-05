"""add media assets for logos

Revision ID: 3a9d7c1b4e52
Revises: e2f7d8fbad57
Create Date: 2026-04-04 15:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3a9d7c1b4e52'
down_revision: Union[str, Sequence[str], None] = 'e2f7d8fbad57'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'media_assets',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('kind', sa.String(length=50), nullable=False),
        sa.Column('filename', sa.String(length=255), nullable=False),
        sa.Column('content_type', sa.String(length=100), nullable=False),
        sa.Column('size_bytes', sa.Integer(), nullable=False),
        sa.Column('sha256', sa.String(length=64), nullable=False),
        sa.Column('data', sa.LargeBinary(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

    with op.batch_alter_table('associations', schema=None) as batch_op:
        batch_op.add_column(sa.Column('logo_asset_id', sa.String(length=36), nullable=True))
        batch_op.create_foreign_key('fk_associations_logo_asset_id', 'media_assets', ['logo_asset_id'], ['id'], ondelete='SET NULL')

    with op.batch_alter_table('teams', schema=None) as batch_op:
        batch_op.add_column(sa.Column('logo_asset_id', sa.String(length=36), nullable=True))
        batch_op.create_foreign_key('fk_teams_logo_asset_id', 'media_assets', ['logo_asset_id'], ['id'], ondelete='SET NULL')

    with op.batch_alter_table('arenas', schema=None) as batch_op:
        batch_op.add_column(sa.Column('logo_asset_id', sa.String(length=36), nullable=True))
        batch_op.create_foreign_key('fk_arenas_logo_asset_id', 'media_assets', ['logo_asset_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    with op.batch_alter_table('arenas', schema=None) as batch_op:
        batch_op.drop_constraint('fk_arenas_logo_asset_id', type_='foreignkey')
        batch_op.drop_column('logo_asset_id')

    with op.batch_alter_table('teams', schema=None) as batch_op:
        batch_op.drop_constraint('fk_teams_logo_asset_id', type_='foreignkey')
        batch_op.drop_column('logo_asset_id')

    with op.batch_alter_table('associations', schema=None) as batch_op:
        batch_op.drop_constraint('fk_associations_logo_asset_id', type_='foreignkey')
        batch_op.drop_column('logo_asset_id')

    op.drop_table('media_assets')
