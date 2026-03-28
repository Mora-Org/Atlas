import requests

BASE_URL = "http://localhost:8000"
LOGIN_ENDPOINT = "/api/auth/login"
TIMEOUT = 30


def test_post_api_auth_login_with_valid_and_invalid_credentials():
    url = BASE_URL + LOGIN_ENDPOINT
    headers = {"Content-Type": "application/json"}

    # Valid credentials example (assuming these are valid for test)
    valid_payload = {
        "username": "valid_user",
        "password": "valid_password"
    }
    # Invalid credentials example
    invalid_payload = {
        "username": "invalid_user",
        "password": "wrong_password"
    }

    # Test valid login
    try:
        valid_resp = requests.post(url, json=valid_payload, headers=headers, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request failed for valid credentials: {e}"
    assert valid_resp.status_code == 200, f"Expected 200 for valid credentials, got {valid_resp.status_code}"
    try:
        valid_json = valid_resp.json()
    except ValueError:
        assert False, "Response is not valid JSON for valid credentials"

    # Validate response fields for valid login
    assert "access_token" in valid_json, "Missing access_token in valid login response"
    assert "token_type" in valid_json, "Missing token_type in valid login response"
    user_info = valid_json.get("user")
    assert isinstance(user_info, dict), "Missing or invalid 'user' object in valid login response"
    assert "id" in user_info, "Missing user id in valid login response"
    assert "username" in user_info, "Missing username in valid login response"
    assert "role" in user_info, "Missing role in valid login response"

    # Test invalid login
    try:
        invalid_resp = requests.post(url, json=invalid_payload, headers=headers, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request failed for invalid credentials: {e}"
    assert invalid_resp.status_code == 401, f"Expected 401 for invalid credentials, got {invalid_resp.status_code}"

    # Optionally verify error message for invalid credentials
    try:
        invalid_json = invalid_resp.json()
        error_msg = invalid_json.get("detail") or invalid_json.get("message") or ""
        assert "invalid" in error_msg.lower() or "unauthorized" in error_msg.lower() or error_msg == "", \
            "Unexpected error message for invalid credentials"
    except ValueError:
        # If no JSON body, it's acceptable
        pass


test_post_api_auth_login_with_valid_and_invalid_credentials()