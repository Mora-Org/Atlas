"""add_webhooks

Revision ID: e5b81f04c9a2
Revises: d1c73a5e9b40
Create Date: 2026-08-07 15:40:00.000000

M9 F3: `_webhook_endpoints` (URL + segredo cifrado + eventos assinados) e
`_webhook_deliveries` (a OUTBOX).

A outbox nasce na mesma transação da mutação — daí `body` ser TEXT: o corpo é
serializado uma vez no emit e enviado verbatim, porque re-serializar poderia
reordenar chaves e quebrar a assinatura HMAC no receptor.

Molde `e4b7a9c31f52`: guard só na criação; índice e RLS **fora** dele. Numa
tabela que guarda segredo de cliente (ainda que cifrado), pular o
`ENABLE ROW LEVEL SECURITY` num banco novo seria o pior lugar pra repetir o
esquecimento que aconteceu com `_publication_versions`.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e5b81f04c9a2"
down_revision: Union[str, Sequence[str], None] = "d1c73a5e9b40"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

IDX_DELIVERIES = "ix__webhook_deliveries_status_next"


def _is_postgres() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    if not insp.has_table("_webhook_endpoints"):
        _create_endpoints()
    if not sa.inspect(op.get_bind()).has_table("_webhook_deliveries"):
        _create_deliveries()

    existentes = {ix["name"] for ix in sa.inspect(op.get_bind()).get_indexes("_webhook_deliveries")}
    if IDX_DELIVERIES not in existentes:
        op.create_index(IDX_DELIVERIES, "_webhook_deliveries", ["status", "next_attempt_at"])

    if _is_postgres():
        op.execute('ALTER TABLE "_webhook_endpoints" ENABLE ROW LEVEL SECURITY')
        op.execute('ALTER TABLE "_webhook_deliveries" ENABLE ROW LEVEL SECURITY')


def _create_endpoints() -> None:
    op.create_table(
        "_webhook_endpoints",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("owner_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("created_by", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"),
                  nullable=True),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("url", sa.String, nullable=False),
        # Fernet, não digest: o HMAC é recomputado a cada tentativa no drain.
        sa.Column("secret_encrypted", sa.String, nullable=False),
        sa.Column("events", sa.JSON, nullable=False, server_default=sa.text("'[]'")),
        sa.Column("table_names", sa.JSON, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )


def _create_deliveries() -> None:
    op.create_table(
        "_webhook_deliveries",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("owner_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("endpoint_id", sa.Integer,
                  sa.ForeignKey("_webhook_endpoints.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("delivery_id", sa.String, nullable=False, index=True),
        sa.Column("event", sa.String, nullable=False),
        # TEXT e não JSON: assinado e enviado verbatim.
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("status", sa.String, nullable=False, server_default="pending"),
        sa.Column("attempts", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("next_attempt_at", sa.DateTime, nullable=True),
        sa.Column("last_error", sa.String, nullable=True),
        sa.Column("response_status", sa.Integer, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("delivered_at", sa.DateTime, nullable=True),
    )


def downgrade() -> None:
    if _is_postgres():
        op.execute('ALTER TABLE "_webhook_deliveries" DISABLE ROW LEVEL SECURITY')
        op.execute('ALTER TABLE "_webhook_endpoints" DISABLE ROW LEVEL SECURITY')
    op.drop_table("_webhook_deliveries")
    op.drop_table("_webhook_endpoints")
