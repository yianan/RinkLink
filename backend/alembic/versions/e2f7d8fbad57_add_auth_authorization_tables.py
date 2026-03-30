"""add auth authorization tables

Revision ID: e2f7d8fbad57
Revises: e2f1c7a9b4d3
Create Date: 2026-03-29 19:10:06.141891

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e2f7d8fbad57'
down_revision: Union[str, Sequence[str], None] = 'e2f1c7a9b4d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_names(inspector: sa.Inspector) -> set[str]:
    return set(inspector.get_table_names())


def _index_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {index["name"] for index in inspector.get_indexes(table_name)}


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = _table_names(inspector)

    if 'app_users' not in existing_tables:
        op.create_table('app_users',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('auth_id', sa.String(length=255), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('display_name', sa.String(length=255), nullable=True),
        sa.Column('status', sa.String(length=20), server_default='pending', nullable=False),
        sa.Column('is_platform_admin', sa.Boolean(), server_default='0', nullable=False),
        sa.Column('default_team_id', sa.String(length=36), nullable=True),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['default_team_id'], ['teams.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('auth_id', name='uq_app_users_auth_id'),
        sa.UniqueConstraint('email', name='uq_app_users_email')
        )
        inspector = sa.inspect(bind)
        existing_tables = _table_names(inspector)
    if 'app_users' in existing_tables and 'ix_app_users_status' not in _index_names(inspector, 'app_users'):
        with op.batch_alter_table('app_users', schema=None) as batch_op:
            batch_op.create_index('ix_app_users_status', ['status'], unique=False)

    if 'access_requests' not in existing_tables:
        op.create_table('access_requests',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('target_type', sa.String(length=50), nullable=False),
        sa.Column('target_id', sa.String(length=36), nullable=False),
        sa.Column('status', sa.String(length=20), server_default='pending', nullable=False),
        sa.Column('notes', sa.String(length=1000), nullable=True),
        sa.Column('reviewed_by_user_id', sa.String(length=36), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['reviewed_by_user_id'], ['app_users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_id'], ['app_users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
        )
        inspector = sa.inspect(bind)
        existing_tables = _table_names(inspector)
    if 'access_requests' in existing_tables and 'ix_access_requests_status_target' not in _index_names(inspector, 'access_requests'):
        with op.batch_alter_table('access_requests', schema=None) as batch_op:
            batch_op.create_index('ix_access_requests_status_target', ['status', 'target_type', 'target_id'], unique=False)

    if 'arena_memberships' not in existing_tables:
        op.create_table('arena_memberships',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('arena_id', sa.String(length=36), nullable=False),
        sa.Column('role', sa.String(length=50), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['arena_id'], ['arenas.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['app_users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'arena_id', name='uq_arena_memberships_user_arena')
        )
        inspector = sa.inspect(bind)
        existing_tables = _table_names(inspector)
    if 'arena_memberships' in existing_tables and 'ix_arena_memberships_arena' not in _index_names(inspector, 'arena_memberships'):
        with op.batch_alter_table('arena_memberships', schema=None) as batch_op:
            batch_op.create_index('ix_arena_memberships_arena', ['arena_id'], unique=False)

    if 'association_memberships' not in existing_tables:
        op.create_table('association_memberships',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('association_id', sa.String(length=36), nullable=False),
        sa.Column('role', sa.String(length=50), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['association_id'], ['associations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['app_users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'association_id', name='uq_association_memberships_user_association')
        )
        inspector = sa.inspect(bind)
        existing_tables = _table_names(inspector)
    if 'association_memberships' in existing_tables and 'ix_association_memberships_association' not in _index_names(inspector, 'association_memberships'):
        with op.batch_alter_table('association_memberships', schema=None) as batch_op:
            batch_op.create_index('ix_association_memberships_association', ['association_id'], unique=False)

    if 'audit_log' not in existing_tables:
        op.create_table('audit_log',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('actor_user_id', sa.String(length=36), nullable=True),
        sa.Column('action', sa.String(length=100), nullable=False),
        sa.Column('resource_type', sa.String(length=50), nullable=False),
        sa.Column('resource_id', sa.String(length=36), nullable=False),
        sa.Column('details_json', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['actor_user_id'], ['app_users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
        )
        inspector = sa.inspect(bind)
        existing_tables = _table_names(inspector)
    if 'audit_log' in existing_tables:
        existing_indexes = _index_names(inspector, 'audit_log')
        with op.batch_alter_table('audit_log', schema=None) as batch_op:
            if 'ix_audit_log_actor_created' not in existing_indexes:
                batch_op.create_index('ix_audit_log_actor_created', ['actor_user_id', 'created_at'], unique=False)
            if 'ix_audit_log_resource_created' not in existing_indexes:
                batch_op.create_index('ix_audit_log_resource_created', ['resource_type', 'resource_id', 'created_at'], unique=False)

    if 'invites' not in existing_tables:
        op.create_table('invites',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('token', sa.String(length=255), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('target_type', sa.String(length=50), nullable=False),
        sa.Column('target_id', sa.String(length=36), nullable=False),
        sa.Column('role', sa.String(length=50), nullable=True),
        sa.Column('status', sa.String(length=20), server_default='pending', nullable=False),
        sa.Column('invited_by_user_id', sa.String(length=36), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('accepted_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['invited_by_user_id'], ['app_users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('token', name='uq_invites_token')
        )
        inspector = sa.inspect(bind)
        existing_tables = _table_names(inspector)
    if 'invites' in existing_tables and 'ix_invites_status_expires' not in _index_names(inspector, 'invites'):
        with op.batch_alter_table('invites', schema=None) as batch_op:
            batch_op.create_index('ix_invites_status_expires', ['status', 'expires_at'], unique=False)

    if 'player_guardianships' not in existing_tables:
        op.create_table('player_guardianships',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('player_id', sa.String(length=36), nullable=False),
        sa.Column('relationship_type', sa.String(length=30), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['player_id'], ['players.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['app_users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'player_id', name='uq_player_guardianships_user_player')
        )
        inspector = sa.inspect(bind)
        existing_tables = _table_names(inspector)
    if 'player_guardianships' in existing_tables and 'ix_player_guardianships_player' not in _index_names(inspector, 'player_guardianships'):
        with op.batch_alter_table('player_guardianships', schema=None) as batch_op:
            batch_op.create_index('ix_player_guardianships_player', ['player_id'], unique=False)

    if 'player_memberships' not in existing_tables:
        op.create_table('player_memberships',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('player_id', sa.String(length=36), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['player_id'], ['players.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['app_users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'player_id', name='uq_player_memberships_user_player')
        )
        inspector = sa.inspect(bind)
        existing_tables = _table_names(inspector)
    if 'player_memberships' in existing_tables and 'ix_player_memberships_player' not in _index_names(inspector, 'player_memberships'):
        with op.batch_alter_table('player_memberships', schema=None) as batch_op:
            batch_op.create_index('ix_player_memberships_player', ['player_id'], unique=False)

    if 'team_memberships' not in existing_tables:
        op.create_table('team_memberships',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('team_id', sa.String(length=36), nullable=False),
        sa.Column('role', sa.String(length=50), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['team_id'], ['teams.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['app_users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'team_id', name='uq_team_memberships_user_team')
        )
        inspector = sa.inspect(bind)
        existing_tables = _table_names(inspector)
    if 'team_memberships' in existing_tables and 'ix_team_memberships_team' not in _index_names(inspector, 'team_memberships'):
        with op.batch_alter_table('team_memberships', schema=None) as batch_op:
            batch_op.create_index('ix_team_memberships_team', ['team_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('team_memberships', schema=None) as batch_op:
        batch_op.drop_index('ix_team_memberships_team')

    op.drop_table('team_memberships')
    with op.batch_alter_table('player_memberships', schema=None) as batch_op:
        batch_op.drop_index('ix_player_memberships_player')

    op.drop_table('player_memberships')
    with op.batch_alter_table('player_guardianships', schema=None) as batch_op:
        batch_op.drop_index('ix_player_guardianships_player')

    op.drop_table('player_guardianships')
    with op.batch_alter_table('invites', schema=None) as batch_op:
        batch_op.drop_index('ix_invites_status_expires')

    op.drop_table('invites')
    with op.batch_alter_table('audit_log', schema=None) as batch_op:
        batch_op.drop_index('ix_audit_log_resource_created')
        batch_op.drop_index('ix_audit_log_actor_created')

    op.drop_table('audit_log')
    with op.batch_alter_table('association_memberships', schema=None) as batch_op:
        batch_op.drop_index('ix_association_memberships_association')

    op.drop_table('association_memberships')
    with op.batch_alter_table('arena_memberships', schema=None) as batch_op:
        batch_op.drop_index('ix_arena_memberships_arena')

    op.drop_table('arena_memberships')
    with op.batch_alter_table('access_requests', schema=None) as batch_op:
        batch_op.drop_index('ix_access_requests_status_target')

    op.drop_table('access_requests')
    with op.batch_alter_table('app_users', schema=None) as batch_op:
        batch_op.drop_index('ix_app_users_status')

    op.drop_table('app_users')
    # ### end Alembic commands ###
