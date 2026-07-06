# CLAUDE.md — Dynamic CMS Template

## Meu Papel
Sou **Planejador + Programador** neste stack de 2 IAs (Gemini saiu do time em 2026-06):
- **Claude (eu)** → Planejador e Programador: planejo iterando com o Diretor e escrevo o código
- **TestSprite** → QA: roda testes e valida as entregas

**Fluxo padrão:** Diretor faz request → Claude planeja **rebatendo com o Diretor** (ida e volta até o plano ter todos os detalhes necessários — nada de decidir schema/endpoints sozinho antecipadamente) → plano aprovado vai pra `planning/` → Claude coda → TestSprite testa → Diretor aprova.

**Planejamento:** usar plan mode / discussão iterativa, **sempre com effort ultracode** (orquestração multi-agente) — planejamento sem ultracode não vale. Rebater com o Diretor até o time estar ok com o plano; só então vira execução. Planos continuam enxutos no documento — o detalhe nasce da conversa, não de especulação.

Para rodar o TestSprite: eu rodo direto via MCP/CLI quando disponível na sessão; senão gero o comando pro Diretor rodar no terminal e me passar o output.

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
- `frontend/src/components/ThemeContext.tsx` — 2 modos (light/dark) × 4 acentos (goldenrod/sage/ruby/nectar). Mora editorial. Persistência em `localStorage` (`mora-theme`, `mora-accent`).
- `frontend/src/contexts/TweaksContext.tsx` — density (compact/regular/loose) + terminology + persona override (dev). Aplica `--row-height` CSS var.
- `frontend/src/components/ui/` — primitivos editoriais Mora: Icon, Eyebrow, Hairline, Button, Pill, Card, Field/Input/Select/Textarea, SectionNum, MMonogram, OwlGlyph. Importar via `@/components/ui`.
- `frontend/src/components/TweaksPanel.tsx` — drawer flutuante (dev ou `localStorage.mora-tweaks-enabled='1'` em prod).

## Estado Atual (2026-06)

- **M1, M2, M5, M3, M4, M6, M6.5:** ✅ fechados. Atlas em prod (Vercel + Railway + Supabase, Auth ES256).
- **M7 (Schema Visualizer):** ✅ código em `main` (PR1–PR4 mergeados, `0dc7f7b`). `/admin/schema` read-only: render ER + interação (seleção/painel/busca/drag persistido) + export (PNG + SQL DDL PostgreSQL/SQLite). **Gate Playwright verde 2026-06-15** (`frontend/scripts/validate-schema.mjs`, 24 checks; rodou com SQLite/test-auth local — o gate usa route-mocks + testadmin, não precisa de Supabase; export PNG inspecionado, arestas visíveis). Planos em `planning/milestone_7_*.md`.
- **M-Ops (Observabilidade):** ✅ código completo (F1/F2/F3/F4 em main) + `security.md` oficializado. Falta só ação de plataforma do Diretor (Sentry DSN, `HEALTH_URL`, `CORS_ORIGINS` prod, rotação de segredos pós-M10).
- **Arco planejado:** M-Ops → **M8 (🟢 rebatido 2026-06-15, escopo AMPLO)** → M8.5 → M9 → M10 → M11. M7.5 congelado (vira 1 PR de componentização). Detalhes no [roadmap](planning/roadmap.md); plano do M8 em `planning/milestone_8_media_library.md`.
- **Roadmap geral:** [planning/roadmap.md](planning/roadmap.md).

## Versionamento (regra pros PRs — Diretor, 2026-07-05)

Formato `MAJOR.MINOR.PATCH`. Todo PR declara na descrição a versão que produz + entrada no [patch_notes](planning/patch_notes.md).

