import requests

BASE_URL = "http://localhost:8000"
ADMIN_TOKEN = "test-testadmin"
MASTER_TOKEN = "test-puczaras"
TIMEOUT = 30

def test_post_tables_reject_master_role_for_column_addition():
    headers_admin = {
        "Authorization": f"Bearer {ADMIN_TOKEN}",
        "Content-Type": "application/json"
    }
    headers_master = {
        "Authorization": f"Bearer {MASTER_TOKEN}",
        "Content-Type": "application/json"
    }

    table_id = None
    try:
        # Step 1: Create a table as admin to use for the test
        create_table_payload = {
            "name": "test_table_master_reject",
            "description": "Table for master role rejection test",
            "is_public": False,
            "columns": [
                {
                    "name": "col1",
                    "data_type": "String",
                    "is_nullable": True,
                    "is_unique": False,
                    "is_primary": False
                },
                {
                    "name": "col2",
                    "data_type": "Integer",
                    "is_nullable": True,
                    "is_unique": False,
                    "is_primary": False
                }
            ]
        }
        create_resp = requests.post(
            f"{BASE_URL}/tables/",
            headers=headers_admin,
            json=create_table_payload,
            timeout=TIMEOUT
        )
        assert create_resp.status_code == 200, f"Unexpected status code creating table: {create_resp.status_code}"
        create_data = create_resp.json()
        assert "id" in create_data, "Created table response missing 'id'"
        table_id = create_data["id"]

        # Step 2: Attempt to add a nullable column as master role - expected 403 Forbidden
        add_column_payload = {
            "name": "new_col_master_test",
            "data_type": "String",
            "is_nullable": True,
            "is_unique": False,
            "is_primary": False
        }
        add_col_resp = requests.post(
            f"{BASE_URL}/tables/{table_id}/columns",
            headers=headers_master,
            json=add_column_payload,
            timeout=TIMEOUT
        )
        # Assert 403 Forbidden because master is blocked from schema mutation
        assert add_col_resp.status_code == 403, (
            f"Expected 403 Forbidden for master role column addition, got {add_col_resp.status_code}"
        )

    finally:
        # Cleanup: delete the created table as admin if exists
        if table_id is not None:
            # Need to confirm_name query param for deletion matches table name
            try:
                del_resp = requests.delete(
                    f"{BASE_URL}/tables/{table_id}",
                    headers=headers_admin,
                    params={"confirm_name": create_table_payload["name"]},
                    timeout=TIMEOUT
                )
                # Accept 200 for successful deletion, 404 if already deleted, or 403 not expected here
                assert del_resp.status_code in {200, 404}, f"Unexpected status code deleting table: {del_resp.status_code}"
            except Exception:
                # Ignore exceptions during cleanup
                pass

test_post_tables_reject_master_role_for_column_addition()