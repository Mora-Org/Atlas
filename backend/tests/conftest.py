import sys
import os
import re
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Ensure backend modules are importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Disable production-only testadmin seed in main.startup_event so that the
# admin_token fixture below can create `testadmin` without collision.
os.environ["SKIP_TEST_SEED"] = "1"

from database import Base, get_db
import database

from sqlalchemy.pool import StaticPool

# Use in-memory SQLite for test isolation
TEST_DATABASE_URL = "sqlite://"
engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Monkey-patch the global engine and SessionLocal so startup events use the test DB
database.engine = engine
database.SessionLocal = TestingSessionLocal
database.Base.metadata.bind = engine

from main import app
from auth import get_password_hash


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


def _drop_tenant_tables(eng):
    """Drop physical tenant tables (t{id}_* ) that aren't tracked by Base.metadata."""
    import dynamic_schema
    dynamic_schema.metadata.reflect(bind=eng)
    tenant_tables = [
        t for name, t in dynamic_schema.metadata.tables.items()
        if re.match(r'^t\d+_', name)
    ]
    for t in tenant_tables:
        try:
            t.drop(bind=eng)
        except Exception:
            pass
    dynamic_schema.metadata.clear()


@pytest.fixture(scope="function", autouse=True)
def setup_db():
    """Create all tables before each test and drop after."""
    from database import engine, SessionLocal
    from auth import create_master_account
    import dynamic_schema

    # Clear stale metadata cache so physical tables from previous tests don't bleed in
    dynamic_schema.metadata.clear()

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        create_master_account(db)
    finally:
        db.close()

    yield

    _drop_tenant_tables(engine)
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
