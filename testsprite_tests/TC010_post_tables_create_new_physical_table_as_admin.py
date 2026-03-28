import requests

BASE_URL = "http://localhost:8000"
ADMIN_USERNAME = "puczaras"
ADMIN_PASSWORD = "Zup Paras"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
TABLES_URL = f"{BASE_URL}/tables/"

def test_post_tables_create_new_physical_table_as_admin():
    # Login as admin user with form data (per OAuth2PasswordRequestForm)
    login_resp = requests.post(LOGIN_URL, data={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}, timeout=30)
    assert login_resp.status_code == 200, f"Login failed with status {login_resp.status_code}"
    login_data = login_resp.json()
    assert "access_token" in login_data, "No access_token in login response"
    assert "user" in login_data and "role" in login_data["user"], "User or role missing in login response"
    assert login_data["user"]["role"] == "admin", f"User role is not admin, got {login_data['user']['role']}"
    token = login_data["access_token"]

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Prepare new physical table data with columns and foreign key references
    # First, create a group to assign group_id (we must create group as admin)
    group_payload = {
        "name": "test_group_for_table_tc010",
        "description": "Test group for dynamic table creation TC010"
    }
    group_resp = requests.post(f"{BASE_URL}/api/database-groups", headers=headers, json=group_payload, timeout=30)
    assert group_resp.status_code == 200, f"Group creation failed with status {group_resp.status_code}"
    group_data = group_resp.json()
    group_id = group_data.get("id")
    assert group_id is not None, "Group id missing in response"

    # We'll create a referenced table first to be used as FK target
    fk_table_payload = {
        "name": "fk_target_table_tc010",
        "description": "FK target table for TC010",
        "group_id": group_id,
        "is_public": False,
        "columns": [
            {
                "name": "id",
                "data_type": "Integer",
                "is_nullable": False,
                "is_unique": True,
                "is_primary": True
            },
            {
                "name": "name",
                "data_type": "String",
                "is_nullable": False,
                "is_unique": False,
                "is_primary": False
            }
        ]
    }
    fk_table_resp = requests.post(TABLES_URL, headers=headers, json=fk_table_payload, timeout=30)
    assert fk_table_resp.status_code == 200, f"FK target table creation failed with status {fk_table_resp.status_code}"
    fk_table_data = fk_table_resp.json()
    fk_table_name = fk_table_data.get("name")
    fk_table_id = fk_table_data.get("id")
    assert fk_table_name == fk_table_payload["name"], "FK table name mismatch"
    assert fk_table_id is not None, "FK table id missing"

    # Now create the main table with columns referencing FK table by name
    main_table_name = "test_table_tc010"
    main_table_payload = {
        "name": main_table_name,
        "description": "A test physical table with FK references created by admin for TC010",
        "group_id": group_id,
        "is_public": True,
        "columns": [
            {
                "name": "id",
                "data_type": "Integer",
                "is_nullable": False,
                "is_unique": True,
                "is_primary": True
            },
            {
                "name": "fk_id",
                "data_type": "Integer",
                "is_nullable": False,
                "is_unique": False,
                "is_primary": False,
                "fk_table": fk_table_name,
                "fk_column": "id"
            },
            {
                "name": "value",
                "data_type": "String",
                "is_nullable": True,
                "is_unique": False,
                "is_primary": False
            }
        ]
    }

    try:
        main_table_resp = requests.post(TABLES_URL, headers=headers, json=main_table_payload, timeout=30)
        assert main_table_resp.status_code == 200, f"Main table creation failed with status {main_table_resp.status_code}"
        main_table_data = main_table_resp.json()
        assert "id" in main_table_data, "Main table response missing id"
        assert main_table_data["name"] == main_table_name, "Main table name mismatch"
        assert "columns" in main_table_data and isinstance(main_table_data["columns"], list), "Columns missing or invalid"
        # Verify columns include FK reference
        fk_column_found = any(
            col.get("name") == "fk_id" and col.get("fk_table") == fk_table_name and col.get("fk_column") == "id"
            for col in main_table_data["columns"]
        )
        assert fk_column_found, "FK column with correct references not found in response"
    finally:
        # Cleanup: delete created tables and group if possible

        # Attempt delete FK table
        if fk_table_id:
            try:
                del_fk_resp = requests.delete(f"{TABLES_URL}{fk_table_id}", headers=headers, timeout=30)
                # May respond 404 or 200 if delete supported; ignore errors
            except Exception:
                pass
        # Attempt delete group
        if group_id:
            try:
                del_group_resp = requests.delete(f"{BASE_URL}/api/database-groups/{group_id}", headers=headers, timeout=30)
                # May respond 404 or 200; ignore errors
            except Exception:
                pass

test_post_tables_create_new_physical_table_as_admin()
