"""add_activated_at_to_publication_versions

Revision ID: d7e1a92c4f03
Revises: c5dad43f9889
Create Date: 2026-06-12

M6.5 PR3: `activated_at` registra quando a versão foi ATIVADA pela
última vez (publish ou rollback). `created_at` diz quando o snapshot
nasceu — sem este campo, a data da "edição vigente" exibida na capa
mentia após um rollback (mostrava a criação, não a reativação).

Nullable de propósito: versões existentes ficam NULL (frontend cai
pro `created_at`); novas ativações preenchem.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d7e1a92c4f03"
down_revision: Union[str, Sequence[str], None] = "c5dad43f9889"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "_publication_versions",
        sa.Column("activated_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("_publication_versions", "activated_at")
