import requests
import uuid

BASE_URL = "http://localhost:8000"
TIMEOUT = 30

MASTER_USERNAME = "puczaras"
MASTER_PASSWORD = "Zup Paras"


def test_public_api_list_and_query_public_tables():
    session = requests.Session()

    def login(username, password):
        url = f"{BASE_URL}/api/auth/login"
        resp = session.post(url, json={"username": username, "password": password}, timeout=TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        assert "access_token" in data
        assert "token_type" in data
        assert data["token_type"].lower() == "bearer"
        assert "user" in data and "username" in data["user"] and "role" in data["user"]
        return data["access_token"]

    # 1) Master login
    master_token = login(MASTER_USERNAME, MASTER_PASSWORD)
    master_headers = {"Authorization": f"Bearer {master_token}"}

    # 2) Master creates admin
    admin_username = f"admin_{uuid.uuid4().hex[:8]}"
    admin_password = "AdminPass123!"
    resp = session.post(f"{BASE_URL}/api/admins", headers=master_headers,
                        json={"username": admin_username, "password": admin_password}, timeout=TIMEOUT)
    resp.raise_for_status()
    admin_user = resp.json()
    assert "id" in admin_user and admin_user["username"] == admin_username

    admin_id = admin_user["id"]

    # 3) Login as admin
    admin_token = login(admin_username, admin_password)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 4) Admin creates a table
    # First, find or create a group for the table (optional: get existing groups or create one)
    # We'll create a new group for isolation
    group_name = f"group_{uuid.uuid4().hex[:8]}"
    group_desc = "Test group for public API test"
    resp = session.post(f"{BASE_URL}/api/database-groups", headers=admin_headers,
                        json={"name": group_name, "description": group_desc}, timeout=TIMEOUT)
    resp.raise_for_status()
    group = resp.json()
    assert "id" in group and group["name"] == group_name
    group_id = group["id"]

    table_name = f"pub_table_{uuid.uuid4().hex[:8]}"
    table_description = "Public API test table"
    columns = [
        {"name": "name", "data_type": "String", "is_nullable": False, "is_unique": False, "is_primary": False},
        {"name": "age", "data_type": "Integer", "is_nullable": True, "is_unique": False, "is_primary": False},
        {"name": "email", "data_type": "String", "is_nullable": False, "is_unique": True, "is_primary": False},
    ]
    table_payload = {
        "name": table_name,
        "description": table_description,
        "group_id": group_id,
        "is_public": False,
        "columns": columns
    }
    resp = session.post(f"{BASE_URL}/tables/", headers=admin_headers, json=table_payload, timeout=TIMEOUT)
    resp.raise_for_status()
    table = resp.json()
    assert "id" in table and "name" in table and table["name"] == table_name
    table_id = table["id"]

    # 5) Admin inserts 3 records
    records = [
        {"name": "Alice", "age": 30, "email": "alice@example.com"},
        {"name": "Bob", "age": 25, "email": "bob@example.com"},
        {"name": "Carol", "age": None, "email": "carol@example.com"},
    ]
    record_ids = []
    try:
        for rec in records:
            resp = session.post(f"{BASE_URL}/api/{table_name}", headers=admin_headers, json=rec, timeout=TIMEOUT)
            resp.raise_for_status()
            res_data = resp.json()
            assert "id" in res_data and "message" in res_data
            record_ids.append(res_data["id"])

        # 6) Admin toggles table to public
        resp = session.patch(f"{BASE_URL}/tables/{table_id}/visibility", headers=admin_headers,
                             timeout=TIMEOUT)
        resp.raise_for_status()
        vis_data = resp.json()
        assert "is_public" in vis_data and vis_data["is_public"] is True

        # 7) Without auth: GET /public/tables/ (must list the table)
        resp = session.get(f"{BASE_URL}/public/tables/", timeout=TIMEOUT)
        resp.raise_for_status()
        public_tables = resp.json()
        # Verify table is listed among public tables (match by id and name)
        found_table = None
        for t in public_tables:
            if t.get("id") == table_id and t.get("name") == table_name:
                found_table = t
                break
        assert found_table is not None, "Public tables list does not include the created public table"

        # 8) GET /public/api/{table_name} (must return records)
        resp = session.get(f"{BASE_URL}/public/api/{table_name}", timeout=TIMEOUT)
        resp.raise_for_status()
        data_resp = resp.json()
        assert "data" in data_resp and isinstance(data_resp["data"], list)
        assert len(data_resp["data"]) >= 3

        # 9) GET /public/api/{table_name}?limit=2 (pagination)
        resp = session.get(f"{BASE_URL}/public/api/{table_name}", params={"limit": 2}, timeout=TIMEOUT)
        resp.raise_for_status()
        page_resp = resp.json()
        assert "data" in page_resp and len(page_resp["data"]) == 2
        assert "total" in page_resp and page_resp["total"] >= 3
        assert "limit" in page_resp and page_resp["limit"] == 2
        assert "offset" in page_resp and page_resp["offset"] == 0

        # 10) GET /public/api/{table_name}/columns
        resp = session.get(f"{BASE_URL}/public/api/{table_name}/columns", timeout=TIMEOUT)
        resp.raise_for_status()
        columns_resp = resp.json()
        assert isinstance(columns_resp, list)
        # Check that expected columns appear in columns response by name
        column_names = {col.get("name") for col in columns_resp if "name" in col}
        for expected_col in ("name", "age", "email"):
            assert expected_col in column_names

    finally:
        # 11) Cleanup: delete inserted records, delete table, delete group, delete admin
        # Delete inserted records
        for rec_id in record_ids:
            try:
                del_resp = session.delete(f"{BASE_URL}/api/{table_name}/{rec_id}", headers=admin_headers, timeout=TIMEOUT)
                if del_resp.status_code not in (200, 404):
                    del_resp.raise_for_status()
            except Exception:
                pass
        # Delete table
        try:
            del_table_resp = session.delete(f"{BASE_URL}/tables/{table_id}", headers=admin_headers, timeout=TIMEOUT)
            # If DELETE /tables/{id} not supported, ignore
        except Exception:
            pass
        # Delete group
        try:
            del_group_resp = session.delete(f"{BASE_URL}/api/database-groups/{group_id}", headers=admin_headers, timeout=TIMEOUT)
            if del_group_resp.status_code not in (200, 404):
                del_group_resp.raise_for_status()
        except Exception:
            pass
        # Delete admin
        try:
            del_admin_resp = session.delete(f"{BASE_URL}/api/admins/{admin_id}", headers=master_headers, timeout=TIMEOUT)
            if del_admin_resp.status_code not in (200, 404):
                del_admin_resp.raise_for_status()
        except Exception:
            pass


test_public_api_list_and_query_public_tables()