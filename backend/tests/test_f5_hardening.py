"""M8 F5 — hardening: content-sniffing (filetype), quota por workspace e
reconcile das cópias de snapshot órfãs. Fecha o M8 → 0.7.0.

- Sniffing: matriz unit de `sniff_ok` (trava a cobertura do filetype sobre a
  whitelist) + HTTP num subset representativo (200/415).
- Quota: monkeypatch de WORKSPACE_QUOTA_BYTES (ninguém sobe 250MB em teste).
- Reconcile: unit no fallback dev + E2E HTTP via /api/assets/gc.
"""
from __future__ import annotations

import io
import os
import time
import zipfile

import pytest

import media_storage


@pytest.fixture(autouse=True)
def _reset_media():
    media_storage._reset_local_store_for_tests()
    yield
    media_storage._reset_local_store_for_tests()


def _hdr(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# fixtures binários mínimos (magic bytes reais que o filetype reconhece)
PNG = bytes.fromhex("89504e470d0a1a0a0000000d494844520000000100000001080600000001f15c48") + b"\x00" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
GIF = b"GIF89a" + b"\x00" * 64
WEBP = b"RIFF" + b"\x24\x00\x00\x00" + b"WEBP" + b"VP8 " + b"\x00" * 64
PDF = b"%PDF-1.4\n" + b"\x00" * 64
MP3 = b"ID3\x03\x00\x00\x00\x00\x00\x00" + b"\x00" * 64
MP4 = b"\x00\x00\x00\x18ftypisom\x00\x00\x02\x00isomiso2avc1mp41" + b"\x00" * 32
EXE = b"MZ\x90\x00" + b"\x00" * 600


def _zip_bytes() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("x.txt", "y")
    return buf.getvalue()


# ───────────────────────── sniff_ok (unit, trava o filetype) ─────────────────────────

@pytest.mark.parametrize("content,mime,ok", [
    (PNG, "image/png", True),
    (JPEG, "image/jpeg", True),
    (GIF, "image/gif", True),
    (WEBP, "image/webp", True),
    (PDF, "application/pdf", True),
    (MP3, "audio/mpeg", True),
    (MP4, "video/mp4", True),
    (EXE, "image/png", False),           # .exe renomeado → 415
    (GIF, "image/png", False),           # mismatch cross-format
    (b"ola mundo", "text/plain", True),  # sniffless tolerado no declarado
    (b"a,b\n1,2\n", "text/csv", True),
    (b'{"a":1}', "application/json", True),
    (b"ola mundo", "image/png", False),  # sem magic e não-sniffless → rejeita
])
def test_sniff_ok_matrix(content, mime, ok):
    assert media_storage.sniff_ok(content, mime) is ok


def test_sniff_zip_family_mutual():
    z = _zip_bytes()
    assert media_storage.sniff_ok(z, "application/zip")
    # container OOXML rotulado como zip genérico (e vice-versa) não dá falso 415
    assert media_storage.sniff_ok(
        z, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )


def test_sniff_real_xlsx_detected():
    import pandas as pd
    buf = io.BytesIO()
    pd.DataFrame({"a": [1]}).to_excel(buf, index=False)
    content = buf.getvalue()
    assert media_storage.sniff_ok(
        content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )


# ───────────────────────────── sniffing via HTTP ─────────────────────────────

def test_upload_valid_png_200(client, admin_token):
    r = client.post("/api/assets/upload", files={"file": ("a.png", PNG, "image/png")}, headers=_hdr(admin_token))
    assert r.status_code == 200, r.text


def test_upload_renamed_exe_415(client, admin_token):
    r = client.post("/api/assets/upload", files={"file": ("foto.png", EXE, "image/png")}, headers=_hdr(admin_token))
    assert r.status_code == 415
    assert "não corresponde" in r.json()["detail"]


def test_upload_cross_format_mismatch_415(client, admin_token):
    r = client.post("/api/assets/upload", files={"file": ("x.png", GIF, "image/png")}, headers=_hdr(admin_token))
    assert r.status_code == 415


def test_upload_text_csv_200(client, admin_token):
    r = client.post("/api/assets/upload", files={"file": ("d.csv", b"a,b\n1,2\n", "text/csv")}, headers=_hdr(admin_token))
    assert r.status_code == 200, r.text


# ─────────────────────────────── quota (413) ───────────────────────────────

def test_quota_blocks_at_limit(client, admin_token, monkeypatch):
    monkeypatch.setattr(media_storage, "WORKSPACE_QUOTA_BYTES", 10 * 1024)  # 10KB p/ teste
    big = PNG + b"\x00" * (6 * 1024)  # ~6KB

    r1 = client.post("/api/assets/upload", files={"file": ("a.png", big, "image/png")}, headers=_hdr(admin_token))
    assert r1.status_code == 200, r1.text  # workspace vazio (coalesce 0) aceita o 1º

    r2 = client.post("/api/assets/upload", files={"file": ("b.png", big, "image/png")}, headers=_hdr(admin_token))
    assert r2.status_code == 413
    assert "Cota do workspace" in r2.json()["detail"]

    # o upload rejeitado não avançou o SUM (biblioteca segue com 1 asset)
    lst = client.get("/api/assets", headers=_hdr(admin_token)).json()
    assert lst["total"] == 1


# ─────────────────────── reconcile das cópias órfãs ───────────────────────

def _mk_pub_copy(owner_id: int, name: str, age_hours: float = 0.0) -> str:
    path = f"{owner_id}/pub/{name}"
    fp = media_storage._dev_file(path)
    os.makedirs(os.path.dirname(fp), exist_ok=True)
    with open(fp, "wb") as fh:
        fh.write(b"COPY-" + name.encode())
    if age_hours:
        old = time.time() - age_hours * 3600
        os.utime(fp, (old, old))
    return path


def test_reconcile_removes_orphan_keeps_live():
    owner = 777001
    # age_hours>0: com min_age_hours=0 o cutoff é "agora" e o mtime de um
    # arquivo recém-criado pode cair 1µs DEPOIS (granularidade de clock)
    _mk_pub_copy(owner, "v1__a.png", age_hours=0.01)
    _mk_pub_copy(owner, "v9__b.png", age_hours=0.01)
    removed = media_storage.reconcile_pub_media(owner, {1}, min_age_hours=0)
    assert removed == 1
    assert media_storage.read_dev(f"{owner}/pub/v9__b.png") is None   # órfão removido
    assert media_storage.read_dev(f"{owner}/pub/v1__a.png") is not None  # vivo mantido


def test_reconcile_age_guard_protects_inflight_publish():
    owner = 777002
    _mk_pub_copy(owner, "v5__c.png")  # órfão FRESCO
    removed = media_storage.reconcile_pub_media(owner, set())  # default 24h
    assert removed == 0
    assert media_storage.read_dev(f"{owner}/pub/v5__c.png") is not None


def test_reconcile_ignores_nonconforming_names():
    owner = 777003
    _mk_pub_copy(owner, "junk.png", age_hours=48)
    removed = media_storage.reconcile_pub_media(owner, set(), min_age_hours=0)
    assert removed == 0
    assert media_storage.read_dev(f"{owner}/pub/junk.png") is not None


def test_reconcile_never_raises_on_missing_dir():
    assert media_storage.reconcile_pub_media(999999, set(), min_age_hours=0) == 0


# ─────────────────────────── GC E2E via HTTP ───────────────────────────

def _create_media_table(client, admin_token, name):
    r = client.post(
        "/tables/",
        json={"name": name, "columns": [
            {"name": "titulo", "data_type": "String", "is_nullable": False},
            {"name": "foto", "data_type": "image", "is_nullable": True},
        ], "is_public": False},
        headers=_hdr(admin_token),
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def test_gc_endpoint_reconciles_pub_copies(client, admin_token):
    import publication_storage
    publication_storage._reset_local_store_for_tests()

    # publica v1 de verdade (cria a cópia via _freeze_snapshot_media)
    tbl = _create_media_table(client, admin_token, "gcacervo")
    up = client.post("/api/assets/upload", files={"file": ("f.png", PNG, "image/png")}, headers=_hdr(admin_token))
    assert up.status_code == 200, up.text
    url = up.json()["url"]
    r = client.post("/api/gcacervo", json={"titulo": "X", "foto": url}, headers=_hdr(admin_token))
    assert r.status_code == 200, r.text
    v = client.post(
        "/api/publications/me/versions",
        json={"description": None, "theme_config": {}, "table_selection": [{"table_id": tbl, "order": 0, "layout": "list"}]},
        headers=_hdr(admin_token),
    ).json()
    owner = v["owner_id"]

    # forja um órfão v99 (versão que não existe) já velho
    _mk_pub_copy(owner, "v99__dead.png", age_hours=48)
    # e envelhece a cópia REAL da v1 também — ela é viva, tem que sobreviver
    pub_dir = media_storage._dev_file(f"{owner}/pub")
    v1_copies = [f for f in os.listdir(pub_dir) if f.startswith("v1__")]
    assert v1_copies, "publish não criou a cópia v1"
    for f in v1_copies:
        fp = os.path.join(pub_dir, f)
        old = time.time() - 48 * 3600
        os.utime(fp, (old, old))

    res = client.post("/api/assets/gc", headers=_hdr(admin_token))
    assert res.status_code == 200, res.text
    body = res.json()
    assert "removed" in body                      # campo antigo (backward-compat)
    assert body["removed_pub_copies"] >= 1        # o órfão v99 saiu
    assert media_storage.read_dev(f"{owner}/pub/v99__dead.png") is None
    for f in v1_copies:                            # a cópia viva ficou
        assert media_storage.read_dev(f"{owner}/pub/{f}") is not None

    publication_storage._reset_local_store_for_tests()


def test_gc_master_403(client, master_token):
    r = client.post("/api/assets/gc", headers=_hdr(master_token))
    assert r.status_code == 403
