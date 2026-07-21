"""M8.5 F3.1 — proveniência (`source`) da tabela pro impresso acadêmico.

Decisão D2 do Diretor (2026-07-21): criar o campo `source` em vez de auto-citar
só metadado. Preenchido no import (filename) ou editável pelo admin; propagado
ao snapshot; NULL = sem origem informada (o acadêmico não fabrica bibliografia).
"""
import io
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _create_table(client, token, name="vendas", source=None):
    body = {"name": name, "description": "", "columns": [
        {"name": "regiao", "data_type": "String", "is_nullable": True},
    ]}
    if source is not None:
        body["source"] = source
    res = client.post("/tables/", json=body, headers=_auth(token))
    assert res.status_code == 200, res.text
    return res.json()


# ------------------------------------------------------------ create

def test_create_table_stores_source(client, admin_token):
    t = _create_table(client, admin_token, source="Censo IBGE 2022")
    assert t["source"] == "Censo IBGE 2022"


def test_create_table_source_optional(client, admin_token):
    """Sem source → None (não fabrica origem)."""
    t = _create_table(client, admin_token)
    assert t.get("source") is None


# ------------------------------------------------------------ import auto-fill

def test_spreadsheet_import_autofills_source_with_filename(client, admin_token):
    """Import de planilha (F4) preenche `source` com o arquivo de origem."""
    csv = b"nome,valor\nAna,10\nBia,20\n"
    fname = "vendas_2026.csv"
    columns = json.dumps([
        {"original_header": "nome", "name": "nome", "data_type": "String", "is_nullable": True},
        {"original_header": "valor", "name": "valor", "data_type": "Integer", "is_nullable": True},
    ])
    commit = client.post("/api/import/table/commit",
                         files={"file": (fname, io.BytesIO(csv), "text/csv")},
                         data={"table_name": "vendas_import", "columns": columns},
                         headers=_auth(admin_token))
    assert commit.status_code == 200, commit.text
    tables = client.get("/tables/", headers=_auth(admin_token)).json()
    imported = [t for t in tables if t.get("source") == fname]
    assert imported, f"nenhuma tabela com source={fname}"


# ------------------------------------------------------------ PATCH edit

def test_patch_source_edits_and_strips(client, admin_token):
    t = _create_table(client, admin_token)
    res = client.patch(f"/tables/{t['id']}/source",
                       json={"source": "  Planilha do RH  "}, headers=_auth(admin_token))
    assert res.status_code == 200, res.text
    assert res.json()["source"] == "Planilha do RH", "tem que dar strip"
    # e persiste
    got = client.get("/tables/", headers=_auth(admin_token)).json()
    assert next(x for x in got if x["id"] == t["id"])["source"] == "Planilha do RH"


def test_patch_source_empty_clears_to_none(client, admin_token):
    """Source vazio limpa → None (acadêmico volta a citar só metadado)."""
    t = _create_table(client, admin_token, source="algo")
    res = client.patch(f"/tables/{t['id']}/source",
                       json={"source": "   "}, headers=_auth(admin_token))
    assert res.status_code == 200
    assert res.json()["source"] is None


def test_patch_source_not_your_table(client, master_token, admin_token):
    t = _create_table(client, admin_token)
    assert client.post("/api/admins",
                       json={"username": "outrosrc", "password": "Pwd12345!", "role": "admin"},
                       headers=_auth(master_token)).status_code == 200
    res = client.patch(f"/tables/{t['id']}/source",
                       json={"source": "x"}, headers=_auth("test-outrosrc"))
    assert res.status_code == 403


def test_patch_source_404(client, admin_token):
    res = client.patch("/tables/999999/source", json={"source": "x"}, headers=_auth(admin_token))
    assert res.status_code == 404


# ------------------------------------------------------------ snapshot payload

def test_source_flows_into_snapshot(client, admin_token):
    """O impresso acadêmico lê `source` do snapshot por-tabela."""
    t = _create_table(client, admin_token, source="Arquivo Nacional, fundo X")
    res = client.post("/api/publications/me/preview",
                      json={"table_selection": [{"table_id": t["id"], "order": 0, "layout": "list"}]},
                      headers=_auth(admin_token))
    assert res.status_code == 200, res.text
    tbl = res.json()["tables"][0]
    assert tbl["source"] == "Arquivo Nacional, fundo X"


def test_snapshot_source_null_when_absent(client, admin_token):
    t = _create_table(client, admin_token)
    res = client.post("/api/publications/me/preview",
                      json={"table_selection": [{"table_id": t["id"], "order": 0, "layout": "list"}]},
                      headers=_auth(admin_token))
    assert res.json()["tables"][0]["source"] is None
