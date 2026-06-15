import requests

BASE_ENDPOINT = "http://localhost:8000"
ADMIN_TOKEN = "test-testadmin"
MASTER_TOKEN = "test-puczaras"
HEADERS_ADMIN = {"Authorization": f"Bearer {ADMIN_TOKEN}"}
HEADERS_MASTER = {"Authorization": f"Bearer {MASTER_TOKEN}"}
TIMEOUT = 30

def test_delete_tables_columns_reject_master_role():
    # Step 1: Create a new table with columns using admin token
    table_data = {
        "name": "test_table_tc005",
        "description": "Table for TC005 test",
        "is_public": False,
        "columns": [
            {"name": "col1", "data_type": "String", "is_nullable": True, "is_unique": False, "is_primary": False},
            {"name": "col2", "data_type": "Integer", "is_nullable": True, "is_unique": False, "is_primary": False}
        ]
    }
    table_id = None
    column_id = None
    try:
        create_table_resp = requests.post(
            f"{BASE_ENDPOINT}/tables/",
            json=table_data,
            headers=HEADERS_ADMIN,
            timeout=TIMEOUT
        )
        assert create_table_resp.status_code == 200, f"Failed to create table: {create_table_resp.text}"
        table_resp_json = create_table_resp.json()
        table_id = table_resp_json.get("id")
        assert table_id is not None, "Table id missing in create response"
        columns = table_resp_json.get("columns")
        assert isinstance(columns, list) and len(columns) > 0, "No columns returned in create table response"
        column_id = columns[0].get("id")
        assert column_id is not None, "Column id missing in create response"

        # Step 2: Try to delete the column using master token (should get 403 Forbidden)
        delete_resp = requests.delete(
            f"{BASE_ENDPOINT}/tables/{table_id}/columns/{column_id}",
            headers=HEADERS_MASTER,
            timeout=TIMEOUT
        )
        assert delete_resp.status_code == 403, (
            f"Expected 403 Forbidden when deleting column with master role, got {delete_resp.status_code} - {delete_resp.text}"
        )
    finally:
        # Cleanup: delete the created table using admin token to avoid leftovers
        if table_id is not None:
            # Need to pass confirm_name query param equal to table name per PRD
            requests.delete(
                f"{BASE_ENDPOINT}/tables/{table_id}",
                headers=HEADERS_ADMIN,
                params={"confirm_name": table_data["name"]},
                timeout=TIMEOUT
            )

test_delete_tables_columns_reject_master_role()