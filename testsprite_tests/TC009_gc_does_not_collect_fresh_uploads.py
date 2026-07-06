import requests
import uuid
import time

ENDPOINT = "http://localhost:8000"
ADMIN_TOKEN = "test-testadmin"
HEADERS_ADMIN = {"Authorization": f"Bearer {ADMIN_TOKEN}"}
TIMEOUT = 30

def test_tc009_gc_does_not_collect_fresh_uploads():
    upload_url = f"{ENDPOINT}/api/assets/upload"
    gc_url = f"{ENDPOINT}/api/assets/gc"
    list_url = f"{ENDPOINT}/api/assets"

    # Prepare a small PNG file content (1x1 pixel PNG)
    png_bytes = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
        b"\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
        b"\x00\x00\x00\nIDATx\x9cc```\x00\x00\x00\x05\x00\x01"
        b"\x0d\n\x2d\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    unique_suffix = uuid.uuid4().hex
    filename = f"fresh_upload_{unique_suffix}.png"

    files = {
        "file": (filename, png_bytes, "image/png")
    }

    # Upload fresh PNG asset as admin
    r_upload = requests.post(upload_url, headers=HEADERS_ADMIN, files=files, timeout=TIMEOUT)
    assert r_upload.status_code == 200, f"Upload failed with status {r_upload.status_code}"
    upload_resp = r_upload.json()
    asset_id = upload_resp.get("id")
    assert asset_id is not None, "No asset id returned after upload"

    try:
        # Call POST /api/assets/gc to trigger garbage collection
        r_gc = requests.post(gc_url, headers=HEADERS_ADMIN, timeout=TIMEOUT)
        assert r_gc.status_code == 200, f"GC POST failed with status {r_gc.status_code}"
        gc_resp = r_gc.json()
        # Expect removed: 0 because fresh upload is not collected
        assert isinstance(gc_resp, dict), "GC response not a JSON object"
        assert gc_resp.get("removed") == 0, f"GC removed count expected 0 but got {gc_resp.get('removed')}"

        # Verify fresh asset still present in GET /api/assets
        r_list = requests.get(list_url, headers=HEADERS_ADMIN, timeout=TIMEOUT)
        assert r_list.status_code == 200, f"GET /api/assets failed with status {r_list.status_code}"
        list_resp = r_list.json()
        # The response is expected to be a list or dict with an array of assets - AS PER PRD unclear,
        # but from test plan expect list or dict containing asset objects with 'id' keys
        # We will check if any asset in list_resp matches the uploaded asset id.
        found = False
        if isinstance(list_resp, list):
            found = any(str(asset.get("id")) == str(asset_id) for asset in list_resp)
        elif isinstance(list_resp, dict):
            # It may be paginated with "data" key per example in TC005
            data = list_resp.get("data")
            if isinstance(data, list):
                found = any(str(asset.get("id")) == str(asset_id) for asset in data)
        else:
            assert False, "Unexpected /api/assets response format"

        assert found, "Fresh uploaded asset not found in /api/assets list after GC"
    finally:
        # Cleanup: delete the uploaded asset
        delete_url = f"{ENDPOINT}/api/assets/{asset_id}"
        r_del = requests.delete(delete_url, headers=HEADERS_ADMIN, timeout=TIMEOUT)
        # Delete may return 200 or 404 (if already deleted), accept both
        assert r_del.status_code in (200, 404), f"Asset delete failed with status {r_del.status_code}"

test_tc009_gc_does_not_collect_fresh_uploads()