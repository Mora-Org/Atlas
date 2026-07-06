import requests
import time
import uuid

BASE_URL = "http://localhost:8000"
ADMIN_TOKEN = "test-testadmin"
HEADERS_ADMIN = {"Authorization": f"Bearer {ADMIN_TOKEN}"}
TIMEOUT = 30


def test_tc008_delete_asset_referenced_returns_409_then_200_when_free():
    # Step 1: Upload asset C (a small PNG file)
    upload_url = f"{BASE_URL}/api/assets/upload"
    png_content = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
        b"\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
        b"\x00\x00\x00\nIDATx\xdacd\xf8\x0f\x00\x01\x05\x01\x02"
        b"\x1a\x0d\x96\xd9\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    files = {"file": ("single_pixel.png", png_content, "image/png")}

    # Upload asset C
    r = requests.post(upload_url, headers=HEADERS_ADMIN, files=files, timeout=TIMEOUT)
    assert r.status_code == 200, f"Asset upload failed with status {r.status_code}"
    asset_c = r.json()
    assert "id" in asset_c and "url" in asset_c and asset_c.get("refcount") == 0
    asset_c_id = asset_c["id"]
    asset_c_url = asset_c["url"]
    # Ensure URL is complete (starts with http)
    assert asset_c_url.startswith("http")

    # Step 2: Create a table with unique random name and one image column
    # Need to create a database group first or find existing group? The PRD allows creating tables with group_id.
    # For simplicity, create a group first, then create a table in that group.
    group_name = f"testgroup_{uuid.uuid4().hex[:8]}"
    group_desc = "Test group for TC008"
    r = requests.post(
        f"{BASE_URL}/api/database-groups", headers=HEADERS_ADMIN, json={"name": group_name, "description": group_desc}, timeout=TIMEOUT
    )
    assert r.status_code == 200, f"Failed to create database group, status {r.status_code}"
    group = r.json()
    group_id = group["id"]

    # Create a table name unique
    table_name = f"testtable_{int(time.time())}_{uuid.uuid4().hex[:6]}"
    table_payload = {
        "name": table_name,
        "description": "Table for TC008 asset reference test",
        "group_id": group_id,
        "is_public": False,
        "columns": [
            {
                "name": "foto",
                "data_type": "image",
                "is_nullable": False,
                "is_unique": False,
                "is_primary": False,
            }
        ],
    }
    r = requests.post(f"{BASE_URL}/tables/", headers=HEADERS_ADMIN, json=table_payload, timeout=TIMEOUT)
    assert r.status_code == 200, f"Failed to create table, status {r.status_code}"
    table = r.json()
    assert table.get("name") == table_name
    table_id = table["id"]

    # Step 3: Insert a record referencing asset C's URL
    record_payload = {"foto": asset_c_url}
    r = requests.post(f"{BASE_URL}/api/{table_name}", headers=HEADERS_ADMIN, json=record_payload, timeout=TIMEOUT)
    assert r.status_code == 200, f"Failed to insert record referencing asset C, status {r.status_code}"
    record = r.json()
    record_id = record["id"]

    # Step 4: DELETE /api/assets/{C.id} expects 409 Conflict due to reference
    r = requests.delete(f"{BASE_URL}/api/assets/{asset_c_id}", headers=HEADERS_ADMIN, timeout=TIMEOUT)
    assert r.status_code == 409, f"Expected 409 when deleting referenced asset, got {r.status_code}"

    # Step 5: DELETE /api/{table}/{record_id} expects 200; this should delete the record referencing asset C
    r = requests.delete(f"{BASE_URL}/api/{table_name}/{record_id}", headers=HEADERS_ADMIN, timeout=TIMEOUT)
    assert r.status_code == 200, f"Failed to delete record referencing asset C, status {r.status_code}"

    # Step 6: DELETE /api/assets/{C.id} now expects 200 (refcount back to 0, asset freed)
    r = requests.delete(f"{BASE_URL}/api/assets/{asset_c_id}", headers=HEADERS_ADMIN, timeout=TIMEOUT)
    assert r.status_code == 200, f"Failed to delete freed asset, status {r.status_code}"

    # Step 7: GET /api/assets does no longer list asset C
    r = requests.get(f"{BASE_URL}/api/assets", headers=HEADERS_ADMIN, timeout=TIMEOUT)
    assert r.status_code == 200, f"Failed to list assets, status {r.status_code}"
    assets_list = r.json()
    # assets_list expected shape: { data: [...], total: n, limit, offset } OR list of assets
    # PRD for GET /api/assets seems to be paginated with keys data, total, limit, offset
    # But some test cases assume array - handle if dict with data or list
    if isinstance(assets_list, dict) and "data" in assets_list:
        assets = assets_list["data"]
    elif isinstance(assets_list, list):
        assets = assets_list
    else:
        assets = []
    # Check asset C id no longer in assets list
    assert all(asset.get("id") != asset_c_id for asset in assets), "Deleted asset C still listed in assets"


test_tc008_delete_asset_referenced_returns_409_then_200_when_free()