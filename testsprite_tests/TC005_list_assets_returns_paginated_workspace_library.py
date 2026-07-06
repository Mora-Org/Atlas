import requests
import io

BASE_URL = "http://localhost:8000"
ADMIN_TOKEN = "test-testadmin"
HEADERS = {"Authorization": f"Bearer {ADMIN_TOKEN}"}
TIMEOUT = 30

def test_TC005_list_assets_returns_paginated_workspace_library():
    upload_url = f"{BASE_URL}/api/assets/upload"
    list_url = f"{BASE_URL}/api/assets"

    # Prepare a small valid PNG binary (1x1 pixel transparent png)
    png_bytes = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
        b"\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
        b"\x00\x00\x00\nIDATx\xdac\xf8\x0f\x00\x01\x01\x01\x00"
        b"\x18\xdd\xdc\xdc\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    files = {"file": ("test.png", io.BytesIO(png_bytes), "image/png")}

    asset_id = None

    try:
        # Upload the PNG asset as admin
        r_upload = requests.post(upload_url, headers=HEADERS, files=files, timeout=TIMEOUT)
        assert r_upload.status_code == 200, f"Upload failed with {r_upload.status_code}"
        upload_resp = r_upload.json()

        # Validate upload response schema partially
        asset_id = upload_resp.get("id")
        assert isinstance(asset_id, int) or isinstance(asset_id, str), "Asset id missing or invalid"
        url = upload_resp.get("url")
        assert isinstance(url, str) and url.startswith("http"), "URL missing or invalid"
        mime = upload_resp.get("mime")
        assert mime == "image/png", f"Unexpected mime: {mime}"
        size_bytes = upload_resp.get("size_bytes")
        assert isinstance(size_bytes, int) and size_bytes > 0, "Invalid size_bytes"
        original_name = upload_resp.get("original_name")
        assert original_name == "test.png", "Original name mismatch"
        refcount = upload_resp.get("refcount")
        assert refcount == 0, f"Refcount expected 0 but got {refcount}"

        # GET /api/assets to retrieve paginated library
        r_list = requests.get(list_url, headers=HEADERS, timeout=TIMEOUT)
        assert r_list.status_code == 200, f"List assets failed with {r_list.status_code}"
        list_resp = r_list.json()

        # Validate response shape and required fields
        assert isinstance(list_resp, dict), "Response not a dict"
        assert "data" in list_resp and isinstance(list_resp["data"], list), "'data' missing or not a list"
        assert "total" in list_resp and isinstance(list_resp["total"], int), "'total' missing or not int"
        assert "limit" in list_resp and isinstance(list_resp["limit"], int), "'limit' missing or not int"
        assert "offset" in list_resp and isinstance(list_resp["offset"], int), "'offset' missing or not int"
        assert list_resp["total"] >= 1, "'total' should be at least 1"

        # Check that the uploaded asset is present with refcount 0
        found = False
        for asset in list_resp["data"]:
            if str(asset.get("id")) == str(asset_id):
                found = True
                assert asset.get("refcount") == 0, f"Asset refcount expected 0 but got {asset.get('refcount')}"
                break
        assert found, "Uploaded asset not found in list"

    finally:
        # Cleanup: delete the uploaded asset if created
        if asset_id:
            try:
                delete_url = f"{BASE_URL}/api/assets/{asset_id}"
                r_del = requests.delete(delete_url, headers=HEADERS, timeout=TIMEOUT)
                # Accept 200 or 404 in cleanup, ignore others
                if r_del.status_code not in (200, 404):
                    print(f"Warning: Failed to delete asset {asset_id} with status {r_del.status_code}")
            except Exception as e:
                print(f"Exception during cleanup deleting asset {asset_id}: {e}")

test_TC005_list_assets_returns_paginated_workspace_library()