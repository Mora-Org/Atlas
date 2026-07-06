import requests
import uuid
import time

BASE_URL = "http://localhost:8000"
HEADERS_ADMIN = {
    "Authorization": "Bearer test-testadmin",
    "Content-Type": "application/json"
}
TIMEOUT = 30


def test_external_url_in_media_column_is_ignored():
    # Step 1: Create a table with UNIQUE random name and an image column
    unique_table_name = f"media_ext_{int(time.time())}_{uuid.uuid4().hex[:8]}"
    create_table_payload = {
        "name": unique_table_name,
        "description": "Test table for external URL in media column ignored",
        "group_id": None,
        "is_public": False,
        "columns": [
            {
                "name": "foto",
                "data_type": "String",
                "is_nullable": True,
                "is_unique": False,
                "is_primary": False
            }
        ]
    }

    table_id = None
    record_id = None
    try:
        # Create the table
        resp = requests.post(
            f"{BASE_URL}/tables/",
            json=create_table_payload,
            headers=HEADERS_ADMIN,
            timeout=TIMEOUT
        )
        assert resp.status_code == 200, f"Expected 200 creating table, got {resp.status_code}"
        table_resp = resp.json()
        table_id = table_resp.get("id")
        assert table_id is not None, "Table ID missing in creation response"

        # Get assets before record insert
        resp_assets_before = requests.get(
            f"{BASE_URL}/api/assets",
            headers=HEADERS_ADMIN,
            timeout=TIMEOUT
        )
        assert resp_assets_before.status_code == 200, f"Expected 200 getting assets before, got {resp_assets_before.status_code}"
        assets_before = resp_assets_before.json()
        # Store asset refcounts keyed by asset id
        asset_refcounts_before = {}
        for asset in assets_before.get("data", []):
            asset_refcounts_before[asset["id"]] = asset.get("refcount", 0)

        # Step 2: POST a record with foto = external URL
        post_record_payload = {
            "foto": "https://i.imgur.com/external.png"
        }
        resp_post_record = requests.post(
            f"{BASE_URL}/api/{unique_table_name}",
            json=post_record_payload,
            headers=HEADERS_ADMIN,
            timeout=TIMEOUT
        )
        assert resp_post_record.status_code == 200, f"Expected 200 posting record with external URL, got {resp_post_record.status_code}"
        post_record_json = resp_post_record.json()
        record_id = post_record_json.get("id")
        assert record_id is not None, "Record ID missing in record creation response"

        # Step 3: GET /api/assets and verify NO asset refcount changed (same as before)
        resp_assets_after = requests.get(
            f"{BASE_URL}/api/assets",
            headers=HEADERS_ADMIN,
            timeout=TIMEOUT
        )
        assert resp_assets_after.status_code == 200, f"Expected 200 getting assets after, got {resp_assets_after.status_code}"
        assets_after = resp_assets_after.json()

        # Compare asset refcounts before and after:
        asset_refcounts_after = {}
        for asset in assets_after.get("data", []):
            asset_refcounts_after[asset["id"]] = asset.get("refcount", 0)

        assert asset_refcounts_before.keys() == asset_refcounts_after.keys(), "Asset sets differ before and after"

        for aid in asset_refcounts_before:
            assert asset_refcounts_before[aid] == asset_refcounts_after[aid], \
                f"Asset ID {aid} refcount changed from {asset_refcounts_before[aid]} to {asset_refcounts_after[aid]}"

    finally:
        # Cleanup: delete the record if created
        if record_id is not None:
            try:
                del_resp = requests.delete(
                    f"{BASE_URL}/api/{unique_table_name}/{record_id}",
                    headers=HEADERS_ADMIN,
                    timeout=TIMEOUT
                )
                assert del_resp.status_code == 200, f"Expected 200 deleting record, got {del_resp.status_code}"
            except Exception:
                pass

        # Cleanup: delete the table if created
        if table_id is not None:
            try:
                del_table_resp = requests.delete(
                    f"{BASE_URL}/tables/{table_id}?confirm_name={unique_table_name}",
                    headers=HEADERS_ADMIN,
                    timeout=TIMEOUT
                )
                assert del_table_resp.status_code == 200, f"Expected 200 deleting table, got {del_table_resp.status_code}"
            except Exception:
                pass


test_external_url_in_media_column_is_ignored()