import requests
import uuid

BASE_URL = "http://localhost:8000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
ADMINS_URL = f"{BASE_URL}/api/admins"
TIMEOUT = 30

MASTER_USERNAME = "puczaras"
MASTER_PASSWORD = "Zup Paras"

def test_post_api_admins_create_admin_as_master():
    # Step 1: Login as master user to get token
    login_payload = {
        "username": MASTER_USERNAME,
        "password": MASTER_PASSWORD
    }
    login_resp = requests.post(LOGIN_URL, json=login_payload, timeout=TIMEOUT)
    assert login_resp.status_code == 200, f"Master login failed: {login_resp.text}"
    login_data = login_resp.json()
    access_token = login_data.get("access_token")
    token_type = login_data.get("token_type")
    assert access_token and token_type, "No access_token or token_type in login response"

    headers = {"Authorization": f"{token_type} {access_token}"}

    # Step 2: Create a new admin user with a unique username
    unique_username = f"testadmin_{uuid.uuid4().hex[:8]}"
    admin_payload = {
        "username": unique_username,
        "password": "TestPass123!"
    }
    created_admin = None
    try:
        create_resp = requests.post(ADMINS_URL, json=admin_payload, headers=headers, timeout=TIMEOUT)
        assert create_resp.status_code == 200, f"Create admin failed: {create_resp.text}"
        admin_data = create_resp.json()
        # Validate response fields of UserResponse (id, username, role expected)
        assert "id" in admin_data and isinstance(admin_data["id"], int), "Missing or invalid 'id' in response"
        assert admin_data.get("username") == unique_username, "Username mismatch in response"
        assert admin_data.get("role") == "admin", "Role mismatch; expected 'admin'"
        created_admin = admin_data
    finally:
        # Cleanup: delete the created admin user if it was created
        if created_admin:
            admin_id = created_admin["id"]
            delete_url = f"{ADMINS_URL}/{admin_id}"
            del_resp = requests.delete(delete_url, headers=headers, timeout=TIMEOUT)
            # Allow delete to fail silently if already deleted; assert status if not 403 or 404
            if del_resp.status_code not in (200, 403, 404):
                raise AssertionError(f"Failed to delete test admin user: {del_resp.text}")

test_post_api_admins_create_admin_as_master()