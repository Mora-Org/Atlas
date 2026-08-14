"""Dual-engine pytest conftest.

Detecta o backend a partir de `DATABASE_URL`:
- vazio ou começa com `sqlite://` → SQLite in-memory (modo padrão dev).
- começa com `postgres` → conecta no Postgres do `DATABASE_URL`.

Em SQLite o engine é monkey-patchado para um `sqlite://` (in-memory)
com `StaticPool` — isolamento total por test session, sem disk I/O.

Em Postgres usa o engine global já configurado em `database.py`. O
teardown por teste dropa todos os schemas `tenant_*` (RLS objects)
e dá `drop_all/create_all` nas tabelas de sistema. É mais lento que
SQLite (1-2s por teste vs ms), mas é a única forma de cobrir o RLS.
"""
import atexit as _atexit
import os
import re
import shutil as _shutil
import sys
import tempfile as _tempfile

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Disable production-only testadmin seed in main.startup_event.
os.environ["SKIP_TEST_SEED"] = "1"

# M4: força "Supabase não configurado" pra que provision_user vire
# no-op em testes (criação de admin/mod local-only). Auth via header
# fake é mockado abaixo no override de get_current_user.
os.environ.pop("SUPABASE_URL", None)
os.environ.pop("SUPABASE_SERVICE_ROLE_KEY", None)

# B8: diretório de mídia PRÓPRIO desta execução. O fallback local usava um
# caminho fixo (`backend/.media_dev`), então duas suítes concorrentes na mesma
# máquina — rodar SQLite e Postgres em paralelo é o jeito rápido de conferir os
# dois engines — apagavam os arquivos uma da outra, e o `owner_id` coincidia
# porque cada banco numera do 1.
#
# Tem que ser AQUI, antes do primeiro import de `media_storage`: o módulo lê a
# variável uma vez, no import. Setar isto numa fixture chegaria tarde.
os.environ["ATLAS_MEDIA_DEV_DIR"] = _tempfile.mkdtemp(prefix="atlas-media-teste-")
_atexit.register(_shutil.rmtree, os.environ["ATLAS_MEDIA_DEV_DIR"], True)

from database import Base, get_db
import database

_DATABASE_URL = os.environ.get("DATABASE_URL", "")
IS_POSTGRES = _DATABASE_URL.startswith("postgres")

if IS_POSTGRES:
    # Use real engine configurado em database.py (já leu DATABASE_URL).
    engine = database.engine
    TestingSessionLocal = database.SessionLocal
else:
    # SQLite in-memory isolado pra rodada de testes.
    TEST_DATABASE_URL = "sqlite://"
    engine = create_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    database.engine = engine
    database.SessionLocal = TestingSessionLocal
    database.Base.metadata.bind = engine

from main import app


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


def _drop_tenant_tables_sqlite(eng):
    """Dropa physical `t{id}_*` tables que não estão no Base.metadata."""
    import dynamic_schema
    dynamic_schema.metadata.reflect(bind=eng)
    tenant_tables = [
        t for name, t in dynamic_schema.metadata.tables.items()
        if re.match(r"^t\d+_", name)
    ]
    for t in tenant_tables:
        try:
            t.drop(bind=eng)
        except Exception:
            pass
    dynamic_schema.metadata.clear()


def _drop_tenant_schemas_pg(eng):
    """Dropa todos os schemas `tenant_*` (CASCADE). Inclui tabelas, RLS, CHECK."""
    with eng.begin() as conn:
        rows = conn.execute(
            text(
                "SELECT schema_name FROM information_schema.schemata "
                "WHERE schema_name LIKE 'tenant\\_%' ESCAPE '\\'"
            )
        ).fetchall()
        for (schema_name,) in rows:
            conn.execute(text(f'DROP SCHEMA "{schema_name}" CASCADE'))


@pytest.fixture(scope="function", autouse=True)
def setup_db():
    """Cria tabelas antes de cada teste, dropa depois.

    Em Postgres também faz `DROP SCHEMA tenant_* CASCADE` no final pra
    não vazar RLS/CHECK entre testes.
    """
    from auth import create_master_account
    import dynamic_schema

    # Limpa cache de metadata reflectado de testes anteriores.
    dynamic_schema.metadata.clear()

    if IS_POSTGRES:
        # Drop schemas tenant_* antes E depois — defesa contra estado sujo
        # de uma run anterior que tenha crashado.
        _drop_tenant_schemas_pg(engine)
        Base.metadata.drop_all(bind=engine)

    Base.metadata.create_all(bind=engine)

    db = TestingSessionLocal()
    try:
        create_master_account(db)
    finally:
        db.close()

    yield

    if IS_POSTGRES:
        _drop_tenant_schemas_pg(engine)
        Base.metadata.drop_all(bind=engine)
    else:
        _drop_tenant_tables_sqlite(engine)
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
    """M4: master é seedado pelo setup_db (create_master_account).
    Token fake `test-puczaras` é resolvido pelo override_get_current_user."""
    return "test-puczaras"


@pytest.fixture(scope="function")
def admin_token(client, master_token):
    """M4: cria admin local-only (Supabase desconfigurado em testes).
    Token fake `test-testadmin` permite que o admin se autentique."""
    res = client.post(
        "/api/admins",
        json={"username": "testadmin", "password": "admin123", "role": "admin"},
        headers={"Authorization": f"Bearer {master_token}"},
    )
    assert res.status_code == 200, res.text
    return "test-testadmin"


@pytest.fixture(scope="function")
def mod_token(client, admin_token):
    """M4: cria moderator local-only. Token fake `test-testmod`."""
    res = client.post(
        "/api/moderators",
        json={"username": "testmod", "password": "mod123", "role": "moderator"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res.status_code == 200, res.text
    return "test-testmod"
