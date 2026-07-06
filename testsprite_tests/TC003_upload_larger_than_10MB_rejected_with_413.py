import requests

def test_upload_larger_than_10MB_rejected_with_413():
    base_url = "http://localhost:8000"
    upload_url = f"{base_url}/api/assets/upload"
    headers = {
        "Authorization": "Bearer test-testadmin"
    }
    # Create payload: file with size 10*1024*1024 + 1 bytes
    size = 10 * 1024 * 1024 + 1
    large_file_content = b"\0" * size
    files = {
        "file": ("large_image.png", large_file_content, "image/png")
    }
    try:
        response = requests.post(upload_url, headers=headers, files=files, timeout=30)
        assert response.status_code == 413, f"Expected status code 413, got {response.status_code}"
    except requests.exceptions.RequestException as e:
        assert False, f"Request to upload large file failed: {e}"

test_upload_larger_than_10MB_rejected_with_413()