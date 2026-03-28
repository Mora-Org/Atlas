import requests

BASE_URL = "http://localhost:8000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
ADMINS_URL = f"{BASE_URL}/api/admins"

MASTER_USERNAME = "puczaras"
MASTER_PASSWORD = "Zup Paras"
TIMEOUT = 30

def test_post_api_admins_create_and_delete_admin_as_master():
    # Step 1: Authenticate as master user
    login_payload = {"username": MASTER_USERNAME, "password": MASTER_PASSWORD}
    login_resp = requests.post(LOGIN_URL, json=login_payload, timeout=TIMEOUT)
    assert login_resp.status_code == 200, f"Master login failed: {login_resp.text}"
    login_data = login_resp.json()
    assert "access_token" in login_data
    master_token = login_data["access_token"]
    headers_master = {"Authorization": f"Bearer {master_token}"}

    # Prepare admin creation data (unique username)
    import uuid
    new_admin_username = f"testadmin_{uuid.uuid4().hex[:8]}"
    new_admin_password = "AdminPass123!"

    # Step 2: Master creates admin via POST /api/admins
    create_payload = {"username": new_admin_username, "password": new_admin_password}
    create_resp = requests.post(ADMINS_URL, json=create_payload, headers=headers_master, timeout=TIMEOUT)
    assert create_resp.status_code == 200, f"Create admin failed: {create_resp.text}"
    created_admin = create_resp.json()
    assert created_admin.get("username") == new_admin_username, "Created admin username mismatch"
    created_admin_id = created_admin.get("id")
    assert isinstance(created_admin_id, int), "Created admin ID is invalid"

    try:
        # Step 3: Master lists admins via GET /api/admins
        list_resp = requests.get(ADMINS_URL, headers=headers_master, timeout=TIMEOUT)
        assert list_resp.status_code == 200, f"List admins failed: {list_resp.text}"
        admins_list = list_resp.json()
        assert any(admin.get("id") == created_admin_id for admin in admins_list), "Created admin not in admins list"

        # Step 4: Master deletes admin via DELETE /api/admins/{id}
        delete_url = f"{ADMINS_URL}/{created_admin_id}"
        delete_resp = requests.delete(delete_url, headers=headers_master, timeout=TIMEOUT)
        assert delete_resp.status_code == 200, f"Delete admin failed: {delete_resp.text}"
        delete_data = delete_resp.json()
        assert "message" in delete_data and isinstance(delete_data["message"], str)

        # Step 5: Verify 403 for non-master trying to create admin
        # Login as the created admin (non-master)
        admin_login_payload = {"username": new_admin_username, "password": new_admin_password}
        admin_login_resp = requests.post(LOGIN_URL, json=admin_login_payload, timeout=TIMEOUT)
        # The admin was deleted, so login likely fails. We create one non-master to test 403
        # Instead, create a non-master user to test 403 when creating admin via that user.

        # To handle that, create a non-master user for the 403 test
        # Since admins must be created by master, create a moderator user as non-master
        # But moderators are created by admins, which we don't have right now.
        # Simplify: Attempt POST /api/admins without auth or with an invalid/non-master token,
        # expecting 403.

        # Try with no auth
        no_auth_resp = requests.post(ADMINS_URL, json=create_payload, timeout=TIMEOUT)
        assert no_auth_resp.status_code in (401, 403), "No auth should return 401 or 403"

        # Try with created admin’s token if login succeeded (if admin not deleted)
        # Since we deleted the admin, let's create a temporary admin user to get a non-master token for 403 test
        # Create temp admin user for 403 test
        temp_admin_username = f"tempadmin_{uuid.uuid4().hex[:8]}"
        temp_admin_password = "TempPass123!"
        create_temp_resp = requests.post(ADMINS_URL, json={"username": temp_admin_username, "password": temp_admin_password}, headers=headers_master, timeout=TIMEOUT)
        assert create_temp_resp.status_code == 200, f"Create temp admin failed: {create_temp_resp.text}"
        temp_admin_id = create_temp_resp.json()["id"]

        # Login as temp admin (role=admin) to get token
        temp_login_payload = {"username": temp_admin_username, "password": temp_admin_password}
        temp_login_resp = requests.post(LOGIN_URL, json=temp_login_payload, timeout=TIMEOUT)
        assert temp_login_resp.status_code == 200, f"Temp admin login failed: {temp_login_resp.text}"
        temp_admin_token = temp_login_resp.json()["access_token"]
        headers_temp_admin = {"Authorization": f"Bearer {temp_admin_token}"}

        # Attempt to create admin as admin user (should get 403)
        create_resp_403 = requests.post(ADMINS_URL, json=create_payload, headers=headers_temp_admin, timeout=TIMEOUT)
        assert create_resp_403.status_code == 403, "Non-master creating admin should return 403"

    finally:
        # Cleanup: Delete temp admin if created
        if 'temp_admin_id' in locals():
            del_resp = requests.delete(f"{ADMINS_URL}/{temp_admin_id}", headers=headers_master, timeout=TIMEOUT)
            # It may fail if already deleted, so do not assert
        # Also ensure created admin is deleted if still exists
        if 'created_admin_id' in locals():
            requests.delete(f"{ADMINS_URL}/{created_admin_id}", headers=headers_master, timeout=TIMEOUT)

test_post_api_admins_create_and_delete_admin_as_master()