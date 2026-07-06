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


def test_create_table_data_type_whitelist_and_reserved_name():
    # (a) POST /tables/ with a UNIQUE random table name (suffix timestamp) and columns [{name:'titulo', data_type:'String'}, {name:'foto', data_type:'image'}] expects 200 and response includes the columns
    unique_table_name_a = f"test_table_a_{int(time.time())}_{uuid.uuid4().hex[:8]}"
    payload_a = {
        "name": unique_table_name_a,
        "description": "Test table with valid data types",
        "group_id": None,
        "is_public": False,
        "columns": [
            {"name": "titulo", "data_type": "String", "is_nullable": False, "is_unique": False, "is_primary": False},
            {"name": "foto", "data_type": "image", "is_nullable": False, "is_unique": False, "is_primary": False}
        ]
    }
    # Note: The PRD for /tables/ lists allowed data_type options as String|Integer|Float|Boolean|DateTime, but the test requires 'image' accepted.
    # We assume 'image' is accepted as data_type despite not listed explicitly in PRD - test expects 200.
    # So we test the API as per instructions.

    response_a = requests.post(f"{BASE_URL}/tables/", headers=HEADERS, json=payload_a, timeout=TIMEOUT)
    assert response_a.status_code == 200, f"Expected 200 but got {response_a.status_code} for valid types"
    try:
        resp_json = response_a.json()
    except Exception:
        resp_json = {}
    columns_resp = resp_json.get("columns")
    assert columns_resp is not None, "Response missing 'columns' on valid table creation"
    col_names = {col.get("name") for col in columns_resp}
    assert "titulo" in col_names and "foto" in col_names, "Response columns do not include expected column names"

    # (b) POST /tables/ with another unique name and a column data_type 'NotAType' expects 422
    unique_table_name_b = f"test_table_b_{int(time.time())}_{uuid.uuid4().hex[:8]}"
    payload_b = {
        "name": unique_table_name_b,
        "description": "Test table with invalid data type",
        "group_id": None,
        "is_public": False,
        "columns": [
            {"name": "invalid_col", "data_type": "NotAType", "is_nullable": False, "is_unique": False, "is_primary": False}
        ]
    }
    response_b = requests.post(f"{BASE_URL}/tables/", headers=HEADERS, json=payload_b, timeout=TIMEOUT)
    assert response_b.status_code == 422, f"Expected 422 but got {response_b.status_code} for invalid data_type"

    # (c) POST /tables/ with name 'assets' expects 400 (reserved)
    payload_c = {
        "name": "assets",
        "description": "Test table with reserved name",
        "group_id": None,
        "is_public": False,
        "columns": [
            {"name": "titulo", "data_type": "String", "is_nullable": False, "is_unique": False, "is_primary": False}
        ]
    }
    response_c = requests.post(f"{BASE_URL}/tables/", headers=HEADERS, json=payload_c, timeout=TIMEOUT)
    assert response_c.status_code == 400, f"Expected 400 but got {response_c.status_code} for reserved table name"


test_create_table_data_type_whitelist_and_reserved_name()