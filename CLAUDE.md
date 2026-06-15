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

## Armadilhas / Design Smells

### Rota dinâmica `/api/{table_name}` conflita com rotas literais (`/api/admins`, `/api/moderators`, etc.)
FastAPI resolve corretamente (literais antes de parâmetros), mas tabelas com nomes reservados serão sombreadas. **NÃO** há trava de palavras reservadas no `POST /tables/` (verificado: `main.py:484-594` sem validação alguma) — smell aberto, dono na F4/F6 do M-Ops. Considerar prefixo `/api/data/{table_name}` numa milestone futura.

### `_safe_migrate` não cobre todas as tabelas legacy
Não é crítico porque `Base.metadata.create_all()` cria as faltantes. Atentar em databases legados.

### `backend/dynamic_template.db` — destrackeado
SQLite local foi destrackeado (PR cleanup pós-M5) e o `.gitignore` já cobre `*.db`. Localmente o arquivo continua existindo e não suja mais diffs.

## Tabelas de Sistema (não são dinâmicas)
`users`, `database_groups`, `moderator_permissions`, `_tables`, `_columns`, `_relations`, `qr_login_sessions`

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
