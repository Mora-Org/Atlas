"""Raw SQL bypass attempts (Postgres-only).

Como `app_user` (NOSUPERUSER), tentar burlar RLS abrindo conexão psycopg2
crua. Numa sessão que nunca setou `app.tenant_id`, qualquer SELECT em
`tenant_*` deve retornar 0 linhas. Com o GUC apontando pra outro tenant, idem.

**Precisão importante (B10):** "sem `app.tenant_id`" só devolve 0 linhas na
sessão VIRGEM. Numa conexão reciclada pelo pool depois de `RESET ALL`, o GUC
volta como string vazia e o `::int` da policy levantava `22P02` — por isso a
policy passou a usar `NULLIF`. Este teste abre conexão crua nova, então
exercita o caso virgem; o caso reciclado tem teste próprio.

Pré-req: a role `app_user` (LOGIN, NOSUPERUSER) precisa existir no cluster.
**O conftest NÃO a criava** — o docstring antigo dizia que sim, e em máquina
sem a role o teste ERRAVA em vez de provar (B12). Agora o `_ensure_app_user`
abaixo cria a role e os grants no setup, então o teste é autossuficiente.
"""
import os

import pytest
import psycopg2


IS_POSTGRES = os.environ.get("DATABASE_URL", "").startswith("postgres")

pytestmark = pytest.mark.skipif(not IS_POSTGRES, reason="raw psycopg2 path é PG-only")


def _parse_pg_dsn():
    """Extrai host/port/db do DATABASE_URL. Senha do `app_user` é fixa local."""
    url = os.environ["DATABASE_URL"]
    # exemplo: postgresql+psycopg2://postgres:devpass@localhost:5432/dynamic_cms_test
    tail = url.split("://", 1)[1]
    # ignora user:pass@
    if "@" in tail:
        tail = tail.split("@", 1)[1]
    host_port, dbname = tail.split("/", 1)
    if ":" in host_port:
        host, port = host_port.split(":")
    else:
        host, port = host_port, "5432"
    return host, int(port), dbname


APP_USER = "app_user"
APP_USER_PASS = "app_user_pass"


@pytest.fixture(autouse=True)
def _ensure_app_user(db_session):
    """B12: cria a role `app_user` se não existir.

    O docstring antigo dizia que "o conftest faz isso" — **não fazia**. Em
    máquina sem a role criada à mão, estes testes levantavam erro de conexão em
    vez de falhar com mensagem, e um teste que ERRA não prova nada. Como este
    arquivo é o único consumidor da role, ele passa a se bastar.

    Idempotente: `DO $$ ... IF NOT EXISTS` — rodar de novo é no-op.
    """
    from sqlalchemy import text
    db_session.execute(text(f"""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{APP_USER}') THEN
                CREATE ROLE {APP_USER} LOGIN PASSWORD '{APP_USER_PASS}' NOSUPERUSER NOBYPASSRLS;
            END IF;
        END
        $$;
    """))
    db_session.commit()
    yield


def _grant_app_user(schema: str, db_session):
    """Concede USAGE/SELECT/etc em um schema do tenant pra `app_user`.
    Em prod isso fica no plano da Fase 8 (Supabase RLS faz por padrão).
    Aqui no teste, fazemos manualmente como superuser."""
    from sqlalchemy import text
    db_session.execute(text(f'GRANT USAGE ON SCHEMA "{schema}" TO app_user'))
    db_session.execute(text(
        f'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "{schema}" TO app_user'
    ))
    db_session.execute(text(
        f'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "{schema}" TO app_user'
    ))
    db_session.commit()


def _create_admin_with_data(client, master_token):
    r = client.post(
        "/api/admins",
        json={"username": "rawbypass_admin", "password": "Pwd12345!", "role": "admin"},
        headers={"Authorization": f"Bearer {master_token}"},
    )
    assert r.status_code == 200, r.text
    admin_id = r.json()["id"]
    tok = client.post(
        "/api/auth/login", data={"username": "rawbypass_admin", "password": "Pwd12345!"}
    ).json()["access_token"]

    client.post(
        "/tables/",
        json={
            "name": "secreta",
            "columns": [{"name": "valor", "data_type": "String", "is_nullable": False}],
            "is_public": False,
        },
        headers={"Authorization": f"Bearer {tok}"},
    )
    for v in ("segredo-1", "segredo-2"):
        client.post(
            "/api/secreta",
            json={"valor": v},
            headers={"Authorization": f"Bearer {tok}"},
        )
    return admin_id


def test_app_user_blocked_without_guc(client, master_token, db_session):
    admin_id = _create_admin_with_data(client, master_token)
    schema = f"tenant_{admin_id}"
    _grant_app_user(schema, db_session)

    host, port, dbname = _parse_pg_dsn()
    conn = psycopg2.connect(
        host=host, port=port, dbname=dbname,
        user="app_user", password="app_user_pass",
    )
    try:
        with conn.cursor() as cur:
            # Sem GUC: RLS bloqueia tudo
            cur.execute(f'SELECT count(*) FROM "{schema}".secreta')
            (n_no_guc,) = cur.fetchone()
            assert n_no_guc == 0, f"esperava 0 linhas sem GUC, recebi {n_no_guc}"

            # Com GUC apontando pro tenant errado: 0 linhas
            cur.execute("SELECT set_config('app.tenant_id', '999999', false)")
            cur.execute(f'SELECT count(*) FROM "{schema}".secreta')
            (n_wrong,) = cur.fetchone()
            assert n_wrong == 0

            # Com GUC certo: 2 linhas
            cur.execute("SELECT set_config('app.tenant_id', %s, false)", (str(admin_id),))
            cur.execute(f'SELECT count(*) FROM "{schema}".secreta')
            (n_right,) = cur.fetchone()
            assert n_right == 2
    finally:
        conn.close()


def test_app_user_insert_with_forged_tenant_blocked(client, master_token, db_session):
    """INSERT com tenant_id forjado é bloqueado — duas camadas:
    RLS WITH CHECK (InsufficientPrivilege) e CHECK constraint
    `tenant_id_matches` (CheckViolation). RLS dispara primeiro;
    a CHECK fica de defesa em profundidade caso RLS seja desabilitada."""
    admin_id = _create_admin_with_data(client, master_token)
    schema = f"tenant_{admin_id}"
    _grant_app_user(schema, db_session)

    host, port, dbname = _parse_pg_dsn()
    conn = psycopg2.connect(
        host=host, port=port, dbname=dbname,
        user="app_user", password="app_user_pass",
    )
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT set_config('app.tenant_id', %s, false)", (str(admin_id),))
            with pytest.raises((psycopg2.errors.InsufficientPrivilege, psycopg2.errors.CheckViolation)):
                cur.execute(
                    f'INSERT INTO "{schema}".secreta (valor, tenant_id) VALUES (%s, %s)',
                    ("forjado", 999),
                )
    finally:
        conn.close()
