import requests

def test_get_public_tables_list_all_public_tables_no_auth():
    url = "http://localhost:8000/public/tables/"
    timeout = 30
    try:
        response = requests.get(url, timeout=timeout)
    except requests.RequestException as e:
        assert False, f"Request to {url} failed: {e}"

    assert response.status_code == 200, f"Expected status code 200 but got {response.status_code}"
    try:
        data = response.json()
    except ValueError:
        assert False, "Response is not valid JSON"

    assert isinstance(data, list), "Response JSON is not a list"

    for table in data:
        assert isinstance(table, dict), "Table entry is not a dictionary"
        # Validate required fields per PRD schema for public tables listing
        for key in ['id', 'name', 'description', 'columns']:
            assert key in table, f"Missing key '{key}' in table entry"

        assert isinstance(table['id'], int), "Table id is not an integer"
        assert isinstance(table['name'], str), "Table name is not a string"
        # description can be None or string
        assert (table['description'] is None) or isinstance(table['description'], str), \
            "Table description is not string or None"
        assert isinstance(table['columns'], list), "Table columns is not a list"

        for column in table['columns']:
            assert isinstance(column, dict), "Column entry is not a dictionary"
            # Minimum column keys expected (based on Dynamic CMS Template)
            for colkey in ['name', 'data_type', 'is_nullable', 'is_unique', 'is_primary']:
                assert colkey in column, f"Missing key '{colkey}' in column entry"
            assert isinstance(column['name'], str), "Column name is not a string"
            assert isinstance(column['data_type'], str), "Column data_type is not a string"
            assert isinstance(column['is_nullable'], bool), "Column is_nullable is not a boolean"
            assert isinstance(column['is_unique'], bool), "Column is_unique is not a boolean"
            assert isinstance(column['is_primary'], bool), "Column is_primary is not a boolean"

if True:
    test_get_public_tables_list_all_public_tables_no_auth()