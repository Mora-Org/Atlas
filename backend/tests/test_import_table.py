"""M8 F4 — endpoints do import que CRIA tabela (dry-run + commit) contra o
backend vivo (SQLite/test-auth). Cobre inferência+sanitização no dry-run, o
commit reusando create_table (id PK auto), re-sanitize server-side, contrato
transacional (reserved → nada persiste) e os guards."""
from __future__ import annotations

import json

import pytest


def _csv(text: str) -> tuple[str, bytes, str]:
    return ("dados.csv", text.encode(), "text/csv")


def _hdr(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _create_table(client, admin_token, name):
    r = client.post(
        "/tables/",
        json={"name": name, "columns": [{"name": "nome", "data_type": "String", "is_nullable": False}], "is_public": False},
        headers=_hdr(admin_token),
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


# ─────────────────────────── dry-run create ───────────────────────────

def test_dry_run_create_infers_and_sanitizes(client, admin_token):
    csv = "Nome,Preço (R$),Idade\nAna,10.50,30\nBia,9.99,25\n"
    r = client.post(
        "/api/import/table/dry-run",
        files={"file": _csv(csv)}, data={"mode": "create", "table_name": "catalogo"},
        headers=_hdr(admin_token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["mode"] == "create"
    cols = {c["name"]: c for c in body["columns"]}
    assert set(cols) == {"nome", "preco_r", "idade"}
    assert cols["preco_r"]["original_header"] == "Preço (R$)"
    assert cols["preco_r"]["note"] == "sanitized"
    assert cols["idade"]["data_type"] == "Integer"
    assert cols["preco_r"]["data_type"] == "Float"
    assert cols["nome"]["data_type"] == "String"
    assert body["name_status"] == "ok"
    assert "id" in body["system_columns"]      # id sempre auto-injetado
    assert len(body["sample_rows"]) == 2


def test_dry_run_create_name_conflict(client, admin_token):
    _create_table(client, admin_token, "jaexiste")
    r = client.post(
        "/api/import/table/dry-run",
        files={"file": _csv("a\n1\n")}, data={"mode": "create", "table_name": "jaexiste"},
        headers=_hdr(admin_token),
    )
    assert r.status_code == 200
    assert r.json()["name_status"] == "conflict"


def test_dry_run_create_master_403(client, master_token):
    r = client.post(
        "/api/import/table/dry-run",
        files={"file": _csv("a\n1\n")}, data={"mode": "create"},
        headers=_hdr(master_token),
    )
    assert r.status_code == 403


# ─────────────────────────── dry-run append ───────────────────────────

def test_dry_run_append_matches(client, admin_token):
    _create_table(client, admin_token, "clientes")  # tem coluna 'nome'
    csv = "nome,inexistente\nAna,x\n"
    r = client.post(
        "/api/import/table/dry-run",
        files={"file": _csv(csv)}, data={"mode": "append", "table_name": "clientes"},
        headers=_hdr(admin_token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    matches = {c["original_header"]: c["match"] for c in body["columns"]}
    assert matches["nome"] == "matched"
    assert matches["inexistente"] == "unmatched"


def test_dry_run_append_unknown_table_404(client, admin_token):
    r = client.post(
        "/api/import/table/dry-run",
        files={"file": _csv("a\n1\n")}, data={"mode": "append", "table_name": "naoexiste"},
        headers=_hdr(admin_token),
    )
    assert r.status_code == 404


# ─────────────────────────────── commit ───────────────────────────────

def _commit(client, token, filename_csv, table_name, columns):
    return client.post(
        "/api/import/table/commit",
        files={"file": (filename_csv[0], filename_csv[1], filename_csv[2])},
        data={"table_name": table_name, "columns": json.dumps(columns)},
        headers=_hdr(token),
    )


def test_commit_creates_table_and_loads_rows(client, admin_token):
    csv = _csv("nome,idade\nAna,30\nBia,25\n")
    cols = [
        {"original_header": "nome", "name": "nome", "data_type": "String", "is_nullable": True},
        {"original_header": "idade", "name": "idade", "data_type": "Integer", "is_nullable": True},
    ]
    r = _commit(client, admin_token, csv, "pessoas", cols)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["created"] is True and body["inserted_rows"] == 2 and body["total_rows"] == 2

    # tabela existe + tem as colunas do usuário (id é físico auto, não vira _column)
    tables = client.get("/tables/", headers=_hdr(admin_token)).json()
    t = next(t for t in tables if t["name"] == "pessoas")
    colnames = {c["name"] for c in t["columns"]}
    assert {"nome", "idade"} <= colnames

    # linhas carregadas, com o id físico auto-injetado
    data = client.get("/api/pessoas", headers=_hdr(admin_token)).json()
    rows = data["data"] if isinstance(data, dict) else data
    assert len(rows) == 2
    assert "id" in rows[0]


def test_commit_re_sanitizes_edited_name(client, admin_token):
    csv = _csv("a,b\n1,2\n")
    # admin editou o 'name' pra algo quebrado — o servidor re-sanitiza
    cols = [
        {"original_header": "a", "name": "Coluna Suja!!", "data_type": "Integer", "is_nullable": True},
        {"original_header": "b", "name": "id", "data_type": "Integer", "is_nullable": True},  # reservado
    ]
    r = _commit(client, admin_token, csv, "resan", cols)
    assert r.status_code == 200, r.text
    tables = client.get("/tables/", headers=_hdr(admin_token)).json()
    t = next(t for t in tables if t["name"] == "resan")
    colnames = {c["name"] for c in t["columns"]}
    assert "coluna_suja" in colnames           # sanitizado
    assert "id_col" in colnames                # 'id' reservado renomeado (não colide com o id físico)


def test_commit_drops_column_not_resent(client, admin_token):
    csv = _csv("keep,drop\n1,2\n")
    cols = [{"original_header": "keep", "name": "keep", "data_type": "Integer", "is_nullable": True}]
    r = _commit(client, admin_token, csv, "parcial", cols)
    assert r.status_code == 200, r.text
    tables = client.get("/tables/", headers=_hdr(admin_token)).json()
    t = next(t for t in tables if t["name"] == "parcial")
    colnames = {c["name"] for c in t["columns"]}
    assert "keep" in colnames and "drop" not in colnames


def test_commit_reserved_table_name_nothing_persists(client, admin_token):
    csv = _csv("a\n1\n")
    cols = [{"original_header": "a", "name": "a", "data_type": "Integer", "is_nullable": True}]
    r = _commit(client, admin_token, csv, "assets", cols)   # nome reservado
    assert r.status_code == 400
    tables = client.get("/tables/", headers=_hdr(admin_token)).json()
    assert not any(t["name"] == "assets" for t in tables)


def test_commit_master_403(client, master_token):
    csv = _csv("a\n1\n")
    cols = [{"original_header": "a", "name": "a", "data_type": "Integer", "is_nullable": True}]
    r = _commit(client, master_token, csv, "x", cols)
    assert r.status_code == 403


# ─────────────────────────────── caps ───────────────────────────────

def test_over_col_cap_400(client, admin_token):
    header = ",".join(f"c{i}" for i in range(120))  # > MAX_COLS=100
    csv = _csv(header + "\n" + ",".join("1" for _ in range(120)) + "\n")
    r = client.post(
        "/api/import/table/dry-run",
        files={"file": csv}, data={"mode": "create"},
        headers=_hdr(admin_token),
    )
    assert r.status_code == 400
