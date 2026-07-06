"""M8 F1 — Media Library: whitelist de data_type, upload, refcount, GC, cleanup.

Roda no fallback filesystem (Supabase desconfigurado pelo conftest).
drop-column é Postgres-only (decisão F0) — o teste correspondente é skipped
em SQLite, igual aos da F0.
"""
import datetime
import io
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import media_storage
import models

IS_POSTGRES = os.environ.get("DATABASE_URL", "").startswith("postgres")

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


@pytest.fixture(autouse=True)
def _reset_media_store():
    media_storage._reset_local_store_for_tests()
    yield
    media_storage._reset_local_store_for_tests()


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _upload(client, token, name="foto.png", mime="image/png", content=PNG):
    return client.post(
        "/api/assets/upload",
        files={"file": (name, io.BytesIO(content), mime)},
        headers=_auth(token),
    )


def _create_media_table(client, token, name="produtos"):
    res = client.post(
        "/tables/",
        json={
            "name": name,
            "description": "",
            "columns": [
                {"name": "titulo", "data_type": "String", "is_nullable": False},
                {"name": "foto", "data_type": "image", "is_nullable": True},
            ],
        },
        headers=_auth(token),
    )
    assert res.status_code == 200, res.text
    return res.json()


def _refcount(client, token, asset_id):
    res = client.get("/api/assets", headers=_auth(token))
    assert res.status_code == 200, res.text
    return next(a["refcount"] for a in res.json()["data"] if a["id"] == asset_id)


# ==========================================
# Whitelist de data_type (borda Pydantic)
# ==========================================

class TestDataTypeWhitelist:
    def test_create_table_rejects_unknown_type(self, client, admin_token):
        res = client.post(
            "/tables/",
            json={"name": "x", "columns": [{"name": "c", "data_type": "DROP TABLE users"}]},
            headers=_auth(admin_token),
        )
        assert res.status_code == 422

    def test_add_column_rejects_unknown_type(self, client, admin_token):
        t = _create_media_table(client, admin_token, name="tw1")
        res = client.post(
            f"/tables/{t['id']}/columns",
            json={"name": "hack", "data_type": "VARCHAR(9)"},
            headers=_auth(admin_token),
        )
        assert res.status_code == 422

    def test_accepts_engine_ui_and_media_spellings(self, client, admin_token):
        # Motor + grafias da UI (Date/Text caem no fallback String — comportamento
        # pré-existente) + os 3 tipos de mídia canônicos.
        tipos = ["String", "Integer", "Float", "Boolean", "DateTime", "Date", "Text",
                 "image", "file", "attachment"]
        cols = [{"name": f"c{i}", "data_type": t} for i, t in enumerate(tipos)]
        res = client.post(
            "/tables/", json={"name": "tipos_ok", "columns": cols}, headers=_auth(admin_token)
        )
        assert res.status_code == 200, res.text

    def test_add_media_column_to_existing_table(self, client, admin_token):
        t = _create_media_table(client, admin_token, name="tw2")
        res = client.post(
            f"/tables/{t['id']}/columns",
            json={"name": "anexo", "data_type": "attachment", "is_nullable": True},
            headers=_auth(admin_token),
        )
        assert res.status_code == 200, res.text

    def test_reserved_table_name_assets(self, client, admin_token):
        res = client.post(
            "/tables/", json={"name": "assets", "columns": []}, headers=_auth(admin_token)
        )
        assert res.status_code == 400
        assert "reservado" in res.json()["detail"].lower()


# ==========================================
# Upload
# ==========================================

