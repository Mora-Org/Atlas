import requests
import uuid

BASE_URL = "http://localhost:8000"
TIMEOUT = 30

MASTER_USERNAME = "puczaras"
MASTER_PASSWORD = "Zup Paras"

def test_sql_import_dry_run_and_commit_blocked_statements():
    # Step 1: Master login to get master token
    login_master_resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        data={"username": MASTER_USERNAME, "password": MASTER_PASSWORD},
        timeout=TIMEOUT
    )
    assert login_master_resp.status_code == 200, "Master login failed"
    master_token = login_master_resp.json().get("access_token")
    assert master_token, "Master access_token missing"

    master_headers = {"Authorization": f"Bearer {master_token}"}

    # Step 2: Master creates an admin user
    admin_username = f"admin_{uuid.uuid4().hex[:8]}"
    admin_password = "AdminPass123!"
    create_admin_resp = requests.post(
        f"{BASE_URL}/api/admins",
        headers=master_headers,
        json={"username": admin_username, "password": admin_password},
        timeout=TIMEOUT
    )
    assert create_admin_resp.status_code == 200, f"Failed to create admin, status {create_admin_resp.status_code}"
    admin_data = create_admin_resp.json()
    admin_id = admin_data.get("id")
    assert admin_id is not None, "Admin ID missing"

    try:
        # Step 3: Login as the created admin to get admin token
        login_admin_resp = requests.post(
            f"{BASE_URL}/api/auth/login",
            data={"username": admin_username, "password": admin_password},
            timeout=TIMEOUT
        )
        assert login_admin_resp.status_code == 200, "Admin login failed"
        admin_token = login_admin_resp.json().get("access_token")
        assert admin_token, "Admin access_token missing"
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        # Step 4: Generate unique table name
        unique_table_name = f"imp_{uuid.uuid4().hex[:8]}"

        # Step 5: Build SQL string with blocked DROP statement
        sql_content = (
            f'CREATE TABLE {unique_table_name} (id INTEGER PRIMARY KEY, label TEXT);\n'
            f'INSERT INTO {unique_table_name} (id, label) VALUES (1, "hello");\n'
            f'DROP TABLE other_nonexistent_table;'
        )

        files = {'file': (f"{unique_table_name}.sql", sql_content, 'application/sql')}

        # Step 6: POST /api/import/sql/dry-run with .sql file upload
        dry_run_resp = requests.post(
            f"{BASE_URL}/api/import/sql/dry-run",
            headers=admin_headers,
            files=files,
            timeout=TIMEOUT
        )
        assert dry_run_resp.status_code == 200, f"Dry-run import failed with status {dry_run_resp.status_code}"
        dry_run_json = dry_run_resp.json()

        # Verify statements: CREATE and INSERT have status "ok", DROP has status "blocked"
        statements = dry_run_json.get("statements")
        assert statements and isinstance(statements, list), "No statements data in dry-run response"

        # We expect 3 statements total as per SQL lines
        assert len(statements) >= 3, "Unexpected number of statements in dry-run"

        # Map statement type to their status
        status_map = {}
        for stmt in statements:
            typ = stmt.get("type", "").upper()
            status = stmt.get("status", "").lower()
            # There might be multiple CREATE statements or inserts for other reasons, just track relevant ones
            if typ == "CREATE" or typ == "INSERT" or typ == "DROP":
                status_map[typ] = status

        assert status_map.get("CREATE") == "ok", f"CREATE statement status expected 'ok', got '{status_map.get('CREATE')}'"
        assert status_map.get("INSERT") == "ok", f"INSERT statement status expected 'ok', got '{status_map.get('INSERT')}'"
        assert status_map.get("DROP") == "blocked", f"DROP statement status expected 'blocked', got '{status_map.get('DROP')}'"

        # Step 7: POST /api/import/sql to commit with the same file
        commit_resp = requests.post(
            f"{BASE_URL}/api/import/sql",
            headers=admin_headers,
            files=files,
            timeout=TIMEOUT
        )
        assert commit_resp.status_code == 200, f"SQL import commit failed with status {commit_resp.status_code}"
        commit_json = commit_resp.json()

        created_tables = commit_json.get("created_tables")
        errors = commit_json.get("errors")
        inserted_rows = commit_json.get("inserted_rows")

        assert isinstance(created_tables, list), "created_tables missing or not a list in commit response"
        assert unique_table_name in created_tables, "Unique table name not found in created_tables"
        # Inserted rows expected at least 1 because of INSERT statement
        assert inserted_rows is not None and inserted_rows >= 1, "Inserted rows count invalid or zero"
        # Errors should be empty or missing
        assert not errors, f"Errors found in commit response: {errors}"

    finally:
        # Step 9: Cleanup admin user created by master
        delete_resp = requests.delete(
            f"{BASE_URL}/api/admins/{admin_id}",
            headers=master_headers,
            timeout=TIMEOUT
        )
        # Allow 200 or 404 if already deleted
        assert delete_resp.status_code in (200, 404), f"Failed to delete admin in cleanup, status {delete_resp.status_code}"

test_sql_import_dry_run_and_commit_blocked_statements()
