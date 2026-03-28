import requests
import uuid

BASE_URL = "http://localhost:8000"
ADMIN_BEARER_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJwdWN6YXJhcyIsInJvbGUiOiJtYXN0ZXIiLCJpZCI6MSwiZXhwIjoxNzc1MTczMjE2fQ.D-ndmBBzrwDgTxzn6n-s9Y6EFNUa0DLyjhWvPFEqWdo"
HEADERS_ADMIN = {
    "Authorization": f"Bearer {ADMIN_BEARER_TOKEN}",
    "Content-Type": "application/json",
}
TIMEOUT = 30


def test_post_api_moderators_create_moderator_under_admin():
    # The token given in instructions is a master token; 
    # to test moderator creation under admin, we first need a real admin token.
    # We'll create a new admin user using the master token, then login as admin to get admin token.

    # 1. Create admin user (random unique username)
    admin_username = f"testadmin_{uuid.uuid4().hex[:8]}"
    admin_password = "AdminPass123!"

    create_admin_body = {
        "username": admin_username,
        "password": admin_password
    }
    # Create admin user using master token
    resp = requests.post(
        f"{BASE_URL}/api/admins",
        headers=HEADERS_ADMIN,
        json=create_admin_body,
        timeout=TIMEOUT,
    )
    assert resp.status_code == 200, f"Failed to create admin user, status: {resp.status_code}, resp: {resp.text}"
    admin_user = resp.json()
    admin_user_id = admin_user.get("id")
    assert admin_user_id is not None, "Admin user ID missing in response"

    # 2. Login as newly created admin to get admin token
    login_body = {
        "username": admin_username,
        "password": admin_password
    }
    resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json=login_body,
        timeout=TIMEOUT,
    )
    assert resp.status_code == 200, f"Admin login failed, status: {resp.status_code}, resp: {resp.text}"
    login_resp = resp.json()
    admin_token = login_resp.get("access_token")
    admin_role = login_resp.get("user", {}).get("role")
    assert admin_token is not None, "Admin token missing in login response"
    assert admin_role == "admin", f"Logged in user role expected to be 'admin' but got {admin_role}"
    admin_headers = {
        "Authorization": f"Bearer {admin_token}",
        "Content-Type": "application/json",
    }

    # 3. Prepare moderator username for creation; ensure it is unique for success case
    mod_username_success = f"modsucc_{uuid.uuid4().hex[:8]}"
    mod_password = "ModPass123!"

    try:
        # 4. Test success case: create a new moderator under admin
        mod_create_body = {
            "username": mod_username_success,
            "password": mod_password
        }

        resp = requests.post(
            f"{BASE_URL}/api/moderators",
            headers=admin_headers,
            json=mod_create_body,
            timeout=TIMEOUT
        )
        assert resp.status_code == 200, f"Expected 200 on moderator creation success, got {resp.status_code}, resp: {resp.text}"
        mod_created = resp.json()
        mod_id = mod_created.get("id")
        assert mod_id is not None, "Moderator ID missing in successful creation response"
        assert mod_created.get("username") == mod_username_success

        # 5. Test error 400: create moderator with same username (should fail)
        resp = requests.post(
            f"{BASE_URL}/api/moderators",
            headers=admin_headers,
            json=mod_create_body,
            timeout=TIMEOUT
        )
        assert resp.status_code == 400, f"Expected 400 for duplicate username creation, got {resp.status_code}, resp: {resp.text}"

        # 6. Test error 403: attempt to create moderator with non-admin user token
        # Reuse master token which is not admin
        mod_username_forbidden = f"modforbid_{uuid.uuid4().hex[:8]}"
        forbidden_body = {
            "username": mod_username_forbidden,
            "password": mod_password
        }
        resp = requests.post(
            f"{BASE_URL}/api/moderators",
            headers=HEADERS_ADMIN,  # Bearer token is master, so not admin role
            json=forbidden_body,
            timeout=TIMEOUT
        )
        assert resp.status_code == 403, f"Expected 403 for non-admin user creating moderator, got {resp.status_code}, resp: {resp.text}"

    finally:
        # Cleanup: delete created moderator (if mod_id is set) and created admin user
        if 'mod_id' in locals():
            try:
                del_resp = requests.delete(
                    f"{BASE_URL}/api/moderators/{mod_id}",
                    headers=admin_headers,
                    timeout=TIMEOUT
                )
                # Accept 200 if deleted or 404 if already gone
                assert del_resp.status_code in (200, 404), f"Failed to delete moderator during cleanup, status: {del_resp.status_code}, resp: {del_resp.text}"
            except Exception:
                pass

        if 'admin_user_id' in locals():
            try:
                del_admin_resp = requests.delete(
                    f"{BASE_URL}/api/admins/{admin_user_id}",
                    headers=HEADERS_ADMIN,
                    timeout=TIMEOUT
                )
                # Accept 200 if deleted or 404 if already gone
                assert del_admin_resp.status_code in (200, 404), f"Failed to delete admin during cleanup, status: {del_admin_resp.status_code}, resp: {del_admin_resp.text}"
            except Exception:
                pass


test_post_api_moderators_create_moderator_under_admin()
