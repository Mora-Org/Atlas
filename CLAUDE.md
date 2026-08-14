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

## Estado Atual (2026-08)

- **M1, M2, M5, M3, M4, M6, M6.5:** ✅ fechados. Atlas em prod (Vercel + Railway + Supabase, Auth ES256).
- **M7 (Schema Visualizer):** ✅ código em `main` (PR1–PR4 mergeados, `0dc7f7b`). `/admin/schema` read-only: render ER + interação (seleção/painel/busca/drag persistido) + export (PNG + SQL DDL PostgreSQL/SQLite). **Gate Playwright verde 2026-06-15** (`frontend/scripts/validate-schema.mjs`, 24 checks; rodou com SQLite/test-auth local — o gate usa route-mocks + testadmin, não precisa de Supabase; export PNG inspecionado, arestas visíveis). Planos em `planning/milestone_7_*.md`.
- **M-Ops (Observabilidade):** ✅ código completo (F1/F2/F3/F4 em main) + `security.md` oficializado. Falta só ação de plataforma do Diretor (Sentry DSN, `HEALTH_URL`, `CORS_ORIGINS` prod, rotação de segredos pós-M10).
- **M8 (Media Library + File Uploads):** ✅ completo — F0–F5 codadas e verificadas (F0–F4 em main; F5 = PR #40, **carimba a 0.7.0 no merge**). Colunas image/file/attachment, `_assets` + refcount, MediaField no DataViewer, mídia no público + copy-at-publish + ZIP com mídia embutida, import que cria tabela de CSV/XLSX, sniffing+quota+GC. Gate Playwright `frontend/scripts/validate-media.mjs` (`npm run gate:media`) verde 2026-07-09. Plano em `planning/milestone_8_media_library.md`.
- **M8.5 (Views, Gráficos & Impressos):** ✅ **FECHADO 2026-08-04 → `0.8.0`.** F1 = agregação server-side (`backend/aggregation.py` + `_views` + `/api/views/me/*`). F2 = gráfico congelado no publish (`backend/chart_svg.py` desenha SVG; recharts é só preview vivo no Studio) + tabela-alternativa a11y no público. F3 = impressos `@media print` (`/{slug}/panfleto` e `/{slug}/academico`, `frontend/src/components/print/`) + proveniência citável (`source` na tabela, editável em `/admin/tables/[id]/edit`). Gates: `npm run gate:charts` (21/07) e `npm run gate:print` (04/08), ambos verdes. Plano em `planning/milestone_8_5_views_graficos_impressos.md`.
- **M9 (Webhooks + API Keys + Audit Log):** 🔵 **F1 + F2 CODADAS.**
  - **F1 — trilha de auditoria:** `backend/audit.py` (vocabulário de ações + `Actor` polimórfico) + `_audit_log` (migration `c9a4d17b3e08`) + ~20 hooks. **Regra pra hook novo:** handler sob `tenant_db` usa `audit.record()` (entra na transação, pode levantar); handler cuja mutação já é durável (DDL, `import_sql_script`) usa `audit.record_best_effort()` — audit não derruba operação que funcionou.
  - **F2 — API keys:** `backend/api_keys.py` (puro: token/hash/escopo) + `_api_keys` (migration `d1c73a5e9b40`) + `Principal` no `auth.py` + `tenant_db_principal`/`authorize_table` no `main.py` + `/api/keys/me/*`. **Token = `mora_{prefixo}_{segredo}`**, prefixo indexado + SHA-256 do segredo, reveal-once. **v1 é SÓ-LEITURA**, escopo por tabela, deny-by-default, sem curinga. Alcance: as 4 rotas `/api/{tabela}` + catálogo (`GET /tables/`, `GET /api/views/me`), sempre filtrado pelo escopo. **Key nunca de master** (barrado na criação E na resolução). Leitura via key entra no audit; leitura humana não.
  - **Rota nova alcançável por key** → usar `Depends(tenant_db_principal)` + `authorize_table(...)`, nunca `tenant_db` cru: o wrapper replica o ciclo do GUC. Sem ele, sob FORCE RLS em Postgres, a rota devolve **200 com zero linhas** numa conexão virgem — e **500** numa conexão reciclada, porque o GUC volta como string vazia ao fim de qualquer transação que o setou (B10; a policy usa `NULLIF` desde então, mas o certo continua sendo declarar o tenant).
  - **F3 — webhooks:** `webhooks.py` (payload/assinatura/SSRF), `webhook_crypto.py` (Fernet), `webhook_drain.py` (drenador), `_webhook_endpoints` + `_webhook_deliveries` (migration `e5b81f04c9a2`), `/api/webhooks/me/*` + `POST /api/webhooks/drain`. **A outbox é gravada na MESMA transação da mutação** — nenhum HTTP acontece dentro dela. O drain faz **claim em 2 fases** (marca `in_flight`, commita e SOLTA a conexão, faz o POST fora da transação, grava o desfecho): segurar conexão através de um `requests.post` de 10s estoura o pool 5+10. **O corpo é serializado uma vez e enviado verbatim** — re-serializar reordenaria chaves e quebraria a assinatura no receptor.
  - **Ação de plataforma pendente (sem ela webhook nenhum é entregue):** `ATLAS_WEBHOOK_SIGNING_KEY` e `ATLAS_DRAIN_TOKEN` no backend + `DRAIN_URL`/`DRAIN_TOKEN` no repo. O workflow `webhook-drain.yml` **falha alto** quando não configurado, de propósito.
  - **F4 — fronteira do nome de tabela:** `schemas.validate_table_name` é a régua ÚNICA (`^[a-z][a-z0-9_]*$`, ≤63), aplicada nas 3 portas (endpoint, import de planilha, import por SQL). Reservados são **computados das rotas** (`_compute_reserved_table_names`, preenchido no startup) — não escreva lista à mão, ela atrasa. Só literal de **1 segmento** sombreia: `views`/`keys`/`webhooks` seguem permitidos de propósito.
  - Todas as fases do M9 estão codadas → fecha `0.9.0`. Plano em `planning/milestone_9_webhooks_keys_audit.md`.
- **Arco planejado:** M-Ops → M8 ✅ → M8.5 ✅ → **M9 (em execução)** → M10 (carimba a 1.0) → M11. M7.5 congelado (vira 1 PR de componentização). Detalhes no [roadmap](planning/roadmap.md); M9 já detalhado em `planning/milestone_9_webhooks_keys_audit.md` (F1 com decisões batidas; F2/F3 aguardam o Diretor).
- **Roadmap geral:** [planning/roadmap.md](planning/roadmap.md).

## Versionamento (regra pros PRs — Diretor, 2026-07-05)

Formato `MAJOR.MINOR.PATCH`. Todo PR declara na descrição a versão que produz + entrada no [patch_notes](planning/patch_notes.md).

- **Feature shipada = +0.1** (minor; zera o patch). No nosso fluxo = fechamento de milestone ou feature standalone. PR de fase intermediária de milestone **não** bumpa — a milestone carimba o +0.1 no fechamento.
- **Bugfix/hotfix = +0.01** (patch, o 3º número). Depois do `.9` continua contando: `1.0.9 → 1.0.10 → 1.0.11 …` (não trava, não vira minor).
- **2.0** só se uma feature enorme mudar completamente o jeito que trabalhamos. Não banalizar major.
- **Âncoras do arco:** hoje = `0.8.0` (M8.5 fechado) → M9 `0.9.0` → **M10 carimba a `1.0.0`** (âncora dura: fechamento do M10 = 1.0 independente da contagem) → **M11 = `1.1`** → **M12 = `1.2`**.
- **Lista de patch notes no site** é compromisso da 1.0 (registrado no backlog do roadmap).
- A numeração `1.0.0–1.3.0+` do histórico do patch_notes (era M1–M5) é **legado de changelog interno** — não renumerar; a régua nova vale a partir de 2026-07-05.

## Armadilhas / Design Smells

### Rota dinâmica `/api/{table_name}` conflita com rotas literais (`/api/admins`, `/api/moderators`, etc.)
Starlette casa rotas por **ordem de registro**, não por especificidade — as literais só ganham porque estão declaradas antes da dinâmica (`main.py:1074`). **Rota literal nova de 1 segmento declarada depois desse ponto é engolida pela dinâmica.** Tabelas com nomes reservados também são sombreadas: **NÃO** há trava de palavras reservadas no `POST /tables/` (`main.py:567`, sem validação) — smell aberto, dono no backlog do `security.md`. Considerar prefixo `/api/data/{table_name}` numa milestone futura.

### Schema de sistema é gerenciado por Alembic (desde o M-Ops)
`_safe_migrate` não existe mais e `Base.metadata.create_all()` só roda no conftest do pytest. Em prod, `alembic upgrade head` roda antes do deploy (`main.py:75`). **Tabela de sistema nova exige migration Alembic** — não nasce sozinha no startup.

### O dev (SQLite) NÃO auto-migra — `no such table: _views` é DX, não bug
O app em runtime não roda `create_all` nem alembic (só o conftest do pytest cria schema; prod migra pelo `railway.json`). Quem puxa uma branch com migration nova e reusa o `dynamic_template.db` antigo bate em `no such table: _views` / coluna faltando. **Fix: `backend/venv/Scripts/python -m alembic upgrade head`** antes de subir o uvicorn — obrigatório também antes de rodar qualquer gate Playwright.

### `backend/dynamic_template.db` — destrackeado
SQLite local foi destrackeado (PR cleanup pós-M5) e o `.gitignore` já cobre `*.db`. Localmente o arquivo continua existindo e não suja mais diffs.

## Tabelas de Sistema (não são dinâmicas)
`users`, `database_groups`, `moderator_permissions`, `_tables`, `_columns`, `_relations`, `qr_login_sessions`, `_publication_versions`, `_assets` (M8), `_views` (M8.5), `_audit_log` (M9 F1), `_api_keys` (M9 F2)

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

## Rodar a suíte em Postgres (o CI já roda — isto aqui é o loop rápido)

O conftest é dual-engine desde o M3, mas o default local é SQLite — e **os dois
únicos bugs de infraestrutura que o projeto teve eram PG-only e invisíveis em
SQLite** (BUG-PG01, hang permanente; BUG-PG02, migration morta em banco novo).
RLS, `ENABLE ROW LEVEL SECURITY` e locks de DDL não existem no SQLite.

**Desde o `0.9.2` o CI roda os dois engines** (matriz `sqlite × postgres`) e mais
um job `migrations` que aplica `alembic upgrade head` num banco virgem. Ou seja:
esquecer de rodar PG **não passa mais batido**. Rodar local continua valendo pelo
ciclo curto — descobrir no CI custa 5 min por tentativa.

```powershell
docker start dynamic-cms-pg      # postgres:16, já provisionado (db dynamic_cms / senha devpass)
cd backend
$env:DATABASE_URL="postgresql://postgres:devpass@localhost:5432/dynamic_cms"
venv\Scripts\python.exe -m pytest -q
```

**Desde o `0.9.4` dá pra rodar os dois engines AO MESMO TEMPO** (em dois
terminais, um com `DATABASE_URL` de PG e outro sem): 5m10 de relógio contra ~8
min em sequência. Antes isso produzia um vermelho aleatório num teste de mídia
que não era regressão nenhuma — era o B8, diretório de mídia compartilhado.

Última medição: **416 passed / 10 skipped / 0 failed** em 4:41 (PG 16.14,
2026-08-14); SQLite no mesmo commit: 412 / 14. Os conjuntos de `skipped` diferem
por engine — import por SQL é SQLite-only, testes de RLS são PG-only.

**Testes de RLS precisam de role sem bypass.** A role do app tem
`rolbypassrls=TRUE`; qualquer teste de policy que rode como ela é **tautológico**
(foi o que deixou o B10 existir sem nenhum vermelho). `test_rls_raw_bypass.py` e
`test_tenant_policy_b10.py` criam a própria role `NOSUPERUSER NOBYPASSRLS` — não
dependem de setup manual da máquina, e é por isso que rodam em CI.

## Gates do frontend (`0.9.2`)

- `npx tsc --noEmit` — **bloqueante no CI**, mede 0. O `ignoreBuildErrors` do
  `next.config.ts` foi desligado: era ele que escondia o B1 em produção.
- `npm run lint:catraca` — **catraca**, não gate zero. Trava a dívida de lint em
  38 errors / 6 warnings. Regressão nova quebra; limpeza obriga a **abaixar a
  baseline** em `frontend/scripts/lint-ratchet.mjs` (o script falha se você
  melhorar e não abaixar — folga não vira espaço pra crescer de novo).
- `npm run check:fontes` — barra `next/font/google` e URLs do Google. Ver abaixo.

## Fontes: versionadas, nunca de CDN (`0.9.3`, B14)

Os 29 `.woff2` (subset `latin`) moram em `frontend/src/fonts/` e são a **única**
origem de fonte do projeto: o `layout.tsx` os declara ao `next/font/local` e o
ZIP do export os lê do disco. Nem o build nem o runtime falam com a rede por
fonte — o `next/font/google` derrubou o CI, e o export baixava em produção e
fazia `throw` na falha.

**Pra adicionar uma família são 3 passos, nesta ordem:** `scripts/fetch-fonts.mjs`
(baixa) → `src/lib/fontManifest.ts` (declara) → `npm run test` (o
`fontManifest.test.ts` confere que toda combinação que o Publish Studio produz
resolve pra um arquivo que existe). Pular o passo 2 não quebra o build: o ZIP sai
**sem a fonte, calado**. É por isso que o teste lê o espaço de opções do
`PublishContext` em vez de uma lista copiada.

Dois detalhes que não são óbvios e já custaram tempo:
- `adjustFontFallback` precisa ser **explícito** por família — o default do
  `next/font/local` é `'Arial'`, e serifada com métrica de sans muda o salto de
  layout durante o carregamento.
- `outputFileTracingIncludes` no `next.config.ts` é o que faz os arquivos
  acompanharem a rota de export no bundle serverless. Sem ele funciona em dev e
  falha na Vercel.

A licença (SIL OFL 1.1) vai junto: `src/fonts/LICENSES.md` no repo e
`assets/fonts/LICENSES.md` dentro de cada ZIP — a OFL exige o texto junto das
cópias, e o ZIP redistribui os arquivos pro cliente.

## TestSprite — Como Usar
1. Eu gero um comando de terminal
2. Diretor roda no terminal e me passa o output
3. Eu analiso e reporto o resultado

---
## Nota de limpeza de disco (Claude / 2026-06-28)
As pastas recriaveis deste projeto (node_modules, .venv, venv, __pycache__, dist, build, .next, target) podem ter sido removidas para liberar espaco em disco. NAO trate a ausencia delas como problema do projeto -- restaure com o gerenciador de pacotes (npm install / pip install / cargo build). O codigo-fonte e os dados versionados estao intactos.
