"""Keep the original venue profile fields without arena operations tables."""
from alembic import op
import sqlalchemy as sa
revision = 'mini_0002'
down_revision = 'mini_0001'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('arenas', sa.Column('phone', sa.String(30), nullable=False, server_default=''))
    op.add_column('arenas', sa.Column('contact_email', sa.String(200), nullable=False, server_default=''))
    op.add_column('arenas', sa.Column('website', sa.String(500), nullable=True))
    op.add_column('arenas', sa.Column('notes', sa.Text(), nullable=True))
    op.add_column('arena_rinks', sa.Column('notes', sa.Text(), nullable=True))

def downgrade():
    op.drop_column('arena_rinks', 'notes')
    for name in ['notes', 'website', 'contact_email', 'phone']:
        op.drop_column('arenas', name)
