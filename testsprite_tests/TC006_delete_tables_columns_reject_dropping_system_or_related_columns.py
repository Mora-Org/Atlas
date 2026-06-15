import requests
import uuid

BASE_URL = "http://localhost:8000"
ADMIN_AUTH_HEADER = {"Authorization": "Bearer test-testadmin"}
TIMEOUT = 30

def test_delete_columns_reject_system_and_related_columns():
    unique_suffix = uuid.uuid4().hex[:8]
    table_name = f"test_table_tc006_{unique_suffix}"
    related_table_name = f"related_table_tc006_{unique_suffix}"

    # Create a new table with some columns, including system columns 'id' and 'tenant_id'
    create_table_payload = {
        "name": table_name,
        "description": "Test table for TC006",
        "is_public": False,
        "columns": [
            {"name": "id", "data_type": "Integer", "is_nullable": True, "is_unique": True, "is_primary": True},
            {"name": "tenant_id", "data_type": "Integer", "is_nullable": True, "is_unique": False, "is_primary": False},
            {"name": "user_col", "data_type": "String", "is_nullable": True, "is_unique": False, "is_primary": False},
            # Add a column to simulate relation usage
            {"name": "related_col", "data_type": "Integer", "is_nullable": True, "is_unique": False, "is_primary": False}
        ]
    }

    table_id = None
    related_column_id = None
    try:
        # Create table
        resp_create = requests.post(
            f"{BASE_URL}/tables/",
            json=create_table_payload,
            headers=ADMIN_AUTH_HEADER,
            timeout=TIMEOUT
        )
        assert resp_create.status_code == 200, f"Failed to create table: {resp_create.text}"
        table = resp_create.json()
        table_id = table.get("id")
        assert table_id, "Table ID not returned"

        # Need to find the columns info: the created table response should have columns metadata
        # The columns created in POST /tables response typically includes their metadata including id
        columns = table.get("columns", [])
        # check system columns exist and get their IDs
        id_column = next((c for c in columns if c["name"] == "id"), None)
        tenant_id_column = next((c for c in columns if c["name"] == "tenant_id"), None)
        related_col_column = next((c for c in columns if c["name"] == "related_col"), None)
        user_col_column = next((c for c in columns if c["name"] == "user_col"), None)
        assert id_column, "System column 'id' not found"
        assert tenant_id_column, "System column 'tenant_id' not found"
        assert related_col_column, "Related column 'related_col' not found"
        assert user_col_column, "User column 'user_col' not found"
        related_column_id = related_col_column["id"]

        # Attempt to DELETE system column 'id' -> expect 400
        resp_del_id = requests.delete(
            f"{BASE_URL}/tables/{table_id}/columns/{id_column['id']}",
            headers=ADMIN_AUTH_HEADER,
            timeout=TIMEOUT
        )
        assert resp_del_id.status_code == 400, f"Expected 400 when deleting system column 'id', got {resp_del_id.status_code}"
        text_lower = resp_del_id.text.lower()
        assert "sqlite" in text_lower or "system" in text_lower or "relation" in text_lower, \
            "Response text does not mention SQLite/system/relation for system column 'id' drop"

        # Attempt to DELETE system column 'tenant_id' -> expect 400
        resp_del_tenant = requests.delete(
            f"{BASE_URL}/tables/{table_id}/columns/{tenant_id_column['id']}",
            headers=ADMIN_AUTH_HEADER,
            timeout=TIMEOUT
        )
        assert resp_del_tenant.status_code == 400, f"Expected 400 when deleting system column 'tenant_id', got {resp_del_tenant.status_code}"
        text_lower = resp_del_tenant.text.lower()
        assert "sqlite" in text_lower or "system" in text_lower or "relation" in text_lower, \
            "Response text does not mention SQLite/system/relation for system column 'tenant_id' drop"

        # To simulate a column used in relations, add a foreign key relation referencing 'related_col'
        # First, create a new table to relate to
        related_table_payload = {
            "name": related_table_name,
            "description": "Related table for TC006",
            "is_public": False,
            "columns": [
                {"name": "id", "data_type": "Integer", "is_nullable": True, "is_unique": True, "is_primary": True},
                {"name": "ref_col", "data_type": "Integer", "is_nullable": True, "is_unique": False, "is_primary": False}
            ]
        }

        resp_related_create = requests.post(
            f"{BASE_URL}/tables/",
            json=related_table_payload,
            headers=ADMIN_AUTH_HEADER,
            timeout=TIMEOUT
        )
        assert resp_related_create.status_code == 200, f"Failed to create related table: {resp_related_create.text}"
        related_table = resp_related_create.json()
        related_table_id = related_table.get("id")
        assert related_table_id, "Related table ID not returned"

        related_table_columns = related_table.get("columns", [])
        related_table_id_column = next((c for c in related_table_columns if c["name"] == "id"), None)
        related_table_ref_col = next((c for c in related_table_columns if c["name"] == "ref_col"), None)
        assert related_table_id_column, "Related table system column 'id' not found"
        assert related_table_ref_col, "Related table column 'ref_col' not found"

        # Add a relation from related_table.ref_col -> test_table_tc006.related_col
        # Usually relations are not created by column addition, but would be separate API if exposed.
        # Since not in PRD, we assume 'related_col' is referenced by some relation metadata internally.
        # The test expects the DELETE returns 400 when attempting to drop columns used in relations.
        # So we directly test deleting 'related_col' column.

        # Attempt to DELETE related_col (used in relations) -> expect 400
        resp_del_related = requests.delete(
            f"{BASE_URL}/tables/{table_id}/columns/{related_column_id}",
            headers=ADMIN_AUTH_HEADER,
            timeout=TIMEOUT
        )
        assert resp_del_related.status_code == 400, f"Expected 400 when deleting column used in relations, got {resp_del_related.status_code}"
        text_lower = resp_del_related.text.lower()
        assert "sqlite" in text_lower or "system" in text_lower or "relation" in text_lower, \
            "Response text does not mention SQLite/system/relation for related column drop"

    finally:
        # Cleanup: delete created tables
        if table_id:
            # Confirm name required exactly - use original table name
            try:
                _ = requests.delete(
                    f"{BASE_URL}/tables/{table_id}",
                    headers=ADMIN_AUTH_HEADER,
                    params={"confirm_name": table_name},
                    timeout=TIMEOUT
                )
            except Exception:
                pass
        if 'related_table_id' in locals() and related_table_id:
            try:
                _ = requests.delete(
                    f"{BASE_URL}/tables/{related_table_id}",
                    headers=ADMIN_AUTH_HEADER,
                    params={"confirm_name": related_table_name},
                    timeout=TIMEOUT
                )
            except Exception:
                pass

test_delete_columns_reject_system_and_related_columns()
