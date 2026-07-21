"""add_source_to_tables

Revision ID: b8e2f5a1c604
Revises: a3f1c8d029e4
Create Date: 2026-07-21 20:30:00.000000

M8.5 F3: coluna `source` em `_tables` — proveniência citável do dado, pro
impresso acadêmico (decisão D2 do Diretor, 2026-07-21). Nullable: dado sem
proveniência informada não fabrica bibliografia.

Molde guarded (BUG-PG02): o baseline `create_all` do models.py ATUAL já cria
`_tables` com `source` num banco zerado — então checa a coluna antes do ADD,
senão `DuplicateColumn` mata a cadeia. `_tables` não é system table de RLS nova
(já existe), então não há bloco de RLS aqui.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b8e2f5a1c604"
down_revision: Union[str, Sequence[str], None] = "a3f1c8d029e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    cols = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("_tables")}
    if "source" not in cols:
        op.add_column("_tables", sa.Column("source", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("_tables", "source")
