import requests
import io
import csv

BASE_URL = "http://localhost:8000"
MASTER_USERNAME = "puczaras"
MASTER_PASSWORD = "Zup Paras"
TIMEOUT = 30


def test_tc014_csv_import_data_into_existing_table():
    # Step 1: Master login to get master token
    login_url = f"{BASE_URL}/api/auth/login"
    master_login_resp = requests.post(
        login_url,
        data={"username": MASTER_USERNAME, "password": MASTER_PASSWORD},
        timeout=TIMEOUT,
    )
    assert master_login_resp.status_code == 200, "Master login failed"
    master_token = master_login_resp.json().get("access_token")
    assert master_token, "Master token missing"

    master_headers = {"Authorization": f"Bearer {master_token}"}

    admin_username = "admin_for_csv_import"
    admin_password = "adminStrongPass123!"
    admin_user_id = None
    table_id = None
    table_name = None

    try:
        # Step 1: Master creates admin
        create_admin_url = f"{BASE_URL}/api/admins"
        create_admin_resp = requests.post(
            create_admin_url,
            headers=master_headers,
            json={"username": admin_username, "password": admin_password},
            timeout=TIMEOUT,
        )
        assert create_admin_resp.status_code == 200, f"Admin creation failed: {create_admin_resp.text}"
        admin_user = create_admin_resp.json()
        admin_user_id = admin_user.get("id")
        assert admin_user_id, "Admin user id missing"

        # Step 2: Login as admin to get admin token
        admin_login_resp = requests.post(
            login_url,
            data={"username": admin_username, "password": admin_password},
            timeout=TIMEOUT,
        )
        assert admin_login_resp.status_code == 200, f"Admin login failed: {admin_login_resp.text}"
        admin_token = admin_login_resp.json().get("access_token")
        assert admin_token, "Admin token missing"
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        # Step 2: Admin creates a table with String columns (name, email)
        # Need group_id - but no mention of groups mandatory, try null or skip if API allows
        # According to PRD, group_id is required. To handle it, create a group first (optional) or try with group_id null.
        # No group creation required per test case instructions, so let's try group_id null or 0

        # Create a group to assign table to (required by POST /tables/)
        # Because group_id required, create a group first
        create_group_url = f"{BASE_URL}/api/database-groups"
        group_payload = {
            "name": "test_group_for_csv_import",
            "description": "Group for CSV import test"
        }
        create_group_resp = requests.post(
            create_group_url,
            headers=admin_headers,
            json=group_payload,
            timeout=TIMEOUT,
        )
        assert create_group_resp.status_code == 200, f"Group creation failed: {create_group_resp.text}"
        group_data = create_group_resp.json()
        group_id = group_data.get("id")
        assert group_id is not None, "Group ID missing"

        # Define table name unique to avoid conflicts
        import uuid
        table_name = f"test_table_{uuid.uuid4().hex[:8]}"

        create_table_url = f"{BASE_URL}/tables/"
        table_payload = {
            "name": table_name,
            "description": "Test table for CSV import",
            "group_id": group_id,
            "is_public": False,
            "columns": [
                {
                    "name": "name",
                    "data_type": "String",
                    "is_nullable": False,
                    "is_unique": False,
                    "is_primary": False
                },
                {
                    "name": "email",
                    "data_type": "String",
                    "is_nullable": False,
                    "is_unique": True,
                    "is_primary": False
                }
            ]
        }
        create_table_resp = requests.post(
            create_table_url,
            headers=admin_headers,
            json=table_payload,
            timeout=TIMEOUT,
        )
        assert create_table_resp.status_code == 200, f"Table creation failed: {create_table_resp.text}"
        table_resp = create_table_resp.json()
        table_id = table_resp.get("id")
        assert table_id is not None, "Table ID missing"

        # Step 3: POST /api/import/data/{table_name} with CSV file containing name,email headers
        import_url = f"{BASE_URL}/api/import/data/{table_name}"

        # Prepare CSV content with matching headers name,email and some rows
        csv_file_content = io.StringIO()
        csv_writer = csv.writer(csv_file_content)
        csv_writer.writerow(["name", "email"])
        csv_writer.writerow(["Alice Smith", "alice@example.com"])
        csv_writer.writerow(["Bob Johnson", "bob@example.com"])
        csv_writer.writerow(["Carol Davis", "carol@example.com"])
        csv_file_content.seek(0)

        files = {
            "file": ("test_data.csv", csv_file_content, "text/csv")
        }

        import_resp = requests.post(
            import_url,
            headers=admin_headers,
            files=files,
            timeout=TIMEOUT,
        )
        assert import_resp.status_code == 200, f"CSV import failed: {import_resp.text}"
        import_json = import_resp.json()

        inserted_rows = import_json.get("inserted_rows")
        total_rows = import_json.get("total_rows")
        matched_columns = import_json.get("matched_columns")
        errors = import_json.get("errors")

        assert inserted_rows is not None and inserted_rows > 0, "No rows were inserted"
        assert total_rows == 3, "Total rows count mismatch"
        assert matched_columns is not None and "name" in matched_columns and "email" in matched_columns, \
            "Matched columns do not include expected columns"
        assert isinstance(errors, list), "Errors field missing or wrong type"
        assert len(errors) == 0, f"Errors present during import: {errors}"

        # Step 5: GET /api/{table_name} to confirm data was inserted
        get_records_url = f"{BASE_URL}/api/{table_name}"
        get_resp = requests.get(get_records_url, headers=admin_headers, timeout=TIMEOUT)
        assert get_resp.status_code == 200, f"Fetching table records failed: {get_resp.text}"
        records = get_resp.json()
        assert isinstance(records, list), "Records response is not a list"
        assert len(records) >= inserted_rows, "Inserted rows not found in table records"

        # Verify at least one record matches the imported data
        emails_imported = {"alice@example.com", "bob@example.com", "carol@example.com"}
        emails_in_db = {r.get("email") for r in records if r.get("email") in emails_imported}
        assert len(emails_in_db) == inserted_rows, "Not all inserted records are present in the table"

    finally:
        # Step 6: Cleanup

        # Delete the table
        if table_id:
            del_table_url = f"{BASE_URL}/tables/{table_id}"
            # According to PRD there is no DELETE for /tables/{table_id}, so deleting tables might be unavailable.
            # If not supported, ignore or implement best effort.

            # No DELETE endpoint specified for tables in PRD, likely no DELETE possible, so skip

        # Delete the group
        if group_id:
            del_group_url = f"{BASE_URL}/api/database-groups/{group_id}"
            try:
                del_group_resp = requests.delete(del_group_url, headers=admin_headers, timeout=TIMEOUT)
                assert del_group_resp.status_code == 200, "Failed to delete group during cleanup"
            except Exception:
                pass

        # Delete the admin user
        if admin_user_id:
            del_admin_url = f"{BASE_URL}/api/admins/{admin_user_id}"
            try:
                del_admin_resp = requests.delete(del_admin_url, headers=master_headers, timeout=TIMEOUT)
                assert del_admin_resp.status_code == 200, "Failed to delete admin during cleanup"
            except Exception:
                pass


test_tc014_csv_import_data_into_existing_table()
