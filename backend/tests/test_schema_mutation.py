"""M8 F0: mutação de schema — add-column / drop-column / delete-table.

Em SQLite (default dos testes), drop-column devolve erro controlado por
decisão do Diretor (Postgres pleno, SQLite parcial); os testes ramificam
em `is_postgres()`. add-column e delete-table funcionam nos dois engines.
"""
import models
from database import is_postgres


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def _col(name, dtype="String", nullable=True, unique=False, primary=False):
    return {"name": name, "data_type": dtype, "is_nullable": nullable,
            "is_unique": unique, "is_primary": primary}


def _create_table(client, token, name, columns):
    res = client.post("/tables/", json={"name": name, "columns": columns}, headers=_h(token))
    assert res.status_code == 200, res.text
    return res.json()


def _get_table(client, token, name):
    tables = client.get("/tables/", headers=_h(token)).json()
    return next(x for x in tables if x["name"] == name)


def _permit_mod(client, admin_token):
    g = client.post("/api/database-groups", json={"name": "G"}, headers=_h(admin_token)).json()
    mods = client.get("/api/moderators", headers=_h(admin_token)).json()
    client.post(f"/api/database-groups/{g['id']}/permissions",
                json={"moderator_id": mods[0]["id"]}, headers=_h(admin_token))
    return g["id"]


# ── add-column ───────────────────────────────────────────────────────────────

def test_add_column(client, admin_token):
    t = _create_table(client, admin_token, "books", [_col("title")])
    res = client.post(f"/tables/{t['id']}/columns", json=_col("author"), headers=_h(admin_token))
    assert res.status_code == 200, res.text
    assert res.json()["name"] == "author"
    # a coluna existe fisicamente: insere usando ela
    ins = client.post("/api/books", json={"title": "Dune", "author": "Herbert"}, headers=_h(admin_token))
    assert ins.status_code in (200, 201), ins.text
    # metadado reflete a coluna nova
    assert _get_table(client, admin_token, "books")["meta"]["column_count"] == 2


def test_add_column_rejects_not_null(client, admin_token):
    t = _create_table(client, admin_token, "t_nn", [_col("a")])
    res = client.post(f"/tables/{t['id']}/columns", json=_col("b", nullable=False), headers=_h(admin_token))
    assert res.status_code == 400


def test_add_column_rejects_pk(client, admin_token):
    t = _create_table(client, admin_token, "t_pk", [_col("a")])
    res = client.post(f"/tables/{t['id']}/columns", json=_col("b", primary=True), headers=_h(admin_token))
    assert res.status_code == 400


def test_add_column_rejects_fk(client, admin_token):
    t = _create_table(client, admin_token, "t_fk", [_col("a")])
    body = _col("b")
    body["fk_table"], body["fk_column"] = "x", "id"
    res = client.post(f"/tables/{t['id']}/columns", json=body, headers=_h(admin_token))
    assert res.status_code == 400


def test_add_column_duplicate(client, admin_token):
    t = _create_table(client, admin_token, "t_dup", [_col("a")])
    res = client.post(f"/tables/{t['id']}/columns", json=_col("a"), headers=_h(admin_token))
    assert res.status_code == 400


def test_add_column_master_blocked(client, master_token, admin_token):
    t = _create_table(client, admin_token, "t_m", [_col("a")])
    res = client.post(f"/tables/{t['id']}/columns", json=_col("b"), headers=_h(master_token))
    assert res.status_code == 403


# ── drop-column ──────────────────────────────────────────────────────────────

def test_drop_column(client, admin_token):
    t = _create_table(client, admin_token, "t_drop", [_col("keep"), _col("gone")])
    gone_id = next(c["id"] for c in _get_table(client, admin_token, "t_drop")["columns"] if c["name"] == "gone")
    res = client.delete(f"/tables/{t['id']}/columns/{gone_id}", headers=_h(admin_token))
    if is_postgres():
        assert res.status_code == 200, res.text
        assert "gone" not in [c["name"] for c in _get_table(client, admin_token, "t_drop")["columns"]]
    else:
        # SQLite: erro controlado (drop-column fora da F0); ORM não muda
        assert res.status_code == 400
        assert "SQLite" in res.json()["detail"]
        assert "gone" in [c["name"] for c in _get_table(client, admin_token, "t_drop")["columns"]]


