"""add_views_aggregation

Revision ID: f2c9e04b7a31
Revises: e4b7a9c31f52
Create Date: 2026-07-16 17:40:00.000000

M8.5 F1: tabela `_views` — view salva (recorte + agregação) persistida como
artefato de workspace consultável (decisão 4 do Diretor, 2026-07-12).

Schema híbrido (decisão 11, 2026-07-16): campo próprio pro que o backend
procura (`table_id`, `group_by`, `operation`, `metric_column`) + `config`
JSON pro que a F2 inventar.

Molde deliberado: e4b7a9c31f52 (M8), NÃO c5dad43f9889. A c5dad43f9889 aborta
a migration inteira com `return` quando a tabela já existe — copiar isso
pularia o `ENABLE ROW LEVEL SECURITY` num banco novo e a tabela nasceria
exposta ao PostgREST/anon. Foi exatamente o que aconteceu com
`_publication_versions` (nasceu depois da b1f6c4e9a2d7, ficou sem RLS, só
corrigido no M8 F1 pela e4b7a9c31f52:43). Aqui o guard fica SÓ em volta do
create e o bloco de RLS roda sempre (idempotente).

O CI não pega esse tipo de erro: o conftest roda `create_all` (conftest.py:117),
nunca `alembic upgrade`. Só code review protege.

`config` fica `JSON` (não `JSONB`) de propósito: o model declara `sa.JSON` e o
`create_all` de um banco novo emitiria `JSON`; usar `JSONB` aqui recriaria a
divergência json×jsonb que a c5dad43f9889:40 já introduziu em
`_publication_versions`. A config é lida como opaca e filtrada em Python —
nenhum `@>`/GIN depende do tipo físico.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f2c9e04b7a31"
down_revision: Union[str, Sequence[str], None] = "e4b7a9c31f52"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _is_postgres() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    # Guard de DB zerada: o baseline ac8fba37080b faz `create_all` do models.py
    # ATUAL, então numa cadeia fresh `_views` já existe aqui — skip do create.
    # O bloco de RLS roda SEMPRE (idempotente) — ver docstring.
    if not sa.inspect(op.get_bind()).has_table("_views"):
        _create_views_table()

    if _is_postgres():
        op.execute('ALTER TABLE "_views" ENABLE ROW LEVEL SECURITY')


def _create_views_table() -> None:
    op.create_table(
        "_views",
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
        # Sem `ondelete`: a limpeza é pelo cascade ORM (DynamicTable.views) —
        # único desenho que limpa nos dois bancos, já que o SQLite não enforce
        # FK (não há `PRAGMA foreign_keys` em lugar nenhum do backend).
        sa.Column(
            "table_id",
            sa.Integer,
            sa.ForeignKey("_tables.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("group_by", sa.String, nullable=False),
        sa.Column("operation", sa.String, nullable=False),
        sa.Column("metric_column", sa.String, nullable=True),
        sa.Column("config", sa.JSON, nullable=False, server_default=sa.text("'{}'")),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("_views")
