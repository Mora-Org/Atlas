"""add_api_keys

Revision ID: d1c73a5e9b40
Revises: c9a4d17b3e08
Create Date: 2026-08-07 13:10:00.000000

M9 F2: tabela `_api_keys` — credencial de máquina.

Guarda `prefix` (público, UNIQUE indexado — é ele que resolve o lookup em O(1))
e `secret_hash` (SHA-256). O segredo em si nunca é gravado.

Molde `e4b7a9c31f52`: guard só em volta da criação, índice e RLS **fora** dele.
Num banco zerado o baseline `create_all` já criou a tabela — é justo aí que
pular o `ENABLE ROW LEVEL SECURITY` faria a tabela nascer exposta. Foi o que
aconteceu com `_publication_versions`.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d1c73a5e9b40"
down_revision: Union[str, Sequence[str], None] = "c9a4d17b3e08"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _is_postgres() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    if not sa.inspect(op.get_bind()).has_table("_api_keys"):
        _create_api_keys_table()

    if _is_postgres():
        # ENABLE sem FORCE e sem policy — padrão das system tables desde a
        # b1f6c4e9a2d7. O escopo real é filtro por `owner_id` na aplicação;
        # o RLS aqui é defesa contra conexão crua (PostgREST/anon), e numa
        # tabela de credencial isso importa mais que nas outras.
        op.execute('ALTER TABLE "_api_keys" ENABLE ROW LEVEL SECURITY')


def _create_api_keys_table() -> None:
    op.create_table(
        "_api_keys",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column(
            "owner_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "created_by",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("name", sa.String, nullable=False),
        # UNIQUE + índice: é a chave de busca de todo request autenticado por key.
        sa.Column("prefix", sa.String, nullable=False, unique=True, index=True),
        sa.Column("secret_hash", sa.String, nullable=False),
        sa.Column("scopes", sa.JSON, nullable=False, server_default=sa.text("'{}'")),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime, nullable=True),
        # Revogação é soft: apagar a linha cegaria o audit retroativamente.
        sa.Column("revoked_at", sa.DateTime, nullable=True),
    )


def downgrade() -> None:
    if _is_postgres():
        op.execute('ALTER TABLE "_api_keys" DISABLE ROW LEVEL SECURITY')
    op.drop_table("_api_keys")
