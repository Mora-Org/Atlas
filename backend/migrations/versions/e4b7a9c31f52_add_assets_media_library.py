"""add_assets_media_library

Revision ID: e4b7a9c31f52
Revises: d7e1a92c4f03
Create Date: 2026-07-05 21:00:00.000000

M8 F1: tabela `_assets` — Media Library central por workspace. Metadados
do blob (path opaco no bucket `workspace-media`, mime, tamanho, autoria)
+ `refcount` de referências de células (mantido por expressão SQL nos
hooks do CRUD/DDL).

Também habilita RLS em `_assets` e corrige o gap da b1f6c4e9a2d7:
`_publication_versions` nasceu depois daquela migration (c5dad43f9889)
e ficou sem `ENABLE ROW LEVEL SECURITY` — mesma exposição PostgREST/anon
que motivou a b1f6c4e9a2d7. Em SQLite o bloco RLS é no-op.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e4b7a9c31f52"
down_revision: Union[str, Sequence[str], None] = "d7e1a92c4f03"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _is_postgres() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    # Guard de DB zerada: o baseline ac8fba37080b (`create_all` do models.py
    # atual) já cria `_assets` numa cadeia fresh — skip do create; o bloco
    # de RLS roda sempre (idempotente).
    if not sa.inspect(op.get_bind()).has_table("_assets"):
        _create_assets_table()

    if _is_postgres():
        op.execute('ALTER TABLE "_assets" ENABLE ROW LEVEL SECURITY')
        # Fix retroativo: ficou fora da b1f6c4e9a2d7 (nasceu depois).
        op.execute('ALTER TABLE "_publication_versions" ENABLE ROW LEVEL SECURITY')


def _create_assets_table() -> None:
    op.create_table(
        "_assets",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column(
            "owner_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "uploaded_by",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("path", sa.String, nullable=False, unique=True, index=True),
        sa.Column("mime", sa.String, nullable=False),
        sa.Column("size_bytes", sa.Integer, nullable=False),
        sa.Column("original_name", sa.String, nullable=False),
        sa.Column("refcount", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    if _is_postgres():
        op.execute('ALTER TABLE "_publication_versions" DISABLE ROW LEVEL SECURITY')
    op.drop_table("_assets")
