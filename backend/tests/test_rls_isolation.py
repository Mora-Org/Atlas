"""RLS isolation tests (Fase 7 do M3).

Dois admins, mesma tabela lógica `clientes`, dados disjuntos.
Roda em SQLite (isolamento lógico via prefixo + `get_accessible_tables`)
e em Postgres (isolamento físico via RLS + schema-per-tenant).
"""
import os

import pytest


IS_POSTGRES = os.environ.get("DATABASE_URL", "").startswith("postgres")


def _create_admin(client, master_token, username, password="Pwd12345!"):
    r = client.post(
        "/api/admins",
        json={"username": username, "password": password, "role": "admin"},
        headers={"Authorization": f"Bearer {master_token}"},
    )
    assert r.status_code == 200, r.text
    login = client.post("/api/auth/login", data={"username": username, "password": password})
    assert login.status_code == 200
    return r.json()["id"], login.json()["access_token"]


def _create_table(client, token, name, columns=None, is_public=False):
    cols = columns or [{"name": "nome", "data_type": "String", "is_nullable": False}]
    r = client.post(
        "/tables/",
        json={"name": name, "columns": cols, "is_public": is_public},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200, r.text
    return r.json()


# --------------------------------------------------------------------------- #
# 1) Admin A não vê dados de admin B (mesma tabela lógica em schemas distintos)
# --------------------------------------------------------------------------- #

def test_admin_to_admin_isolation(client, master_token):
    a_id, a_tok = _create_admin(client, master_token, "rls_admin_a")
    b_id, b_tok = _create_admin(client, master_token, "rls_admin_b")

    _create_table(client, a_tok, "clientes")
    _create_table(client, b_tok, "clientes")

    # A insere 2, B insere 1
    for nome in ("Alice (A)", "Ana (A)"):
        r = client.post(
            "/api/clientes",
            json={"nome": nome},
            headers={"Authorization": f"Bearer {a_tok}"},
        )
        assert r.status_code == 200, r.text

    r = client.post(
        "/api/clientes",
        json={"nome": "Bob (B)"},
        headers={"Authorization": f"Bearer {b_tok}"},
    )
    assert r.status_code == 200

    # A lê: 2 linhas, todas "(A)"
    a_rows = client.get("/api/clientes", headers={"Authorization": f"Bearer {a_tok}"}).json()["data"]
    assert len(a_rows) == 2
    assert all("(A)" in r["nome"] for r in a_rows)

    # B lê: 1 linha, "(B)"
    b_rows = client.get("/api/clientes", headers={"Authorization": f"Bearer {b_tok}"}).json()["data"]
    assert len(b_rows) == 1
    assert "(B)" in b_rows[0]["nome"]


# --------------------------------------------------------------------------- #
# 2) Forge: B tenta inserir com tenant_id=A. Backend deve sobrescrever.
# --------------------------------------------------------------------------- #

@pytest.mark.skipif(
    not IS_POSTGRES,
    reason="forge prevention is PG-only (RLS WITH CHECK + backend overwrite)",
)
def test_admin_cannot_forge_tenant_id(client, master_token):
    a_id, a_tok = _create_admin(client, master_token, "forge_a")
    b_id, b_tok = _create_admin(client, master_token, "forge_b")

    _create_table(client, a_tok, "secreta")
    _create_table(client, b_tok, "secreta")

    # B tenta forjar tenant_id = a_id no payload
    r = client.post(
        "/api/secreta",
        json={"nome": "forged", "tenant_id": a_id},
        headers={"Authorization": f"Bearer {b_tok}"},
    )
    assert r.status_code == 200, r.text  # backend reescreve → insere OK no schema de B

    # A NÃO vê o registro forjado.
    # A rota autenticada devolve {data,total,limit,offset} desde a paginação do
    # M-Ops F3. Este teste é PG-only e passou muito tempo sem rodar: ficou com o
    # assert no formato antigo (lista crua), foi corrigido, e só em 2026-08-04
    # alguém de fato o EXECUTOU num Postgres pra confirmar. Verde desde então.
    a_rows = client.get("/api/secreta", headers={"Authorization": f"Bearer {a_tok}"}).json()
    assert a_rows["data"] == []
    assert a_rows["total"] == 0

    # B vê (com tenant_id correto)
    b_rows = client.get("/api/secreta", headers={"Authorization": f"Bearer {b_tok}"}).json()
    assert len(b_rows["data"]) == 1
    assert b_rows["data"][0]["tenant_id"] == b_id


# --------------------------------------------------------------------------- #
# 3) Moderador só vê tabelas dos grupos que tem permissão (não escala a RLS,
#    é checagem aplicacional — mas reforça que `get_accessible_tables`
#    e tenant_db cooperam).
# --------------------------------------------------------------------------- #

def test_moderator_scoped_to_permitted_group(client, master_token):
    _, admin_tok = _create_admin(client, master_token, "modscope_admin")

    # Criar dois grupos. Tabela pública em G1, privada em G2.
    g1 = client.post(
        "/api/database-groups",
        json={"name": "g1", "description": "grupo 1"},
        headers={"Authorization": f"Bearer {admin_tok}"},
    ).json()
    g2 = client.post(
        "/api/database-groups",
        json={"name": "g2", "description": "grupo 2"},
        headers={"Authorization": f"Bearer {admin_tok}"},
    ).json()
    assert "id" in g1 and "id" in g2

    # Tabela no g1 (acessível) e tabela no g2 (proibida pro mod)
    client.post(
        "/tables/",
        json={
            "name": "publica_g1",
            "columns": [{"name": "valor", "data_type": "String", "is_nullable": False}],
            "is_public": False,
            "group_id": g1["id"],
        },
        headers={"Authorization": f"Bearer {admin_tok}"},
    )
    client.post(
        "/tables/",
        json={
            "name": "restrita_g2",
            "columns": [{"name": "valor", "data_type": "String", "is_nullable": False}],
            "is_public": False,
            "group_id": g2["id"],
        },
        headers={"Authorization": f"Bearer {admin_tok}"},
    )

    # Criar mod e dar permissão só em g1
    mod = client.post(
        "/api/moderators",
        json={"username": "scoped_mod", "password": "Mod12345!", "role": "moderator"},
        headers={"Authorization": f"Bearer {admin_tok}"},
    ).json()
    perm = client.post(
        f"/api/database-groups/{g1['id']}/permissions",
        json={"moderator_id": mod["id"]},
        headers={"Authorization": f"Bearer {admin_tok}"},
    )
    assert perm.status_code == 200, perm.text

    mod_tok = client.post(
        "/api/auth/login", data={"username": "scoped_mod", "password": "Mod12345!"}
    ).json()["access_token"]

    # Mod lista tabelas → vê só publica_g1
    tables = client.get("/tables/", headers={"Authorization": f"Bearer {mod_tok}"}).json()
    names = {t["name"] for t in tables}
    assert "publica_g1" in names
    assert "restrita_g2" not in names

    # GET /api/restrita_g2 → 404
    r = client.get("/api/restrita_g2", headers={"Authorization": f"Bearer {mod_tok}"})
    assert r.status_code == 404


# --------------------------------------------------------------------------- #
# 4) POST /api/admins provisiona schema `tenant_N` em Postgres.
# --------------------------------------------------------------------------- #

@pytest.mark.skipif(not IS_POSTGRES, reason="schema-per-tenant é PG-only")
def test_admin_create_provisions_schema(client, master_token, db_session):
    from sqlalchemy import text

    new_id, _ = _create_admin(client, master_token, "schemacheck")

    rows = db_session.execute(
        text(
            "SELECT schema_name FROM information_schema.schemata "
            "WHERE schema_name = :s"
        ),
        {"s": f"tenant_{new_id}"},
    ).fetchall()
    assert len(rows) == 1, f"esperava schema tenant_{new_id} criado"


# --------------------------------------------------------------------------- #
# 5) Tabela pública: GET /public/api/{name} retorna dados quando is_public=true,
#    404 quando is_public=false.
# --------------------------------------------------------------------------- #

def test_public_endpoint_respects_is_public(client, master_token):
    _, a_tok = _create_admin(client, master_token, "pub_admin")

    _create_table(client, a_tok, "privada", is_public=False)
    _create_table(client, a_tok, "aberta", is_public=True)

    client.post(
        "/api/aberta",
        json={"nome": "visivel"},
        headers={"Authorization": f"Bearer {a_tok}"},
    )

    # Sem auth, tabela pública responde
    pub_ok = client.get("/public/api/aberta")
    assert pub_ok.status_code == 200, pub_ok.text
    payload = pub_ok.json()
    assert payload.get("total") == 1
    assert len(payload["data"]) == 1
    assert payload["data"][0]["nome"] == "visivel"

    # Sem auth, tabela não pública → 404
    pub_404 = client.get("/public/api/privada")
    assert pub_404.status_code == 404