class TestUpload:
    def test_upload_and_list(self, client, admin_token):
        res = _upload(client, admin_token)
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["url"].startswith("http")
        assert body["mime"] == "image/png"
        assert body["refcount"] == 0
        assert body["original_name"] == "foto.png"
        assert body["size_bytes"] == len(PNG)

        listing = client.get("/api/assets", headers=_auth(admin_token)).json()
        assert listing["total"] == 1
        assert listing["data"][0]["id"] == body["id"]

        # bytes de fato no fallback e servidos pela rota dev
        dev_path = body["url"].split("/api/assets/dev/")[1]
        assert media_storage.read_dev(dev_path) == PNG
        served = client.get(f"/api/assets/dev/{dev_path}")
        assert served.status_code == 200
        assert served.content == PNG

    def test_svg_rejected(self, client, admin_token):
        res = _upload(client, admin_token, name="x.svg", mime="image/svg+xml",
                      content=b"<svg onload=alert(1)></svg>")
        assert res.status_code == 415

    def test_unknown_mime_rejected(self, client, admin_token):
        res = _upload(client, admin_token, name="x.exe",
                      mime="application/x-msdownload", content=b"MZ")
        assert res.status_code == 415

    def test_oversize_rejected(self, client, admin_token):
        big = b"0" * (media_storage.MAX_FILE_BYTES + 1)
        res = _upload(client, admin_token, content=big)
        assert res.status_code == 413

    def test_master_403(self, client, master_token):
        res = _upload(client, master_token)
        assert res.status_code == 403

    def test_moderator_uploads_and_sees_workspace_library(self, client, admin_token, mod_token):
        # Decisão Diretor 2026-07-05: biblioteca é do workspace inteiro.
        assert _upload(client, admin_token).status_code == 200
        listing = client.get("/api/assets", headers=_auth(mod_token)).json()
        assert listing["total"] == 1
        res = _upload(client, mod_token, name="do_mod.png")
        assert res.status_code == 200
        assert client.get("/api/assets", headers=_auth(admin_token)).json()["total"] == 2

    def test_cross_tenant_isolation(self, client, master_token, admin_token):
        a1 = _upload(client, admin_token).json()
        res = client.post(
            "/api/admins",
            json={"username": "admin2", "password": "admin123", "role": "admin"},
            headers=_auth(master_token),
        )
        assert res.status_code == 200, res.text
        listing = client.get("/api/assets", headers=_auth("test-admin2")).json()
        assert listing["total"] == 0
        # deletar asset de outro tenant → 404 (não vaza existência)
        res = client.delete(f"/api/assets/{a1['id']}", headers=_auth("test-admin2"))
        assert res.status_code == 404


# ==========================================
# Refcount (hooks da F0)
# ==========================================

class TestRefcount:
    def test_insert_update_delete_lifecycle(self, client, admin_token):
        _create_media_table(client, admin_token)
        a1 = _upload(client, admin_token, name="a1.png").json()
        a2 = _upload(client, admin_token, name="a2.png").json()

        r1 = client.post("/api/produtos", json={"titulo": "p1", "foto": a1["url"]},
                         headers=_auth(admin_token))
        assert r1.status_code == 200, r1.text
        assert _refcount(client, admin_token, a1["id"]) == 1

        # reuso: 1 asset em 2 células
        r2 = client.post("/api/produtos", json={"titulo": "p2", "foto": a1["url"]},
                         headers=_auth(admin_token))
        assert r2.status_code == 200
        assert _refcount(client, admin_token, a1["id"]) == 2

        # troca de mídia: antigo -1, novo +1
        rec2 = r2.json()["id"]
        res = client.put(f"/api/produtos/{rec2}", json={"foto": a2["url"]},
                         headers=_auth(admin_token))
        assert res.status_code == 200, res.text
        assert _refcount(client, admin_token, a1["id"]) == 1
        assert _refcount(client, admin_token, a2["id"]) == 1

        # PUT parcial sem a chave de mídia = não mudou
        res = client.put(f"/api/produtos/{rec2}", json={"titulo": "renomeado"},
                         headers=_auth(admin_token))
        assert res.status_code == 200
        assert _refcount(client, admin_token, a2["id"]) == 1

        # delete de row decrementa
        rec1 = r1.json()["id"]
        res = client.delete(f"/api/produtos/{rec1}", headers=_auth(admin_token))
        assert res.status_code == 200
        assert _refcount(client, admin_token, a1["id"]) == 0

    def test_external_url_is_noop(self, client, admin_token):
        _create_media_table(client, admin_token, name="legado")
        a1 = _upload(client, admin_token).json()
        res = client.post("/api/legado",
                          json={"titulo": "x", "foto": "https://i.imgur.com/antigo.png"},
                          headers=_auth(admin_token))
        assert res.status_code == 200, res.text
        assert _refcount(client, admin_token, a1["id"]) == 0

    @pytest.mark.skipif(not IS_POSTGRES, reason="drop-column é Postgres-only (decisão F0)")
    def test_drop_column_decrements(self, client, admin_token):
        t = _create_media_table(client, admin_token, name="dropcol")
        a1 = _upload(client, admin_token).json()
        for i in range(2):
            r = client.post("/api/dropcol", json={"titulo": f"p{i}", "foto": a1["url"]},
                            headers=_auth(admin_token))
            assert r.status_code == 200, r.text
        assert _refcount(client, admin_token, a1["id"]) == 2

        col_id = next(c["id"] for c in t["columns"] if c["name"] == "foto")
        res = client.delete(f"/tables/{t['id']}/columns/{col_id}", headers=_auth(admin_token))
        assert res.status_code == 200, res.text
        assert _refcount(client, admin_token, a1["id"]) == 0

    def test_delete_table_decrements(self, client, admin_token):
        t = _create_media_table(client, admin_token, name="droptab")
        a1 = _upload(client, admin_token).json()
        r = client.post("/api/droptab", json={"titulo": "p", "foto": a1["url"]},
                        headers=_auth(admin_token))
        assert r.status_code == 200, r.text
        assert _refcount(client, admin_token, a1["id"]) == 1

        res = client.delete(f"/tables/{t['id']}", params={"confirm_name": "droptab"},
                            headers=_auth(admin_token))
        assert res.status_code == 200, res.text
        assert _refcount(client, admin_token, a1["id"]) == 0


