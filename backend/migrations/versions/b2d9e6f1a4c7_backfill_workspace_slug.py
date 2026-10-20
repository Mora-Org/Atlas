"""backfill_workspace_slug

Revision ID: b2d9e6f1a4c7
Revises: f3a80c5d1e97
Create Date: 2026-10-20 15:00:00.000000

1.3.2: todo admin passa a ter endereço público GRAVADO.

Até aqui o `create_admin` deixava `workspace_slug` e `workspace_name` em NULL,
e só o `PATCH /api/admins/me/workspace` gravava — mas nenhuma tela chama esse
PATCH. O `/api/auth/me` inventava o slug a partir do username, o Studio
mostrava esse link, e o `/public/{slug}/snapshot` respondia 404 "Workspace não
encontrado" mesmo depois de publicar e ativar. Medido em produção em
20/10/2026 (admin `budismopuc`).

Daqui pra frente o `create_admin` grava na criação (`main.slug_livre`). Esta
migration cobre os admins que já existiam. A regra é uma CÓPIA CONGELADA do
`slug_livre` + `auth._slugify`, de propósito: migration não importa código do
app, senão uma mudança futura no app reescreveria o passado.

Só preenche o que está NULL: admin que já tem endereço (gravado pelo PATCH)
fica intocado. Idempotente: rodar de novo não acha NULL e não faz nada.
Downgrade é no-op: não há como saber quais endereços nasceram aqui e quais o
admin escolheu depois, e apagar endereço tira site do ar.
"""
import re
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b2d9e6f1a4c7"
down_revision: Union[str, Sequence[str], None] = "f3a80c5d1e97"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# cópia congelada de `main._RESERVED_SLUGS` em 2026-10-20
RESERVADOS = {
    "api", "admin", "auth", "login", "master", "public", "static",
    "assets", "explore", "dashboard", "workspace", "atlas", "mora",
}


def _slugify(s: str) -> str:
    # cópia congelada de `auth._slugify` em 2026-10-20
    s = s.lower().strip()
    s = re.sub(r"[^a-z0-9\s-]", "", s)
    s = re.sub(r"[\s_]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s[:32] or "workspace"


def _livre(base: str, ocupados: set) -> str:
    raiz = _slugify(base)
    candidato, n = raiz, 2
    while len(candidato) < 3 or candidato in RESERVADOS or candidato in ocupados:
        sufixo = f"-{n}"
        candidato = raiz[: 32 - len(sufixo)] + sufixo
        n += 1
    return candidato


def preencher(conn) -> int:
    """Grava endereço e nome nos admins sem endereço. Devolve quantos."""
    ocupados = {
        r[0] for r in conn.execute(
            sa.text("SELECT workspace_slug FROM users WHERE workspace_slug IS NOT NULL")
        )
    }
    sem = conn.execute(sa.text(
        "SELECT id, username, workspace_name FROM users "
        "WHERE role = 'admin' AND workspace_slug IS NULL ORDER BY id"
    )).fetchall()
    for uid, username, nome in sem:
        slug = _livre(username, ocupados)
        ocupados.add(slug)
        conn.execute(
            sa.text("UPDATE users SET workspace_slug = :s, workspace_name = :n WHERE id = :i"),
            {"s": slug, "n": nome or username, "i": uid},
        )
    return len(sem)


def upgrade() -> None:
    preencher(op.get_bind())


def downgrade() -> None:
    pass
