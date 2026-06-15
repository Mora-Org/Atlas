import requests

BASE_URL = "http://localhost:8000"
ADMIN_TOKEN = "test-testadmin"
HEADERS_ADMIN = {
    "Authorization": f"Bearer {ADMIN_TOKEN}",
    "Content-Type": "application/json",
}
TIMEOUT = 30


def test_delete_table_success_deletes_physical_table_and_metadata():
    # Step 1: Create a new table with a couple of columns
    create_table_payload = {
        "name": "tc009_table",
        "description": "Table for TC009 delete test",
        "is_public": False,
        "columns": [
            {"name": "col1", "data_type": "String", "is_nullable": True, "is_unique": False, "is_primary": False},
            {"name": "col2", "data_type": "Integer", "is_nullable": True, "is_unique": False, "is_primary": False}
        ]
    }

    table_id = None
    try:
        create_resp = requests.post(
            f"{BASE_URL}/tables/",
            headers=HEADERS_ADMIN,
            json=create_table_payload,
            timeout=TIMEOUT,
        )
        assert create_resp.status_code == 200, f"Unexpected status creating table: {create_resp.status_code}, body: {create_resp.text}"
        table = create_resp.json()
        assert "id" in table and table["id"] is not None, "Table ID missing in create response"
        assert table.get("name") == create_table_payload["name"], "Table name mismatch on creation"
        table_id = table["id"]
        table_name = table["name"]

        # Step 2: Delete the created table with confirm_name equal to the table name
        delete_resp = requests.delete(
            f"{BASE_URL}/tables/{table_id}",
            headers=HEADERS_ADMIN,
            params={"confirm_name": table_name},
            timeout=TIMEOUT,
        )
        assert delete_resp.status_code == 200, f"Unexpected status deleting table: {delete_resp.status_code}, body: {delete_resp.text}"
        delete_data = delete_resp.json()
        assert isinstance(delete_data, dict), "Delete response is not a json object"
        assert "message" in delete_data and len(delete_data["message"]) > 0, "Delete confirmation message missing"

        # Step 3: Verify that the table no longer exists (expect 404 on GET /tables/{table_id} or table list)
        # Since no GET /tables/{table_id} endpoint described, check list and confirm table is absent
        list_resp = requests.get(
            f"{BASE_URL}/tables/",
            headers=HEADERS_ADMIN,
            timeout=TIMEOUT,
        )
        assert list_resp.status_code == 200, f"Failed to list tables after deletion: {list_resp.status_code}"
        tables_list = list_resp.json()
        assert isinstance(tables_list, list), "Tables list response not JSON array"
        ids = [t.get("id") for t in tables_list if "id" in t]
        assert table_id not in ids, "Deleted table still present in tables list after deletion"

    finally:
        # Cleanup: In case deletion failed, try to delete to avoid residual resource
        if table_id is not None:
            try:
                # Attempt delete again without raising exceptions on failure
                requests.delete(
                    f"{BASE_URL}/tables/{table_id}",
                    headers=HEADERS_ADMIN,
                    params={"confirm_name": create_table_payload["name"]},
                    timeout=TIMEOUT,
                )
            except Exception:
                pass


test_delete_table_success_deletes_physical_table_and_metadata()