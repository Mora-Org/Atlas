import requests
import time

BASE_URL = "http://localhost:8000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
QR_SESSION_URL = f"{BASE_URL}/api/auth/qr/session"
QR_AUTHORIZE_URL = f"{BASE_URL}/api/auth/qr/authorize"
QR_STATUS_URL = f"{BASE_URL}/api/auth/qr/status"

MASTER_USERNAME = "puczaras"
MASTER_PASSWORD = "Zup Paras"

def test_get_api_auth_qr_status_for_authorized_session():
    try:
        # Step 1: Login as master to get bearer token
        login_resp = requests.post(
            LOGIN_URL,
            json={"username": MASTER_USERNAME, "password": MASTER_PASSWORD},
            timeout=30
        )
        assert login_resp.status_code == 200, f"Login failed with status {login_resp.status_code}"
        login_data = login_resp.json()
        master_token = login_data.get("access_token")
        assert master_token and isinstance(master_token, str), "No access_token in login response"

        headers_auth = {"Authorization": f"Bearer {master_token}"}

        # Step 2: Create new QR session (no auth)
        qr_sess_resp = requests.post(QR_SESSION_URL, timeout=30)
        assert qr_sess_resp.status_code == 200, f"QR session creation failed with status {qr_sess_resp.status_code}"
        qr_sess_data = qr_sess_resp.json()
        session_id = qr_sess_data.get("session_id")
        assert session_id and isinstance(session_id, str), "No session_id in QR session response"

        # Step 3: Authorize the QR session with master token
        authorize_resp = requests.post(
            QR_AUTHORIZE_URL,
            json={"session_id": session_id},
            headers=headers_auth,
            timeout=30
        )
        assert authorize_resp.status_code == 200, f"QR session authorization failed with status {authorize_resp.status_code}"
        authorize_data = authorize_resp.json()
        assert "message" in authorize_data and isinstance(authorize_data["message"], str), "No message in auth response"

        # Step 4: Poll QR session status until authorized or timeout reached (max 10 seconds, poll every 1 sec)
        is_authorized = False
        access_token = None
        response_user = None
        for _ in range(11):
            status_resp = requests.get(f"{QR_STATUS_URL}/{session_id}", timeout=30)
            if status_resp.status_code == 200:
                status_data = status_resp.json()
                if status_data.get("is_authorized") is True:
                    is_authorized = True
                    access_token = status_data.get("access_token")
                    response_user = status_data.get("user")
                    break
            elif status_resp.status_code == 400:
                # Session expired error case
                raise AssertionError("QR session expired unexpectedly during polling")
            elif status_resp.status_code == 404:
                raise AssertionError("QR session not found during polling")
            time.sleep(1)

        assert is_authorized, "QR session never authorized within polling time"
        assert access_token and isinstance(access_token, str), "No access_token returned when authorized"
        assert response_user and isinstance(response_user, dict), "No user info returned when authorized"
        assert "username" in response_user and isinstance(response_user["username"], str), "User info missing username"
        assert "id" in response_user and isinstance(response_user["id"], int), "User info missing id"
        assert "role" in response_user and isinstance(response_user["role"], str), "User info missing role"

    finally:
        # Cleanup: no resources created that need explicit deletion for this test
        pass

test_get_api_auth_qr_status_for_authorized_session()