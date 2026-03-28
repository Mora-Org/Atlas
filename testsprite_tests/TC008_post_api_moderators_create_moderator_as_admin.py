import requests
import uuid

BASE_URL = "http://localhost:8000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
MODERATORS_URL = f"{BASE_URL}/api/moderators"

MASTER_USERNAME = "puczaras"
MASTER_PASSWORD = "Zup Paras"

def test_post_api_moderators_create_moderator_as_admin():
    timeout = 30

    # Step 1: Login as master to create an admin user for testing (ensure admin exists)
    master_login_resp = requests.post(
        LOGIN_URL,
        json={"username": MASTER_USERNAME, "password": MASTER_PASSWORD},
        timeout=timeout
    )
    assert master_login_resp.status_code == 200, f"Master login failed: {master_login_resp.text}"
    master_access_token = master_login_resp.json()["access_token"]
    master_headers = {"Authorization": f"Bearer {master_access_token}"}

    # Generate unique admin username
    admin_username = f"testadmin_{uuid.uuid4().hex[:8]}"
    admin_password = "AdminPass123!"

    # Create admin user
    create_admin_resp = requests.post(
        f"{BASE_URL}/api/admins",
        headers=master_headers,
        json={"username": admin_username, "password": admin_password},
        timeout=timeout
    )
    assert create_admin_resp.status_code == 200, f"Create admin failed: {create_admin_resp.text}"
    admin_user = create_admin_resp.json()
    admin_access_token = None

    try:
        # Step 2: Login as the created admin user to get admin token
        admin_login_resp = requests.post(
            LOGIN_URL,
            json={"username": admin_username, "password": admin_password},
            timeout=timeout
        )
        assert admin_login_resp.status_code == 200, f"Admin login failed: {admin_login_resp.text}"
        admin_access_token = admin_login_resp.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_access_token}"}

        # Step 3: Create a new moderator with admin token
        moderator_username = f"mod_{uuid.uuid4().hex[:8]}"
        moderator_password = "ModPass123!"

        create_moderator_resp = requests.post(
            MODERATORS_URL,
            headers=admin_headers,
            json={"username": moderator_username, "password": moderator_password},
            timeout=timeout
        )

        assert create_moderator_resp.status_code == 200, f"Create moderator failed: {create_moderator_resp.text}"
        moderator_data = create_moderator_resp.json()

        # Validate response structure for UserResponse (id, username, role expected minimally)
        assert "id" in moderator_data and isinstance(moderator_data["id"], int), "Moderator response missing 'id'"
        assert moderator_data.get("username") == moderator_username, "Moderator username mismatch"
        assert moderator_data.get("role") == "moderator", "Moderator role mismatch or missing"

    finally:
        # Cleanup: Delete the created moderator if created and admin exists
        if 'moderator_data' in locals():
            mod_id = moderator_data.get("id")
            if mod_id:
                del_mod_resp = requests.delete(
                    f"{MODERATORS_URL}/{mod_id}",
                    headers=admin_headers,
                    timeout=timeout
                )
                assert del_mod_resp.status_code == 200, f"Failed to delete moderator: {del_mod_resp.text}"

        # Cleanup: Delete the created admin user
        if admin_user and "id" in admin_user:
            del_admin_resp = requests.delete(
                f"{BASE_URL}/api/admins/{admin_user['id']}",
                headers=master_headers,
                timeout=timeout
            )
            assert del_admin_resp.status_code == 200, f"Failed to delete admin: {del_admin_resp.text}"

test_post_api_moderators_create_moderator_as_admin()