import pytest
from fastapi.testclient import TestClient
from main import app
from database import get_db, Base, engine
from auth import get_password_hash
import models
import uuid
import time

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_database():
    Base.metadata.create_all(bind=engine)
    db = next(get_db())
    # Create test user
    user = db.query(models.User).filter(models.User.username == "qr_test_user").first()
    if not user:
        user = models.User(username="qr_test_user", password_hash=get_password_hash("testpass123"), role="admin")
        db.add(user)
        db.commit()
    yield
    # Cleanup
    db.delete(user)
    db.commit()

def test_qr_login_flow():
    # 1. Login to get a token for the phone/authorizing device
    login_data = {"username": "qr_test_user", "password": "testpass123"}
    response = client.post("/api/auth/login", data=login_data)
    assert response.status_code == 200
    token = response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Desktop creates a QR session
    response = client.post("/api/auth/qr/session")
    assert response.status_code == 200
    session_data = response.json()
    assert "session_id" in session_data
    session_id = session_data["session_id"]

    # 3. Desktop polls status (should be unauthorized)
    response = client.get(f"/api/auth/qr/status/{session_id}")
    assert response.status_code == 200
    status_data = response.json()
    assert status_data["is_authorized"] is False

    # 4. Mobile phone (authenticated) authorizes the session
    response = client.post("/api/auth/qr/authorize", json={"session_id": session_id}, headers=headers)
    assert response.status_code == 200
    assert response.json() == {"message": "Session authorized"}

    # 5. Desktop polls status again (should be authorized now)
    response = client.get(f"/api/auth/qr/status/{session_id}")
    assert response.status_code == 200
    status_data = response.json()
    assert status_data["is_authorized"] is True
    assert "access_token" in status_data
    assert status_data["user"]["username"] == "qr_test_user"

def test_qr_invalid_session():
    fake_session = str(uuid.uuid4())
    response = client.get(f"/api/auth/qr/status/{fake_session}")
    assert response.status_code == 404
