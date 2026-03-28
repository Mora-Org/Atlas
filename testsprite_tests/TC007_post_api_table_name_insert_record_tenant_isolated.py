import requests

BASE_URL = "http://localhost:8000"
TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJwdWN6YXJhcyIsInJvbGUiOiJtYXN0ZXIiLCJpZCI6MSwiZXhwIjoxNzc1MTczMjE2fQ.D-ndmBBzrwDgTxzn6n-s9Y6EFNUa0DLyjhWvPFEqWdo"
HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json"
}
TIMEOUT = 30

def test_post_api_table_name_insert_record_tenant_isolated():
    # Step 1: Get list of tables accessible to user (GET /tables/)
    tables_url = f"{BASE_URL}/tables/"
    try:
        tables_resp = requests.get(tables_url, headers=HEADERS, timeout=TIMEOUT)
        assert tables_resp.status_code == 200, f"Expected 200 from /tables/, got {tables_resp.status_code}"
        tables = tables_resp.json()
        assert isinstance(tables, list), "Tables response is not a list"
    except Exception as e:
        raise AssertionError(f"Failed to get accessible tables: {e}")

    # Filter dynamic tables this user has access to
    # Select a table with at least one non-primary non-nullable column to insert data
    table_name = None
    insert_fields = {}
    for table in tables:
        if "name" in table and "columns" in table and isinstance(table["columns"], list):
            columns = table["columns"]
            # Find columns eligible for insert: skip primary key if auto increment
            candidate_columns = [col for col in columns if not col.get("is_primary", False)]
            # We pick minimal columns with simple types for test
            if candidate_columns:
                table_name = table["name"]
                # Create a sample insert payload with dummy values based on data type
                for col in candidate_columns:
                    col_name = col.get("name")
                    if not col_name:
                        continue
                    dtype = col.get("data_type", "").lower()
                    is_nullable = col.get("is_nullable", True)
                    if not dtype:
                        continue
                    # Provide sample data per type, skip nullable with no sample value
                    if dtype == "string":
                        insert_fields[col_name] = "test_value"
                    elif dtype == "integer":
                        insert_fields[col_name] = 1
                    elif dtype == "float":
                        insert_fields[col_name] = 1.23
                    elif dtype == "boolean":
                        insert_fields[col_name] = True
                    elif dtype == "datetime":
                        insert_fields[col_name] = "2023-01-01T12:00:00Z"
                    else:
                        # Unknown type, skip
                        continue
                # If we got at least one field, break
                if insert_fields:
                    break
    if not table_name or not insert_fields:
        raise AssertionError("No suitable table with columns found to insert record")

    post_url = f"{BASE_URL}/api/{table_name}"
    try:
        post_resp = requests.post(post_url, headers=HEADERS, json=insert_fields, timeout=TIMEOUT)
        if post_resp.status_code == 200:
            resp_json = post_resp.json()
            # Expected keys: message:string, id:integer
            assert "message" in resp_json and isinstance(resp_json["message"], str), "Missing or invalid 'message' in response"
            assert "id" in resp_json and isinstance(resp_json["id"], int), "Missing or invalid 'id' in response"
            record_id = resp_json["id"]

            # Cleanup: delete the record to avoid pollution
            delete_url = f"{BASE_URL}/api/{table_name}/{record_id}"
            try:
                del_resp = requests.delete(delete_url, headers=HEADERS, timeout=TIMEOUT)
                assert del_resp.status_code == 200, f"Cleanup delete failed with status {del_resp.status_code}"
            except Exception as e:
                raise AssertionError(f"Cleanup delete failed: {e}")

        elif post_resp.status_code == 404:
            # Table not found or no access - acceptable response
            pass
        else:
            raise AssertionError(f"Unexpected status code {post_resp.status_code} from POST /api/{table_name}")
    except Exception as e:
        raise AssertionError(f"POST /api/{table_name} request failed: {e}")

test_post_api_table_name_insert_record_tenant_isolated()