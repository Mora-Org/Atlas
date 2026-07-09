"""M8 F3 — mídia no snapshot: preview (PR4b) + copy-at-publish (#3=A).

Cobre:
- POST /api/publications/me/preview: monta o MESMO blob do publish sem
  persistir (preview == publish), master 403, sem criar versão.
- Copy-at-publish: o publish congela a mídia num retrato imutável por-versão
  (`{owner}/pub/vN__…`) e reescreve a célula pro path copiado; o asset original
  fica intocado (refcount limpo); deletar a versão remove a cópia.

Storage de snapshot + mídia rodam em modo dev/in-memory (sem Supabase). O
fixture limpa os dois stores entre testes.
"""
from __future__ import annotations

import pytest

import media_storage
import publication_storage


@pytest.fixture(autouse=True)
def _reset_stores():
    publication_storage._reset_local_store_for_tests()
    media_storage._reset_local_store_for_tests()
    yield
    publication_storage._reset_local_store_for_tests()
    media_storage._reset_local_store_for_tests()


def _create_media_table(client, admin_token: str, name: str) -> int:
    res = client.post(
        "/tables/",
        json={
            "name": name,
            "columns": [
                {"name": "titulo", "data_type": "String", "is_nullable": False},
                {"name": "foto", "data_type": "image", "is_nullable": True},
            ],
            "is_public": False,
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res.status_code == 200, res.text
    return res.json()["id"]


def _upload_asset(client, admin_token: str, name: str = "x.png") -> str:
    res = client.post(
        "/api/assets/upload",
        files={"file": (name, b"PNGDATA-" + name.encode(), "image/png")},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res.status_code == 200, res.text
    return res.json()["url"]


def _insert_row(client, admin_token: str, table_name: str, titulo: str, foto: str | None) -> None:
    res = client.post(
        f"/api/{table_name}",
        json={"titulo": titulo, "foto": foto},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res.status_code == 200, res.text


# ------------------------------- preview -------------------------------- #

def test_preview_returns_payload_without_persisting(client, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    tbl = _create_media_table(client, admin_token, "acervo")
    url = _upload_asset(client, admin_token, "foto1.png")
    _insert_row(client, admin_token, "acervo", "Peça A", url)

    r = client.post(
        "/api/publications/me/preview",
        json={"table_selection": [{"table_id": tbl, "order": 0, "layout": "grid"}]},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    blob = r.json()
    assert blob["schema_version"] == 1
    t0 = blob["tables"][0]
    # colunas carregam data_type (o render chaveia por ele)
    dtypes = {c["name"]: c["data_type"] for c in t0["columns"]}
    assert dtypes["foto"] == "image"
    # célula do preview tem a URL VIVA (preview não congela — é efêmero)
    assert t0["rows"][0]["foto"] == url
    assert t0["rows"][0]["titulo"] == "Peça A"

    # NÃO persistiu: nenhuma versão criada
    versions = client.get("/api/publications/me/versions", headers=headers).json()
    assert versions == []


def test_preview_master_403(client, master_token):
    r = client.post(
        "/api/publications/me/preview",
        json={"table_selection": []},
        headers={"Authorization": f"Bearer {master_token}"},
    )
    assert r.status_code == 403


def test_preview_equals_publish_shape(client, admin_token):
    """O preview e o publish saem do MESMO _build_snapshot_payload — as
    tables (colunas + linhas) batem (menos a mídia, que o publish congela)."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    tbl = _create_media_table(client, admin_token, "obras")
    _insert_row(client, admin_token, "obras", "Sem foto", None)

    prev = client.post(
        "/api/publications/me/preview",
        json={"table_selection": [{"table_id": tbl, "order": 0, "layout": "list"}]},
        headers=headers,
    ).json()

    v = client.post(
        "/api/publications/me/versions",
        json={"description": None, "theme_config": {}, "table_selection": [{"table_id": tbl, "order": 0, "layout": "list"}]},
        headers=headers,
    ).json()
    pub = client.get(f"/api/publications/me/versions/{v['id']}/snapshot", headers=headers).json()

    # sem mídia, preview e publish são idênticos nas tables
    assert prev["tables"][0]["columns"] == pub["tables"][0]["columns"]
    assert prev["tables"][0]["rows"] == pub["tables"][0]["rows"]


# --------------------------- copy-at-publish ---------------------------- #

def test_publish_freezes_media_into_immutable_copy(client, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    tbl = _create_media_table(client, admin_token, "galeria")
    url = _upload_asset(client, admin_token, "peca.png")
    _insert_row(client, admin_token, "galeria", "Peça", url)

    v = client.post(
        "/api/publications/me/versions",
        json={"description": "v1", "theme_config": {}, "table_selection": [{"table_id": tbl, "order": 0, "layout": "grid"}]},
        headers=headers,
    ).json()
    owner_id = v["owner_id"]

    blob = client.get(f"/api/publications/me/versions/{v['id']}/snapshot", headers=headers).json()
    cell = blob["tables"][0]["rows"][0]["foto"]

    # a célula do snapshot foi reescrita pro path COPIADO (não a URL viva)
    src_path = media_storage.url_to_path(url)
    copy_path = media_storage.snapshot_copy_path(owner_id, 1, src_path)
    assert cell == media_storage.public_url(copy_path)
    assert cell != url

    # a cópia existe fisicamente; o asset ORIGINAL fica intocado (refcount limpo)
    assert media_storage.read_dev(copy_path) is not None
    assert media_storage.read_dev(src_path) is not None


def test_dev_serving_of_copied_media_nested_path(client, admin_token):
    """A cópia de snapshot vive num path ANINHADO ({owner}/pub/vN__…); a rota
    de serving dev tem que servi-lo (não só o path flat do asset original) — do
    contrário o <img> do site público 404a em dev. Regressão da F3."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    tbl = _create_media_table(client, admin_token, "acervo_serve")
    url = _upload_asset(client, admin_token, "img.png")
    _insert_row(client, admin_token, "acervo_serve", "X", url)
    v = client.post(
        "/api/publications/me/versions",
        json={"description": "v1", "theme_config": {}, "table_selection": [{"table_id": tbl, "order": 0, "layout": "grid"}]},
        headers=headers,
    ).json()
    blob = client.get(f"/api/publications/me/versions/{v['id']}/snapshot", headers=headers).json()
    copied_url = blob["tables"][0]["rows"][0]["foto"]
    assert "/api/assets/dev/" in copied_url
    dev_path = copied_url.split("/api/assets/dev/", 1)[1]  # "{owner}/pub/vN__uuid.png"
    assert "/pub/" in dev_path  # é aninhado

    r = client.get(f"/api/assets/dev/{dev_path}")
    assert r.status_code == 200, f"copia aninhada nao serviu: {r.status_code}"
    assert r.headers["content-type"].startswith("image/")
    assert r.content

    # guard de path-traversal continua firme
    bad = client.get("/api/assets/dev/10/../../etc/passwd")
    assert bad.status_code == 404


def test_delete_version_removes_media_copy(client, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    tbl = _create_media_table(client, admin_token, "acervo2")
    url = _upload_asset(client, admin_token, "img.png")
    _insert_row(client, admin_token, "acervo2", "X", url)

    v = client.post(
        "/api/publications/me/versions",
        json={"description": "v1", "theme_config": {}, "table_selection": [{"table_id": tbl, "order": 0, "layout": "list"}]},
        headers=headers,
    ).json()
    owner_id = v["owner_id"]
    src_path = media_storage.url_to_path(url)
    copy_path = media_storage.snapshot_copy_path(owner_id, 1, src_path)
    assert media_storage.read_dev(copy_path) is not None  # cópia criada

    # versão inativa pode ser deletada; isso remove a cópia congelada
    r = client.delete(f"/api/publications/me/versions/{v['id']}", headers=headers)
    assert r.status_code == 200, r.text
    assert media_storage.read_dev(copy_path) is None       # cópia removida
    assert media_storage.read_dev(src_path) is not None    # original intocado
