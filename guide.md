# 📖 Project Guide — Dynamic CMS Template

This guide provides an in-depth explanation of how the Dynamic CMS Template works, including its architecture, data flow, security model, and customization options.

---

## Table of Contents

1. [How It Works (High Level)](#how-it-works)
2. [Authentication & Roles](#authentication--roles)
3. [Multi-Tenancy & Data Isolation](#multi-tenancy--data-isolation)
4. [Dynamic Table Engine](#dynamic-table-engine)
5. [Theming System](#theming-system)
6. [Data Import System](#data-import-system)
7. [Public API & Visibility](#public-api--visibility)
8. [Frontend Architecture](#frontend-architecture)
9. [Backend Architecture](#backend-architecture)
10. [Environment Variables Reference](#environment-variables-reference)

---

## How It Works

The platform is a **Headless CMS** — meaning there is no fixed data model. Instead, administrators design their own database schemas through a visual interface:

1. **Admin logs in** → navigates to the Table Builder.
2. **Defines columns** (name, type, nullable, unique) → clicks "Create Table".
3. The backend **generates real SQL DDL** and executes it against the connected database.
4. A new CRUD interface is **instantly available** at `/admin/data/{table_name}`.
5. The admin can optionally **make the table public**, exposing a read-only API at `/public/api/{table_name}`.

This zero-code approach means any data structure — products, events, customer records, IoT readings — can be modeled and managed without writing a single line of SQL.

---

## Authentication & Roles

### How Login Works

The system uses **JWT (JSON Web Tokens)** for stateless authentication:

```
[User] → POST /api/auth/login (username + password)
       ← { access_token, user: { id, username, role } }
       → All subsequent requests include: Authorization: Bearer <token>
```

### Roles

| Role | Can Create Tables | Can Create Users | Can View Data | Can Toggle Visibility |
|------|-------------------|------------------|---------------|----------------------|
| **Admin** | ✅ | ✅ (moderators only) | ✅ Own tables | ✅ |
| **Moderator** | ❌ | ❌ | ✅ Parent's tables | ❌ |

### Master Account

On first startup, the system automatically creates:
- **Username:** `monochaco`
- **Password:** `bodes123`

> ⚠️ This account can only be created from the database level — there is no public registration endpoint. This is by design for security.

---

## Multi-Tenancy & Data Isolation

Every admin operates in an isolated namespace. When Admin #1 creates a table called `products`, the physical table is stored as `t1_products`. Admin #2's `products` table becomes `t2_products`.

```
Admin 1 → creates "clients" → physical table: t1_clients
Admin 2 → creates "clients" → physical table: t2_clients
```

Moderators created by Admin #1 can only see `t1_*` tables. They cannot access Admin #2's data.

---

## Dynamic Table Engine

The core magic happens in `dynamic_schema.py`:

1. **Column mapping** — User-defined types (`String`, `Integer`, `Float`, `Boolean`, `DateTime`) are mapped to SQLAlchemy column types.
2. **Auto-ID** — If no primary key column is defined, an auto-incrementing `id` column is injected.
3. **Physical DDL** — The `Table` object is created using SQLAlchemy's `MetaData` and executed via `table.create(engine)`.
4. **Metadata registration** — The table name, columns, and owner are stored in the `_tables` and `_columns` metadata tables for the CMS to track.

This dual-layer approach (metadata + physical) allows the frontend to render forms and tables dynamically without hardcoded models.

---

## Theming System

The frontend supports a fully dynamic theming engine with two axes:

### Accent Colors (6 options)
| Color | HSL Value |
|-------|-----------|
| Blue | `220, 90%, 56%` |
| Red | `0, 85%, 55%` |
| Green | `150, 80%, 40%` |
| Yellow | `45, 95%, 55%` |
| Orange | `25, 95%, 55%` |
| Purple | `270, 75%, 55%` |

### Layout Modes (4 options)
| Mode | Description |
|------|-------------|
| **Dark** | Pure black background (`0, 0%, 4%`) |
| **Light** | Clean white background (`0, 0%, 98%`) |
| **Dusk** | Dark blue-gray (`220, 15%, 12%`) |
| **Dawn** | Warm light gray (`30, 10%, 90%`) |

### How It Works

1. CSS custom properties (`--color-primary`, `--color-bg`, etc.) are defined in `globals.css`.
2. `ThemeContext.tsx` reads saved preferences from `localStorage` on mount.
3. On change, it updates the CSS variables on `document.documentElement` — no page reload needed.
4. All components use `hsl(var(--color-*))` for colors, making them automatically reactive.

---

## Data Import System

### SQL Script Import (`/api/import/sql`)

- Accepts `.sql` files via multipart upload.
- Uses `sqlparse` to tokenize and classify statements.
- **Only `CREATE TABLE` and `INSERT INTO` are allowed** — anything else (DROP, ALTER, DELETE) is blocked for security.
- Table names are automatically prefixed with the tenant ID.
- Created tables are registered in the CMS metadata so they appear in the admin panel.

### CSV / XLSX Import (`/api/import/data/{table_name}`)

- Accepts `.csv`, `.xlsx`, or `.xls` files.
- Uses `pandas` to parse the file.
- Column headers in the file are matched against the physical table's columns.
- Unmatched columns are silently ignored.
- Returns a summary: rows inserted, columns matched, errors encountered.

---

## Public API & Visibility

Admins can toggle any table between **public** and **private**:

- `PATCH /tables/{table_id}/visibility` — Flips the `is_public` boolean.
- **Public tables** are accessible without authentication:
  - `GET /public/tables/` — Lists all public tables.
  - `GET /public/api/{table_name}` — Returns all records as JSON.

This is ideal for powering public dashboards, mobile apps, or third-party integrations without exposing the admin panel.

---

## Frontend Architecture

```
src/
├── app/
│   ├── layout.tsx          → Root layout (AuthProvider + ThemeProvider)
│   ├── globals.css         → CSS custom properties & theme defaults
│   ├── login/page.tsx      → JWT login form
│   ├── dashboard/page.tsx  → Public drag-and-drop dashboard
│   └── admin/
│       ├── layout.tsx      → Sidebar nav, auth guard, theme switcher
│       ├── page.tsx        → Admin home
│       ├── tables/         → Table list + create form
│       ├── data/[table]/   → Dynamic CRUD data viewer
│       ├── import/sql/     → SQL script upload
│       ├── import/data/    → CSV/XLSX upload
│       └── users/          → Moderator management
├── components/
│   ├── AuthContext.tsx      → JWT state + login/logout
│   ├── ThemeContext.tsx     → Color + mode state + CSS injection
│   ├── ThemeSwitcher.tsx    → UI for picking colors and modes
│   └── widgets/            → Dashboard chart/table widgets
└── utils/
    └── cn.ts               → Tailwind class merge utility
```

---

## Backend Architecture

```
backend/
├── main.py            → FastAPI app, all routes, CORS, startup seed
├── auth.py            → JWT creation, password hashing, role guards
├── models.py          → SQLAlchemy ORM: User, DynamicTable, DynamicColumn, DynamicRelation
├── schemas.py         → Pydantic request/response validation
├── dynamic_schema.py  → Physical table DDL engine
├── database.py        → Engine creation (SQLite or Postgres via DATABASE_URL)
└── requirements.txt   → Frozen Python dependencies
```

### Key Dependencies
| Package | Purpose |
|---------|---------|
| `fastapi` | Web framework |
| `uvicorn` | ASGI server |
| `sqlalchemy` | ORM + dynamic DDL |
| `python-jose` | JWT token encoding |
| `passlib` + `bcrypt` | Password hashing |
| `sqlparse` | SQL script tokenization |
| `pandas` + `openpyxl` | CSV/Excel parsing |

---

## Environment Variables Reference

### Backend (Railway / Render)
| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string (e.g. from Neon) |
| `SECRET_KEY` | ✅ | JWT signing secret (any long random string) |

### Frontend (Vercel)
| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | ✅ | Full URL to your deployed backend (e.g. `https://app.up.railway.app`) |
