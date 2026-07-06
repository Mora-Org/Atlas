import requests
import time
import uuid


BASE_URL = "http://localhost:8000"
ADMIN_TOKEN = "test-testadmin"
AUTH_HEADER_ADMIN = {"Authorization": f"Bearer {ADMIN_TOKEN}"}
TIMEOUT = 30


def upload_asset(file_bytes: bytes, filename: str, content_type: str):
    files = {
        "file": (filename, file_bytes, content_type)
    }
    resp = requests.post(f"{BASE_URL}/api/assets/upload", headers=AUTH_HEADER_ADMIN, files=files, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Upload asset failed with status {resp.status_code}"
    data = resp.json()
    assert "id" in data and "url" in data and "refcount" in data
    return data


def create_table(name: str):
    url = f"{BASE_URL}/tables/"
    body = {
        "name": name,
        "description": "Test table for TC007",
        "group_id": None,
        "is_public": False,
        "columns": [
            {"name": "titulo", "data_type": "String", "is_nullable": False, "is_unique": False, "is_primary": False},
            {"name": "foto", "data_type": "String", "is_nullable": True, "is_unique": False, "is_primary": False},
        ],
    }
    resp = requests.post(url, json=body, headers=AUTH_HEADER_ADMIN, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Create table failed with status {resp.status_code}"
    return resp.json()


def post_record(table_name: str, data: dict):
    url = f"{BASE_URL}/api/{table_name}"
    resp = requests.post(url, json=data, headers=AUTH_HEADER_ADMIN, timeout=TIMEOUT)
    assert resp.status_code == 200, f"POST record failed with status {resp.status_code}"
    return resp.json()


def get_assets():
    url = f"{BASE_URL}/api/assets"
    resp = requests.get(url, headers=AUTH_HEADER_ADMIN, timeout=TIMEOUT)
    assert resp.status_code == 200, f"GET assets failed with status {resp.status_code}"
    return resp.json()


def put_record(table_name: str, record_id: int, data: dict):
    url = f"{BASE_URL}/api/{table_name}/{record_id}"
    resp = requests.put(url, json=data, headers=AUTH_HEADER_ADMIN, timeout=TIMEOUT)
    assert resp.status_code == 200, f"PUT record failed with status {resp.status_code}"


def get_asset_refcount(asset_id, assets_list: list):
    for asset in assets_list:
        if isinstance(asset, dict) and asset.get("id") == asset_id:
            return asset.get("refcount")
    return None


def delete_table(table_id: int):
    url = f"{BASE_URL}/tables/{table_id}"
    resp = requests.delete(url, headers=AUTH_HEADER_ADMIN, timeout=TIMEOUT)
    # It's possible that delete may not be allowed here; ignore errors for cleanup
    return resp.status_code


def test_TC007_refcount_increments_on_insert_and_swaps_on_update():
    # Prepare unique table name
    unique_table_name = f"tc007_table_{int(time.time()*1000)}_{uuid.uuid4().hex[:6]}"
    table_info = None
    record_id = None
    
    # Upload two png assets A and B
    # Minimal valid PNG header + IHDR chunk (minimal PNG)
    png_data = (
        b"\x89PNG\r\n\x1a\n"
        b"\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\nIDATx\x9cc`\x00\x00\x00\x02\x00\x01"
        b"\xe2!\xbc3\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    asset_a = upload_asset(png_data, "a.png", "image/png")
    asset_b = upload_asset(png_data, "b.png", "image/png")

    try:
        # Create table with unique name and columns [titulo:String, foto:String]
        table_info = create_table(unique_table_name)
        table_name = table_info["name"]
        table_id = table_info["id"]

        # POST /api/{table} with {titulo:"p1", foto: A.url} expects 200
        post_data = {"titulo": "p1", "foto": asset_a["url"]}
        post_resp = post_record(table_name, post_data)
        record_id = post_resp.get("id")
        assert record_id is not None, "Record ID missing after post"

        # GET /api/assets and verify asset A refcount == 1
        assets = get_assets()
        refcount_a = get_asset_refcount(asset_a["id"], assets)
        assert refcount_a == 1, f"Asset A refcount expected 1 but got {refcount_a}"

        # PUT /api/{table}/{record_id} with {foto: B.url} expects 200; verify A refcount==0 and B refcount==1
        put_record(table_name, record_id, {"foto": asset_b["url"]})
        assets = get_assets()
        refcount_a_after = get_asset_refcount(asset_a["id"], assets)
        refcount_b_after = get_asset_refcount(asset_b["id"], assets)
        assert refcount_a_after == 0, f"Asset A refcount expected 0 but got {refcount_a_after}"
        assert refcount_b_after == 1, f"Asset B refcount expected 1 but got {refcount_b_after}"

        # PUT with only {titulo:'renamed'} (no foto key) keeps B refcount == 1
        put_record(table_name, record_id, {"titulo": "renamed"})
        assets = get_assets()
        refcount_b_final = get_asset_refcount(asset_b["id"], assets)
        assert refcount_b_final == 1, f"Asset B refcount expected 1 after rename but got {refcount_b_final}"

    finally:
        # Cleanup: delete record then delete table
        if record_id is not None:
            try:
                requests.delete(f"{BASE_URL}/api/{table_name}/{record_id}", headers=AUTH_HEADER_ADMIN, timeout=TIMEOUT)
            except Exception:
                pass
        if table_info is not None:
            try:
                requests.delete(f"{BASE_URL}/tables/{table_info['id']}?confirm_name={unique_table_name}", headers=AUTH_HEADER_ADMIN, timeout=TIMEOUT)
            except Exception:
                pass
        # Note: assets cannot be deleted in this test because they may be referenced

test_TC007_refcount_increments_on_insert_and_swaps_on_update()
