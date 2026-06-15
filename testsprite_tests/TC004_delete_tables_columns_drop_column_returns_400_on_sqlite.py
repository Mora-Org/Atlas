import requests

BASE_URL = "http://localhost:8000"
ADMIN_TOKEN = "test-testadmin"
HEADERS_ADMIN = {
    "Authorization": f"Bearer {ADMIN_TOKEN}",
    "Content-Type": "application/json"
}
TIMEOUT = 30


def test_delete_tables_columns_drop_column_returns_400_on_sqlite():
    # Step 1: Create a table with columns
    table_payload = {
        "name": "tc004_test_table",
        "description": "Table for TC004 testing drop column limitation on SQLite",
        "is_public": False,
        "columns": [
            {"name": "col1", "data_type": "String", "is_nullable": True, "is_unique": False, "is_primary": False},
            {"name": "col2", "data_type": "Integer", "is_nullable": True, "is_unique": False, "is_primary": False}
        ]
    }
    table_id = None
    column_id = None
    table_data = None
    resp_create = requests.post(
        f"{BASE_URL}/tables/",
        json=table_payload,
        headers=HEADERS_ADMIN,
        timeout=TIMEOUT,
    )
    assert resp_create.status_code == 200, f"Expected status 200 on table creation, got {resp_create.status_code}"
    table_data = resp_create.json()
    table_id = table_data.get("id")
    assert table_id is not None, "Table creation response missing 'id'"

    # Step 2: Add an additional column to be dropped (nullable column)
    add_column_payload = {
        "name": "col_drop",
        "data_type": "String",
        "is_nullable": True,
        "is_unique": False,
        "is_primary": False,
    }
    resp_add_col = requests.post(
        f"{BASE_URL}/tables/{table_id}/columns",
        json=add_column_payload,
        headers=HEADERS_ADMIN,
        timeout=TIMEOUT,
    )
    assert resp_add_col.status_code == 200, f"Expected status 200 on adding column, got {resp_add_col.status_code}"
    added_col_data = resp_add_col.json()
    column_id = added_col_data.get("id")
    assert column_id is not None, "Add column response missing 'id'"

    # Step 3: Attempt to drop the column - expect 400 with SQLite limitation message
    resp_delete_col = requests.delete(
        f"{BASE_URL}/tables/{table_id}/columns/{column_id}",
        headers=HEADERS_ADMIN,
        timeout=TIMEOUT,
    )

    assert resp_delete_col.status_code == 400, \
        f"Expected status code 400 on drop column, got {resp_delete_col.status_code}"

    error_response = resp_delete_col.json()
    message = error_response.get("message", "").lower()
    assert "sqlite" in message or "drop-column" in message, "Error message did not mention SQLite limitation or drop-column"

    # Cleanup - delete the created table with confirm_name query param
    if table_id and table_data.get("name"):
        confirm_name = table_data["name"]
        try:
            requests.delete(
                f"{BASE_URL}/tables/{table_id}",
                headers=HEADERS_ADMIN,
                params={"confirm_name": confirm_name},
                timeout=TIMEOUT,
            )
        except Exception:
            pass


test_delete_tables_columns_drop_column_returns_400_on_sqlite()
