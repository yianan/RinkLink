"""add team setup access requests

Revision ID: 6a8e3f1b2c90
Revises: 3b9f4a8e2d77
Create Date: 2026-05-22 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "6a8e3f1b2c90"
down_revision: Union[str, Sequence[str], None] = "3b9f4a8e2d77"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "details_json" not in _column_names(inspector, "access_requests"):
        op.add_column("access_requests", sa.Column("details_json", sa.JSON(), nullable=True))

    with op.batch_alter_table("teams") as batch_op:
        batch_op.alter_column("association_id", existing_type=sa.String(length=36), nullable=True)
    if bind.dialect.name == "postgresql":
        op.drop_constraint("teams_association_id_fkey", "teams", type_="foreignkey")
        op.create_foreign_key(
            "teams_association_id_fkey",
            "teams",
            "associations",
            ["association_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.drop_constraint("teams_association_id_fkey", "teams", type_="foreignkey")
        op.create_foreign_key(
            "teams_association_id_fkey",
            "teams",
            "associations",
            ["association_id"],
            ["id"],
            ondelete="CASCADE",
        )
    with op.batch_alter_table("teams") as batch_op:
        batch_op.alter_column("association_id", existing_type=sa.String(length=36), nullable=False)
    op.drop_column("access_requests", "details_json")
