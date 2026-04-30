"""Tests for table creation, visibility, and public access"""


def _create_group_and_permit_mod(client, admin_token, mod_token):
    """Helper: create a group and give mod access"""
    group = client.post("/api/database-groups", json={"name": "TestGroup"},
                        headers={"Authorization": f"Bearer {admin_token}"})
    group_id = group.json()["id"]

    mods = client.get("/api/moderators", headers={"Authorization": f"Bearer {admin_token}"})
    mod_id = mods.json()[0]["id"]
    client.post(f"/api/database-groups/{group_id}/permissions",
                json={"moderator_id": mod_id},
                headers={"Authorization": f"Bearer {admin_token}"})
    return group_id


def test_admin_create_table(client, admin_token):
    """Admin can create a table"""
    res = client.post("/tables/", json={
        "name": "products",
        "description": "Test table",
        "columns": [
            {"name": "title", "data_type": "String", "is_nullable": False, "is_unique": False, "is_primary": False},
            {"name": "price", "data_type": "Float", "is_nullable": True, "is_unique": False, "is_primary": False}
        ]
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    assert res.json()["name"] == "products"


def test_master_cannot_create_table(client, master_token):
    """Master is blocked from direct table ownership (should use admin)"""
    res = client.post("/tables/", json={
        "name": "master_table",
        "columns": [{"name": "id", "data_type": "Integer", "is_primary": True}]
    }, headers={"Authorization": f"Bearer {master_token}"})
    assert res.status_code == 403


def test_mod_create_table_in_permitted_group(client, admin_token, mod_token):
    """Moderator can create table in a permitted group"""
    group_id = _create_group_and_permit_mod(client, admin_token, mod_token)

    res = client.post("/tables/", json={
        "name": "items",
        "description": "Mod table",
        "group_id": group_id,
        "columns": [{"name": "name", "data_type": "String", "is_nullable": False, "is_unique": False, "is_primary": False}]
    }, headers={"Authorization": f"Bearer {mod_token}"})
    assert res.status_code == 200


def test_mod_blocked_from_unpermitted_group(client, admin_token, mod_token):
    """Moderator cannot create table in unpermitted group"""
    # Create group but DON'T give mod permission
    group = client.post("/api/database-groups", json={"name": "Restricted"},
                        headers={"Authorization": f"Bearer {admin_token}"})
    group_id = group.json()["id"]

    res = client.post("/tables/", json={
        "name": "blocked",
        "group_id": group_id,
        "columns": [{"name": "x", "data_type": "String", "is_nullable": True, "is_unique": False, "is_primary": False}]
    }, headers={"Authorization": f"Bearer {mod_token}"})
    assert res.status_code == 403


def test_toggle_visibility(client, admin_token):
    """Admin can toggle table visibility"""
    table = client.post("/tables/", json={
        "name": "vis_test",
        "columns": [{"name": "x", "data_type": "String", "is_nullable": True, "is_unique": False, "is_primary": False}]
    }, headers={"Authorization": f"Bearer {admin_token}"})
    table_id = table.json()["id"]

    # Toggle to public
    res = client.patch(f"/tables/{table_id}/visibility",
                       headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    assert res.json()["is_public"] == True

    # Toggle back to private
    res2 = client.patch(f"/tables/{table_id}/visibility",
                        headers={"Authorization": f"Bearer {admin_token}"})
    assert res2.json()["is_public"] == False


def test_public_table_access(client, admin_token):
    """Public table data is accessible without auth"""
    # Create table and make public
    table = client.post("/tables/", json={
        "name": "public_data",
        "columns": [{"name": "title", "data_type": "String", "is_nullable": True, "is_unique": False, "is_primary": False}]
    }, headers={"Authorization": f"Bearer {admin_token}"})
    table_id = table.json()["id"]
    client.patch(f"/tables/{table_id}/visibility",
                 headers={"Authorization": f"Bearer {admin_token}"})

    # Access without auth
    res = client.get("/public/tables/")
    assert res.status_code == 200
    assert any(t["name"] == "public_data" for t in res.json())

    # Get data without auth
    data = client.get("/public/api/public_data")
    assert data.status_code == 200
    assert "data" in data.json()


def test_tables_list_includes_meta(client, admin_token):
    """GET /tables/ returns meta with row_count, column_count, relation_count (T0.7)"""
    client.post("/tables/", json={
        "name": "meta_test",
        "columns": [
            {"name": "title", "data_type": "String", "is_nullable": False, "is_unique": False, "is_primary": False},
            {"name": "body", "data_type": "String", "is_nullable": True, "is_unique": False, "is_primary": False},
        ]
    }, headers={"Authorization": f"Bearer {admin_token}"})

    res = client.get("/tables/", headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    tables = res.json()
    table = next((t for t in tables if t["name"] == "meta_test"), None)
    assert table is not None
    assert "meta" in table
    meta = table["meta"]
    assert "row_count" in meta
    assert "column_count" in meta
    assert "relation_count" in meta
    assert meta["column_count"] == 2
    assert meta["row_count"] == 0
    assert meta["relation_count"] == 0


def test_public_filter(client, admin_token):
    """Public API supports filtering"""
    # Create table, make public, insert data
    client.post("/tables/", json={
        "name": "filter_test",
        "columns": [
            {"name": "name", "data_type": "String", "is_nullable": False, "is_unique": False, "is_primary": False},
            {"name": "age", "data_type": "Integer", "is_nullable": True, "is_unique": False, "is_primary": False}
        ]
    }, headers={"Authorization": f"Bearer {admin_token}"})

    # Make public
    tables = client.get("/tables/", headers={"Authorization": f"Bearer {admin_token}"})
    # Safe access to table list
    table_list = tables.json()
    filter_test_table = next((t for t in table_list if t["name"] == "filter_test"), None)
    assert filter_test_table is not None, "Table filter_test should exist"
    table_id = filter_test_table["id"]
    client.patch(f"/tables/{table_id}/visibility", headers={"Authorization": f"Bearer {admin_token}"})

    # Insert data
    client.post("/api/filter_test", json={"name": "Alice", "age": 30},
                headers={"Authorization": f"Bearer {admin_token}"})
    client.post("/api/filter_test", json={"name": "Bob", "age": 25},
                headers={"Authorization": f"Bearer {admin_token}"})

    # Filter
    res = client.get("/public/api/filter_test?filter_col=name&filter_val=Alice&filter_op=eq")
    assert res.status_code == 200
    data = res.json()["data"]
    assert len(data) == 1
    assert data[0]["name"] == "Alice"
