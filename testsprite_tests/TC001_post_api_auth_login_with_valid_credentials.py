import requests

BASE_URL = "http://localhost:8000"

def test_post_api_auth_login_with_valid_credentials():
    url = f"{BASE_URL}/api/auth/login"
    payload = {
        "username": "puczaras",
        "password": "Zup Paras"
    }
    headers = {
        "Content-Type": "application/json"
    }
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=30)
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

    assert response.status_code == 200, f"Expected status code 200 but got {response.status_code}"
    try:
        data = response.json()
    except ValueError:
        assert False, "Response is not valid JSON"

    assert "access_token" in data and isinstance(data["access_token"], str) and data["access_token"], "Missing or invalid access_token"
    assert "token_type" in data and isinstance(data["token_type"], str) and data["token_type"], "Missing or invalid token_type"
    assert "user" in data and isinstance(data["user"], dict), "Missing or invalid user object"

    user = data["user"]
    assert "id" in user and isinstance(user["id"], int), "User object missing 'id' or not integer"
    assert "username" in user and user["username"] == "puczaras", f"User username mismatch, expected 'puczaras', got {user.get('username')}"
    assert "role" in user and isinstance(user["role"], str) and user["role"], "User object missing 'role' or invalid"

test_post_api_auth_login_with_valid_credentials()