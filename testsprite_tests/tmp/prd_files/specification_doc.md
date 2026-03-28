# Dynamic CMS Template — Product Specification Document

## Overview

Dynamic CMS Template is a full-stack Headless CMS with a physical DDL engine. Unlike traditional CMSs with fixed data models, administrators design their own database schemas through a visual interface. The backend generates real SQL DDL and executes it against a connected database, instantly exposing full CRUD APIs for each table — without writing any code.

**Stack:** FastAPI (Python) backend + Next.js (App Router) frontend + SQLite (dev) / PostgreSQL (prod)

---

## Authentication & Authorization

The system uses **JWT (Bearer Token)** for all authenticated endpoints.

### Login
- `POST /api/auth/login` — returns `{ access_token, token_type, user: { id, username, role } }`
  - **Content-Type MUST be `application/x-www-form-urlencoded`** (OAuth2PasswordRequestForm — NOT JSON)
  - Body: `username=puczaras&password=Zup%20Paras`
  - Example: `requests.post(url, data={"username": "...", "password": "..."})` ← use `data=`, not `json=`
- All protected endpoints require: `Authorization: Bearer <token>`

### Role Hierarchy (3 tiers)
| Role | Capabilities |
|------|-------------|
| **master** | Creates/deletes admins, views all users, cannot create tables directly |
| **admin** | Creates tables, creates moderators, manages database groups, imports data |
| **moderator** | CRUD on tables in permitted database groups |

### Seed Account
On first startup, the system seeds: `username: puczaras`, `password: Zup Paras`, `role: master`

### QR Login
- `POST /api/auth/qr/session` — creates a session (no auth required), returns `{ session_id, expires_at }`
- `GET /api/auth/qr/status/{session_id}` — poll status; returns JWT if authorized
- `POST /api/auth/qr/authorize` — called by authenticated user to approve a QR session

---

## Multi-Tenancy

Every admin has an isolated namespace. Physical table names are prefixed with `t{admin_id}_`. Moderators inherit their parent admin's prefix.

- Admin ID 1 creates table `products` → physical table: `t1_products`
- Admin ID 2 creates table `products` → physical table: `t2_products`
- Moderators of Admin 1 can only access `t1_*` tables

---

## User Management

### Master → Admin
- `POST /api/admins` — create admin (master only)
- `GET /api/admins` — list admins (master only)
- `DELETE /api/admins/{admin_id}` — delete admin (master only)
- `GET /api/all-users` — list all non-master users (master only)

### Admin → Moderator
- `POST /api/moderators` — create moderator (admin only)
- `GET /api/moderators` — list own moderators
- `DELETE /api/moderators/{mod_id}` — delete own moderator
- `POST /api/moderators/{mod_id}/reset-password` — reset moderator password

---

## Database Groups & Permissions

Admins organize tables into named groups. Moderators are granted access to specific groups.

- `POST /api/database-groups` — create group (admin only)
- `GET /api/database-groups` — list accessible groups
- `DELETE /api/database-groups/{group_id}` — delete group
- `POST /api/database-groups/{group_id}/permissions` — grant moderator access to a group
- `DELETE /api/database-groups/{group_id}/permissions/{mod_id}` — revoke access

---

## Dynamic Table Engine (Core Feature)

Admins define columns (name, type, nullable, unique, FK references) and the backend:
1. Creates a physical SQL table with `CREATE TABLE`
2. Registers it in `_tables` and `_columns` metadata
3. Instantly exposes full CRUD at `/api/{table_name}`

### Table Management
- `POST /tables/` — create table with columns (supports FK columns via `fk_table` + `fk_column`)
- `GET /tables/` — list accessible tables (includes column definitions)
- `PATCH /tables/{table_id}/visibility` — toggle public/private

### Supported Column Types
`String`, `Integer`, `Float`, `Boolean`, `DateTime`

### Foreign Key Support
When creating a table, columns can declare FK references:
```json
{ "name": "cargo_id", "data_type": "Integer", "fk_table": "cargos", "fk_column": "id" }
```
Physical `ForeignKeyConstraint` is added at table creation time only (SQLite limitation).

---

## Relations API

- `POST /api/relations` — create logical FK relation record (admin only)
- `GET /api/relations/table/{table_name}` — get all FK relations for a given table
- `DELETE /api/relations/{relation_id}` — delete relation (admin only)

Response format for `GET /api/relations/table/{table_name}`:
```json
[{ "id": 1, "name": "employees_cargo_id_fk", "from_table_name": "employees", "from_column_name": "cargo_id", "to_table_name": "cargos", "to_column_name": "id", "relation_type": "many_to_one" }]
```

---

## Dynamic CRUD (Authenticated)

Full CRUD on any table owned/accessible by the authenticated user.

- `GET /api/{table_name}` — list all records
- `POST /api/{table_name}` — insert record (JSON body)
- `PUT /api/{table_name}/{record_id}` — update record (JSON body, tenant-isolated)
- `DELETE /api/{table_name}/{record_id}` — delete record (tenant-isolated)

**Tenant isolation:** a user cannot access records of tables owned by a different admin.

---

## Public API (No Auth)

Admins can mark tables as public, exposing read-only endpoints.

- `GET /public/tables/` — list all public tables with columns
- `GET /public/api/{table_name}` — get records with filtering, sorting, pagination
  - Query params: `filter_col`, `filter_val`, `filter_op` (eq/neq/contains/gt/lt/gte/lte), `sort`, `order`, `search`, `limit`, `offset`
- `GET /public/api/{table_name}/columns` — get column definitions
- `GET /public/relations/` — list relations between public tables

---

## SQL Script Import

Admins can import `.sql` dumps. Only `CREATE TABLE` and `INSERT INTO` are allowed — `DROP`, `ALTER`, `DELETE`, `TRUNCATE` are blocked.

### Dry-Run (Preview)
- `POST /api/import/sql/dry-run` — parse and validate without executing. Returns per-statement report with statuses: `ok`, `blocked`, `conflict`

### Commit Import
- `POST /api/import/sql` — execute the import. Atomically creates `_tables` + `_columns` metadata after each `CREATE TABLE`. Returns `{ created_tables, inserted_rows, errors }`

---

## CSV / XLSX Import

- `POST /api/import/data/{table_name}` — upload `.csv`, `.xlsx`, or `.xls`. Columns are matched by name; unmatched columns are ignored. Returns `{ inserted_rows, total_rows, matched_columns, errors }`
- **Note for test generation:** Use `.csv` files only in automated tests. `.xlsx` requires the `openpyxl` package which may not be present in all test runner environments. CSV has no external dependencies.

---

## Expected Behaviors & Invariants

1. A user with role `moderator` **cannot** access tables outside their permitted groups → must return `403` or `404`
2. A user with role `master` **cannot** create tables or import data → must return `403`
3. `PUT`/`DELETE` on a record in another tenant's table → must return `403` or `404`
4. Importing a `.sql` with `DROP DATABASE` → dry-run and commit must both block it with status `blocked`
5. Creating a table that already exists → must return `400`
6. Toggling visibility only by the table owner or master
7. QR session expires after 5 minutes → status endpoint returns `400`
8. All physical table names must include tenant prefix — no raw user-defined names in the DB