- **Feature shipada = +0.1** (minor; zera o patch). No nosso fluxo = fechamento de milestone ou feature standalone. PR de fase intermediária de milestone **não** bumpa — a milestone carimba o +0.1 no fechamento.
- **Bugfix/hotfix = +0.01** (patch, o 3º número). Depois do `.9` continua contando: `1.0.9 → 1.0.10 → 1.0.11 …` (não trava, não vira minor).
- **2.0** só se uma feature enorme mudar completamente o jeito que trabalhamos. Não banalizar major.
- **Âncoras do arco:** hoje = `0.6.0` → M8 fecha `0.7.0` → M8.5 `0.8.0` → M9 `0.9.0` → **M10 carimba a `1.0.0`** (âncora dura: fechamento do M10 = 1.0 independente da contagem) → **M11 = `1.1`** → **M12 = `1.2`**.
- **Lista de patch notes no site** é compromisso da 1.0 (registrado no backlog do roadmap).
- A numeração `1.0.0–1.3.0+` do histórico do patch_notes (era M1–M5) é **legado de changelog interno** — não renumerar; a régua nova vale a partir de 2026-07-05.

## Armadilhas / Design Smells

### Rota dinâmica `/api/{table_name}` conflita com rotas literais (`/api/admins`, `/api/moderators`, etc.)
Starlette casa rotas por **ordem de registro**, não por especificidade — as literais só ganham porque estão declaradas antes da dinâmica (`main.py:1074`). **Rota literal nova de 1 segmento declarada depois desse ponto é engolida pela dinâmica.** Tabelas com nomes reservados também são sombreadas: **NÃO** há trava de palavras reservadas no `POST /tables/` (`main.py:567`, sem validação) — smell aberto, dono no backlog do `security.md`. Considerar prefixo `/api/data/{table_name}` numa milestone futura.

### Schema de sistema é gerenciado por Alembic (desde o M-Ops)
`_safe_migrate` não existe mais e `Base.metadata.create_all()` só roda no conftest do pytest. Em prod, `alembic upgrade head` roda antes do deploy (`main.py:75`). **Tabela de sistema nova exige migration Alembic** — não nasce sozinha no startup.

### `backend/dynamic_template.db` — destrackeado
SQLite local foi destrackeado (PR cleanup pós-M5) e o `.gitignore` já cobre `*.db`. Localmente o arquivo continua existindo e não suja mais diffs.

## Tabelas de Sistema (não são dinâmicas)
`users`, `database_groups`, `moderator_permissions`, `_tables`, `_columns`, `_relations`, `qr_login_sessions`, `_publication_versions`

## Credenciais de Desenvolvimento
Master: `puczaras` / `Zup Paras` (seed automático no startup)

## Variáveis de Ambiente
> Template completo e honesto: [`backend/.env.example`](backend/.env.example) + [`frontend/.env.example`](frontend/.env.example).

| Var | Padrão | Descrição |
|-----|--------|-----------|
| `DATABASE_URL` | SQLite local | PostgreSQL em produção (Supabase/Railway) |
| `SUPABASE_URL` | vazio | Auth Supabase (M4). Vazio em dev → modo test-auth (`test-<user>`) |
| `SUPABASE_SERVICE_ROLE_KEY` | vazio | Idem; obrigatório em prod pra validar JWT |
| `CORS_ORIGINS` | `["*"]` | Lista por vírgula; setar em prod fecha o wildcard (M-Ops F4) |
| `ENABLE_TEST_SEED` | vazio | Seeda `testadmin` em prod (postgres) só se `=1` (M-Ops F4) |
| `SKIP_TEST_SEED` | vazio | Desliga o seed de vez (setado pelo conftest do pytest) |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | URL do backend |
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | vazio | Supabase no front (login) |

*(O antigo `SECRET_KEY` HS256 foi aposentado no M4 — não é mais lido pelo código.)*

## TestSprite — Como Usar
1. Eu gero um comando de terminal
2. Diretor roda no terminal e me passa o output
3. Eu analiso e reporto o resultado

---
## Nota de limpeza de disco (Claude / 2026-06-28)
As pastas recriaveis deste projeto (node_modules, .venv, venv, __pycache__, dist, build, .next, target) podem ter sido removidas para liberar espaco em disco. NAO trate a ausencia delas como problema do projeto -- restaure com o gerenciador de pacotes (npm install / pip install / cargo build). O codigo-fonte e os dados versionados estao intactos.
