import requests
import time
import uuid

BASE_URL = "http://localhost:8000"
ADMIN_TOKEN = "test-testadmin"
HEADERS = {
    "Authorization": f"Bearer {ADMIN_TOKEN}",
    "Content-Type": "application/json"
}
TIMEOUT = 30

def test_TC012_add_column_to_existing_table_honors_whitelist():
    table_id = None
    table_name = f"test_table_{int(time.time())}_{uuid.uuid4().hex[:8]}"
    try:
        # Step 1: Create a table with unique random name and one String column
        create_table_payload = {
            "name": table_name,
            "description": "Table for TC012 test",
            "group_id": None,
            "is_public": False,
            "columns": [
                {
                    "name": "title",
                    "data_type": "String",
                    "is_nullable": False,
                    "is_unique": False,
                    "is_primary": False
                }
            ]
        }
        resp = requests.post(f"{BASE_URL}/tables/", headers=HEADERS, json=create_table_payload, timeout=TIMEOUT)
        assert resp.status_code == 200
        table_data = resp.json()
        table_id = table_data.get("id")
        assert isinstance(table_id, int)

        # Step 2: POST /tables/{table_id}/columns with {name:'anexo', data_type:'attachment', is_nullable:true} expects 200
        add_column_payload_valid = {
            "name": "anexo",
            "data_type": "attachment",
            "is_nullable": True
        }
        resp = requests.post(f"{BASE_URL}/tables/{table_id}/columns", headers=HEADERS, json=add_column_payload_valid, timeout=TIMEOUT)
        assert resp.status_code == 200

        # Step 3: POST /tables/{table_id}/columns with {name:'bad', data_type:'blob'} expects 422
        add_column_payload_invalid = {
            "name": "bad",
            "data_type": "blob"
        }
        resp = requests.post(f"{BASE_URL}/tables/{table_id}/columns", headers=HEADERS, json=add_column_payload_invalid, timeout=TIMEOUT)
        assert resp.status_code == 422

    finally:
        # Cleanup: delete the created table if exists
        if table_id is not None:
            try:
                delete_resp = requests.delete(f"{BASE_URL}/tables/{table_id}?confirm_name={table_name}", headers=HEADERS, timeout=TIMEOUT)
                # We expect 200 on successful deletion, but do not assert here to ensure cleanup attempt
            except Exception:
                pass

test_TC012_add_column_to_existing_table_honors_whitelist()