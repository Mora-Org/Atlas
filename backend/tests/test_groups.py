"""Tests for database groups and permissions"""


def test_admin_creates_group(client, admin_token):
    """Admin can create a database group"""
    res = client.post("/api/database-groups",
                      json={"name": "Project Alpha", "description": "Test group"},
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    assert res.json()["name"] == "Project Alpha"


def test_master_cannot_create_group(client, master_token):
    """Master cannot directly own database groups"""
    res = client.post("/api/database-groups",
                      json={"name": "Should Fail"},
                      headers={"Authorization": f"Bearer {master_token}"})
    assert res.status_code == 403


def test_admin_lists_own_groups(client, admin_token):
    """Admin sees only their own groups"""
    client.post("/api/database-groups", json={"name": "G1"},
                headers={"Authorization": f"Bearer {admin_token}"})
    client.post("/api/database-groups", json={"name": "G2"},
                headers={"Authorization": f"Bearer {admin_token}"})
    res = client.get("/api/database-groups", headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    assert len(res.json()) == 2


def test_grant_moderator_permission(client, admin_token, mod_token):
    """Admin can grant moderator access to a group"""
    # Create group
    group = client.post("/api/database-groups", json={"name": "TestGroup"},
                        headers={"Authorization": f"Bearer {admin_token}"})
    group_id = group.json()["id"]

    # Get mod id
    mods = client.get("/api/moderators", headers={"Authorization": f"Bearer {admin_token}"})
    mod_id = mods.json()[0]["id"]

    # Grant permission
    res = client.post(f"/api/database-groups/{group_id}/permissions",
                      json={"moderator_id": mod_id},
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200


def test_moderator_sees_permitted_groups(client, admin_token, mod_token):
    """Moderator can see groups they have permissions for"""
    # Create 2 groups
    g1 = client.post("/api/database-groups", json={"name": "Allowed"},
                     headers={"Authorization": f"Bearer {admin_token}"})
    client.post("/api/database-groups", json={"name": "NotAllowed"},
                headers={"Authorization": f"Bearer {admin_token}"})

    # Grant access to first group only
    mods = client.get("/api/moderators", headers={"Authorization": f"Bearer {admin_token}"})
    mod_id = mods.json()[0]["id"]
    client.post(f"/api/database-groups/{g1.json()['id']}/permissions",
                json={"moderator_id": mod_id},
                headers={"Authorization": f"Bearer {admin_token}"})

    # Moderator should see 1 group
    res = client.get("/api/database-groups", headers={"Authorization": f"Bearer {mod_token}"})
    assert res.status_code == 200
    assert len(res.json()) == 1
    assert res.json()[0]["name"] == "Allowed"


def test_revoke_permission(client, admin_token, mod_token):
    """Admin can revoke moderator permission"""
    group = client.post("/api/database-groups", json={"name": "RevTest"},
                        headers={"Authorization": f"Bearer {admin_token}"})
    group_id = group.json()["id"]
    mods = client.get("/api/moderators", headers={"Authorization": f"Bearer {admin_token}"})
    mod_id = mods.json()[0]["id"]

    # Grant
    client.post(f"/api/database-groups/{group_id}/permissions",
                json={"moderator_id": mod_id},
                headers={"Authorization": f"Bearer {admin_token}"})

    # Revoke
    res = client.delete(f"/api/database-groups/{group_id}/permissions/{mod_id}",
                        headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200

    # Moderator should see 0 groups
    groups = client.get("/api/database-groups", headers={"Authorization": f"Bearer {mod_token}"})
    assert len(groups.json()) == 0


def test_delete_group(client, admin_token):
    """Admin can delete their own group"""
    group = client.post("/api/database-groups", json={"name": "ToDelete"},
                        headers={"Authorization": f"Bearer {admin_token}"})
    res = client.delete(f"/api/database-groups/{group.json()['id']}",
                        headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
