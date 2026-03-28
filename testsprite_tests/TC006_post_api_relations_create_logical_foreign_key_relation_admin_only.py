import requests

BASE_URL = "http://localhost:8000"
TIMEOUT = 30

# Helper function to get a valid admin token

def get_admin_token(username: str, password: str) -> str:
    login_payload = {"username": username, "password": password}
    resp = requests.post(f"{BASE_URL}/api/auth/login", json=login_payload, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Login failed for admin user, got {resp.status_code}"
    token = resp.json().get("access_token")
    assert token and isinstance(token, str), "Access token not found in login response"
    return token

# Helper function to get a valid non-admin token

def get_non_admin_token(username: str, password: str) -> str:
    login_payload = {"username": username, "password": password}
    resp = requests.post(f"{BASE_URL}/api/auth/login", json=login_payload, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Login failed for non-admin user, got {resp.status_code}"
    token = resp.json().get("access_token")
    assert token and isinstance(token, str), "Access token not found in login response"
    return token


def test_post_api_relations_create_logical_fk_relation_admin_only():
    # Replace with valid credentials for your test environment
    ADMIN_USERNAME = "admin_user"
    ADMIN_PASSWORD = "admin_pass"
    NON_ADMIN_USERNAME = "moderator_user"
    NON_ADMIN_PASSWORD = "moderator_pass"

    admin_token = get_admin_token(ADMIN_USERNAME, ADMIN_PASSWORD)
    non_admin_token = get_non_admin_token(NON_ADMIN_USERNAME, NON_ADMIN_PASSWORD)

    headers_admin = {
        "Authorization": f"Bearer {admin_token}",
        "Content-Type": "application/json"
    }
    headers_non_admin = {
        "Authorization": f"Bearer {non_admin_token}",
        "Content-Type": "application/json"
    }

    # Step 1: Create two tables (physical) as admin to have from_table_id and to_table_id
    created_table_ids = []
    try:
        table1_payload = {
            "name": "test_table_relation_from",
            "description": "Table for relation from",
            "group_id": None,
            "is_public": False,
            "columns": [
                {
                    "name": "id",
                    "data_type": "Integer",
                    "is_nullable": False,
                    "is_unique": True,
                    "is_primary": True
                },
                {
                    "name": "name",
                    "data_type": "String",
                    "is_nullable": True,
                    "is_unique": False,
                    "is_primary": False
                }
            ]
        }
        resp1 = requests.post(f"{BASE_URL}/tables/", json=table1_payload, headers=headers_admin, timeout=TIMEOUT)
        assert resp1.status_code == 200, f"Admin should be able to create table1, got {resp1.status_code}"
        table1 = resp1.json()
        assert "id" in table1 and isinstance(table1["id"], int)
        created_table_ids.append(table1["id"])

        table2_payload = {
            "name": "test_table_relation_to",
            "description": "Table for relation to",
            "group_id": None,
            "is_public": False,
            "columns": [
                {
                    "name": "id",
                    "data_type": "Integer",
                    "is_nullable": False,
                    "is_unique": True,
                    "is_primary": True
                },
                {
                    "name": "description",
                    "data_type": "String",
                    "is_nullable": True,
                    "is_unique": False,
                    "is_primary": False
                }
            ]
        }
        resp2 = requests.post(f"{BASE_URL}/tables/", json=table2_payload, headers=headers_admin, timeout=TIMEOUT)
        assert resp2.status_code == 200, f"Admin should be able to create table2, got {resp2.status_code}"
        table2 = resp2.json()
        assert "id" in table2 and isinstance(table2["id"], int)
        created_table_ids.append(table2["id"])

        relation_payload = {
            "name": "test_logical_fk_relation",
            "from_table_id": table1["id"],
            "to_table_id": table2["id"],
            "relation_type": "foreign_key",
            "from_column_name": "id",
            "to_column_name": "id"
        }
        resp_rel_admin = requests.post(f"{BASE_URL}/api/relations", json=relation_payload, headers=headers_admin, timeout=TIMEOUT)
        assert resp_rel_admin.status_code == 200, f"Admin should be able to create relation, got {resp_rel_admin.status_code}"
        relation_resp = resp_rel_admin.json()
        assert "id" in relation_resp and isinstance(relation_resp["id"], int)
        relation_id = relation_resp["id"]

        resp_rel_non_admin = requests.post(f"{BASE_URL}/api/relations", json=relation_payload, headers=headers_non_admin, timeout=TIMEOUT)
        assert resp_rel_non_admin.status_code == 403, f"Non-admin should receive 403, got {resp_rel_non_admin.status_code}"

    finally:
        try:
            if 'relation_id' in locals():
                requests.delete(f"{BASE_URL}/api/relations/{relation_id}", headers=headers_admin, timeout=TIMEOUT)
        except Exception:
            pass
        for tid in created_table_ids:
            try:
                # Deleting tables endpoint isn't documented in PRD; ignoring cleanup errors
                requests.delete(f"{BASE_URL}/tables/{tid}", headers=headers_admin, timeout=TIMEOUT)
            except Exception:
                pass


test_post_api_relations_create_logical_fk_relation_admin_only()