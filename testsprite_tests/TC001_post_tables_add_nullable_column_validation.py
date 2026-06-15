import requests

BASE_URL = "http://localhost:8000"
ADMIN_AUTH_HEADER = {"Authorization": "Bearer test-testadmin"}
TIMEOUT = 30

def test_post_tables_add_nullable_column_validation():
    table_id = None
    created_column_id = None
    created_table_name = None
    try:
        # Step 1: Create a new table as admin
        create_table_payload = {
            "name": "test_table_nullable_col",
            "description": "Test table for nullable column addition",
            "is_public": False,
            "columns": [
                {
                    "name": "sample_column_1",
                    "data_type": "String",
                    "is_nullable": True,
                    "is_unique": False,
                    "is_primary": False
                },
                {
                    "name": "sample_column_2",
                    "data_type": "Integer",
                    "is_nullable": True,
                    "is_unique": False,
                    "is_primary": False
                }
            ]
        }
        create_table_resp = requests.post(
            f"{BASE_URL}/tables/",
            json=create_table_payload,
            headers=ADMIN_AUTH_HEADER,
            timeout=TIMEOUT
        )
        assert create_table_resp.status_code == 200, f"Failed to create table: {create_table_resp.text}"
        table_data = create_table_resp.json()
        table_id = table_data.get("id")
        created_table_name = table_data.get("name")
        assert table_id is not None, "Created table ID is missing"
        assert created_table_name == create_table_payload["name"], "Created table name mismatch"

        # Step 2: Add a nullable column to the created table
        add_column_payload = {
            "name": "nullable_new_column",
            "data_type": "String",
            "is_nullable": True,
            "is_unique": False,
            "is_primary": False
        }
        add_column_resp = requests.post(
            f"{BASE_URL}/tables/{table_id}/columns",
            json=add_column_payload,
            headers=ADMIN_AUTH_HEADER,
            timeout=TIMEOUT
        )
        assert add_column_resp.status_code == 200, f"Failed to add nullable column: {add_column_resp.text}"
        column_data = add_column_resp.json()
        created_column_id = column_data.get("id")
        assert created_column_id is not None, "Created column ID is missing"
        assert column_data.get("name") == add_column_payload["name"], "Column name mismatch"
        assert column_data.get("data_type") == add_column_payload["data_type"], "Column data_type mismatch"
        assert column_data.get("is_nullable") is True, "Column is_nullable should be True"
        assert column_data.get("is_unique") == add_column_payload["is_unique"], "Column is_unique mismatch"
        assert column_data.get("is_primary") == add_column_payload["is_primary"], "Column is_primary mismatch"
    finally:
        if table_id and created_table_name:
            # Clean up by deleting the created table
            # Requires confirm_name query param equal to table name
            delete_resp = requests.delete(
                f"{BASE_URL}/tables/{table_id}",
                headers=ADMIN_AUTH_HEADER,
                params={"confirm_name": created_table_name},
                timeout=TIMEOUT
            )
            # Deletion should succeed with 200 or could be 404 if already deleted
            assert delete_resp.status_code in (200, 404)

test_post_tables_add_nullable_column_validation()