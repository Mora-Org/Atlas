<div align="center">

```
  /\   /\
 ( ◉ v ◉)
  (      )
 __)    (__
   \__/
```

# Atlas

*Headless CMS open-source para painéis administrativos modernos.*

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-c084fc?style=flat-square&logo=opensourceinitiative&logoColor=white)](https://opensource.org/licenses/Apache-2.0)
[![Built with intention](https://img.shields.io/badge/Built%20with-Inten%C3%A7%C3%A3o-5eead4?style=flat-square)](manifesto.md)
[![Mora Org](https://img.shields.io/badge/Mora-Org-fb7185?style=flat-square)](https://github.com/Mora-Org)

</div>

---

Atlas é um template open-source que deixa você criar tabelas no banco de dados, interfaces CRUD e dashboards públicos diretamente pelo painel admin — sem boilerplate. Cada schema que você define na UI vira uma **tabela física real** no seu banco.

Sinta-se livre para criar seu fork. Seguimos as convenções da licença [Apache 2.0](LICENSE).

---

## Funcionalidades

- **Table Builder visual** — Crie tabelas com colunas tipadas (String, Integer, Float, Boolean, DateTime) sem escrever SQL.
- **Multi-tenant** — Cada admin tem tabelas isoladas com prefixo. Moderadores para clientes.
- **3 níveis de acesso** — Hierarquia `master` → `admin` → `moderador` com permissões granulares por tabela.
- **JWT + QR Auth** — Login com senha ou autorizando via QR Code em dispositivo já logado.
- **Temas** — 6 cores de destaque × 4 modos (Dark, Light, Dusk, Dawn), salvo por usuário.
- **Import SQL / CSV / XLSX** — Suba dumps `.sql` ou planilhas direto pelo painel.
- **Public/Private toggle** — Exponha tabelas como API pública de leitura com um clique.
- **Dashboard interativo** — Widgets com gráficos e tabelas, exportável como PDF/JPEG/CSV/Excel.

---

## Arquitetura

```
├── frontend/              → Next.js (App Router) + TailwindCSS + Framer Motion
│   ├── src/app/           → Páginas: login, admin, dashboard, explorador público
│   └── src/components/    → AuthContext, ThemeContext, ThemeSwitcher, Widgets
│
├── backend/               → FastAPI + SQLAlchemy (Python 3.13)
│   ├── main.py            → Todos os endpoints (CRUD, import, auth, público)
│   ├── auth.py            → JWT, bcrypt, QR auth, guards de role
│   ├── models.py          → User, DatabaseGroup, DynamicTable, DynamicColumn, DynamicRelation
│   ├── schemas.py         → Validação Pydantic
│   ├── dynamic_schema.py  → Motor DDL físico
│   └── database.py        → Engine SQLAlchemy (SQLite ou Postgres)
```

---

## Quick Start

### Backend
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

API sobe em `http://localhost:8000`. Uma conta master é criada automaticamente no primeiro boot:

| Campo | Valor |
|-------|-------|
| Usuário | `puczaras` |
| Senha | `Zup Paras` |

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Acesse `http://localhost:3000`:

| Rota | Descrição |
|------|-----------|
| `/` | Landing page |
| `/login` | Autenticação |
| `/admin` | Painel administrativo |
| `/admin/tables` | Table builder |
| `/admin/import/sql` | Upload de scripts SQL |
| `/admin/import/data` | Upload CSV/XLSX |
| `/admin/users` | Criar moderadores |
| `/explore` | Explorador público de dados |

---

## Deploy em Produção

### Banco de Dados (Neon Postgres)
> SQLite não é adequado em ambientes serverless — containers são efêmeros e o `.db` se perde no restart.

1. Crie um banco gratuito no [Neon](https://neon.tech).
2. Copie a `DATABASE_URL`.

### Backend → Railway (ou Render)
1. Conecte o repositório, defina **Root Directory** como `backend`.
2. **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
3. Variáveis de ambiente:
   - `DATABASE_URL` — string de conexão Neon Postgres
   - `SECRET_KEY` — string aleatória longa para assinar JWTs

### Frontend → Vercel
1. Importe o repo, **Framework:** Next.js, **Root Directory:** `frontend`.
2. Variável de ambiente:
   - `NEXT_PUBLIC_API_URL` — URL do backend no Railway
3. Deploy.

---

## Origem

Atlas nasceu de um projeto de **Iniciação Científica** originalmente escrito em Flask, HTML estático e MySQL. Foi reescrito do zero com tecnologias modernas para ter confiabilidade e escalabilidade em produção.

---

<div align="center">

**[Mora Org](https://github.com/Mora-Org)** · Código com intenção · Open Source com alma

*mora (lat.) — a pausa necessária para que a profundidade aconteça.*

</div>
