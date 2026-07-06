import requests
import io

def test_TC001_upload_png_asset_returns_200_with_url_and_refcount_zero():
    base_url = "http://localhost:8000"
    upload_url = f"{base_url}/api/assets/upload"
    headers = {
        "Authorization": "Bearer test-testadmin"
    }
    # A minimal valid PNG file byte content (1x1 px)
    png_bytes = (
        b"\x89PNG\r\n\x1a\n"
        b"\x00\x00\x00\rIHDR"
        b"\x00\x00\x00\x01"  # width: 1
        b"\x00\x00\x00\x01"  # height:1
        b"\x08\x06\x00\x00\x00"
        b"\x1f\x15\xc4\x89"
        b"\x00\x00\x00\nIDATx\xdac\xf8\x0f\x00\x01\x01\x01\x00"
        b"\x18\xdd\x8b\xdb"
        b"\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    files = {
        "file": ("test.png", io.BytesIO(png_bytes), "image/png")
    }
    try:
        # POST upload
        response = requests.post(upload_url, headers=headers, files=files, timeout=30)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        # Validate keys present
        for key in ["id", "url", "mime", "size_bytes", "original_name", "refcount"]:
            assert key in data, f"Missing key '{key}' in response JSON"
        # Validate values
        assert data["mime"] == "image/png", f"Expected mime 'image/png', got {data['mime']}"
        assert isinstance(data["size_bytes"], int) and data["size_bytes"] > 0, f"Expected size_bytes >0, got {data['size_bytes']}"
        assert data["original_name"] == "test.png", f"Expected original_name 'test.png', got {data['original_name']}"
        assert data["refcount"] == 0, f"Expected refcount 0, got {data['refcount']}"
        url = data["url"]
        assert url.startswith("http"), f"Expected url starting with 'http', got {url}"

        # GET the returned url without auth, expect 200 and content matches uploaded bytes
        get_response = requests.get(url, timeout=30)
        assert get_response.status_code == 200, f"Expected 200 on GET asset url, got {get_response.status_code}"
        assert get_response.content == png_bytes, "Downloaded file bytes differ from uploaded PNG bytes"
    except requests.RequestException as e:
        assert False, f"HTTP request failed: {e}"

test_TC001_upload_png_asset_returns_200_with_url_and_refcount_zero()