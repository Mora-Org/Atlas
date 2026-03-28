"""Tests for authentication and user management"""
import models

def test_master_login(client, db_session):
    """Master can login with seeded credentials"""
    # Debug: Check user in DB
    user = db_session.query(models.User).filter(models.User.username == "puczaras").first()
    print(f"\nDEBUG: User in DB: {user.username if user else 'None'}")
    if user:
        print(f"DEBUG: Hashed password: {user.password_hash}")
        from auth import verify_password
        is_ok = verify_password("Zup Paras", user.password_hash)
        print(f"DEBUG: Manual verify: {is_ok}")

    res = client.post("/api/auth/login", data={"username": "puczaras", "password": "Zup Paras"})
    if res.status_code != 200:
        print(f"DEBUG: Login failed: {res.status_code} - {res.text}")
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["user"]["role"] == "master"


def test_invalid_login(client, db_session):
    """Invalid credentials return 401"""
    res = client.post("/api/auth/login", data={"username": "puczaras", "password": "wrongpassword"})
    assert res.status_code == 401
