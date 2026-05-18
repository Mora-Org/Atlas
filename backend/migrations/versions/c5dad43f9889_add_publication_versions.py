"""add_publication_versions

Revision ID: c5dad43f9889
Revises: c4cc157acbad
Create Date: 2026-05-18 16:56:58.033826

Cria `_publication_versions` (M6 Fase 1): snapshots imutáveis de
estado publicado do workspace. Cada versão guarda metadados (tema,
seleção de tabelas, layout) na DB e o blob de dados das tabelas
no Supabase Storage (`storage_path`).

`is_active` é UNIQUE-by-owner via UNIQUE INDEX parcial em
Postgres (`WHERE is_active`). Em SQLite (dev) usa o mesmo idiom.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c5dad43f9889"
down_revision: Union[str, Sequence[str], None] = "c4cc157acbad"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _is_postgres() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    json_type = sa.dialects.postgresql.JSONB if _is_postgres() else sa.JSON
    json_default_obj = sa.text("'{}'::jsonb") if _is_postgres() else sa.text("'{}'")
    json_default_arr = sa.text("'[]'::jsonb") if _is_postgres() else sa.text("'[]'")

    op.create_table(
        "_publication_versions",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column(
            "owner_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("version_number", sa.Integer, nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column(
            "created_by",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("storage_path", sa.Text, nullable=False),
        sa.Column("theme_config", json_type(), nullable=False, server_default=json_default_obj),
        sa.Column("table_selection", json_type(), nullable=False, server_default=json_default_arr),
        sa.UniqueConstraint("owner_id", "version_number", name="uq_publication_owner_version"),
    )

    # Apenas uma versão ativa por owner. PARTIAL UNIQUE INDEX em Postgres
    # e SQLite (>=3.8); o `sqlite_where` faz a sintaxe portátil.
    op.create_index(
        "uq_publication_active_per_owner",
        "_publication_versions",
        ["owner_id"],
        unique=True,
        postgresql_where=sa.text("is_active"),
        sqlite_where=sa.text("is_active"),
    )


def downgrade() -> None:
    op.drop_index("uq_publication_active_per_owner", table_name="_publication_versions")
    op.drop_table("_publication_versions")
