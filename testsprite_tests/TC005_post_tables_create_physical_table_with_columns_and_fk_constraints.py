import requests
import uuid

BASE_URL = "http://localhost:8000"
AUTH_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJwdWN6YXJhcyIsInJvbGUiOiJtYXN0ZXIiLCJpZCI6MSwiZXhwIjoxNzc1MTczMjE2fQ.D-ndmBBzrwDgTxzn6n-s9Y6EFNUa0DLyjhWvPFEqWdo"
HEADERS_MASTER = {"Authorization": f"Bearer {AUTH_TOKEN}", "Content-Type": "application/json"}
TIMEOUT = 30

def test_post_tables_create_physical_table_with_columns_and_fk_constraints():
    # Because master role cannot create tables (403), first attempt with master
    table_payload = {
        "name": "test_table_master",
        "description": "Physical table created by master role - should fail",
        "group_id": None,
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
                "is_nullable": True,
                "is_unique": False,
                "is_primary": False
            }
        ]
    }
    response = requests.post(f"{BASE_URL}/tables/", headers=HEADERS_MASTER, json=table_payload, timeout=TIMEOUT)
    assert response.status_code == 403, f"Expected 403 for master creating table, got {response.status_code}"

    # For success and 400 cases need an admin token to test further
    # To test full backend features, login as admin (simulate login) - Here we create a helper function:
    def admin_login():
        login_data = {"username": "admin_user", "password": "admin_password"}
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json=login_data, headers={"Content-Type": "application/json"}, timeout=TIMEOUT)
        if login_resp.status_code == 200:
            data = login_resp.json()
            token = data.get("access_token")
            role = data.get("user", {}).get("role")
            if role != "admin":
                raise Exception("Logged in user is not admin, can't proceed for admin tests.")
            return token
        else:
            raise AssertionError(f"Failed admin login: {login_resp.status_code} {login_resp.text}")

    admin_token = admin_login()
    headers_admin = {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}

    # Create a dependent FK table first to reference in FK constraints
    fk_table_name = f"fk_table_{uuid.uuid4().hex[:8]}"
    fk_table_payload = {
        "name": fk_table_name,
        "description": "FK target table",
        "group_id": None,
        "is_public": False,
        "columns": [
            {
                "name": "fk_id",
                "data_type": "Integer",
                "is_nullable": False,
                "is_unique": True,
                "is_primary": True
            },
            {
                "name": "fk_name",
                "data_type": "String",
                "is_nullable": True,
                "is_unique": False,
                "is_primary": False
            }
        ]
    }
    fk_table_id = None
    main_table_name = f"main_table_{uuid.uuid4().hex[:8]}"
    try:
        fk_resp = requests.post(f"{BASE_URL}/tables/", headers=headers_admin, json=fk_table_payload, timeout=TIMEOUT)
        assert fk_resp.status_code == 200, f"Failed to create FK target table: {fk_resp.status_code} {fk_resp.text}"
        fk_table_id = fk_resp.json().get("id")
        assert fk_table_id is not None, "FK table creation response missing 'id'"

        # Now create main table with FK constraints referencing the FK table
        main_table_payload = {
            "name": main_table_name,
            "description": "Main table with FK constraint",
            "group_id": None,
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
                    "name": "fk_id",
                    "data_type": "Integer",
                    "is_nullable": False,
                    "is_unique": False,
                    "is_primary": False,
                    "fk_table": fk_table_name,
                    "fk_column": "fk_id"
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
        main_resp = requests.post(f"{BASE_URL}/tables/", headers=headers_admin, json=main_table_payload, timeout=TIMEOUT)
        assert main_resp.status_code == 200, f"Failed to create main table with FK: {main_resp.status_code} {main_resp.text}"
        main_table_id = main_resp.json().get("id")
        assert main_table_id is not None, "Main table creation response missing 'id'"

        # Try duplicate table creation (should return 400)
        dup_resp = requests.post(f"{BASE_URL}/tables/", headers=headers_admin, json=main_table_payload, timeout=TIMEOUT)
        assert dup_resp.status_code == 400, f"Expected 400 on duplicate table creation, got {dup_resp.status_code}"

        # Try create table with FK to non-existent table (should return 400)
        invalid_fk_payload = {
            "name": f"invalid_fk_table_{uuid.uuid4().hex[:8]}",
            "description": "Table referencing non-existent FK table",
            "group_id": None,
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
                    "name": "bad_fk_id",
                    "data_type": "Integer",
                    "is_nullable": False,
                    "is_unique": False,
                    "is_primary": False,
                    "fk_table": "non_existent_table_12345",
                    "fk_column": "id"
                }
            ]
        }
        invalid_fk_resp = requests.post(f"{BASE_URL}/tables/", headers=headers_admin, json=invalid_fk_payload, timeout=TIMEOUT)
        assert invalid_fk_resp.status_code == 400, f"Expected 400 on FK reference to non-existent table, got {invalid_fk_resp.status_code}"

    finally:
        # Cleanup created tables if exist
        if 'main_table_id' in locals() and main_table_id:
            _ = requests.delete(f"{BASE_URL}/tables/{main_table_id}", headers=headers_admin, timeout=TIMEOUT)
        if fk_table_id:
            _ = requests.delete(f"{BASE_URL}/tables/{fk_table_id}", headers=headers_admin, timeout=TIMEOUT)

test_post_tables_create_physical_table_with_columns_and_fk_constraints()
