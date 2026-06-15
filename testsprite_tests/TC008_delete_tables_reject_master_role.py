import requests

BASE_URL = "http://localhost:8000"
ADMIN_TOKEN = "test-testadmin"
MASTER_TOKEN = "test-puczaras"
TIMEOUT = 30

def test_delete_tables_reject_master_role():
    headers_admin = {
        "Authorization": f"Bearer {ADMIN_TOKEN}",
        "Content-Type": "application/json",
    }
    headers_master = {
        "Authorization": f"Bearer {MASTER_TOKEN}",
        "Content-Type": "application/json",
    }
    table_id = None
    table_name = None

    try:
        # Create a table as admin to have a table to attempt deleting
        create_payload = {
            "name": "test_table_tc008",
            "description": "Table to test delete reject master role",
            "is_public": False,
            "columns": [
                {"name": "col1", "data_type": "String", "is_nullable": True, "is_unique": False, "is_primary": False},
                {"name": "col2", "data_type": "Integer", "is_nullable": True, "is_unique": False, "is_primary": False}
            ]
        }
        create_resp = requests.post(
            f"{BASE_URL}/tables/",
            headers=headers_admin,
            json=create_payload,
            timeout=TIMEOUT
        )
        assert create_resp.status_code == 200, f"Table creation failed: {create_resp.text}"
        created_table = create_resp.json()
        table_id = created_table.get("id")
        table_name = created_table.get("name")
        assert table_id is not None, "Created table ID missing"
        assert table_name == create_payload["name"], "Created table name mismatch"

        # Attempt delete as master role (should be rejected with 403)
        delete_resp = requests.delete(
            f"{BASE_URL}/tables/{table_id}",
            headers=headers_master,
            params={"confirm_name": table_name},
            timeout=TIMEOUT
        )
        assert delete_resp.status_code == 403, (
            f"Expected 403 Forbidden for master deleting table, got {delete_resp.status_code}: {delete_resp.text}"
        )

    finally:
        # Cleanup: delete the created table as admin if exists
        if table_id and table_name:
            try:
                resp_cleanup = requests.delete(
                    f"{BASE_URL}/tables/{table_id}",
                    headers=headers_admin,
                    params={"confirm_name": table_name},
                    timeout=TIMEOUT
                )
                # Accept 200 or 404 (if already deleted)
                assert resp_cleanup.status_code in (200, 404), (
                    f"Cleanup delete failed: {resp_cleanup.status_code} {resp_cleanup.text}"
                )
            except requests.RequestException as e:
                print(f"Exception during cleanup delete: {e}")

test_delete_tables_reject_master_role()