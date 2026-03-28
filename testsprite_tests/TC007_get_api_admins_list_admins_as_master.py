import requests

BASE_URL = "http://localhost:8000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
ADMINS_URL = f"{BASE_URL}/api/admins"
TIMEOUT = 30

MASTER_USERNAME = "puczaras"
MASTER_PASSWORD = "Zup Paras"

def test_get_api_admins_list_as_master():
    # Step 1: Login as master user to get access token
    login_payload = {"username": MASTER_USERNAME, "password": MASTER_PASSWORD}
    try:
        login_resp = requests.post(LOGIN_URL, json=login_payload, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Login failed with status code {login_resp.status_code}"
        login_data = login_resp.json()
        access_token = login_data.get("access_token")
        token_type = login_data.get("token_type")
        user = login_data.get("user")
        assert access_token and token_type and user, "Missing access_token, token_type or user in login response"
        assert user.get("role") == "master", f"Logged in user role is not master: {user.get('role')}"
    except requests.RequestException as e:
        assert False, f"Exception during login request: {e}"
    except ValueError:
        assert False, "Failed to decode JSON response from login"

    headers = {"Authorization": f"{token_type} {access_token}"}

    # Step 2: GET /api/admins to list all admin users as master
    try:
        resp = requests.get(ADMINS_URL, headers=headers, timeout=TIMEOUT)
        assert resp.status_code == 200, f"Listing admins failed with status code {resp.status_code}"
        admins_list = resp.json()
        assert isinstance(admins_list, list), "Admins list response is not a list"
        for admin in admins_list:
            assert isinstance(admin, dict), "Each admin should be a dict"
            # Validate keys expected in UserResponse (id, username, role)
            assert "id" in admin, "Admin user missing 'id'"
            assert "username" in admin, "Admin user missing 'username'"
            assert "role" in admin, "Admin user missing 'role'"
            # Also verify role is 'admin' (not master)
            assert admin.get("role") == "admin", f"Non-admin role found in admins list: {admin.get('role')}"
    except requests.RequestException as e:
        assert False, f"Exception during getting admins list: {e}"
    except ValueError:
        assert False, "Failed to decode JSON response from admins list"

test_get_api_admins_list_as_master()