def test_drop_column_blocks_pk(client, admin_token):
    # guard roda ANTES da física → bloqueia nos dois engines
    t = _create_table(client, admin_token, "t_pk2", [_col("code", primary=True), _col("x")])
    pk_id = next(c["id"] for c in _get_table(client, admin_token, "t_pk2")["columns"] if c["name"] == "code")
    res = client.delete(f"/tables/{t['id']}/columns/{pk_id}", headers=_h(admin_token))
    assert res.status_code == 400


def test_drop_column_blocked_by_relation(client, admin_token):
    _create_table(client, admin_token, "rel_a", [_col("name")])
    fk_col = _col("a_ref", "Integer")
    fk_col["fk_table"], fk_col["fk_column"] = "rel_a", "id"
    b = _create_table(client, admin_token, "rel_b", [fk_col])
    fk_id = next(c["id"] for c in _get_table(client, admin_token, "rel_b")["columns"] if c["name"] == "a_ref")
    res = client.delete(f"/tables/{b['id']}/columns/{fk_id}", headers=_h(admin_token))
    assert res.status_code == 400
    assert "rela" in res.json()["detail"].lower()


# ── delete-table ─────────────────────────────────────────────────────────────

def test_delete_table(client, admin_token):
    t = _create_table(client, admin_token, "del_me", [_col("a")])
    res = client.delete(f"/tables/{t['id']}?confirm_name=del_me", headers=_h(admin_token))
    assert res.status_code == 200, res.text
    assert "del_me" not in [x["name"] for x in client.get("/tables/", headers=_h(admin_token)).json()]


def test_delete_table_wrong_confirm(client, admin_token):
    t = _create_table(client, admin_token, "keep_me", [_col("a")])
    res = client.delete(f"/tables/{t['id']}?confirm_name=wrong", headers=_h(admin_token))
    assert res.status_code == 400
    assert "keep_me" in [x["name"] for x in client.get("/tables/", headers=_h(admin_token)).json()]


def test_delete_table_cascades_columns(client, admin_token, db_session):
    t = _create_table(client, admin_token, "casc", [_col("a"), _col("b")])
    tid = t["id"]
    assert client.delete(f"/tables/{tid}?confirm_name=casc", headers=_h(admin_token)).status_code == 200
    assert db_session.query(models.DynamicColumn).filter(models.DynamicColumn.table_id == tid).count() == 0


# ── permissão + isolamento ───────────────────────────────────────────────────

def test_mod_can_mutate_permitted_table(client, admin_token, mod_token):
    gid = _permit_mod(client, admin_token)
    t = client.post("/tables/", json={"name": "mod_t", "group_id": gid, "columns": [_col("a")]},
                    headers=_h(mod_token)).json()
    res = client.post(f"/tables/{t['id']}/columns", json=_col("b"), headers=_h(mod_token))
    assert res.status_code == 200, res.text


def test_cross_tenant_mutation_blocked(client, master_token, admin_token):
    t = _create_table(client, admin_token, "owned", [_col("a")])
    r = client.post("/api/admins", json={"username": "admin2", "password": "x", "role": "admin"},
                    headers=_h(master_token))
    assert r.status_code == 200, r.text
    res = client.post(f"/tables/{t['id']}/columns", json=_col("b"), headers=_h("test-admin2"))
    assert res.status_code == 404  # admin2 não enxerga a tabela do admin1


# ── fix delete_admin em SQLite (dropa as físicas órfãs) ───────────────────────

def test_delete_admin_drops_sqlite_physical(client, master_token):
    if is_postgres():
        import pytest
        pytest.skip("PG usa DROP SCHEMA CASCADE; este teste cobre o gap do SQLite")
    from sqlalchemy import inspect
    from database import engine
    r = client.post("/api/admins", json={"username": "adm_x", "password": "x", "role": "admin"},
                    headers=_h(master_token))
    admin_id = r.json()["id"]
    _create_table(client, "test-adm_x", "gadgets", [_col("a")])
    phys = f"t{admin_id}_gadgets"
    assert phys in inspect(engine).get_table_names()
    assert client.delete(f"/api/admins/{admin_id}", headers=_h(master_token)).status_code == 200
    assert phys not in inspect(engine).get_table_names()
