import requests
import uuid

BASE_URL = "http://localhost:8000"
TIMEOUT = 30

MASTER_USERNAME = "puczaras"
MASTER_PASSWORD = "Zup Paras"


def test_dynamic_table_crud_with_tenant_isolation():
    session = requests.Session()

    def login(username, password):
        url = f"{BASE_URL}/api/auth/login"
        # Fix: send data as form-urlencoded, not JSON
        response = session.post(url, data={"username": username, "password": password}, timeout=TIMEOUT)
        assert response.status_code == 200, f"Login failed for {username}: {response.text}"
        data = response.json()
        assert "access_token" in data and "token_type" in data and "user" in data
        token = data["access_token"]
        return token

    def create_admin(master_token, username, password):
        url = f"{BASE_URL}/api/admins"
        headers = {"Authorization": f"Bearer {master_token}"}
        response = session.post(url, headers=headers, json={"username": username, "password": password}, timeout=TIMEOUT)
        assert response.status_code == 200, f"Create admin failed: {response.text}"
        data = response.json()
        assert "id" in data and data["username"] == username
        return data["id"]

    def delete_admin(master_token, admin_id):
        url = f"{BASE_URL}/api/admins/{admin_id}"
        headers = {"Authorization": f"Bearer {master_token}"}
        response = session.delete(url, headers=headers, timeout=TIMEOUT)
        assert response.status_code == 200, f"Delete admin failed: {response.text}"

    # Generate usernames for admins A and B
    admin_a_username = f"adminA_{uuid.uuid4().hex[:8]}"
    admin_b_username = f"adminB_{uuid.uuid4().hex[:8]}"
    admin_password = "AdminPass123!"

    master_token = login(MASTER_USERNAME, MASTER_PASSWORD)

    # Step 1: Master creates two admins (A and B)
    admin_a_id = create_admin(master_token, admin_a_username, admin_password)
    admin_b_id = create_admin(master_token, admin_b_username, admin_password)

    admin_a_token = None
    admin_b_token = None
    table_name = None
    record_id = None

    try:
        # Step 2: Login as admin A
        admin_a_token = login(admin_a_username, admin_password)
        headers_a = {"Authorization": f"Bearer {admin_a_token}"}

        # Step 3: Admin A creates a table with minimal schema
        # Create a database group first (need a group_id)
        # As per PRD, admin can create database group at /api/database-groups
        group_name = f"group_{uuid.uuid4().hex[:8]}"
        group_description = "Test group for dynamic table"
        group_resp = session.post(f"{BASE_URL}/api/database-groups", headers=headers_a,
                                  json={"name": group_name, "description": group_description}, timeout=TIMEOUT)
        assert group_resp.status_code == 200, f"Create database group failed: {group_resp.text}"
        group_data = group_resp.json()
        group_id = group_data.get("id")
        assert group_id is not None

        # Define a unique table name for this test
        table_name = f"tbl_{uuid.uuid4().hex[:8]}"

        # Table columns definition - one column 'name' of type String
        columns = [
            {
                "name": "name",
                "data_type": "String",
                "is_nullable": False,
                "is_unique": False,
                "is_primary": False
            }
        ]

        table_payload = {
            "name": table_name,
            "description": "Table created by Admin A for CRUD test",
            "group_id": group_id,
            "is_public": False,
            "columns": columns,
        }
        create_table_resp = session.post(f"{BASE_URL}/tables/", headers=headers_a, json=table_payload, timeout=TIMEOUT)
        assert create_table_resp.status_code == 200, f"Create table failed: {create_table_resp.text}"
        table_data = create_table_resp.json()
        assert table_data.get("name") == table_name

        # Step 3: Admin A inserts a record into the table (POST /api/{table_name})
        record_payload = {"name": "Record One"}
        post_record_resp = session.post(f"{BASE_URL}/api/{table_name}", headers=headers_a, json=record_payload, timeout=TIMEOUT)
        assert post_record_resp.status_code == 200, f"Insert record failed: {post_record_resp.text}"
        post_data = post_record_resp.json()
        assert "message" in post_data and "id" in post_data
        record_id = post_data["id"]

        # Step 4: Admin A reads records (GET /api/{table_name})
        get_records_resp = session.get(f"{BASE_URL}/api/{table_name}", headers=headers_a, timeout=TIMEOUT)
        assert get_records_resp.status_code == 200, f"Read records failed: {get_records_resp.text}"
        records = get_records_resp.json()
        assert isinstance(records, list)
        assert any(rec.get("id") == record_id for rec in records), "Inserted record not found"

        # Step 5: Admin A updates record (PUT /api/{table_name}/{record_id})
        update_payload = {"name": "Record One Updated"}
        update_resp = session.put(f"{BASE_URL}/api/{table_name}/{record_id}", headers=headers_a, json=update_payload, timeout=TIMEOUT)
        assert update_resp.status_code == 200, f"Update record failed: {update_resp.text}"
        update_data = update_resp.json()
        assert "message" in update_data

        # Step 6: Admin A deletes record (DELETE /api/{table_name}/{record_id})
        delete_resp = session.delete(f"{BASE_URL}/api/{table_name}/{record_id}", headers=headers_a, timeout=TIMEOUT)
        assert delete_resp.status_code == 200, f"Delete record failed: {delete_resp.text}"
        delete_data = delete_resp.json()
        assert "message" in delete_data

        # Step 7: Login as admin B
        admin_b_token = login(admin_b_username, admin_password)
        headers_b = {"Authorization": f"Bearer {admin_b_token}"}

        # Step 8: Admin B tries to read admin A's table (should return 404)
        get_records_b_resp = session.get(f"{BASE_URL}/api/{table_name}", headers=headers_b, timeout=TIMEOUT)
        assert get_records_b_resp.status_code == 404, f"Admin B should not access Admin A's table: {get_records_b_resp.text}"

        # Also check insert fails with 404
        post_record_b_resp = session.post(f"{BASE_URL}/api/{table_name}", headers=headers_b, json={"name": "x"}, timeout=TIMEOUT)
        assert post_record_b_resp.status_code == 404, f"Admin B should not insert to Admin A's table: {post_record_b_resp.text}"

        # Update record id 1 should also fail with 404 for admin B
        put_record_b_resp = session.put(f"{BASE_URL}/api/{table_name}/1", headers=headers_b, json={"name": "x"}, timeout=TIMEOUT)
        assert put_record_b_resp.status_code == 404 or put_record_b_resp.status_code == 403, f"Admin B should not update Admin A's record: {put_record_b_resp.text}"

        # Delete record id 1 should also fail with 404 for admin B
        delete_record_b_resp = session.delete(f"{BASE_URL}/api/{table_name}/1", headers=headers_b, timeout=TIMEOUT)
        assert delete_record_b_resp.status_code == 404 or delete_record_b_resp.status_code == 403, f"Admin B should not delete Admin A's record: {delete_record_b_resp.text}"

    finally:
        # Cleanup: delete table then admins
        if admin_a_token and table_name:
            # No explicit delete table endpoint mentioned; if needed, delete dynamic table by ID or name
            # The PRD does not show delete for /tables/{id}, so skipping table deletion
            # If this is needed, add it here

            # Could try: DELETE /tables/{table_id}
            # Attempt to get list of tables and find id by name
            headers_a = {"Authorization": f"Bearer {admin_a_token}"}
            tables_resp = session.get(f"{BASE_URL}/tables/", headers=headers_a, timeout=TIMEOUT)
            if tables_resp.status_code == 200:
                tables = tables_resp.json()
                table_obj = next((t for t in tables if t.get("name") == table_name), None)
                if table_obj and "id" in table_obj:
                    try:
                        delete_table_resp = session.delete(f"{BASE_URL}/tables/{table_obj['id']}", headers=headers_a, timeout=TIMEOUT)
                        # 200 or 404 acceptable, because maybe deletion not allowed or already deleted
                    except Exception:
                        pass

        if master_token:
            if admin_a_id:
                try:
                    delete_admin(master_token, admin_a_id)
                except Exception:
                    pass
            if admin_b_id:
                try:
                    delete_admin(master_token, admin_b_id)
                except Exception:
                    pass


test_dynamic_table_crud_with_tenant_isolation()
