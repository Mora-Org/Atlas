import requests
import uuid

BASE_URL = "http://localhost:8000"
TIMEOUT = 30

MASTER_USERNAME = "puczaras"
MASTER_PASSWORD = "Zup Paras"

def test_post_tables_create_physical_table_with_fk_columns_as_admin():
    session = requests.Session()

    # Step 1: Master login to get master token
    login_master_resp = session.post(
        f"{BASE_URL}/api/auth/login",
        data={"username": MASTER_USERNAME, "password": MASTER_PASSWORD},
        timeout=TIMEOUT
    )
    assert login_master_resp.status_code == 200, f"Master login failed: {login_master_resp.text}"
    master_token = login_master_resp.json().get("access_token")
    assert master_token, "No access_token in master login response"
    master_headers = {"Authorization": f"Bearer {master_token}"}

    # Step 1: Master creates admin user
    admin_username = f"admin_{uuid.uuid4().hex[:8]}"
    admin_password = "AdminPass123!"
    create_admin_resp = session.post(
        f"{BASE_URL}/api/admins",
        headers=master_headers,
        json={"username": admin_username, "password": admin_password},
        timeout=TIMEOUT
    )
    assert create_admin_resp.status_code == 200, f"Master failed to create admin: {create_admin_resp.text}"
    admin_user = create_admin_resp.json()
    admin_id = admin_user.get("id")
    assert admin_id, "No admin id returned"

    try:
        # Step 2: Login as admin
        login_admin_resp = session.post(
            f"{BASE_URL}/api/auth/login",
            data={"username": admin_username, "password": admin_password},
            timeout=TIMEOUT
        )
        assert login_admin_resp.status_code == 200, f"Admin login failed: {login_admin_resp.text}"
        admin_token = login_admin_resp.json().get("access_token")
        assert admin_token, "No access_token in admin login response"
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        # Step 3: Admin creates database group
        db_group_name = f"grp_{uuid.uuid4().hex[:8]}"
        create_group_resp = session.post(
            f"{BASE_URL}/api/database-groups",
            headers=admin_headers,
            json={"name": db_group_name, "description": "Test group for FK table creation"},
            timeout=TIMEOUT
        )
        assert create_group_resp.status_code == 200, f"Admin failed to create database group: {create_group_resp.text}"
        db_group = create_group_resp.json()
        group_id = db_group.get("id")
        assert group_id, "No group id returned"

        # Step 4: Admin creates base table (no FK)
        base_table_name = f"base_{uuid.uuid4().hex[:8]}"
        base_table_payload = {
            "name": base_table_name,
            "description": "Base table for FK reference",
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
        create_base_table_resp = session.post(
            f"{BASE_URL}/tables/",
            headers=admin_headers,
            json=base_table_payload,
            timeout=TIMEOUT
        )
        assert create_base_table_resp.status_code == 200, f"Failed to create base table: {create_base_table_resp.text}"
        base_table = create_base_table_resp.json()
        base_table_id = base_table.get("id")
        assert base_table_id, "No base table id returned"
        base_columns = base_table.get("columns")
        assert isinstance(base_columns, list) and len(base_columns) > 0, "Base table columns missing"

        # Step 5: Admin creates table with FK column referencing base table
        fk_table_name = f"fk_{uuid.uuid4().hex[:8]}"
        fk_column_name = "base_id"
        fk_table_payload = {
            "name": fk_table_name,
            "description": "Table with FK column referencing base table",
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
                    "name": fk_column_name,
                    "data_type": "Integer",
                    "is_nullable": False,
                    "is_unique": False,
                    "is_primary": False,
                    "fk_table": base_table_name,
                    "fk_column": "id"
                },
                {
                    "name": "description",
                    "data_type": "String",
                    "is_nullable": True,
                    "is_unique": False,
                    "is_primary": False
                }
            ]
        }
        create_fk_table_resp = session.post(
            f"{BASE_URL}/tables/",
            headers=admin_headers,
            json=fk_table_payload,
            timeout=TIMEOUT
        )
        assert create_fk_table_resp.status_code == 200, f"Failed to create FK table: {create_fk_table_resp.text}"
        fk_table = create_fk_table_resp.json()
        fk_table_id = fk_table.get("id")
        assert fk_table_id, "No FK table id returned"

        # Step 6: Verify response columns include fk_table and fk_column fields
        fk_table_columns = fk_table.get("columns")
        assert isinstance(fk_table_columns, list), "Columns missing in FK table response"
        fk_col = None
        for col in fk_table_columns:
            if col.get("name") == fk_column_name:
                fk_col = col
                break
        assert fk_col is not None, f"FK column '{fk_column_name}' not found in FK table columns"
        assert fk_col.get("fk_table") == base_table_name, "fk_table field mismatch"
        assert fk_col.get("fk_column") == "id", "fk_column field mismatch"

        # Step 7: Toggle visibility (PATCH /tables/{id}/visibility)
        patch_visibility_resp = session.patch(
            f"{BASE_URL}/tables/{fk_table_id}/visibility",
            headers=admin_headers,
            timeout=TIMEOUT
        )
        assert patch_visibility_resp.status_code == 200, f"Failed to toggle visibility: {patch_visibility_resp.text}"
        visibility_resp_json = patch_visibility_resp.json()
        assert "is_public" in visibility_resp_json, "Response missing 'is_public' field after toggle"
        toggled_visibility = visibility_resp_json["is_public"]
        # Toggle again to revert to original state
        patch_visibility_resp_revert = session.patch(
            f"{BASE_URL}/tables/{fk_table_id}/visibility",
            headers=admin_headers,
            timeout=TIMEOUT
        )
        assert patch_visibility_resp_revert.status_code == 200, f"Failed to revert visibility: {patch_visibility_resp_revert.text}"

    finally:
        # Step 8: Cleanup tables and admin

        # Delete FK table
        if 'fk_table_id' in locals():
            del_fk_resp = session.delete(
                f"{BASE_URL}/tables/{fk_table_id}",
                headers=admin_headers,
                timeout=TIMEOUT
            )
            # 200 expected, but ignore if not found or 403
            assert del_fk_resp.status_code in (200, 404, 403), f"Failed to delete FK table: {del_fk_resp.text}"

        # Delete base table
        if 'base_table_id' in locals():
            del_base_resp = session.delete(
                f"{BASE_URL}/tables/{base_table_id}",
                headers=admin_headers,
                timeout=TIMEOUT
            )
            assert del_base_resp.status_code in (200, 404, 403), f"Failed to delete base table: {del_base_resp.text}"

        # Delete database group
        if 'group_id' in locals():
            del_group_resp = session.delete(
                f"{BASE_URL}/api/database-groups/{group_id}",
                headers=admin_headers,
                timeout=TIMEOUT
            )
            assert del_group_resp.status_code in (200, 404, 403), f"Failed to delete database group: {del_group_resp.text}"

        # Delete admin user
        if 'admin_id' in locals():
            del_admin_resp = session.delete(
                f"{BASE_URL}/api/admins/{admin_id}",
                headers=master_headers,
                timeout=TIMEOUT
            )
            assert del_admin_resp.status_code in (200, 404, 403), f"Failed to delete admin user: {del_admin_resp.text}"

test_post_tables_create_physical_table_with_fk_columns_as_admin()
