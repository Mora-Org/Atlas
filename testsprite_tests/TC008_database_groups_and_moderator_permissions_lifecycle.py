import requests
import uuid

base_url = "http://localhost:8000"
timeout = 30


def test_TC008_database_groups_and_moderator_permissions_lifecycle():
    # Step 0: Login as master puczaras
    login_master_resp = requests.post(
        f"{base_url}/api/auth/login",
        json={"username": "puczaras", "password": "Zup Paras"},
        timeout=timeout,
    )
    assert login_master_resp.status_code == 200, f"Master login failed: {login_master_resp.text}"
    master_token = login_master_resp.json().get("access_token")
    assert master_token, "Master access_token missing"
    master_headers = {"Authorization": f"Bearer {master_token}"}

    # Step 1: Master creates admin
    admin_username = f"admin_{uuid.uuid4().hex[:8]}"
    admin_password = "AdminPass123!"
    create_admin_resp = requests.post(
        f"{base_url}/api/admins",
        headers=master_headers,
        json={"username": admin_username, "password": admin_password},
        timeout=timeout,
    )
    assert create_admin_resp.status_code == 200, f"Create admin failed: {create_admin_resp.text}"
    admin_user = create_admin_resp.json()
    admin_id = admin_user.get("id")
    assert admin_id, "Admin ID missing in create admin response"

    admin_headers = None
    moderator_id = None
    group_id = None

    try:
        # Step 2: Admin login
        login_admin_resp = requests.post(
            f"{base_url}/api/auth/login",
            json={"username": admin_username, "password": admin_password},
            timeout=timeout,
        )
        assert login_admin_resp.status_code == 200, f"Admin login failed: {login_admin_resp.text}"
        admin_token = login_admin_resp.json().get("access_token")
        assert admin_token, "Admin access_token missing"
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        # Step 3: Admin creates database group
        group_name = f"testgroup_{uuid.uuid4().hex[:8]}"
        group_description = "Test group for TC008"
        create_group_resp = requests.post(
            f"{base_url}/api/database-groups",
            headers=admin_headers,
            json={"name": group_name, "description": group_description},
            timeout=timeout,
        )
        assert create_group_resp.status_code == 200, f"Create group failed: {create_group_resp.text}"
        group = create_group_resp.json()
        group_id = group.get("id")
        assert group_id, "Group ID missing in create group response"

        # Step 4: Admin creates moderator
        mod_username = f"mod_{uuid.uuid4().hex[:8]}"
        mod_password = "ModPass123!"
        create_mod_resp = requests.post(
            f"{base_url}/api/moderators",
            headers=admin_headers,
            json={"username": mod_username, "password": mod_password},
            timeout=timeout,
        )
        assert create_mod_resp.status_code == 200, f"Create moderator failed: {create_mod_resp.text}"
        moderator = create_mod_resp.json()
        moderator_id = moderator.get("id")
        assert moderator_id, "Moderator ID missing in create moderator response"

        # Step 5: Admin grants moderator access to group
        grant_perm_resp = requests.post(
            f"{base_url}/api/database-groups/{group_id}/permissions",
            headers=admin_headers,
            json={"moderator_id": moderator_id},
            timeout=timeout,
        )
        assert grant_perm_resp.status_code == 200, f"Grant permission failed: {grant_perm_resp.text}"
        perm_resp = grant_perm_resp.json()
        assert perm_resp.get("moderator_id") == moderator_id, "Granted moderator_id mismatch"
        assert perm_resp.get("group_id") == group_id or perm_resp.get("database_group_id") == group_id, "Granted group_id mismatch"

        # Step 6: Verify moderator can list the group
        # Moderator login to get token
        login_mod_resp = requests.post(
            f"{base_url}/api/auth/login",
            json={"username": mod_username, "password": mod_password},
            timeout=timeout,
        )
        assert login_mod_resp.status_code == 200, f"Moderator login failed: {login_mod_resp.text}"
        mod_token = login_mod_resp.json().get("access_token")
        assert mod_token, "Moderator access_token missing"
        mod_headers = {"Authorization": f"Bearer {mod_token}"}

        list_groups_resp = requests.get(
            f"{base_url}/api/database-groups",
            headers=mod_headers,
            timeout=timeout,
        )
        assert list_groups_resp.status_code == 200, f"Moderator listing groups failed: {list_groups_resp.text}"
        groups_list = list_groups_resp.json()
        # groups_list should contain the group created above
        assert any(g.get("id") == group_id for g in groups_list), "Moderator cannot see granted group"

        # Step 7: Admin revokes access
        revoke_perm_resp = requests.delete(
            f"{base_url}/api/database-groups/{group_id}/permissions/{moderator_id}",
            headers=admin_headers,
            timeout=timeout,
        )
        assert revoke_perm_resp.status_code == 200, f"Revoke permission failed: {revoke_perm_resp.text}"
        revoke_msg = revoke_perm_resp.json().get("message", "")
        assert revoke_msg, "Revoke permission response missing message"

        # Verify moderator no longer sees the group
        list_groups_after_revoke = requests.get(
            f"{base_url}/api/database-groups",
            headers=mod_headers,
            timeout=timeout,
        )
        assert list_groups_after_revoke.status_code == 200, f"Moderator listing groups after revoke failed: {list_groups_after_revoke.text}"
        groups_after_revoke = list_groups_after_revoke.json()
        assert all(g.get("id") != group_id for g in groups_after_revoke), "Moderator still sees group after revoke"

    finally:
        # Cleanup: delete moderator
        if admin_headers and moderator_id:
            requests.delete(
                f"{base_url}/api/moderators/{moderator_id}",
                headers=admin_headers,
                timeout=timeout,
            )
        # Cleanup: delete database group
        if admin_headers and group_id:
            requests.delete(
                f"{base_url}/api/database-groups/{group_id}",
                headers=admin_headers,
                timeout=timeout,
            )
        # Cleanup: delete admin user
        if master_headers and admin_id:
            requests.delete(
                f"{base_url}/api/admins/{admin_id}",
                headers=master_headers,
                timeout=timeout,
            )


test_TC008_database_groups_and_moderator_permissions_lifecycle()