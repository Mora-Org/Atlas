# 🌍 Dynamic CMS Template (Next.js + FastAPI)

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

A **fully open-source**, production-ready Headless CMS template that lets you dynamically create database tables, CRUD interfaces, and public dashboards — all from a sleek admin panel. No placeholders — every schema you design in the UI becomes a **real physical table** in your database.

## ✨ Features

- **Dynamic Table Builder** — Create database tables visually with typed columns (String, Integer, Float, Boolean, DateTime).
- **Multi-Tenant Architecture** — Each admin gets tenant-isolated tables. Moderator accounts for clients.
- **JWT Authentication** — Secure login with role-based access (Admin / Moderator).
- **Customizable Theming** — 6 accent colors × 4 modes (Dark, Light, Dusk, Dawn), saved per user.
- **SQL Script Import** — Upload `.sql` dumps (CREATE TABLE + INSERT) directly from the admin panel.
- **CSV / XLSX Import** — Populate existing tables by uploading spreadsheets.
- **Public / Private Toggle** — Expose specific tables as public read-only APIs with one click.
- **Interactive Dashboard** — Drag-and-drop widgets with chart and table visualizations (exportable as PDF/JPEG/CSV/Excel).

## 🏗 Architecture

```
├── frontend/          → Next.js 14+ (App Router, Tailwind CSS 4, Framer Motion)
│   ├── src/app/       → Pages: login, admin, dashboard, public views
│   └── src/components → AuthContext, ThemeContext, ThemeSwitcher, Widgets
│
├── backend/           → FastAPI + SQLAlchemy (async Python)
│   ├── main.py        → All API routes (CRUD, import, auth, public)
│   ├── auth.py        → JWT authentication & role guards
│   ├── models.py      → User, DynamicTable, DynamicColumn, DynamicRelation
│   ├── schemas.py     → Pydantic validation schemas
│   ├── dynamic_schema.py → Physical table DDL engine
│   └── database.py    → SQLAlchemy engine setup (SQLite or Postgres)
```

## 🚀 Quick Start (Local)

### 1. Backend
```bash
cd backend
python -m venv venv

# Windows
.\venv\Scripts\activate
# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload
```
API runs at `http://localhost:8000`. A master account is automatically created on first launch:
- **Username:** `monochaco`
- **Password:** `bodes123`

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`:
| Route | Description |
|-------|-------------|
| `/login` | Authentication page |
| `/admin` | Admin dashboard (requires login) |
| `/admin/tables` | Table builder & management |
| `/admin/import/sql` | Upload SQL scripts |
| `/admin/import/data` | Upload CSV/XLSX files |
| `/admin/users` | Create moderator accounts (admin only) |
| `/dashboard` | Public interactive dashboard |

---

## ☁️ Production Deployment Guide

### Database (Neon Postgres)
> ⚠️ Do **not** use SQLite in cloud environments — serverless containers are ephemeral and your `.db` file will be lost on restart.

1. Create a free Postgres database on [Neon](https://neon.tech) (or via Vercel Storage).
2. Copy the `DATABASE_URL` connection string.

### Backend → Railway (or Render)
1. Create a new project, connect your GitHub repo.
2. Set **Root Directory** to `backend`.
3. Set **Start Command** to: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add environment variables:
   - `DATABASE_URL` = your Neon Postgres connection string
   - `SECRET_KEY` = a long random string for JWT signing
5. Generate a public domain (e.g. `your-app.up.railway.app`).

### Frontend → Vercel
1. Import the repository, set **Framework** to Next.js, **Root Directory** to `frontend`.
2. Add environment variable:
   - `NEXT_PUBLIC_API_URL` = `https://your-app.up.railway.app`
3. Deploy!

---

## 🎓 Origin Story

This template evolved from a **Scientific Initiation (Undergraduate Research)** project originally built with **Flask, static HTML/CSS, and MySQL**. It has been fully rewritten using industry-standard, state-of-the-art technologies to achieve production-grade reliability and scalability.

## 📄 License

This project is open-source under the [Apache License 2.0](LICENSE).
