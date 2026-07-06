import requests
import uuid
import time

BASE_URL = "http://localhost:8000"
ADMIN_TOKEN = "test-testadmin"
HEADERS_ADMIN = {"Authorization": f"Bearer {ADMIN_TOKEN}"}
TIMEOUT = 30

def test_delete_table_decrements_refcounts():
    # Step 1: Upload asset D
    upload_url = f"{BASE_URL}/api/assets/upload"
    png_content = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
        b"\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
        b"\x00\x00\x00\nIDATx\xdacd\xf8\x0f\x00\x01\x01\x01\x00"
        b"\x18\xdd\x05\xfd\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    files = {"file": ("d.png", png_content, "image/png")}
    upload_resp = requests.post(upload_url, headers=HEADERS_ADMIN, files=files, timeout=TIMEOUT)
    assert upload_resp.status_code == 200
    upload_data = upload_resp.json()
    asset_d_id = upload_data["id"]
    asset_d_url = upload_data["url"]
    # Initially refcount should be 0
    assert "refcount" in upload_data
    assert upload_data["refcount"] == 0

    # Step 2: Create a group to assign to the table (needed for table creation)
    group_name = f"group_{uuid.uuid4().hex[:8]}"
    group_payload = {"name": group_name, "description": "Test group for TC010"}
    group_resp = requests.post(f"{BASE_URL}/api/database-groups", headers=HEADERS_ADMIN, json=group_payload, timeout=TIMEOUT)
    assert group_resp.status_code == 200
    group_id = group_resp.json()["id"]

    # Step 3: Create table with unique random name and an image column
    unique_table_name = f"table_{int(time.time())}_{uuid.uuid4().hex[:6]}"
    table_payload = {
        "name": unique_table_name,
        "description": "Table for TC010",
        "group_id": group_id,
        "is_public": False,
        "columns": [
            {
                "name": "foto",
                "data_type": "String",
                "is_nullable": False,
                "is_unique": False,
                "is_primary": False,
            }
        ]
    }
    table_resp = requests.post(f"{BASE_URL}/tables/", headers=HEADERS_ADMIN, json=table_payload, timeout=TIMEOUT)
    assert table_resp.status_code == 200
    table_data = table_resp.json()
    table_id = table_data["id"]

    try:
        # Step 4: Insert a record referencing D.url => refcount of D becomes 1
        record_payload = {"foto": asset_d_url}
        insert_resp = requests.post(f"{BASE_URL}/api/{unique_table_name}", headers=HEADERS_ADMIN, json=record_payload, timeout=TIMEOUT)
        assert insert_resp.status_code == 200
        inserted_id = insert_resp.json().get("id")
        assert inserted_id is not None

        # Step 5: GET /api/assets and verify D refcount == 1
        assets_resp = requests.get(f"{BASE_URL}/api/assets", headers=HEADERS_ADMIN, timeout=TIMEOUT)
        assert assets_resp.status_code == 200
        assets_data = assets_resp.json()
        found_asset_d = next((a for a in assets_data.get("data", []) if a["id"] == asset_d_id), None)
        assert found_asset_d is not None
        assert found_asset_d["refcount"] == 1

        # Step 6: DELETE /tables/{table_id}?confirm_name=<exact table name> expects 200
        delete_resp = requests.delete(f"{BASE_URL}/tables/{table_id}", headers=HEADERS_ADMIN, params={"confirm_name": unique_table_name}, timeout=TIMEOUT)
        assert delete_resp.status_code == 200

        # Step 7: GET /api/assets and verify D refcount == 0
        assets_resp_after = requests.get(f"{BASE_URL}/api/assets", headers=HEADERS_ADMIN, timeout=TIMEOUT)
        assert assets_resp_after.status_code == 200
        assets_data_after = assets_resp_after.json()
        found_asset_d_after = next((a for a in assets_data_after.get("data", []) if a["id"] == asset_d_id), None)
        assert found_asset_d_after is not None
        assert found_asset_d_after["refcount"] == 0

        # Step 8: Create another fresh table with unique random name and image column
        fresh_table_name = f"table_{int(time.time())}_{uuid.uuid4().hex[:6]}"
        fresh_table_payload = {
            "name": fresh_table_name,
            "description": "Table for TC010 - fresh",
            "group_id": group_id,
            "is_public": False,
            "columns": [
                {
                    "name": "foto",
                    "data_type": "String",
                    "is_nullable": False,
                    "is_unique": False,
                    "is_primary": False,
                }
            ]
        }
        fresh_table_resp = requests.post(f"{BASE_URL}/tables/", headers=HEADERS_ADMIN, json=fresh_table_payload, timeout=TIMEOUT)
        assert fresh_table_resp.status_code == 200
        fresh_table_data = fresh_table_resp.json()
        fresh_table_id = fresh_table_data["id"]

        # Step 9: DELETE /tables/{fresh_table_id} with wrong confirm_name returns 400
        wrong_confirm_name = fresh_table_name + "_wrong"
        wrong_delete_resp = requests.delete(f"{BASE_URL}/tables/{fresh_table_id}", headers=HEADERS_ADMIN, params={"confirm_name": wrong_confirm_name}, timeout=TIMEOUT)
        assert wrong_delete_resp.status_code == 400

    finally:
        # Cleanup fresh table if exists
        try:
            requests.delete(f"{BASE_URL}/tables/{fresh_table_id}", headers=HEADERS_ADMIN, params={"confirm_name": fresh_table_name}, timeout=TIMEOUT)
        except Exception:
            pass
        # No cleanup for asset D or first table because deleted already

test_delete_table_decrements_refcounts()