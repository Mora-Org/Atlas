import requests
import uuid

BASE_URL = "http://localhost:8000"
TIMEOUT = 30
MASTER_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJwdWN6YXJhcyIsInJvbGUiOiJtYXN0ZXIiLCJpZCI6MSwiZXhwIjoxNzc1MTczMjE2fQ.D-ndmBBzrwDgTxzn6n-s9Y6EFNUa0DLyjhWvPFEqWdo"

def test_post_api_admins_create_admin_user_master_only():
    headers_master = {
        "Authorization": f"Bearer {MASTER_TOKEN}",
        "Content-Type": "application/json"
    }

    # Attempt to login to get a non-master token
    non_master_token = None
    try:
        login_resp = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "admin_test_user", "password": "adminpass"},
            timeout=TIMEOUT
        )
        if login_resp.status_code == 200:
            token_type = login_resp.json().get("token_type")
            access_token = login_resp.json().get("access_token")
            if token_type and access_token:
                non_master_token = access_token
    except Exception:
        pass

    if not non_master_token:
        non_master_token = "invalid_or_non_master_token_example"

    headers_non_master = {
        "Authorization": f"Bearer {non_master_token}",
        "Content-Type": "application/json"
    }

    new_admin_username = f"testadmin_{uuid.uuid4().hex[:8]}"
    new_admin_password = "StrongAdminPassword123!"

    created_admin_id = None
    try:
        resp_master = requests.post(
            f"{BASE_URL}/api/admins",
            headers=headers_master,
            json={"username": new_admin_username, "password": new_admin_password},
            timeout=TIMEOUT
        )
        assert resp_master.status_code == 200, f"Expected 200, got {resp_master.status_code}"
        resp_json = resp_master.json()
        assert "id" in resp_json, "Response missing 'id'"
        assert resp_json.get("username") == new_admin_username, "Username mismatch in response"
        assert resp_json.get("role") == "admin" or resp_json.get("role") != "master", "Role should be admin or non-master"
        created_admin_id = resp_json.get("id")
        assert created_admin_id is not None, "No admin 'id' returned"

        resp_non_master = requests.post(
            f"{BASE_URL}/api/admins",
            headers=headers_non_master,
            json={"username": f"{new_admin_username}_fail", "password": new_admin_password},
            timeout=TIMEOUT
        )
        assert resp_non_master.status_code in (401, 403), f"Expected 401 or 403 for non-master role, got {resp_non_master.status_code}"

    finally:
        if created_admin_id:
            try:
                del_resp = requests.delete(
                    f"{BASE_URL}/api/admins/{created_admin_id}",
                    headers=headers_master,
                    timeout=TIMEOUT
                )
                assert del_resp.status_code in (200, 404), f"Failed to delete admin user, status: {del_resp.status_code}"
            except Exception:
                pass

test_post_api_admins_create_admin_user_master_only()
