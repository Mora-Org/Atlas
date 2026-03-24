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
