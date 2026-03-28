import requests

BASE_URL = "http://localhost:8000"

def test_post_api_auth_login_with_invalid_credentials():
    url = f"{BASE_URL}/api/auth/login"
    payload = {
        "username": "puczaras",
        "password": "WrongPassword123!"
    }
    headers = {
        "Content-Type": "application/json"
    }
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=30)
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

    assert response.status_code == 401, f"Expected status code 401, got {response.status_code}"
    # Optionally could check response text or json for "Invalid credentials"
    try:
        resp_json = response.json()
        assert isinstance(resp_json, dict), "Response is not a JSON object"
        # Possibly check for error message in response body if present
    except Exception:
        # If response not JSON, it's still acceptable for error
        pass

test_post_api_auth_login_with_invalid_credentials()