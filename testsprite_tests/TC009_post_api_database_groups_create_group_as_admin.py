import requests
import uuid

BASE_URL = "http://localhost:8000"
TIMEOUT = 30

MASTER_USERNAME = "puczaras"
MASTER_PASSWORD = "Zup Paras"

def test_post_api_database_groups_create_group_as_admin():
    # Step 1: Login as master to create an admin user (setup admin user)
    login_url = f"{BASE_URL}/api/auth/login"
    master_login_payload = {"username": MASTER_USERNAME, "password": MASTER_PASSWORD}
    try:
        master_login_resp = requests.post(login_url, json=master_login_payload, timeout=TIMEOUT)
        master_login_resp.raise_for_status()
        master_token = master_login_resp.json().get("access_token")
        assert master_token and isinstance(master_token, str)

        headers_master = {"Authorization": f"Bearer {master_token}"}

        # Create an admin user with a unique username
        admin_username = f"testadmin_{uuid.uuid4().hex[:8]}"
        admin_password = "TestAdminPass123!"
        create_admin_resp = requests.post(
            f"{BASE_URL}/api/admins",
            json={"username": admin_username, "password": admin_password},
            headers=headers_master,
            timeout=TIMEOUT,
        )
        create_admin_resp.raise_for_status()
        admin_data = create_admin_resp.json()
        assert admin_data.get("username") == admin_username
        admin_token = None

        # Step 2: Login as the newly created admin to get admin JWT token
        admin_login_resp = requests.post(
            login_url,
            json={"username": admin_username, "password": admin_password},
            timeout=TIMEOUT,
        )
        admin_login_resp.raise_for_status()
        admin_token = admin_login_resp.json().get("access_token")
        assert admin_token and isinstance(admin_token, str)
        headers_admin = {"Authorization": f"Bearer {admin_token}"}

        # Step 3: Create a new database group with the admin token
        group_name = f"Group_{uuid.uuid4().hex[:8]}"
        group_description = "Test group created by automated test"

        create_group_resp = requests.post(
            f"{BASE_URL}/api/database-groups",
            json={"name": group_name, "description": group_description},
            headers=headers_admin,
            timeout=TIMEOUT,
        )
        create_group_resp.raise_for_status()
        group_data = create_group_resp.json()
        assert isinstance(group_data, dict)
        assert group_data.get("name") == group_name
        assert group_data.get("description") == group_description
        assert "id" in group_data and isinstance(group_data["id"], int)

    finally:
        # Cleanup: Delete the created database group and admin user if they exist
        # Delete database group
        if 'group_data' in locals() and "id" in group_data:
            try:
                requests.delete(
                    f"{BASE_URL}/api/database-groups/{group_data['id']}",
                    headers=headers_admin,
                    timeout=TIMEOUT,
                )
            except Exception:
                pass

        # Delete admin user
        if 'admin_data' in locals() and "id" in admin_data:
            try:
                requests.delete(
                    f"{BASE_URL}/api/admins/{admin_data['id']}",
                    headers=headers_master,
                    timeout=TIMEOUT,
                )
            except Exception:
                pass

test_post_api_database_groups_create_group_as_admin()