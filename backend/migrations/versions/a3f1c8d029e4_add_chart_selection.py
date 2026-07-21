"""add_chart_selection_to_publication_versions

Revision ID: a3f1c8d029e4
Revises: f2c9e04b7a31
Create Date: 2026-07-20 18:10:00.000000

M8.5 F2: coluna `chart_selection` em `_publication_versions` — a SPEC dos
gráficos curados numa versão (refs a views salvas + título/ordem), pra a versão
ser re-editável no builder, simétrico com `table_selection`. O SVG renderizado
fica no blob do snapshot, não aqui.

Guard de DB zerada (BUG-PG02): o baseline `create_all` do models.py atual já
cria a coluna num banco novo → checa antes do ADD, senão dá DuplicateColumn e
mata a cadeia. Mesmo padrão de d7e1a92c4f03.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a3f1c8d029e4"
down_revision: Union[str, Sequence[str], None] = "f2c9e04b7a31"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _is_postgres() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    cols = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("_publication_versions")}
    if "chart_selection" in cols:
        return
    # NOT NULL com default de servidor pra as linhas existentes: `[]`. json em
    # SQLite / DB novo, jsonb em prod (incremental) — mesma divergência histórica
    # das outras colunas JSON; a coluna é lida como opaca (nunca `@>`/GIN).
    default = sa.text("'[]'::jsonb") if _is_postgres() else sa.text("'[]'")
    json_type = sa.dialects.postgresql.JSONB if _is_postgres() else sa.JSON
    op.add_column(
        "_publication_versions",
        sa.Column("chart_selection", json_type(), nullable=False, server_default=default),
    )


def downgrade() -> None:
    op.drop_column("_publication_versions", "chart_selection")
