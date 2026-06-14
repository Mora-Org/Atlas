"""Tests for FEAT-03: PUT/DELETE on /api/{table_name}/{record_id} + tenant isolation."""


def _create_table_with_row(client, token, table_name="notes", payload=None):
    """Helper: create a simple 2-column table and insert one row, returning its id."""
    client.post("/tables/", json={
        "name": table_name,
        "columns": [
            {"name": "title", "data_type": "String", "is_nullable": False, "is_unique": False, "is_primary": False},
            {"name": "body",  "data_type": "String", "is_nullable": True,  "is_unique": False, "is_primary": False},
        ],
    }, headers={"Authorization": f"Bearer {token}"})

    data = payload or {"title": "hello", "body": "world"}
    res = client.post(f"/api/{table_name}", json=data,
                      headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    return res.json()["id"]


def test_dynamic_record_update(client, admin_token):
    """Admin can PUT /api/{table}/{id} to update own record."""
    rid = _create_table_with_row(client, admin_token)

    res = client.put(f"/api/notes/{rid}",
                     json={"title": "updated", "body": "world"},
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200

    got = client.get("/api/notes", headers={"Authorization": f"Bearer {admin_token}"})
    row = next((r for r in got.json()["data"] if r["id"] == rid), None)
    assert row is not None
    assert row["title"] == "updated"


def test_dynamic_record_delete(client, admin_token):
    """Admin can DELETE /api/{table}/{id}."""
    rid = _create_table_with_row(client, admin_token, table_name="todelete")

    res = client.delete(f"/api/todelete/{rid}",
                        headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200

    got = client.get("/api/todelete", headers={"Authorization": f"Bearer {admin_token}"})
    assert all(r["id"] != rid for r in got.json()["data"])


def test_dynamic_record_update_cross_tenant_isolation(client, master_token, admin_token):
    """A second admin cannot PUT a record that belongs to another tenant."""
    rid = _create_table_with_row(client, admin_token, table_name="isolated_notes")

    # Create a second admin B via master
    r = client.post("/api/admins",
                    json={"username": "admin_b", "password": "pb12345", "role": "admin"},
                    headers={"Authorization": f"Bearer {master_token}"})
    assert r.status_code == 200
    login_b = client.post("/api/auth/login", data={"username": "admin_b", "password": "pb12345"})
    token_b = login_b.json()["access_token"]

    res = client.put(f"/api/isolated_notes/{rid}",
                     json={"title": "hacked"},
                     headers={"Authorization": f"Bearer {token_b}"})
    # Admin B's accessible list doesn't include admin A's "isolated_notes" → 404
    assert res.status_code == 404


def test_dynamic_record_delete_cross_tenant_isolation(client, master_token, admin_token):
    """A second admin cannot DELETE a record that belongs to another tenant."""
    rid = _create_table_with_row(client, admin_token, table_name="isolated_del")

    client.post("/api/admins",
                json={"username": "admin_c", "password": "pc12345", "role": "admin"},
                headers={"Authorization": f"Bearer {master_token}"})
    login_c = client.post("/api/auth/login", data={"username": "admin_c", "password": "pc12345"})
    token_c = login_c.json()["access_token"]

    res = client.delete(f"/api/isolated_del/{rid}",
                        headers={"Authorization": f"Bearer {token_c}"})
    assert res.status_code == 404

    # Confirm record still exists for admin A
    got = client.get("/api/isolated_del", headers={"Authorization": f"Bearer {admin_token}"})
    assert any(r["id"] == rid for r in got.json()["data"])


# ──────────────────────────────────────────────────────────────────────────
# M-Ops F3 — paginação da rota autenticada (porta o template da pública)
# ──────────────────────────────────────────────────────────────────────────

def _seed_rows(client, token, table_name, n):
    client.post("/tables/", json={
        "name": table_name,
        "columns": [
            {"name": "label", "data_type": "String", "is_nullable": False, "is_unique": False, "is_primary": False},
        ],
    }, headers={"Authorization": f"Bearer {token}"})
    for i in range(n):
        client.post(f"/api/{table_name}", json={"label": f"item{i:03d}"},
                    headers={"Authorization": f"Bearer {token}"})


def test_records_pagination_shape_and_limit(client, admin_token):
    _seed_rows(client, admin_token, "paged", 7)
    body = client.get("/api/paged?limit=3&offset=0",
                      headers={"Authorization": f"Bearer {admin_token}"}).json()
    assert set(body.keys()) >= {"data", "total", "limit", "offset"}
    assert body["total"] == 7
    assert len(body["data"]) == 3


def test_records_pagination_offset_disjoint(client, admin_token):
    _seed_rows(client, admin_token, "paged2", 5)
    p1 = client.get("/api/paged2?limit=2&offset=0", headers={"Authorization": f"Bearer {admin_token}"}).json()
    p2 = client.get("/api/paged2?limit=2&offset=2", headers={"Authorization": f"Bearer {admin_token}"}).json()
    assert {r["id"] for r in p1["data"]}.isdisjoint({r["id"] for r in p2["data"]})
    assert len(p1["data"]) == 2 and len(p2["data"]) == 2


def test_records_search_server_side(client, admin_token):
    _seed_rows(client, admin_token, "searchable", 4)
    client.post("/api/searchable", json={"label": "needle_xyz"},
                headers={"Authorization": f"Bearer {admin_token}"})
    res = client.get("/api/searchable?search=needle",
                     headers={"Authorization": f"Bearer {admin_token}"}).json()
    assert res["total"] == 1
    assert res["data"][0]["label"] == "needle_xyz"


def test_records_limit_capped_at_500(client, admin_token):
    _seed_rows(client, admin_token, "capped", 2)
    res = client.get("/api/capped?limit=99999",
                     headers={"Authorization": f"Bearer {admin_token}"}).json()
    assert res["total"] == 2
    assert len(res["data"]) == 2
