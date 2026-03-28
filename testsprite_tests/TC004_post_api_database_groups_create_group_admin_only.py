import requests
import uuid

BASE_URL = "http://localhost:8000"
TIMEOUT = 30

# Tokens provided
MASTER_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJwdWN6YXJhcyIsInJvbGUiOiJtYXN0ZXIiLCJpZCI6MSwiZXhwIjoxNzc1MTczMjE2fQ.D-ndmBBzrwDgTxzn6n-s9Y6EFNUa0DLyjhWvPFEqWdo"

def test_post_api_database_groups_create_group_admin_only():
    headers_master = {"Authorization": f"Bearer {MASTER_TOKEN}", "Content-Type": "application/json"}

    # Step 1: Attempt to create a database group with master token, expect 403.
    group_payload = {
        "name": f"test_group_{uuid.uuid4().hex[:8]}",
        "description": "Test group created by master (should fail)"
    }
    resp_master = requests.post(
        f"{BASE_URL}/api/database-groups",
        json=group_payload,
        headers=headers_master,
        timeout=TIMEOUT
    )
    # Assert forbidden for master user
    assert resp_master.status_code == 403, f"Expected 403 for master user creating group, got {resp_master.status_code}"
    # Optionally check error message for master
    assert "Master cannot own groups" in resp_master.text or resp_master.status_code == 403

    # Step 2: To test admin user creating group, first create an admin user by master,
    # then login as that admin to get admin token to create group (admin only).
    admin_username = f"testadmin_{uuid.uuid4().hex[:8]}"
    admin_password = "AdminPass123!"

    # Create admin user by master
    admin_create_payload = {
        "username": admin_username,
        "password": admin_password
    }
    admin_user = None
    resp_create_admin = requests.post(
        f"{BASE_URL}/api/admins",
        json=admin_create_payload,
        headers=headers_master,
        timeout=TIMEOUT
    )
    assert resp_create_admin.status_code == 200, f"Failed to create admin user, got {resp_create_admin.status_code}"
    admin_user = resp_create_admin.json()
    assert "id" in admin_user

    admin_token = None
    group_id = None

    try:
        # Login as newly created admin to get token
        resp_login = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": admin_username, "password": admin_password},
            headers={"Content-Type": "application/json"},
            timeout=TIMEOUT
        )
        assert resp_login.status_code == 200, f"Admin login failed: {resp_login.status_code}"
        login_data = resp_login.json()
        admin_token = login_data.get("access_token")
        assert admin_token, "No access_token in admin login response"

        headers_admin = {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}

        # Create a database group as admin - expect 200 and group response
        group_payload_admin = {
            "name": f"test_admin_group_{uuid.uuid4().hex[:8]}",
            "description": "Test group created by admin user"
        }
        resp_group_create = requests.post(
            f"{BASE_URL}/api/database-groups",
            json=group_payload_admin,
            headers=headers_admin,
            timeout=TIMEOUT
        )
        assert resp_group_create.status_code == 200, f"Admin failed to create group: {resp_group_create.status_code}"
        group_resp = resp_group_create.json()
        assert "id" in group_resp, "Response does not contain group id"
        assert group_resp.get("name") == group_payload_admin["name"]
        group_id = group_resp["id"]

    finally:
        # Cleanup: delete the created admin user and database group if created
        if group_id and admin_token:
            try:
                # Delete the created database group as admin (owner)
                resp_del_group = requests.delete(
                    f"{BASE_URL}/api/database-groups/{group_id}",
                    headers=headers_admin,
                    timeout=TIMEOUT
                )
                # Group delete may succeed or fail if already deleted
                assert resp_del_group.status_code in (200, 404)
            except Exception:
                pass

        if admin_user and admin_user.get("id"):
            try:
                # Delete the created admin user by master
                resp_del_admin = requests.delete(
                    f"{BASE_URL}/api/admins/{admin_user['id']}",
                    headers=headers_master,
                    timeout=TIMEOUT
                )
                # Deleting admin user should succeed
                assert resp_del_admin.status_code == 200
            except Exception:
                pass

test_post_api_database_groups_create_group_admin_only()
