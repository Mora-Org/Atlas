import requests

BASE_URL = "http://localhost:8000"
TIMEOUT = 30

MASTER_USERNAME = "puczaras"
MASTER_PASSWORD = "Zup Paras"


def test_post_api_moderators_full_lifecycle_as_admin():
    session = requests.Session()

    # Step 1: Master login to get master token
    login_master_resp = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": MASTER_USERNAME, "password": MASTER_PASSWORD},
        timeout=TIMEOUT,
    )
    assert login_master_resp.status_code == 200, f"Master login failed: {login_master_resp.text}"
    master_token = login_master_resp.json().get("access_token")
    assert master_token is not None, "No access_token in master login response"
    master_headers = {"Authorization": f"Bearer {master_token}"}

    # Step 1: Master creates an admin user
    admin_username = "testadmin_tc007"
    admin_password = "AdminPass123!"
    create_admin_resp = session.post(
        f"{BASE_URL}/api/admins",
        headers=master_headers,
        json={"username": admin_username, "password": admin_password},
        timeout=TIMEOUT,
    )
    assert create_admin_resp.status_code == 200, f"Admin creation failed: {create_admin_resp.text}"
    admin_data = create_admin_resp.json()
    admin_id = admin_data.get("id")
    assert admin_id is not None, "Admin id missing in creation response"

    try:
        # Step 2: Login as created admin
        login_admin_resp = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": admin_username, "password": admin_password},
            timeout=TIMEOUT,
        )
        assert login_admin_resp.status_code == 200, f"Admin login failed: {login_admin_resp.text}"
        admin_token = login_admin_resp.json().get("access_token")
        assert admin_token is not None, "No access_token in admin login response"
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        # Step 3: Admin creates a moderator
        mod_username = "testmoderator_tc007"
        mod_password = "ModPass123!"
        create_mod_resp = session.post(
            f"{BASE_URL}/api/moderators",
            headers=admin_headers,
            json={"username": mod_username, "password": mod_password},
            timeout=TIMEOUT,
        )
        assert create_mod_resp.status_code == 200, f"Moderator creation failed: {create_mod_resp.text}"
        mod_data = create_mod_resp.json()
        mod_id = mod_data.get("id")
        assert mod_id is not None, "Moderator id missing in creation response"

        try:
            # Step 4: Admin lists moderators
            list_mods_resp = session.get(
                f"{BASE_URL}/api/moderators",
                headers=admin_headers,
                timeout=TIMEOUT,
            )
            assert list_mods_resp.status_code == 200, f"List moderators failed: {list_mods_resp.text}"
            mods_list = list_mods_resp.json()
            assert any(m.get("id") == mod_id for m in mods_list), "Created moderator not found in list"

            # Step 5: Admin resets moderator password
            new_password = "NewModPass123!"
            reset_pass_resp = session.post(
                f"{BASE_URL}/api/moderators/{mod_id}/reset-password",
                headers=admin_headers,
                json={"new_password": new_password},
                timeout=TIMEOUT,
            )
            assert reset_pass_resp.status_code == 200, f"Reset password failed: {reset_pass_resp.text}"
            reset_msg = reset_pass_resp.json().get("message")
            assert reset_msg, "Reset password response missing message"

        finally:
            # Step 6: Admin deletes moderator
            delete_mod_resp = session.delete(
                f"{BASE_URL}/api/moderators/{mod_id}",
                headers=admin_headers,
                timeout=TIMEOUT,
            )
            assert delete_mod_resp.status_code == 200, f"Delete moderator failed: {delete_mod_resp.text}"
            delete_msg = delete_mod_resp.json().get("message")
            assert delete_msg, "Delete moderator response missing message"

    finally:
        # Cleanup: Master deletes the created admin
        delete_admin_resp = session.delete(
            f"{BASE_URL}/api/admins/{admin_id}",
            headers=master_headers,
            timeout=TIMEOUT,
        )
        assert delete_admin_resp.status_code == 200, f"Delete admin failed: {delete_admin_resp.text}"
        delete_admin_msg = delete_admin_resp.json().get("message")
        assert delete_admin_msg, "Delete admin response missing message"


test_post_api_moderators_full_lifecycle_as_admin()