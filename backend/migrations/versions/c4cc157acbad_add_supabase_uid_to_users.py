"""add_supabase_uid_to_users

Revision ID: c4cc157acbad
Revises: b1f6c4e9a2d7
Create Date: 2026-05-16 16:57:43.167856

Adiciona coluna `supabase_uid` (UUID, UNIQUE, NULL) em `users` para
referenciar `auth.users.id` do Supabase Auth (M4).

Nullable durante a transição: linhas legadas (criadas via JWT custom
HS256 antes do M4) ainda existem sem `supabase_uid`. O startup do
backend faz backfill chamando a Admin API do Supabase.

Em SQLite, usa `String` em vez de `UUID` (SQLite não tem tipo UUID
nativo). O ORM continua tratando como string em ambos.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c4cc157acbad"
down_revision: Union[str, Sequence[str], None] = "b1f6c4e9a2d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _is_postgres() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    # Guard de DB zerada (BUG-PG02, 2026-07-17): o baseline ac8fba37080b faz
    # `create_all` do models.py ATUAL, que já cria `users` com `supabase_uid`
    # (unique=True → a unicidade já vem do modelo). Sem este guard, o
    # `add_column` abaixo dá DuplicateColumn e mata a cadeia inteira em qualquer
    # ambiente novo (staging, Supabase novo, restore de DR). Prod é incremental
    # e passou por aqui antes da coluna existir, então nunca bateu no bug — e
    # como o alembic não re-roda revisão aplicada, este guard só afeta DB fresh.
    # Mesmo padrão de d7e1a92c4f03 / e4b7a9c31f52 / f2c9e04b7a31.
    cols = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("users")}
    if "supabase_uid" in cols:
        return

    col_type = sa.dialects.postgresql.UUID(as_uuid=False) if _is_postgres() else sa.String(length=36)
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("supabase_uid", col_type, nullable=True))
        batch_op.create_unique_constraint("uq_users_supabase_uid", ["supabase_uid"])


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_constraint("uq_users_supabase_uid", type_="unique")
        batch_op.drop_column("supabase_uid")
