import requests
from requests.exceptions import RequestException

BASE_URL = "http://localhost:8000"
SQL_DRY_RUN_ENDPOINT = "/api/import/sql/dry-run"
AUTH_LOGIN_ENDPOINT = "/api/auth/login"

# Credentials for admin login (adjust as needed for valid admin user)
ADMIN_CREDENTIALS = {
    "username": "admin",
    "password": "adminpass"
}

def test_post_api_import_sql_dry_run_validate_statements():
    # First get a valid token by logging in
    try:
        login_resp = requests.post(f"{BASE_URL}{AUTH_LOGIN_ENDPOINT}", json=ADMIN_CREDENTIALS, timeout=10)
    except RequestException as e:
        assert False, f"Login request failed with exception: {e}"

    assert login_resp.status_code == 200, f"Login failed with status {login_resp.status_code}"

    try:
        login_json = login_resp.json()
        token = login_json.get("access_token")
    except Exception as e:
        assert False, f"Login response invalid JSON or missing access_token: {e}"

    assert token, "No access_token found in login response"

    headers = {"Authorization": f"Bearer {token}"}

    # Prepare a sample SQL file content for dry-run which should include a mix of allowed and blocked statements.
    # Including a blocked DROP statement and a normal CREATE TABLE statement.
    sql_content = """
    CREATE TABLE test_table (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL
    );
    INSERT INTO test_table (id, name) VALUES (1, 'Test');
    DROP TABLE forbidden_table;
    """

    files = {
        "file": ("test.sql", sql_content, "application/sql")
    }

    try:
        response = requests.post(
            f"{BASE_URL}{SQL_DRY_RUN_ENDPOINT}",
            headers=headers,
            files=files,
            timeout=30,
        )
    except RequestException as e:
        assert False, f"Request failed with exception: {e}"

    # Assert HTTP status code 200
    assert response.status_code == 200, f"Expected status code 200, got {response.status_code}"

    try:
        json_resp = response.json()
    except Exception as e:
        assert False, f"Response is not valid JSON: {e}"

    # Check response keys
    assert "summary" in json_resp, "Response JSON missing 'summary'"
    assert "statements" in json_resp, "Response JSON missing 'statements'"

    summary = json_resp["summary"]
    statements = json_resp["statements"]

    # Validate summary keys and values
    for key in ["total", "ok", "blocked", "conflicts"]:
        assert key in summary, f"Summary missing key '{key}'"
        assert isinstance(summary[key], int), f"Summary '{key}' should be int"

    # The total count should be equal to ok + blocked + conflicts (conflicts might be zero)
    total_calc = summary["ok"] + summary["blocked"] + summary["conflicts"]
    assert summary["total"] == total_calc, (
        f"Summary total ({summary['total']}) != ok + blocked + conflicts ({total_calc})"
    )

    # Validate each statement entry contains required fields and blocked statements are present for DROP
    found_drop_blocked = False
    found_create_ok = False

    for stmt in statements:
        # Check required keys for each statement summary entry
        for k in ["type", "status", "message", "table_name"]:
            assert k in stmt, f"Statement missing key '{k}'"

        stmt_type = stmt["type"].upper() if stmt["type"] else ""
        stmt_status = stmt["status"].lower() if stmt["status"] else ""
        stmt_message = stmt.get("message", "")
        stmt_table = stmt.get("table_name", "")

        # Check that DROP statements are blocked
        if stmt_type == "DROP":
            assert stmt_status == "blocked", "DROP statement should be blocked"
            found_drop_blocked = True

        # Check that CREATE TABLE statement is OK
        if stmt_type == "CREATE" and "TABLE" in stmt_message.upper():
            assert stmt_status == "ok", "CREATE TABLE statement should be ok"
            found_create_ok = True

    assert found_drop_blocked, "No blocked DROP statement found in response"
    assert found_create_ok, "No OK CREATE TABLE statement found in response"


test_post_api_import_sql_dry_run_validate_statements()
