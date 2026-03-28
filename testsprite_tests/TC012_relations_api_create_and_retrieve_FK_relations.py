import requests
import uuid

BASE_URL = "http://localhost:8000"
TIMEOUT = 30


def test_relations_api_create_and_retrieve_fk_relations():
    # Step 1) Master login and create admin
    master_login_resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        data={"username": "puczaras", "password": "Zup Paras"},
        timeout=TIMEOUT,
    )
    assert master_login_resp.status_code == 200, master_login_resp.text
    master_token = master_login_resp.json()["access_token"]
    master_headers = {"Authorization": f"Bearer {master_token}"}
    # create unique admin username
    admin_username = f"admin_{uuid.uuid4().hex[:8]}"
    admin_password = "SecurePass123!"
    create_admin_resp = requests.post(
        f"{BASE_URL}/api/admins",
        json={"username": admin_username, "password": admin_password},
        headers=master_headers,
        timeout=TIMEOUT,
    )
    assert create_admin_resp.status_code == 200, create_admin_resp.text
    admin_data = create_admin_resp.json()
    admin_id = admin_data.get("id")
    assert admin_data["username"] == admin_username

    # Step 2) Login as admin
    admin_login_resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        data={"username": admin_username, "password": admin_password},
        timeout=TIMEOUT,
    )
    assert admin_login_resp.status_code == 200, admin_login_resp.text
    admin_token = admin_login_resp.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Helper to create a database group - necessary for table creation group_id
    group_name = f"group_{uuid.uuid4().hex[:8]}"
    create_group_resp = requests.post(
        f"{BASE_URL}/api/database-groups",
        json={"name": group_name, "description": "Group for FK relations test"},
        headers=admin_headers,
        timeout=TIMEOUT,
    )
    assert create_group_resp.status_code == 200, create_group_resp.text
    group = create_group_resp.json()
    group_id = group["id"]

    # Step 2) Admin creates two tables: parent + child
    # Define columns for parent table (simple)
    parent_table_name = f"parent_{uuid.uuid4().hex[:8]}"
    parent_table_payload = {
        "name": parent_table_name,
        "description": "Parent table for FK test",
        "group_id": group_id,
        "is_public": False,
        "columns": [
            {
                "name": "id",
                "data_type": "Integer",
                "is_nullable": False,
                "is_unique": True,
                "is_primary": True,
            },
            {
                "name": "parent_data",
                "data_type": "String",
                "is_nullable": True,
                "is_unique": False,
                "is_primary": False,
            },
        ],
    }
    create_parent_resp = requests.post(
        f"{BASE_URL}/tables/",
        json=parent_table_payload,
        headers=admin_headers,
        timeout=TIMEOUT,
    )
    assert create_parent_resp.status_code == 200, create_parent_resp.text
    parent_table = create_parent_resp.json()
    parent_table_id = parent_table["id"]

    # Define columns for child table including FK ref to parent table
    child_table_name = f"child_{uuid.uuid4().hex[:8]}"
    child_table_payload = {
        "name": child_table_name,
        "description": "Child table for FK test",
        "group_id": group_id,
        "is_public": False,
        "columns": [
            {
                "name": "id",
                "data_type": "Integer",
                "is_nullable": False,
                "is_unique": True,
                "is_primary": True,
            },
            {
                "name": "child_data",
                "data_type": "String",
                "is_nullable": True,
                "is_unique": False,
                "is_primary": False,
            },
            {
                "name": "parent_id",
                "data_type": "Integer",
                "is_nullable": True,
                "is_unique": False,
                "is_primary": False,
                "fk_table": parent_table_name,
                "fk_column": "id",
            },
        ],
    }
    create_child_resp = requests.post(
        f"{BASE_URL}/tables/",
        json=child_table_payload,
        headers=admin_headers,
        timeout=TIMEOUT,
    )
    assert create_child_resp.status_code == 200, create_child_resp.text
    child_table = create_child_resp.json()
    child_table_id = child_table["id"]

    # Step 3) Admin creates relation via POST /api/relations
    relation_name = f"rel_{uuid.uuid4().hex[:8]}"
    relation_payload = {
        "name": relation_name,
        "from_table_id": child_table_id,
        "to_table_id": parent_table_id,
        "relation_type": "foreign_key",
        "from_column_name": "parent_id",
        "to_column_name": "id",
    }
    create_relation_resp = requests.post(
        f"{BASE_URL}/api/relations",
        json=relation_payload,
        headers=admin_headers,
        timeout=TIMEOUT,
    )
    assert create_relation_resp.status_code == 200, create_relation_resp.text
    relation = create_relation_resp.json()
    relation_id = relation.get("id")
    # Verify fields in relation response
    assert relation["name"] == relation_name
    assert relation["from_table_id"] == child_table_id
    assert relation["to_table_id"] == parent_table_id
    assert relation["relation_type"] == "foreign_key"
    assert relation["from_column_name"] == "parent_id"
    assert relation["to_column_name"] == "id"
    assert relation_id is not None

    try:
        # Step 4) Retrieve relations via GET /api/relations/table/{table_name}
        get_relations_resp = requests.get(
            f"{BASE_URL}/api/relations/table/{child_table_name}",
            headers=admin_headers,
            timeout=TIMEOUT,
        )
        assert get_relations_resp.status_code == 200, get_relations_resp.text
        relations_list = get_relations_resp.json()
        # Step 5) Verify response fields in one of the relations match the created relation
        found = False
        for rel in relations_list:
            if rel.get("id") == relation_id:
                found = True
                assert rel["name"] == relation_name
                assert rel["from_table_id"] == child_table_id
                assert rel["to_table_id"] == parent_table_id
                assert rel["relation_type"] == "foreign_key"
                assert rel["from_column_name"] == "parent_id"
                assert rel["to_column_name"] == "id"
                break
        assert found, "Created relation not found in GET relations response"

    finally:
        # Step 6) Delete relation via DELETE /api/relations/{id}
        delete_relation_resp = requests.delete(
            f"{BASE_URL}/api/relations/{relation_id}",
            headers=admin_headers,
            timeout=TIMEOUT,
        )
        assert delete_relation_resp.status_code == 200, delete_relation_resp.text

        # Step 7) Cleanup: delete child table, parent table, database group, admin user
        delete_table_resp_child = requests.delete(
            f"{BASE_URL}/tables/{child_table_id}",
            headers=admin_headers,
            timeout=TIMEOUT,
        )
        assert delete_table_resp_child.status_code == 200, delete_table_resp_child.text

        delete_table_resp_parent = requests.delete(
            f"{BASE_URL}/tables/{parent_table_id}",
            headers=admin_headers,
            timeout=TIMEOUT,
        )
        assert delete_table_resp_parent.status_code == 200, delete_table_resp_parent.text

        delete_group_resp = requests.delete(
            f"{BASE_URL}/api/database-groups/{group_id}",
            headers=admin_headers,
            timeout=TIMEOUT,
        )
        assert delete_group_resp.status_code == 200, delete_group_resp.text

        delete_admin_resp = requests.delete(
            f"{BASE_URL}/api/admins/{admin_id}",
            headers=master_headers,
            timeout=TIMEOUT,
        )
        assert delete_admin_resp.status_code == 200, delete_admin_resp.text


test_relations_api_create_and_retrieve_fk_relations()
