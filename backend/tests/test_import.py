"""Tests for SQL and CSV/XLSX import"""
import io
import os
import pytest


# SQL Import (CREATE TABLE/INSERT via /api/import/sql) ainda usa o caminho
# legado SQLite (prefixo `t{id}_` em `public`). Refatorar pra schema-per-tenant
# exige reescrever `_parse_sql_statements` (sqlglot) — fora do escopo M3.
# Os testes seguem rodando em SQLite e ficam skipped em Postgres.
pytestmark_sqlite_only = pytest.mark.skipif(
    os.environ.get("DATABASE_URL", "").startswith("postgres"),
    reason="SQL Import legacy path (SQLite-only); refactor fora de M3",
)


@pytestmark_sqlite_only
def test_sql_import(client, admin_token):
    """Admin can import a SQL script with CREATE and INSERT"""
    sql_content = """
CREATE TABLE employees (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    department VARCHAR(50)
);

INSERT INTO employees (name, department) VALUES ('Alice', 'Engineering');
INSERT INTO employees (name, department) VALUES ('Bob', 'Marketing');
"""
    files = {"file": ("test.sql", io.BytesIO(sql_content.encode()), "application/sql")}
    res = client.post("/api/import/sql", files=files,
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    data = res.json()
    assert "employees" in data["created_tables"]
    assert data["inserted_rows"] >= 1


@pytestmark_sqlite_only
def test_sql_import_grava_rotulo_canonico(client, admin_token):
    """B4 — o import por SQL gravava `type(col.type).__name__`, ou seja o nome do
    DIALETO (`VARCHAR`, `INTEGER`, `TEXT`), fora de `ALLOWED_DATA_TYPES`.

    Isso fazia a tabela importada por SQL mentir o tipo pra toda leitura que
    confia no rótulo — e mentir justamente nas tabelas grandes, que são as que
    motivam import. Aqui o teste olha o `_columns` de verdade, não a resposta do
    endpoint (a resposta nunca mostrou o rótulo, foi por isso que passou
    despercebido)."""
    from schemas import ALLOWED_DATA_TYPES

    sql_content = """
CREATE TABLE catalogo (
    id SERIAL PRIMARY KEY,
    titulo VARCHAR(100),
    resumo TEXT,
    paginas INTEGER,
    preco FLOAT,
    esgotado BOOLEAN,
    publicado_em TIMESTAMP
);
"""
    files = {"file": ("catalogo.sql", io.BytesIO(sql_content.encode()), "application/sql")}
    res = client.post("/api/import/sql", files=files,
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200, res.text

    cols = client.get("/tables/", headers={"Authorization": f"Bearer {admin_token}"}).json()
    tabela = next(t for t in cols if t["name"] == "catalogo")
    rotulos = {c["name"]: c["data_type"] for c in tabela["columns"]}

    # nenhum rótulo pode cair fora da whitelist
    fora = {k: v for k, v in rotulos.items() if v not in ALLOWED_DATA_TYPES}
    assert fora == {}, f"rótulos fora da whitelist: {fora}"

    # O rótulo descreve a coluna FÍSICA que existe, não a que o .sql pediu — e
    # em SQLite as duas divergem porque o sqlglot transpila na renderização
    # (medido: `VARCHAR(100)`→`TEXT(100)`, `FLOAT`→`REAL`, `BOOLEAN`→`INTEGER`).
    # Dizer "Boolean" aqui seria voltar a mentir, só que com rótulo bonito: a
    # agregação lê o tipo físico e veria Integer. O rótulo passa a CONCORDAR com
    # ela — é isso que o fix compra.
    assert rotulos["titulo"] == "Text"        # VARCHAR virou TEXT no SQLite
    assert rotulos["resumo"] == "Text"
    assert rotulos["paginas"] == "Integer"
    assert rotulos["preco"] == "Float"        # REAL
    assert rotulos["esgotado"] == "Integer"   # SQLite não tem BOOLEAN nativo
    assert rotulos["publicado_em"] == "DateTime"


def test_csv_import(client, admin_token):
    """Admin can import CSV data into existing table"""
    # First create the table
    client.post("/tables/", json={
        "name": "csv_test",
        "columns": [
            {"name": "name", "data_type": "String", "is_nullable": False, "is_unique": False, "is_primary": False},
            {"name": "score", "data_type": "Integer", "is_nullable": True, "is_unique": False, "is_primary": False}
        ]
    }, headers={"Authorization": f"Bearer {admin_token}"})

    csv_content = "name,score\nAlice,95\nBob,87\nCharlie,92\n"
    files = {"file": ("data.csv", io.BytesIO(csv_content.encode()), "text/csv")}
    res = client.post("/api/import/data/csv_test", files=files,
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    assert res.json()["inserted_rows"] == 3


@pytestmark_sqlite_only
def test_moderator_cannot_import_sql(client, admin_token, mod_token):
    """Moderators cannot import SQL scripts (admin-only)"""
    sql_content = "CREATE TABLE hack (id SERIAL);"
    files = {"file": ("hack.sql", io.BytesIO(sql_content.encode()), "application/sql")}
    res = client.post("/api/import/sql", files=files,
                      headers={"Authorization": f"Bearer {mod_token}"})
    assert res.status_code == 403


@pytestmark_sqlite_only
def test_sql_import_dry_run(client, admin_token):
    """Dry-run parses SQL and reports plan without creating physical tables."""
    sql_content = """
CREATE TABLE dryrun_people (id INTEGER PRIMARY KEY, name VARCHAR(100));
INSERT INTO dryrun_people (id, name) VALUES (1, 'Alice');
"""
    files = {"file": ("plan.sql", io.BytesIO(sql_content.encode()), "application/sql")}
    res = client.post("/api/import/sql/dry-run", files=files,
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    body = res.json()
    assert "summary" in body and "statements" in body
    assert body["summary"]["total"] >= 2
    assert body["summary"]["ok"] >= 2
    # Ensure the table was NOT actually created — a real import would succeed
    tables = client.get("/tables/", headers={"Authorization": f"Bearer {admin_token}"})
    assert not any(t["name"] == "dryrun_people" for t in tables.json())


@pytestmark_sqlite_only
def test_sql_import_destructive(client, admin_token):
    """DROP / ALTER / DELETE statements are blocked and reported."""
    sql_content = """
DROP TABLE users;
DELETE FROM employees;
ALTER TABLE employees ADD COLUMN hacked VARCHAR(10);
CREATE TABLE ok_table (id INTEGER PRIMARY KEY);
"""
    files = {"file": ("destructive.sql", io.BytesIO(sql_content.encode()), "application/sql")}
    res = client.post("/api/import/sql", files=files,
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    body = res.json()
    # The single CREATE should have gone through; DROP/DELETE/ALTER should be in errors
    assert "ok_table" in body.get("created_tables", [])
    assert any("DROP" in e.upper() or "not allowed" in e.lower() for e in body.get("errors", []))
    assert any("DELETE" in e.upper() or "not allowed" in e.lower() for e in body.get("errors", []))
    # The tenant's users table was NOT touched — master login still works
    login = client.post("/api/auth/login", data={"username": "puczaras", "password": "Zup Paras"})
    assert login.status_code == 200


def test_unsupported_file_type(client, admin_token):
    """Unsupported file types are rejected"""
    client.post("/tables/", json={
        "name": "file_test",
        "columns": [{"name": "x", "data_type": "String", "is_nullable": True, "is_unique": False, "is_primary": False}]
    }, headers={"Authorization": f"Bearer {admin_token}"})

    files = {"file": ("data.txt", io.BytesIO(b"hello"), "text/plain")}
    res = client.post("/api/import/data/file_test", files=files,
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 400
