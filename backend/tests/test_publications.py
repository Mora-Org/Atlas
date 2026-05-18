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
