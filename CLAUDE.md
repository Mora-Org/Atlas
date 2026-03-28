# CLAUDE.md — Dynamic CMS Template

## Meu Papel
Sou o **Programador** neste stack de 3 IAs:
- **Gemini (Antigravity)** → Planejador: escreve planos em `planning/`
- **Claude (eu)** → Programador: executa os planos, escreve código
- **TestSprite** → QA: roda testes e valida as entregas

**Fluxo padrão:** Diretor faz request → Gemini planeja → Claude coda → TestSprite testa → Diretor aprova.

Para rodar o TestSprite, o Diretor roda o comando no terminal que eu forneço e me passa o output.

## Stack
- **Backend:** FastAPI + SQLAlchemy + SQLite/PostgreSQL (Python 3.13)
- **Frontend:** Next.js (App Router) + TailwindCSS + Framer Motion
- **Auth:** JWT via `python-jose`, bcrypt para hashing
- **Roles:** `master` > `admin` > `moderator` (3 camadas)
- **Multi-tenancy:** tabelas prefixadas `t{admin_id}_nome`

## Como Rodar Localmente
```bash
# Backend
cd backend
python -m uvicorn main:app --reload --port 8000

# Frontend
cd frontend
npm run dev
```

## Arquitetura Chave
- `backend/main.py` — Todos os endpoints FastAPI + rota dinâmica `/api/{table_name}`
- `backend/auth.py` — JWT, bcrypt, QR login, guards de role
- `backend/models.py` — ORM: User, DatabaseGroup, ModeratorPermission, DynamicTable, DynamicColumn, DynamicRelation, QRLoginSession
- `backend/dynamic_schema.py` — Motor DDL físico (cria tabelas reais no banco)
- `frontend/src/components/AuthContext.tsx` — JWT state + QR auth
- `frontend/src/components/ThemeContext.tsx` — 4 modos × 6 cores

## Bugs Conhecidos / Armadilhas

### 1. `String` não importado em `main.py`
`from sqlalchemy import Table, MetaData, insert, select, update, delete, text` — falta `String`.
Usado em `cast(col, String)` dentro de `get_public_records` e na busca global. Gera `NameError` em runtime.

### 2. Rota dinâmica `/api/{table_name}` conflita com `/api/admins`, `/api/moderators`
FastAPI resolve corretamente (literais antes de parâmetros), mas tabelas com nomes `admins`, `moderators` etc. serão sombreadas. Design smell — considerar prefixo `/api/data/{table_name}` futuramente.

### 3. CRUD dinâmico incompleto
`/api/{table_name}` só tem `GET` e `POST`. Faltam `PUT /{id}` e `DELETE /{id}`.

### 4. `login/page.tsx` sem `'use client'`
O arquivo usa `useState`, `useEffect` etc. mas está faltando a diretiva `'use client'` no topo. Next.js App Router exige isso para componentes interativos.

### 5. `_safe_migrate` não inclui `qr_login_sessions` nem `moderator_permissions`
Não é crítico porque `Base.metadata.create_all()` cria essas tabelas. Mas se o DB já existia sem essas tabelas e `create_all` não foi rodado, pode haver problemas. Atentar em databases legadas.

## Tabelas de Sistema (não são dinâmicas)
`users`, `database_groups`, `moderator_permissions`, `_tables`, `_columns`, `_relations`, `qr_login_sessions`

## Credenciais de Desenvolvimento
Master: `puczaras` / `Zup Paras` (seed automático no startup)

## Variáveis de Ambiente
| Var | Padrão | Descrição |
|-----|--------|-----------|
| `DATABASE_URL` | SQLite local | PostgreSQL em produção |
| `SECRET_KEY` | `super-secret-key-123` | Trocar em produção! |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | URL do backend |

## TestSprite — Como Usar
1. Eu gero um comando de terminal
2. Diretor roda no terminal e me passa o output
3. Eu analiso e reporto o resultado
