import requests

BASE_URL = "http://localhost:8000"
ADMIN_TOKEN = "test-testadmin"
HEADERS_ADMIN = {
    "Authorization": f"Bearer {ADMIN_TOKEN}",
    "Content-Type": "application/json"
}
TIMEOUT = 30


def test_post_tables_reject_nonnullable_column_addition():
    # Step 1: Create a new table to test column addition
    table_payload = {
        "name": "test_table_tc002",
        "description": "Table for TC002 test",
        "is_public": False,
        "columns": [
            {"name": "col1", "data_type": "String", "is_nullable": True, "is_unique": False, "is_primary": True},
            {"name": "col2", "data_type": "Integer", "is_nullable": True, "is_unique": False, "is_primary": False}
        ]
    }

    table_id = None
    try:
        resp_create = requests.post(f"{BASE_URL}/tables/", json=table_payload, headers=HEADERS_ADMIN, timeout=TIMEOUT)
        assert resp_create.status_code == 200, f"Failed to create table, status: {resp_create.status_code}, body: {resp_create.text}"
        table = resp_create.json()
        table_id = table.get("id")
        assert table_id is not None, "Created table does not have an id"

        # Step 2: Attempt to add a non-nullable column (is_nullable=false) - expect 400
        add_column_payload = {
            "name": "non_nullable_col",
            "data_type": "String",
            "is_nullable": False,
            "is_unique": False,
            "is_primary": False
        }
        resp_add_col = requests.post(
            f"{BASE_URL}/tables/{table_id}/columns",
            json=add_column_payload,
            headers=HEADERS_ADMIN,
            timeout=TIMEOUT,
        )
        assert resp_add_col.status_code == 400, (
            f"Expected 400 when adding non-nullable column, got {resp_add_col.status_code} with body: {resp_add_col.text}"
        )
    finally:
        # Cleanup: delete the table if created
        if table_id:
            # Need to pass confirm_name query parameter equal to table name for deletion
            params = {"confirm_name": table_payload["name"]}
            try:
                resp_delete = requests.delete(f"{BASE_URL}/tables/{table_id}", headers=HEADERS_ADMIN, params=params, timeout=TIMEOUT)
                # Accept 200 for successful deletion or 404 if already deleted/stale
                assert resp_delete.status_code in (200, 404), f"Unexpected status {resp_delete.status_code} on cleanup delete: {resp_delete.text}"
            except Exception:
                # Ignore cleanup exceptions
                pass


test_post_tables_reject_nonnullable_column_addition()