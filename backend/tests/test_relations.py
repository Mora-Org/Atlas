"""Tests for FEAT-01: Foreign Key / Relations API."""


def _create_parent_child(client, token):
    """Create a parent table + a child table with FK pointing to parent."""
    parent = client.post("/tables/", json={
        "name": "categories",
        "columns": [
            {"name": "id",   "data_type": "Integer", "is_nullable": False, "is_unique": False, "is_primary": True},
            {"name": "name", "data_type": "String",  "is_nullable": False, "is_unique": False, "is_primary": False},
        ],
    }, headers={"Authorization": f"Bearer {token}"})
    assert parent.status_code == 200

    child = client.post("/tables/", json={
        "name": "items",
        "columns": [
            {"name": "id",    "data_type": "Integer", "is_nullable": False, "is_unique": False, "is_primary": True},
            {"name": "title", "data_type": "String",  "is_nullable": False, "is_unique": False, "is_primary": False},
            {"name": "category_id", "data_type": "Integer", "is_nullable": False,
             "is_unique": False, "is_primary": False,
             "fk_table": "categories", "fk_column": "id"},
        ],
    }, headers={"Authorization": f"Bearer {token}"})
    assert child.status_code == 200
    return parent.json(), child.json()


def test_foreign_key_population(client, admin_token):
    """Creating a child table with fk_table/fk_column registers a DynamicRelation
    and /api/relations/table/{name} returns the expected lookup payload."""
    _create_parent_child(client, admin_token)

    res = client.get("/api/relations/table/items",
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    rels = res.json()
    assert len(rels) == 1
    rel = rels[0]
    assert rel["from_table"] == "items"
    assert rel["from_column_name"] == "category_id"
    assert rel["to_table"] == "categories"
    assert rel["to_column_name"] == "id"


def test_relations_delete(client, admin_token):
    """DELETE /api/relations/{id} removes the logical relation record."""
    _create_parent_child(client, admin_token)
    rels = client.get("/api/relations/table/items",
                      headers={"Authorization": f"Bearer {admin_token}"}).json()
    rel_id = rels[0]["id"]

    res = client.delete(f"/api/relations/{rel_id}",
                        headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200

    after = client.get("/api/relations/table/items",
                       headers={"Authorization": f"Bearer {admin_token}"}).json()
    assert all(r["id"] != rel_id for r in after)
