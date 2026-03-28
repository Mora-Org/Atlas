import requests
import io
import csv
import openpyxl
from requests.exceptions import RequestException

BASE_URL = "http://localhost:8000"
AUTH_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJwdWN6YXJhcyIsInJvbGUiOiJtYXN0ZXIiLCJpZCI6MSwiZXhwIjoxNzc1MTczMjE2fQ.D-ndmBBzrwDgTxzn6n-s9Y6EFNUa0DLyjhWvPFEqWdo"
HEADERS = {
    "Authorization": f"Bearer {AUTH_TOKEN}"
}
TIMEOUT = 30

def create_admin_and_login():
    """Create a new admin user as master and obtain JWT token for that admin."""
    master_token = AUTH_TOKEN
    headers_master = {"Authorization": f"Bearer {master_token}"}
    username = "test_admin_tc010"
    password = "TestPassword123!"
    # Create admin user
    try:
        resp = requests.post(f"{BASE_URL}/api/admins",
                             json={"username": username, "password": password},
                             headers=headers_master, timeout=TIMEOUT)
        if resp.status_code == 403:
            # Master token is probably fixed, try with existing credentials
            raise RuntimeError("Master token does not allow admin creation")
        resp.raise_for_status()
    except RequestException as e:
        raise RuntimeError("Failed to create admin user") from e

    # Login as created admin
    login_resp = requests.post(f"{BASE_URL}/api/auth/login",
                               json={"username": username, "password": password},
                               timeout=TIMEOUT)
    login_resp.raise_for_status()
    data = login_resp.json()
    assert "access_token" in data and "token_type" in data
    admin_token = data["access_token"]
    return admin_token, username

def create_dynamic_table(admin_token, table_name):
    """Create a new physical table dynamically with one or two columns."""
    headers_admin = {"Authorization": f"Bearer {admin_token}"}
    # Prepare payload for table creation
    payload = {
        "name": table_name,
        "description": "Test Table for TC010",
        "group_id": None,
        "is_public": False,
        "columns": [
            {"name": "id", "data_type": "Integer", "is_nullable": False, "is_unique": True, "is_primary": True},
            {"name": "name", "data_type": "String", "is_nullable": True, "is_unique": False, "is_primary": False}
        ]
    }
    response = requests.post(f"{BASE_URL}/tables/", json=payload, headers=headers_admin, timeout=TIMEOUT)
    if response.status_code == 403:
        # Master cannot create tables, so re-raise as error
        raise RuntimeError("Master role trying to create table")
    if response.status_code == 400:
        # Table may already exist, handle gracefully
        raise RuntimeError("Table already exists or DDL error")
    response.raise_for_status()
    table_data = response.json()
    assert table_data["name"] == table_name
    assert "columns" in table_data and len(table_data["columns"]) >= 1
    return table_data

def delete_dynamic_table(admin_token, table_id):
    """Delete a dynamic table by ID if API existed, but no endpoint found in PRD for deletion of tables.
    So this is a no-op or assumed cleanup happens elsewhere."""
    # No delete endpoint defined in PRD for tables; ignore.
    pass

def upload_file_to_import_data(admin_token, table_name, filename, file_content, content_type):
    """Upload file to /api/import/data/{table_name} as multipart."""
    url = f"{BASE_URL}/api/import/data/{table_name}"
    headers = {"Authorization": f"Bearer {admin_token}"}
    files = {"file": (filename, file_content, content_type)}
    response = requests.post(url, headers=headers, files=files, timeout=TIMEOUT)
    return response

