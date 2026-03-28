import requests

BASE_URL = "http://localhost:8000"
TIMEOUT = 30

def test_post_api_auth_qr_authorize_with_valid_session():
    # Step 1: Login as master user to get Bearer token
    login_url = f"{BASE_URL}/api/auth/login"
    login_payload = {
        "username": "puczaras",
        "password": "Zup Paras"
    }
    login_response = requests.post(login_url, json=login_payload, timeout=TIMEOUT)
    assert login_response.status_code == 200, f"Login failed with status {login_response.status_code}"
    login_data = login_response.json()
    assert "access_token" in login_data and "token_type" in login_data and "user" in login_data
    token = login_data["access_token"]
    assert login_data["token_type"].lower() == "bearer"
    assert "id" in login_data["user"] and "username" in login_data["user"] and "role" in login_data["user"]

    headers_auth = {
        "Authorization": f"Bearer {token}"
    }

    # Step 2: Create a new QR login session (no auth required)
    qr_session_url = f"{BASE_URL}/api/auth/qr/session"
    qr_session_response = requests.post(qr_session_url, timeout=TIMEOUT)
    assert qr_session_response.status_code == 200, f"QR session creation failed with status {qr_session_response.status_code}"
    qr_session_data = qr_session_response.json()
    assert "session_id" in qr_session_data and "expires_at" in qr_session_data
    session_id = qr_session_data["session_id"]

    # Step 3: Authorize QR session with valid session_id and authenticated user token
    qr_authorize_url = f"{BASE_URL}/api/auth/qr/authorize"
    qr_authorize_payload = {
        "session_id": session_id
    }
    qr_authorize_response = requests.post(qr_authorize_url, headers=headers_auth, json=qr_authorize_payload, timeout=TIMEOUT)
    assert qr_authorize_response.status_code == 200, f"QR authorize failed with status {qr_authorize_response.status_code}"
    qr_authorize_data = qr_authorize_response.json()
    assert "message" in qr_authorize_data and isinstance(qr_authorize_data["message"], str)

test_post_api_auth_qr_authorize_with_valid_session()