# ==========================================
# Delete explícito + GC + delete_admin
# ==========================================

class TestDeleteAndGC:
    def test_delete_referenced_409_then_free_ok(self, client, admin_token):
        _create_media_table(client, admin_token, name="del409")
        a1 = _upload(client, admin_token).json()
        r = client.post("/api/del409", json={"titulo": "p", "foto": a1["url"]},
                        headers=_auth(admin_token))
        rec = r.json()["id"]

        res = client.delete(f"/api/assets/{a1['id']}", headers=_auth(admin_token))
        assert res.status_code == 409

        client.delete(f"/api/del409/{rec}", headers=_auth(admin_token))
        res = client.delete(f"/api/assets/{a1['id']}", headers=_auth(admin_token))
        assert res.status_code == 200, res.text
        # blob removido do fallback
        dev_path = a1["url"].split("/api/assets/dev/")[1]
        assert media_storage.read_dev(dev_path) is None

    def test_gc_respects_min_age(self, client, admin_token, db_session):
        old = _upload(client, admin_token, name="velho.png").json()
        fresh = _upload(client, admin_token, name="novo.png").json()

        cutoff = datetime.datetime.utcnow() - datetime.timedelta(
            hours=media_storage.GC_MIN_AGE_HOURS + 1
        )
        db_session.query(models.Asset).filter(models.Asset.id == old["id"]).update(
            {"created_at": cutoff}
        )
        db_session.commit()

        res = client.post("/api/assets/gc", headers=_auth(admin_token))
        assert res.status_code == 200, res.text
        assert res.json()["removed"] == 1

        listing = client.get("/api/assets", headers=_auth(admin_token)).json()
        assert [a["id"] for a in listing["data"]] == [fresh["id"]]
        old_path = old["url"].split("/api/assets/dev/")[1]
        assert media_storage.read_dev(old_path) is None

    def test_gc_never_removes_referenced(self, client, admin_token, db_session):
        _create_media_table(client, admin_token, name="gcref")
        a1 = _upload(client, admin_token).json()
        r = client.post("/api/gcref", json={"titulo": "p", "foto": a1["url"]},
                        headers=_auth(admin_token))
        assert r.status_code == 200
        cutoff = datetime.datetime.utcnow() - datetime.timedelta(hours=48)
        db_session.query(models.Asset).filter(models.Asset.id == a1["id"]).update(
            {"created_at": cutoff}
        )
        db_session.commit()
        res = client.post("/api/assets/gc", headers=_auth(admin_token))
        assert res.json()["removed"] == 0

    def test_delete_admin_cleans_assets(self, client, master_token, db_session):
        res = client.post(
            "/api/admins",
            json={"username": "admin2", "password": "admin123", "role": "admin"},
            headers=_auth(master_token),
        )
        assert res.status_code == 200, res.text
        admin2_id = res.json()["id"]

        a1 = _upload(client, "test-admin2").json()
        dev_path = a1["url"].split("/api/assets/dev/")[1]
        assert media_storage.read_dev(dev_path) == PNG

        res = client.delete(f"/api/admins/{admin2_id}", headers=_auth(master_token))
        assert res.status_code == 200, res.text

        remaining = db_session.query(models.Asset).filter(
            models.Asset.owner_id == admin2_id
        ).count()
        assert remaining == 0
        assert media_storage.read_dev(dev_path) is None
