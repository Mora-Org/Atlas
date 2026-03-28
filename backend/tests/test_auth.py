"""Tests for authentication and user management"""


def test_master_login(client, db_session):
    """Master can login with seeded credentials"""
    # Master is already seeded by setup_db in conftest.py
    res = client.post("/api/auth/login", data={"username": "puczaras", "password": "Zup Paras"})
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["user"]["role"] == "master"


def test_invalid_login(client, db_session):
    """Invalid credentials return 401"""
    # Master is already seeded by setup_db
    res = client.post("/api/auth/login", data={"username": "puczaras", "password": "wrongpassword"})
    assert res.status_code == 401


def test_master_creates_admin(client, master_token):
    """Master can create an admin account"""
    res = client.post("/api/admins",
                      json={"username": "newadmin", "password": "pass123", "role": "admin"},
                      headers={"Authorization": f"Bearer {master_token}"})
    assert res.status_code == 200
    assert res.json()["role"] == "admin"


def test_admin_creates_moderator(client, admin_token):
    """Admin can create a moderator"""
    res = client.post("/api/moderators",
                      json={"username": "newmod", "password": "mod456", "role": "moderator"},
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    assert res.json()["role"] == "moderator"


def test_moderator_cannot_create_users(client, mod_token):
    """Moderator cannot create admins or moderators"""
    res1 = client.post("/api/admins",
                       json={"username": "hack", "password": "hack", "role": "admin"},
                       headers={"Authorization": f"Bearer {mod_token}"})
    assert res1.status_code == 403

    res2 = client.post("/api/moderators",
                       json={"username": "hack", "password": "hack", "role": "moderator"},
                       headers={"Authorization": f"Bearer {mod_token}"})
    assert res2.status_code == 403


def test_admin_reset_mod_password(client, admin_token, mod_token):
    """Admin can reset moderator password"""
    # Get mod id
    mods = client.get("/api/moderators", headers={"Authorization": f"Bearer {admin_token}"})
    mod_id = mods.json()[0]["id"]

    res = client.post(f"/api/moderators/{mod_id}/reset-password",
                      json={"new_password": "newpass123"},
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200

    # Login with new password
    login = client.post("/api/auth/login", data={"username": "testmod", "password": "newpass123"})
    assert login.status_code == 200


def test_admin_delete_moderator(client, admin_token, mod_token):
    """Admin can delete moderator"""
    mods = client.get("/api/moderators", headers={"Authorization": f"Bearer {admin_token}"})
    mod_id = mods.json()[0]["id"]

    res = client.delete(f"/api/moderators/{mod_id}",
                        headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200

    # Verify deleted
    mods2 = client.get("/api/moderators", headers={"Authorization": f"Bearer {admin_token}"})
    assert len(mods2.json()) == 0


def test_duplicate_username_rejected(client, master_token):
    """Duplicate username is rejected"""
    client.post("/api/admins", json={"username": "admin1", "password": "p", "role": "admin"},
                headers={"Authorization": f"Bearer {master_token}"})
    res = client.post("/api/admins", json={"username": "admin1", "password": "p", "role": "admin"},
                      headers={"Authorization": f"Bearer {master_token}"})
    assert res.status_code == 400
