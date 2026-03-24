import sys
import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Ensure backend modules are importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import Base, get_db
from main import app
from auth import get_password_hash

# Use in-memory SQLite for test isolation
TEST_DATABASE_URL = "sqlite:///./test_temp.db"
engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="function", autouse=True)
def setup_db():
    """Create all tables before each test and drop after"""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client():
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def db_session():
    db = TestingSessionLocal()
    yield db
    db.close()


@pytest.fixture(scope="function")
def master_token(client, db_session):
    """Seed master and return token"""
    import models
    master = models.User(
        username="puczaras",
        password_hash=get_password_hash("Zup Paras"),
        role="master"
    )
    db_session.add(master)
    db_session.commit()

    res = client.post("/api/auth/login", data={"username": "puczaras", "password": "Zup Paras"})
    assert res.status_code == 200
    return res.json()["access_token"]


@pytest.fixture(scope="function")
def admin_token(client, master_token):
    """Create admin via master and return token"""
    res = client.post("/api/admins", json={"username": "testadmin", "password": "admin123", "role": "admin"},
                      headers={"Authorization": f"Bearer {master_token}"})
    assert res.status_code == 200

    login = client.post("/api/auth/login", data={"username": "testadmin", "password": "admin123"})
    assert login.status_code == 200
    return login.json()["access_token"]


@pytest.fixture(scope="function")
def mod_token(client, admin_token):
    """Create moderator via admin and return token"""
    res = client.post("/api/moderators", json={"username": "testmod", "password": "mod123", "role": "moderator"},
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200

    login = client.post("/api/auth/login", data={"username": "testmod", "password": "mod123"})
    assert login.status_code == 200
    return login.json()["access_token"]
