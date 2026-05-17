"""Tests for authentication and user management"""
import models

def test_master_login(client, db_session):
    """Master can login with seeded credentials (dev/test mode)."""
    user = db_session.query(models.User).filter(models.User.username == "puczaras").first()
    assert user is not None, "master account must be seeded by setup_db"

    res = client.post("/api/auth/login", data={"username": "puczaras", "password": "Zup Paras"})
    assert res.status_code == 200, res.text
    data = res.json()
    assert "access_token" in data
    assert data["user"]["role"] == "master"


def test_invalid_login(client, db_session):
    """Invalid credentials return 401"""
    res = client.post("/api/auth/login", data={"username": "puczaras", "password": "wrongpassword"})
    assert res.status_code == 401
