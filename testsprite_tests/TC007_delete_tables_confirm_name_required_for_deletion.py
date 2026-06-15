import requests

BASE_URL = "http://localhost:8000"
HEADERS_ADMIN = {"Authorization": "Bearer test-testadmin"}
TIMEOUT = 30

def test_delete_table_requires_exact_confirm_name():
    created_table = None
    table_name_to_test = "test_delete_confirm_name"
    try:
        # Cleanup any existing table with the same name before starting
        resp_list = requests.get(f"{BASE_URL}/tables/", headers=HEADERS_ADMIN, timeout=TIMEOUT)
        if resp_list.status_code == 200:
            tables = resp_list.json()
            for table in tables:
                if table.get("name") == table_name_to_test:
                    # Delete with confirm_name
                    requests.delete(
                        f"{BASE_URL}/tables/{table['id']}",
                        headers=HEADERS_ADMIN,
                        params={"confirm_name": table_name_to_test},
                        timeout=TIMEOUT
                    )

        # Create a table first
        create_payload = {
            "name": table_name_to_test,
            "description": "Table for deletion confirm_name test",
            "is_public": False,
            "columns": [
                {"name": "col1", "data_type": "String", "is_nullable": True, "is_unique": False, "is_primary": False},
                {"name": "col2", "data_type": "Integer", "is_nullable": True, "is_unique": False, "is_primary": False}
            ]
        }
        resp_create = requests.post(f"{BASE_URL}/tables/", json=create_payload, headers=HEADERS_ADMIN, timeout=TIMEOUT)
        assert resp_create.status_code == 200, f"Table creation failed: {resp_create.text}"
        created_table = resp_create.json()
        table_id = created_table["id"]
        table_name = created_table["name"]

        # Attempt DELETE without confirm_name param - should get 400 (confirmation mismatch)
        resp_no_confirm = requests.delete(f"{BASE_URL}/tables/{table_id}", headers=HEADERS_ADMIN, timeout=TIMEOUT)
        assert resp_no_confirm.status_code == 400, f"DELETE without confirm_name should fail with 400, got {resp_no_confirm.status_code}"

        # Attempt DELETE with confirm_name param wrong - should get 400
        wrong_name = table_name + "_wrong"
        resp_wrong_confirm = requests.delete(
            f"{BASE_URL}/tables/{table_id}",
            headers=HEADERS_ADMIN,
            params={"confirm_name": wrong_name},
            timeout=TIMEOUT
        )
        assert resp_wrong_confirm.status_code == 400, f"DELETE with wrong confirm_name should fail with 400, got {resp_wrong_confirm.status_code}"

    finally:
        if created_table:
            # Clean up: delete the table with correct confirm_name param to avoid leftovers
            try:
                resp_del_cleanup = requests.delete(
                    f"{BASE_URL}/tables/{created_table['id']}",
                    headers=HEADERS_ADMIN,
                    params={"confirm_name": created_table["name"]},
                    timeout=TIMEOUT
                )
                # It may pass or fail if already deleted during test, ignore non-200 here
            except Exception:
                pass

test_delete_table_requires_exact_confirm_name()
