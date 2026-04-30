"""Tests for QR login flow (desktop + mobile handshake)."""
import uuid
import pytest

from auth import get_password_hash
import models


@pytest.fixture(scope="function")
def qr_user_token(client, db_session):
    """Create an admin user for QR flow and return its JWT."""
    if not db_session.query(models.User).filter(models.User.username == "qr_test_user").first():
        db_session.add(models.User(
            username="qr_test_user",
            password_hash=get_password_hash("testpass123"),
            role="admin",
        ))
        db_session.commit()

    res = client.post("/api/auth/login", data={"username": "qr_test_user", "password": "testpass123"})
    assert res.status_code == 200
    return res.json()["access_token"]


def test_qr_login_flow(client, qr_user_token):
    headers = {"Authorization": f"Bearer {qr_user_token}"}

    # Desktop creates a QR session
    res = client.post("/api/auth/qr/session")
    assert res.status_code == 200
    session_id = res.json()["session_id"]

    # Desktop polls status — should be unauthorized
    res = client.get(f"/api/auth/qr/status/{session_id}")
    assert res.status_code == 200
    assert res.json()["is_authorized"] is False

    # Mobile authorizes the session
    res = client.post("/api/auth/qr/authorize", json={"session_id": session_id}, headers=headers)
    assert res.status_code == 200
    assert res.json() == {"message": "Session authorized"}

    # Desktop polls again — now authorized, token returned
    res = client.get(f"/api/auth/qr/status/{session_id}")
    assert res.status_code == 200
    body = res.json()
    assert body["is_authorized"] is True
    assert "access_token" in body
    assert body["user"]["username"] == "qr_test_user"


def test_qr_invalid_session(client):
    fake = str(uuid.uuid4())
    res = client.get(f"/api/auth/qr/status/{fake}")
    assert res.status_code == 404
