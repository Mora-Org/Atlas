import requests

def test_master_forbidden_on_media_endpoints():
    base_url = "http://localhost:8000"
    headers = {
        "Authorization": "Bearer test-puczaras"
    }
    timeout = 30

    # Prepare a small PNG file content (1x1 px black pixel PNG)
    png_bytes = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
        b"\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
        b"\x00\x00\x00\nIDATx\xdacd\xf8\x0f\x00\x01\x05\x01\x02"
        b"\xaf\xbfz\x81\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    files = {
        "file": ("test.png", png_bytes, "image/png")
    }

    # POST /api/assets/upload with master token - expect 403
    try:
        resp_upload = requests.post(
            f"{base_url}/api/assets/upload",
            headers=headers,
            files=files,
            timeout=timeout
        )
    except requests.RequestException as e:
        assert False, f"RequestException during POST /api/assets/upload: {e}"
    assert resp_upload.status_code == 403, f"Expected 403, got {resp_upload.status_code} for POST /api/assets/upload"

    # GET /api/assets with master token - expect 403
    try:
        resp_get_assets = requests.get(
            f"{base_url}/api/assets",
            headers=headers,
            timeout=timeout
        )
    except requests.RequestException as e:
        assert False, f"RequestException during GET /api/assets: {e}"
    assert resp_get_assets.status_code == 403, f"Expected 403, got {resp_get_assets.status_code} for GET /api/assets"

    # POST /api/assets/gc with master token - expect 403
    try:
        resp_gc = requests.post(
            f"{base_url}/api/assets/gc",
            headers=headers,
            timeout=timeout
        )
    except requests.RequestException as e:
        assert False, f"RequestException during POST /api/assets/gc: {e}"
    assert resp_gc.status_code == 403, f"Expected 403, got {resp_gc.status_code} for POST /api/assets/gc"

test_master_forbidden_on_media_endpoints()