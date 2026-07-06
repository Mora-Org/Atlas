import requests

BASE_URL = "http://localhost:8000"
ADMIN_TOKEN = "test-testadmin"
UPLOAD_ENDPOINT = "/api/assets/upload"
TIMEOUT = 30

def test_upload_svg_and_exe_rejected_with_415():
    headers = {
        "Authorization": f"Bearer {ADMIN_TOKEN}"
    }
    url = BASE_URL + UPLOAD_ENDPOINT

    # Prepare a minimal SVG content
    svg_content = b"""<?xml version="1.0" encoding="UTF-8"?>
    <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <rect width="100" height="100" fill="blue"/>
    </svg>"""

    # Upload with content-type image/svg+xml
    files_svg = {
        "file": ("test.svg", svg_content, "image/svg+xml")
    }
    response_svg = requests.post(url, headers=headers, files=files_svg, timeout=TIMEOUT)
    assert response_svg.status_code == 415, f"Expected 415 for image/svg+xml upload, got {response_svg.status_code}"

    # Prepare a dummy content for application/x-msdownload
    msdownload_content = b"MZP\x00\x02\x00\x00\x00"  # MZ header typical for exe/dll
    files_exe = {
        "file": ("test.exe", msdownload_content, "application/x-msdownload")
    }
    response_exe = requests.post(url, headers=headers, files=files_exe, timeout=TIMEOUT)
    assert response_exe.status_code == 415, f"Expected 415 for application/x-msdownload upload, got {response_exe.status_code}"

test_upload_svg_and_exe_rejected_with_415()