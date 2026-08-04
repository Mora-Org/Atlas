"""add_audit_log

Revision ID: c9a4d17b3e08
Revises: b8e2f5a1c604
Create Date: 2026-08-04 16:10:00.000000

M9 F1: tabela `_audit_log` — trilha de mutação do tenant (ator e alvo
polimórficos, sem valor de célula).

Molde `e4b7a9c31f52` (NÃO o `c5dad43f9889`): o guard cobre SÓ a criação, e o
bloco de RLS fica FORA dele. Copiar o outro molde abortaria a migration inteira
quando a tabela já existe — e num banco zerado, onde o baseline `create_all` já
criou a tabela, o `ENABLE ROW LEVEL SECURITY` seria PULADO e a tabela nasceria
exposta. Foi exatamente o que aconteceu com `_publication_versions`.

O índice composto é criado aqui E declarado no model: o `create_all` serve o CI
e a migration serve prod; declarar num lugar só faz o índice sumir do outro
ambiente.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c9a4d17b3e08"
down_revision: Union[str, Sequence[str], None] = "b8e2f5a1c604"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INDEX_NAME = "ix__audit_log_owner_created"


def _is_postgres() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    if not insp.has_table("_audit_log"):
        _create_audit_table()

    # Fora do guard e idempotente: num banco zerado o create_all já fez a
    # tabela, e é justo aí que o índice/RLS não podem ser pulados.
    existing = {ix["name"] for ix in sa.inspect(op.get_bind()).get_indexes("_audit_log")}
    if INDEX_NAME not in existing:
        op.create_index(INDEX_NAME, "_audit_log", ["owner_id", "created_at"])

    if _is_postgres():
        # ENABLE sem FORCE e sem policy — padrão das system tables desde a
        # b1f6c4e9a2d7. O escopo real é filtro de aplicação por `owner_id`;
        # o RLS aqui é defesa contra conexão crua (PostgREST/anon).
        op.execute('ALTER TABLE "_audit_log" ENABLE ROW LEVEL SECURITY')


def _create_audit_table() -> None:
    op.create_table(
        "_audit_log",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column(
            "owner_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("action", sa.String, nullable=False),
        # ator (polimórfico, ponteiro soft — sem FK)
        sa.Column("actor_type", sa.String, nullable=False, server_default="user"),
        sa.Column("actor_id", sa.Integer, nullable=True),
        sa.Column("actor_label", sa.String, nullable=True),
        sa.Column("actor_ip", sa.String, nullable=True),
        sa.Column("user_agent", sa.String, nullable=True),
        # alvo (polimórfico, ponteiro soft — apagar o alvo É um evento auditado,
        # e uma FK apagaria o registro de que ele existiu)
        sa.Column("target_type", sa.String, nullable=True),
        sa.Column("target_id", sa.Integer, nullable=True),
        sa.Column("target_label", sa.String, nullable=True),
        sa.Column("target_row_id", sa.String, nullable=True),
        # sa.JSON nos dois bancos, NUNCA JSONB (divergiria de um DB fresh, que
        # nasce do create_all do model) e NUNCA sa.ARRAY (SQLite não tem).
        sa.Column("changed_columns", sa.JSON, nullable=True),
        sa.Column("details", sa.JSON, nullable=True),
    )


def downgrade() -> None:
    if _is_postgres():
        op.execute('ALTER TABLE "_audit_log" DISABLE ROW LEVEL SECURITY')
    op.drop_table("_audit_log")
