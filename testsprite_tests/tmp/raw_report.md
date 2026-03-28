
# TestSprite AI Testing Report(MCP)

---

## 1️⃣ Document Metadata
- **Project Name:** dynamic-sql-editor
- **Date:** 2026-03-26
- **Prepared by:** TestSprite AI Team

---

## 2️⃣ Requirement Validation Summary

#### Test TC001 post api auth login with valid credentials
- **Test Code:** [TC001_post_api_auth_login_with_valid_credentials.py](./TC001_post_api_auth_login_with_valid_credentials.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/ee506363-1ea0-41de-800c-c6904470d2d4/1c868589-6952-4cbd-b86d-af26520160d0
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC002 post api auth login with invalid credentials
- **Test Code:** [TC002_post_api_auth_login_with_invalid_credentials.py](./TC002_post_api_auth_login_with_invalid_credentials.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/ee506363-1ea0-41de-800c-c6904470d2d4/6436bcae-ba78-4e97-8a2b-e8a568a50887
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC003 post api auth qr session creation
- **Test Code:** [TC003_post_api_auth_qr_session_creation.py](./TC003_post_api_auth_qr_session_creation.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/ee506363-1ea0-41de-800c-c6904470d2d4/54d20168-40a6-4e1f-ad17-3cbddb8e69fb
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC004 get api auth qr status with authorized session
- **Test Code:** [TC004_get_api_auth_qr_status_with_authorized_session.py](./TC004_get_api_auth_qr_status_with_authorized_session.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/ee506363-1ea0-41de-800c-c6904470d2d4/a8602a0f-8e9c-48f7-b727-4ec8acf78101
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC005 post api auth qr authorize with valid session
- **Test Code:** [TC005_post_api_auth_qr_authorize_with_valid_session.py](./TC005_post_api_auth_qr_authorize_with_valid_session.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/ee506363-1ea0-41de-800c-c6904470d2d4/fcb26a4e-6b6c-4311-b816-37b5f67032cf
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC006 post api admins create and delete admin as master
- **Test Code:** [TC006_post_api_admins_create_and_delete_admin_as_master.py](./TC006_post_api_admins_create_and_delete_admin_as_master.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/ee506363-1ea0-41de-800c-c6904470d2d4/78348de1-066e-4693-888a-7f5ff49c9e64
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC007 post api moderators full lifecycle as admin
- **Test Code:** [TC007_post_api_moderators_full_lifecycle_as_admin.py](./TC007_post_api_moderators_full_lifecycle_as_admin.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 110, in <module>
  File "<string>", line 19, in test_post_api_moderators_full_lifecycle_as_admin
AssertionError: Master login failed: Proxy server error: 

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/ee506363-1ea0-41de-800c-c6904470d2d4/996fdee2-e65a-4cf6-8123-1cfae2b1b79f
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC008 database groups and moderator permissions lifecycle
- **Test Code:** [TC008_database_groups_and_moderator_permissions_lifecycle.py](./TC008_database_groups_and_moderator_permissions_lifecycle.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 156, in <module>
  File "<string>", line 15, in test_TC008_database_groups_and_moderator_permissions_lifecycle
AssertionError: Master login failed: Proxy server error: 

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/ee506363-1ea0-41de-800c-c6904470d2d4/ecf836ef-e489-435a-a715-72b3cd6deb92
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC009 post tables create physical table with FK columns as admin
- **Test Code:** [TC009_post_tables_create_physical_table_with_FK_columns_as_admin.py](./TC009_post_tables_create_physical_table_with_FK_columns_as_admin.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 215, in <module>
  File "<string>", line 19, in test_post_tables_create_physical_table_with_fk_columns_as_admin
AssertionError: Master login failed: Proxy server error: 

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/ee506363-1ea0-41de-800c-c6904470d2d4/7db665ef-8955-48c1-9351-d69a0cddd92a
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC010 dynamic table CRUD with tenant isolation
- **Test Code:** [TC010_dynamic_table_CRUD_with_tenant_isolation.py](./TC010_dynamic_table_CRUD_with_tenant_isolation.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 180, in <module>
  File "<string>", line 44, in test_dynamic_table_crud_with_tenant_isolation
  File "<string>", line 18, in login
AssertionError: Login failed for puczaras: Proxy server error: 

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/ee506363-1ea0-41de-800c-c6904470d2d4/4cc686d3-a744-4608-a655-2f22b59b01fd
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC011 public api list and query public tables
- **Test Code:** [TC011_public_api_list_and_query_public_tables.py](./TC011_public_api_list_and_query_public_tables.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 168, in <module>
  File "<string>", line 94, in test_public_api_list_and_query_public_tables
  File "/var/lang/lib/python3.12/site-packages/requests/models.py", line 1024, in raise_for_status
    raise HTTPError(http_error_msg, response=self)
requests.exceptions.HTTPError: 500 Server Error: Internal Server Error for url: http://localhost:8000/tables/8/visibility

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/ee506363-1ea0-41de-800c-c6904470d2d4/68b1c6ce-91bb-4b48-872b-30e2e1c84c5f
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC012 relations api create and retrieve FK relations
- **Test Code:** [TC012_relations_api_create_and_retrieve_FK_relations.py](./TC012_relations_api_create_and_retrieve_FK_relations.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 222, in <module>
  File "<string>", line 15, in test_relations_api_create_and_retrieve_fk_relations
AssertionError: Proxy server error: 

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/ee506363-1ea0-41de-800c-c6904470d2d4/fda5a46b-b059-4216-9f02-3b800f8424fd
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC013 sql import dry-run and commit with blocked statements
- **Test Code:** [TC013_sql_import_dry_run_and_commit_with_blocked_statements.py](./TC013_sql_import_dry_run_and_commit_with_blocked_statements.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 122, in <module>
  File "<string>", line 17, in test_sql_import_dry_run_and_commit_blocked_statements
AssertionError: Master login failed

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/ee506363-1ea0-41de-800c-c6904470d2d4/e8c17d3d-e2dd-4d4a-be92-e6d393b617c9
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC014 csv import data into existing table
- **Test Code:** [TC014_csv_import_data_into_existing_table.py](./TC014_csv_import_data_into_existing_table.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 197, in <module>
  File "<string>", line 19, in test_tc014_csv_import_data_into_existing_table
AssertionError: Master login failed

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/ee506363-1ea0-41de-800c-c6904470d2d4/ccf575e4-8b74-444c-908d-09d43bd10b40
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---


## 3️⃣ Coverage & Matching Metrics

- **42.86** of tests passed

| Requirement        | Total Tests | ✅ Passed | ❌ Failed  |
|--------------------|-------------|-----------|------------|
| ...                | ...         | ...       | ...        |
---


## 4️⃣ Key Gaps / Risks
{AI_GNERATED_KET_GAPS_AND_RISKS}
---