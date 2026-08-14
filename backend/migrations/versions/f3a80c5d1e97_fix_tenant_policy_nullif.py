"""fix_tenant_policy_nullif

Revision ID: f3a80c5d1e97
Revises: e5b81f04c9a2
Create Date: 2026-08-07 20:10:00.000000

B10: corrige a `tenant_isolation` das tabelas dinâmicas JÁ EXISTENTES.

**Esta é a primeira migration do projeto a executar DDL de policy.** Até aqui a
única policy do sistema nascia em `dynamic_schema.py`, por tabela, dentro do
`create_table` — nenhuma das 12 migrations anteriores toca em `POLICY`. Quem for
mexer em policy de novo vai copiar este molde, então ele está comentado com esse
peso.

Dois defeitos são corrigidos de uma vez (detalhe em `dynamic_schema.py`, onde a
expressão mora):

1. `current_setting('app.tenant_id', true)::int` levantava **22P02** quando o
   GUC estava em string vazia — que é o estado normal de uma conexão devolvida
   ao pool. Vira `NULLIF(...)`, que nega em vez de errar.
2. O ramo do master aceitava a **flag sozinha**. Agora exige também a sentinela
   `app.tenant_id='0'`, que o `set_tenant_for_session` já seta junto. Isso fecha
   um vazamento cross-tenant que **já existia** — e que o fix do item 1, sozinho,
   teria alargado.

`ALTER POLICY` e não `DROP`+`CREATE`: preserva `cmd`/`roles`/`permissive` sem
re-declarar, e não existe janela em que a tabela fique sem policy. (`CREATE OR
REPLACE POLICY` não existe em Postgres — testado, é erro de sintaxe.)

Idempotente por construção: reaplicar a mesma expressão é no-op semântico.
PG-only; em SQLite não há RLS e a função inteira não roda.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f3a80c5d1e97"
down_revision: Union[str, Sequence[str], None] = "e5b81f04c9a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Importa do módulo pra garantir que a migration e o `create_table` apliquem a
# MESMA expressão. Se divergirem, metade dos tenants fica com uma regra e
# metade com outra, e nada no sistema compara as duas.
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from dynamic_schema import (  # noqa: E402
    TENANT_POLICY_CHECK, TENANT_POLICY_NAME, TENANT_POLICY_USING,
)

# Policy ANTIGA, pro downgrade — literal, porque o downgrade tem que restaurar o
# que existia, não o que o código passar a gerar no futuro.
_USING_ANTIGA = (
    "tenant_id = current_setting('app.tenant_id', true)::int"
    " OR current_setting('app.is_master', true) = 'true'"
)
_CHECK_ANTIGA = "tenant_id = current_setting('app.tenant_id', true)::int"


def _is_postgres() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def _alvos(conn):
    """Tabelas de tenant que têm a policy. Enumera por `pg_policies` cruzado com
    o padrão de schema — não por `_tables`, porque o que interessa é o que está
    no BANCO, não o que o metadado diz que deveria estar."""
    return conn.execute(sa.text("""
        SELECT schemaname::text, tablename::text
          FROM pg_policies
         WHERE policyname = :nome
           AND schemaname::text ~ '^tenant_[0-9]+$'
         ORDER BY 1, 2
    """), {"nome": TENANT_POLICY_NAME}).fetchall()


def _aplica(conn, using: str, check: str) -> int:
    n = 0
    for schema, tabela in _alvos(conn):
        conn.execute(sa.text(
            f'ALTER POLICY {TENANT_POLICY_NAME} ON "{schema}"."{tabela}" '
            f'USING ({using}) WITH CHECK ({check})'
        ))
        n += 1
    return n


def upgrade() -> None:
    if not _is_postgres():
        return
    conn = op.get_bind()
    # Falha rápido em vez de empilhar fila atrás de uma transação longa: o
    # ALTER POLICY pega lock na tabela, e um deploy travado é pior que um
    # deploy que reclama.
    conn.execute(sa.text("SET lock_timeout = '3s'"))

    n = _aplica(conn, TENANT_POLICY_USING, TENANT_POLICY_CHECK)
    print(f"{revision}: policy '{TENANT_POLICY_NAME}' atualizada em {n} tabela(s) de tenant")

    # Sinal barato: tabela de tenant com RLS ligado e SEM policy é fail-closed
    # (nega tudo), mas é estado que ninguém pretendeu criar. Só avisa.
    orfas = conn.execute(sa.text("""
        SELECT n.nspname || '.' || c.relname
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relkind = 'r' AND c.relrowsecurity
           AND n.nspname ~ '^tenant_[0-9]+$'
           AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
    """)).fetchall()
    if orfas:
        print(f"{revision}: AVISO — {len(orfas)} tabela(s) com RLS e SEM policy: "
              + ", ".join(r[0] for r in orfas[:5]))


def downgrade() -> None:
    if not _is_postgres():
        return
    conn = op.get_bind()
    conn.execute(sa.text("SET lock_timeout = '3s'"))
    n = _aplica(conn, _USING_ANTIGA, _CHECK_ANTIGA)
    print(f"{revision}: policy revertida em {n} tabela(s) — 22P02 volta a existir")
