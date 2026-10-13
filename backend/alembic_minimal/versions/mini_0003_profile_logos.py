"""Preserve original team and arena logos without restoring excluded features."""
from alembic import op
import sqlalchemy as sa
revision='mini_0003'
down_revision='mini_0002'
branch_labels=None
depends_on=None

def upgrade():
    op.create_table('media_assets', sa.Column('id',sa.String(36),primary_key=True),
        sa.Column('kind',sa.String(50),nullable=False), sa.Column('filename',sa.String(255),nullable=False),
        sa.Column('content_type',sa.String(100),nullable=False),sa.Column('size_bytes',sa.Integer(),nullable=False),
        sa.Column('sha256',sa.String(64),nullable=False),sa.Column('data',sa.LargeBinary(),nullable=False),
        sa.Column('created_at',sa.DateTime(),nullable=False),sa.Column('updated_at',sa.DateTime(),nullable=False))
    for table in ['teams','arenas']:
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column('logo_asset_id',sa.String(36),nullable=True))
            batch.create_foreign_key('fk_'+table+'_logo_asset','media_assets',['logo_asset_id'],['id'])

def downgrade():
    for table in ['teams','arenas']:
        with op.batch_alter_table(table) as batch:
            batch.drop_constraint('fk_'+table+'_logo_asset',type_='foreignkey')
            batch.drop_column('logo_asset_id')
    op.drop_table('media_assets')
