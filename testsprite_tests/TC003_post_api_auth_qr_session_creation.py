import requests

BASE_URL = "http://localhost:8000"


def test_post_api_auth_qr_session_creation():
    url = f"{BASE_URL}/api/auth/qr/session"
    headers = {
        "Content-Type": "application/json"
    }

    try:
        response = requests.post(url, headers=headers, timeout=30)
        response.raise_for_status()
    except requests.RequestException as e:
        assert False, f"Request to {url} failed: {e}"

    assert response.status_code == 200, f"Expected status 200, got {response.status_code}"
    json_data = response.json()

    assert "session_id" in json_data, "Response missing 'session_id'"
    assert isinstance(json_data["session_id"], str) and json_data["session_id"], "'session_id' must be a non-empty string"

    assert "expires_at" in json_data, "Response missing 'expires_at'"
    expires_at = json_data["expires_at"]
    assert isinstance(expires_at, str) and expires_at, "'expires_at' must be a non-empty string representing datetime"

    # Optionally, check that expires_at looks like a datetime string (ISO 8601)
    import re
    iso8601_regex = r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}"
    assert re.match(iso8601_regex, expires_at), "'expires_at' does not appear to be an ISO8601 datetime string"


test_post_api_auth_qr_session_creation()