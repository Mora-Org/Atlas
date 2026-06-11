"""Publication versions (M6 Fase 1).

Cobre o ciclo completo: criar versão → ativar → trocar de versão ativa
→ deletar. Inclui o endpoint público `/public/{slug}/snapshot`.

Storage roda em modo in-memory (publication_storage detecta que
Supabase não está configurado e usa o dict local). conftest limpa o
store entre testes pra isolamento total.
"""
from __future__ import annotations

import pytest

import publication_storage


@pytest.fixture(autouse=True)
def _reset_storage():
    publication_storage._reset_local_store_for_tests()
    yield
    publication_storage._reset_local_store_for_tests()


def _set_workspace_slug(client, admin_token: str, name: str, slug: str) -> None:
    res = client.patch(
        "/api/admins/me/workspace",
        json={"workspace_name": name, "workspace_slug": slug},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res.status_code == 200, res.text


def _create_table(client, admin_token: str, name: str) -> int:
    res = client.post(
        "/tables/",
        json={
            "name": name,
            "columns": [{"name": "titulo", "data_type": "String", "is_nullable": False}],
            "is_public": False,
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res.status_code == 200, res.text
    return res.json()["id"]


def _insert_row(client, admin_token: str, table_name: str, titulo: str) -> None:
    res = client.post(
        f"/api/{table_name}",
        json={"titulo": titulo},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res.status_code == 200, res.text


# --------------------------------------------------------------------- #

def test_create_first_version_increments_to_1_and_is_inactive(client, admin_token):
    tbl = _create_table(client, admin_token, "eventos")
    _insert_row(client, admin_token, "eventos", "Festa junina")

    res = client.post(
        "/api/publications/me/versions",
        json={
            "description": "primeira publicação",
            "theme_config": {"preset": "goldenrod"},
            "table_selection": [{"table_id": tbl, "order": 0, "layout": "list"}],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["version_number"] == 1
    assert body["is_active"] is False  # criar não ativa


def test_second_version_increments_and_only_one_active(client, admin_token):
    tbl = _create_table(client, admin_token, "eventos")
    _insert_row(client, admin_token, "eventos", "Festa")

    payload = {
        "description": "v1",
        "theme_config": {},
        "table_selection": [{"table_id": tbl, "order": 0, "layout": "list"}],
    }
    headers = {"Authorization": f"Bearer {admin_token}"}

    v1 = client.post("/api/publications/me/versions", json=payload, headers=headers).json()
    payload["description"] = "v2"
    v2 = client.post("/api/publications/me/versions", json=payload, headers=headers).json()

    assert v1["version_number"] == 1
    assert v2["version_number"] == 2

    # Ativa v1
    r = client.post(f"/api/publications/me/versions/{v1['id']}/activate", headers=headers)
    assert r.status_code == 200 and r.json()["is_active"] is True

    # Ativa v2 → v1 vira inativa
    r = client.post(f"/api/publications/me/versions/{v2['id']}/activate", headers=headers)
    assert r.status_code == 200 and r.json()["is_active"] is True

    listing = client.get("/api/publications/me/versions", headers=headers).json()
    actives = [v for v in listing if v["is_active"]]
    assert len(actives) == 1
    assert actives[0]["id"] == v2["id"]


def test_cannot_delete_active_version(client, admin_token):
    tbl = _create_table(client, admin_token, "eventos")
    headers = {"Authorization": f"Bearer {admin_token}"}
    v = client.post(
        "/api/publications/me/versions",
        json={"description": "v1", "theme_config": {}, "table_selection": [{"table_id": tbl, "order": 0, "layout": "list"}]},
        headers=headers,
    ).json()
    client.post(f"/api/publications/me/versions/{v['id']}/activate", headers=headers)

    r = client.delete(f"/api/publications/me/versions/{v['id']}", headers=headers)
    assert r.status_code == 400
    assert "ativa" in r.json()["detail"].lower()


def test_public_endpoint_serves_active_snapshot(client, admin_token):
    _set_workspace_slug(client, admin_token, "Centro Budista", "centrobudista")
    tbl = _create_table(client, admin_token, "eventos")
    _insert_row(client, admin_token, "eventos", "Retiro de outono")
    _insert_row(client, admin_token, "eventos", "Festa junina")

    headers = {"Authorization": f"Bearer {admin_token}"}
    v = client.post(
        "/api/publications/me/versions",
        json={
            "description": "v1",
            "theme_config": {"preset": "sage"},
            "table_selection": [{"table_id": tbl, "order": 0, "layout": "essay"}],
        },
        headers=headers,
    ).json()
    client.post(f"/api/publications/me/versions/{v['id']}/activate", headers=headers)

    # Endpoint público — sem auth
    pub = client.get("/public/centrobudista/snapshot")
    assert pub.status_code == 200, pub.text
    blob = pub.json()
    assert blob["schema_version"] == 1
    assert blob["owner"]["workspace_slug"] == "centrobudista"
    assert blob["version_number"] == 1
    assert blob["theme"] == {"preset": "sage"}
    assert len(blob["tables"]) == 1
    assert blob["tables"][0]["name"] == "eventos"
    assert blob["tables"][0]["layout"] == "essay"
    assert len(blob["tables"][0]["rows"]) == 2
    titulos = {r["titulo"] for r in blob["tables"][0]["rows"]}
    assert titulos == {"Retiro de outono", "Festa junina"}


def test_public_endpoint_404_for_workspace_without_publish(client, admin_token):
    _set_workspace_slug(client, admin_token, "Vazio", "vazio")
    r = client.get("/public/vazio/snapshot")
    assert r.status_code == 404


def test_public_endpoint_404_for_unknown_slug(client):
    r = client.get("/public/inexistente/snapshot")
    assert r.status_code == 404


def test_master_cannot_publish(client, master_token):
    r = client.post(
        "/api/publications/me/versions",
        json={"description": "x", "theme_config": {}, "table_selection": []},
        headers={"Authorization": f"Bearer {master_token}"},
    )
    assert r.status_code == 403


def test_truncation_marker_when_table_exceeds_limit(client, admin_token, monkeypatch):
    """Reduz o limite pra 3 e cria 5 linhas — espera truncated=True."""
    monkeypatch.setattr(publication_storage, "MAX_ROWS_PER_TABLE", 3)

    tbl = _create_table(client, admin_token, "muitos")
    for i in range(5):
        _insert_row(client, admin_token, "muitos", f"linha {i}")

    headers = {"Authorization": f"Bearer {admin_token}"}
    _set_workspace_slug(client, admin_token, "Big", "big")
    v = client.post(
        "/api/publications/me/versions",
        json={"description": "trunc", "theme_config": {}, "table_selection": [{"table_id": tbl, "order": 0, "layout": "list"}]},
        headers=headers,
    ).json()
    client.post(f"/api/publications/me/versions/{v['id']}/activate", headers=headers)

    blob = client.get("/public/big/snapshot").json()
    assert blob["tables"][0]["truncated"] is True
    assert len(blob["tables"][0]["rows"]) == 3


def test_delete_owner_snapshots_removes_only_that_owner():
    """Cleanup de Storage ao deletar admin: remove blobs do owner, mantém
    os de outros owners. Roda no fallback in-memory."""
    publication_storage.upload(publication_storage.snapshot_path(42, 1), {"v": 1})
    publication_storage.upload(publication_storage.snapshot_path(42, 2), {"v": 2})
    publication_storage.upload(publication_storage.snapshot_path(99, 1), {"v": 1})

    publication_storage.delete_owner_snapshots(42)

    assert publication_storage.download(publication_storage.snapshot_path(42, 1)) is None
    assert publication_storage.download(publication_storage.snapshot_path(42, 2)) is None
    # Owner 99 intacto.
    assert publication_storage.download(publication_storage.snapshot_path(99, 1)) == {"v": 1}


def test_delete_owner_snapshots_idempotent_when_empty():
    """Não falha se o owner não tem nenhum snapshot."""
    publication_storage.delete_owner_snapshots(12345)  # no-op, sem exceção


# ---- M6 PR5: Histórico + Rollback (cobre o lifecycle da UI nova) -------- #

def test_rollback_activates_older_version(client, admin_token):
    """Rollback = ativar uma versão ANTIGA depois de uma mais nova estar ativa.
    É exatamente o que o botão 'Voltar pra esta' do histórico dispara."""
    tbl = _create_table(client, admin_token, "eventos")
    headers = {"Authorization": f"Bearer {admin_token}"}
    payload = {"description": "v1", "theme_config": {}, "table_selection": [{"table_id": tbl, "order": 0, "layout": "list"}]}
    v1 = client.post("/api/publications/me/versions", json=payload, headers=headers).json()
    payload["description"] = "v2"
    v2 = client.post("/api/publications/me/versions", json=payload, headers=headers).json()

    client.post(f"/api/publications/me/versions/{v2['id']}/activate", headers=headers)
    # rollback pra v1
    r = client.post(f"/api/publications/me/versions/{v1['id']}/activate", headers=headers)
    assert r.status_code == 200 and r.json()["is_active"] is True

    active = client.get("/api/publications/me/active", headers=headers).json()
    assert active["id"] == v1["id"] and active["version_number"] == 1

    listing = client.get("/api/publications/me/versions", headers=headers).json()
    actives = [v for v in listing if v["is_active"]]
    assert len(actives) == 1 and actives[0]["id"] == v1["id"]


def test_delete_inactive_version_succeeds(client, admin_token):
    """Deletar versão inativa retorna 200 e some da lista; a ativa permanece."""
    tbl = _create_table(client, admin_token, "eventos")
    headers = {"Authorization": f"Bearer {admin_token}"}
    payload = {"description": "v1", "theme_config": {}, "table_selection": [{"table_id": tbl, "order": 0, "layout": "list"}]}
    v1 = client.post("/api/publications/me/versions", json=payload, headers=headers).json()
    payload["description"] = "v2"
    v2 = client.post("/api/publications/me/versions", json=payload, headers=headers).json()
    client.post(f"/api/publications/me/versions/{v1['id']}/activate", headers=headers)

    r = client.delete(f"/api/publications/me/versions/{v2['id']}", headers=headers)
    assert r.status_code == 200, r.text

    listing = client.get("/api/publications/me/versions", headers=headers).json()
    assert [v["id"] for v in listing] == [v1["id"]]


# ---- M6 Fase 5 (Marco 2): snapshot por versão + hardening do blob ------- #

def test_upload_serializes_datetime_decimal_uuid_bytes():
    """Rows de tabelas dinâmicas podem carregar datetime/Decimal/UUID
    (Postgres). O blob é congelado no export — publish não pode estourar
    nem gravar lixo por tipo de coluna."""
    import datetime
    import decimal
    import uuid as uuid_mod

    path = publication_storage.snapshot_path(7, 1)
    publication_storage.upload(path, {
        "rows": [{
            "quando": datetime.datetime(2026, 6, 11, 12, 30, 0),
            "dia": datetime.date(2026, 6, 11),
            "preco": decimal.Decimal("10.50"),
            "uid": uuid_mod.UUID("12345678-1234-5678-1234-567812345678"),
            "blob": b"bytes cruas",
        }],
    })

    row = publication_storage.download(path)["rows"][0]
    assert row["quando"] == "2026-06-11T12:30:00"
    assert row["dia"] == "2026-06-11"
    assert row["preco"] == 10.5
    assert row["uid"] == "12345678-1234-5678-1234-567812345678"
    assert row["blob"] == "bytes cruas"


def test_truncated_total_rows_is_real_count(client, admin_token, monkeypatch):
    """Quando trunca, total_rows é a contagem REAL da tabela — não limit+1.
    O export congela esse número; ele não pode mentir."""
    monkeypatch.setattr(publication_storage, "MAX_ROWS_PER_TABLE", 3)

    tbl = _create_table(client, admin_token, "muitos")
    for i in range(7):
        _insert_row(client, admin_token, "muitos", f"linha {i}")

    headers = {"Authorization": f"Bearer {admin_token}"}
    _set_workspace_slug(client, admin_token, "Real", "real")
    v = client.post(
        "/api/publications/me/versions",
        json={"description": "t", "theme_config": {}, "table_selection": [{"table_id": tbl, "order": 0, "layout": "list"}]},
        headers=headers,
    ).json()
    client.post(f"/api/publications/me/versions/{v['id']}/activate", headers=headers)

    blob = client.get("/public/real/snapshot").json()
    assert blob["tables"][0]["truncated"] is True
    assert len(blob["tables"][0]["rows"]) == 3
    assert blob["tables"][0]["total_rows"] == 7


def test_version_snapshot_serves_specific_version(client, admin_token):
    """GET /versions/{id}/snapshot devolve o blob daquela versão mesmo
    quando outra está ativa — base do export por card do histórico."""
    tbl = _create_table(client, admin_token, "eventos")
    _insert_row(client, admin_token, "eventos", "Festa")
    headers = {"Authorization": f"Bearer {admin_token}"}
    payload = {"description": "v1", "theme_config": {"preset": "sage"}, "table_selection": [{"table_id": tbl, "order": 0, "layout": "list"}]}
    v1 = client.post("/api/publications/me/versions", json=payload, headers=headers).json()
    payload["description"] = "v2"
    v2 = client.post("/api/publications/me/versions", json=payload, headers=headers).json()
    client.post(f"/api/publications/me/versions/{v2['id']}/activate", headers=headers)

    r1 = client.get(f"/api/publications/me/versions/{v1['id']}/snapshot", headers=headers)
    assert r1.status_code == 200, r1.text
    assert r1.json()["version_number"] == 1
    assert r1.json()["description"] == "v1"

    r2 = client.get(f"/api/publications/me/versions/{v2['id']}/snapshot", headers=headers)
    assert r2.status_code == 200
    assert r2.json()["version_number"] == 2


def test_version_snapshot_guards(client, admin_token, master_token):
    """404 pra id inexistente e pra versão de OUTRO workspace; master 403."""
    tbl = _create_table(client, admin_token, "eventos")
    headers = {"Authorization": f"Bearer {admin_token}"}
    v = client.post(
        "/api/publications/me/versions",
        json={"description": "v1", "theme_config": {}, "table_selection": [{"table_id": tbl, "order": 0, "layout": "list"}]},
        headers=headers,
    ).json()

    # id inexistente
    assert client.get("/api/publications/me/versions/99999/snapshot", headers=headers).status_code == 404

    # master não tem workspace
    r = client.get(
        f"/api/publications/me/versions/{v['id']}/snapshot",
        headers={"Authorization": f"Bearer {master_token}"},
    )
    assert r.status_code == 403

    # outro admin não enxerga a versão deste workspace
    client.post(
        "/api/admins",
        json={"username": "outroadmin", "password": "outro123", "role": "admin"},
        headers={"Authorization": f"Bearer {master_token}"},
    )
    r = client.get(
        f"/api/publications/me/versions/{v['id']}/snapshot",
        headers={"Authorization": "Bearer test-outroadmin"},
    )
    assert r.status_code == 404


def test_version_snapshot_moderator_inherits_workspace(client, admin_token, mod_token):
    """Moderador herda o workspace do admin pai — mesmo guard dos demais
    /api/publications/me/*."""
    tbl = _create_table(client, admin_token, "eventos")
    headers = {"Authorization": f"Bearer {admin_token}"}
    v = client.post(
        "/api/publications/me/versions",
        json={"description": "v1", "theme_config": {}, "table_selection": [{"table_id": tbl, "order": 0, "layout": "list"}]},
        headers=headers,
    ).json()

    r = client.get(
        f"/api/publications/me/versions/{v['id']}/snapshot",
        headers={"Authorization": f"Bearer {mod_token}"},
    )
    assert r.status_code == 200
    assert r.json()["version_number"] == 1


def test_versions_list_is_descending_with_descriptions(client, admin_token):
    """Lista vem ordenada DESC por version_number e preserva as descriptions
    (o rótulo que o histórico da UI exibe)."""
    tbl = _create_table(client, admin_token, "eventos")
    headers = {"Authorization": f"Bearer {admin_token}"}
    payload = {"description": "rotulo um", "theme_config": {}, "table_selection": [{"table_id": tbl, "order": 0, "layout": "list"}]}
    client.post("/api/publications/me/versions", json=payload, headers=headers)
    payload["description"] = "rotulo dois"
    client.post("/api/publications/me/versions", json=payload, headers=headers)

    listing = client.get("/api/publications/me/versions", headers=headers).json()
    assert [v["version_number"] for v in listing] == [2, 1]
    assert [v["description"] for v in listing] == ["rotulo dois", "rotulo um"]