def test_tc010_post_api_import_data_table_name_upload_csv_or_xlsx():
    admin_token, admin_username = create_admin_and_login()

    # Create a dynamic table for this test with name unique to avoid collision
    table_name = "tc010_import_test"
    try:
        table = create_dynamic_table(admin_token, table_name)
    except RuntimeError as e:
        # Try proceeding if table exists (unlikely in clean env)
        if "Table already exists" in str(e):
            pass
        else:
            raise

    # Test data for CSV upload (matching columns: id, name)
    csv_content = io.StringIO()
    writer = csv.DictWriter(csv_content, fieldnames=["id", "name", "extra_column"])
    writer.writeheader()
    writer.writerow({"id": "1", "name": "Alice", "extra_column": "ignored"})
    writer.writerow({"id": "2", "name": "Bob", "extra_column": "ignored"})
    csv_bytes = csv_content.getvalue().encode("utf-8")

    # 1) Upload valid CSV file with matched and unmatched columns
    resp_csv = upload_file_to_import_data(admin_token, table_name, "data.csv", io.BytesIO(csv_bytes), "text/csv")
    assert resp_csv.status_code == 200, f"Expected 200 for CSV upload, got {resp_csv.status_code} {resp_csv.text}"
    json_csv = resp_csv.json()
    assert "inserted_rows" in json_csv and json_csv["inserted_rows"] > 0
    assert "matched_columns" in json_csv and "id" in json_csv["matched_columns"] and "name" in json_csv["matched_columns"]
    assert "errors" in json_csv and isinstance(json_csv["errors"], list)

    # 2) Upload valid XLSX file with matching columns
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["id", "name", "extra_column"])
    ws.append([3, "Charlie", "ignored"])
    ws.append([4, "Diana", "ignored"])
    xlsx_bytes_io = io.BytesIO()
    wb.save(xlsx_bytes_io)
    xlsx_bytes_io.seek(0)

    resp_xlsx = upload_file_to_import_data(admin_token, table_name, "data.xlsx", xlsx_bytes_io, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    assert resp_xlsx.status_code == 200, f"Expected 200 for XLSX upload, got {resp_xlsx.status_code} {resp_xlsx.text}"
    json_xlsx = resp_xlsx.json()
    assert "inserted_rows" in json_xlsx and json_xlsx["inserted_rows"] > 0
    assert "matched_columns" in json_xlsx and "id" in json_xlsx["matched_columns"] and "name" in json_xlsx["matched_columns"]
    assert "errors" in json_xlsx and isinstance(json_xlsx["errors"], list)

    # 3) Upload unsupported file type (e.g. .txt file)
    txt_content = b"This should not be accepted"
    resp_txt = upload_file_to_import_data(admin_token, table_name, "data.txt", io.BytesIO(txt_content), "text/plain")
    assert resp_txt.status_code == 400, f"Expected 400 for unsupported file type, got {resp_txt.status_code} {resp_txt.text}"
    err_json = resp_txt.json()
    assert "No matching columns" in str(err_json) or "unsupported file type" in str(err_json).lower()

    # 4) Upload CSV with no matching columns (header unmatched)
    csv_no_match_content = io.StringIO()
    writer = csv.DictWriter(csv_no_match_content, fieldnames=["foo", "bar"])
    writer.writeheader()
    writer.writerow({"foo": "val1", "bar": "val2"})
    csv_no_match_bytes = csv_no_match_content.getvalue().encode("utf-8")

    resp_no_match = upload_file_to_import_data(admin_token, table_name, "data.csv", io.BytesIO(csv_no_match_bytes), "text/csv")
    assert resp_no_match.status_code == 400, f"Expected 400 for no matching columns, got {resp_no_match.status_code} {resp_no_match.text}"
    err_no_match_json = resp_no_match.json()
    assert "No matching columns" in str(err_no_match_json) or "unsupported file type" in str(err_no_match_json).lower()

    # 5) Upload to non-existent table or table no access (simulate with invalid table_name)
    invalid_table = "nonexistent_table_xyz"
    resp_404 = upload_file_to_import_data(admin_token, invalid_table, "data.csv", io.BytesIO(csv_bytes), "text/csv")
    assert resp_404.status_code == 404, f"Expected 404 for no access or table not found, got {resp_404.status_code} {resp_404.text}"

    # 6) Upload as master token (should get 403)
    master_headers = {"Authorization": f"Bearer {AUTH_TOKEN}"}
    resp_403 = requests.post(f"{BASE_URL}/api/import/data/{table_name}",
                            headers=master_headers,
                            files={"file": ("data.csv", io.BytesIO(csv_bytes), "text/csv")},
                            timeout=TIMEOUT)
    assert resp_403.status_code == 403, f"Expected 403 when master attempts import, got {resp_403.status_code} {resp_403.text}"

    # Cleanup dynamic table if possible - no delete endpoint given, so skip

test_tc010_post_api_import_data_table_name_upload_csv_or_xlsx()