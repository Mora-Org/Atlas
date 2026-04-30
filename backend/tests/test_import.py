"""Tests for SQL and CSV/XLSX import"""
import io


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


def test_moderator_cannot_import_sql(client, admin_token, mod_token):
    """Moderators cannot import SQL scripts (admin-only)"""
    sql_content = "CREATE TABLE hack (id SERIAL);"
    files = {"file": ("hack.sql", io.BytesIO(sql_content.encode()), "application/sql")}
    res = client.post("/api/import/sql", files=files,
                      headers={"Authorization": f"Bearer {mod_token}"})
    assert res.status_code == 403


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
