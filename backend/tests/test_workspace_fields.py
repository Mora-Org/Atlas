"""Tests for workspace editorial fields on admin users (T0.6)"""


def test_login_includes_workspace_fallback(client, admin_token):
    """Login response includes workspace_name/slug with username fallback when not set"""
    res = client.post("/api/auth/login", data={"username": "testadmin", "password": "admin123"})
    assert res.status_code == 200
    user = res.json()["user"]
    assert "workspace_name" in user
    assert "workspace_slug" in user
    # fallback: name and slug derived from username
    assert user["workspace_name"] == "testadmin"
    assert user["workspace_slug"] == "testadmin"


def test_me_endpoint_returns_workspace(client, admin_token):
    """/api/auth/me returns current user with workspace fields"""
    res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    data = res.json()
    assert data["username"] == "testadmin"
    assert "workspace_name" in data
    assert "workspace_slug" in data


def test_patch_workspace_success(client, admin_token):
    """Admin can update workspace name and slug"""
    res = client.patch(
        "/api/admins/me/workspace",
        json={"workspace_name": "Centro Budista do Brasil", "workspace_slug": "centrobudista"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["workspace_name"] == "Centro Budista do Brasil"
    assert data["workspace_slug"] == "centrobudista"


def test_patch_workspace_persists(client, admin_token):
    """After updating, /api/auth/me reflects new workspace fields"""
    client.patch(
        "/api/admins/me/workspace",
        json={"workspace_name": "Biblioteca Nacional", "workspace_slug": "biblioteca-nacional"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
    assert me.json()["workspace_name"] == "Biblioteca Nacional"
    assert me.json()["workspace_slug"] == "biblioteca-nacional"


def test_patch_workspace_duplicate_slug(client, admin_token, master_token):
    """Two admins cannot share the same slug — second gets 409"""
    # Create a second admin
    client.post(
        "/api/admins",
        json={"username": "secondadmin", "password": "admin456", "role": "admin"},
        headers={"Authorization": f"Bearer {master_token}"},
    )
    second_login = client.post("/api/auth/login", data={"username": "secondadmin", "password": "admin456"})
    second_token = second_login.json()["access_token"]

    client.patch(
        "/api/admins/me/workspace",
        json={"workspace_name": "First", "workspace_slug": "myslug"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    res = client.patch(
        "/api/admins/me/workspace",
        json={"workspace_name": "Second", "workspace_slug": "myslug"},
        headers={"Authorization": f"Bearer {second_token}"},
    )
    assert res.status_code == 409


def test_patch_workspace_invalid_slug(client, admin_token):
    """Slug with uppercase or special chars is rejected by schema validation"""
    res = client.patch(
        "/api/admins/me/workspace",
        json={"workspace_name": "Test", "workspace_slug": "UPPERCASE"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res.status_code == 422  # Pydantic pattern validation


def test_patch_workspace_reserved_slug(client, admin_token):
    """Reserved slugs are blocked"""
    res = client.patch(
        "/api/admins/me/workspace",
        json={"workspace_name": "Test", "workspace_slug": "api"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res.status_code == 400


def test_patch_workspace_master_blocked(client, master_token):
    """Master cannot set workspace (has no workspace)"""
    res = client.patch(
        "/api/admins/me/workspace",
        json={"workspace_name": "Master WS", "workspace_slug": "masterws"},
        headers={"Authorization": f"Bearer {master_token}"},
    )
    assert res.status_code == 403
