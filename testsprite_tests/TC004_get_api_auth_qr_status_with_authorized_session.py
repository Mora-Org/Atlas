import requests
import time

BASE_URL = "http://localhost:8000"
TIMEOUT = 30

def test_get_api_auth_qr_status_with_authorized_session():
    # Step 1: Login as master user to get access token
    login_url = f"{BASE_URL}/api/auth/login"
    login_payload = {"username": "puczaras", "password": "Zup Paras"}
    resp = requests.post(login_url, json=login_payload, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    login_data = resp.json()
    access_token = login_data.get("access_token")
    assert access_token, "No access_token in login response"

    headers_auth = {"Authorization": f"Bearer {access_token}"}

    # Step 2: Create QR session (no auth required)
    qr_session_url = f"{BASE_URL}/api/auth/qr/session"
    resp = requests.post(qr_session_url, timeout=TIMEOUT)
    assert resp.status_code == 200, f"QR session creation failed: {resp.text}"
    qr_session_data = resp.json()
    session_id = qr_session_data.get("session_id")
    assert session_id, "No session_id in QR session creation response"
    expires_at = qr_session_data.get("expires_at")
    assert expires_at, "No expires_at in QR session creation response"

    # Step 3: Authorize the QR session as the authenticated user
    qr_authorize_url = f"{BASE_URL}/api/auth/qr/authorize"
    authorize_payload = {"session_id": session_id}
    resp = requests.post(qr_authorize_url, json=authorize_payload, headers=headers_auth, timeout=TIMEOUT)
    assert resp.status_code == 200, f"QR authorization failed: {resp.text}"
    authorize_data = resp.json()
    assert "message" in authorize_data, "No message in QR authorize response"

    # Step 4: Poll /api/auth/qr/status/{session_id} until is_authorized=True or timeout
    qr_status_url = f"{BASE_URL}/api/auth/qr/status/{session_id}"
    max_attempts = 10
    authorized = False
    for attempt in range(max_attempts):
        resp = requests.get(qr_status_url, timeout=TIMEOUT)
        if resp.status_code == 200:
            status_data = resp.json()
            if status_data.get("is_authorized") is True:
                authorized = True
                # Validate presence of access_token and user in response
                access_token_qr = status_data.get("access_token")
                user = status_data.get("user")
                assert access_token_qr and isinstance(access_token_qr, str) and access_token_qr != "", \
                    "access_token missing or invalid in QR status response"
                assert user and isinstance(user, dict), "user missing or invalid in QR status response"
                break
            # Not authorized yet, wait and retry
        elif resp.status_code == 400:
            # Session expired
            assert False, f"QR session expired: {resp.text}"
        elif resp.status_code == 404:
            # Session not found
            assert False, f"QR session not found: {resp.text}"
        else:
            assert False, f"Unexpected status code from QR status endpoint: {resp.status_code} - {resp.text}"
        time.sleep(1)  # Wait 1 second between polls

    assert authorized, "QR session was not authorized within expected time"


test_get_api_auth_qr_status_with_authorized_session()