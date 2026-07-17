# 📝 Patch Notes

Registro de mudanças, novas funcionalidades e atualizações do sistema.

> **Régua de versão nova (Diretor, 2026-07-05):** a versão do **produto** hoje é `0.6.0` e a `1.0.0` carimba no fechamento do M10 — regra completa no [roadmap](./roadmap.md#versionamento-do-produto-diretor-2026-07-05) e no CLAUDE.md. A numeração `1.0.0–1.3.0+` das entradas abaixo (era M1–M5) é **legado de changelog interno** — não renumerar. Entradas novas usam a régua nova.

## Histórico

### **[26/03/2026] - Versão 1.0.0 (Base Release)**
Esta é a consolidação de todos os commits e desenvolvimentos anteriores ao estabelecimento da equipe.

- ✨ **Dynamic Table Engine**: Implementado sistema que traduz modelos do UI diretamente para DDL (SQLAlchemy) e cria tabelas físicas atreladas ao tenant.
- ✨ **Autenticação & QR Login**: Autenticação stateless via JWT. Implementado também login via escaneamento de QR Code (mobile-to-web).
- ✨ **Dashboard Dinâmico**: Widgets interativos (drag-and-drop) capazes de renderizar gráficos a partir das tabelas públicas. Suporte a exportação (PDF, XLSX).
- ✨ **Sistema de Theming Reativo**: 4 modos de brilho (Light, Dark, Dusk, Dawn) e 6 cores primárias utilizando variáveis CSS injetadas dinamicamente.
- ✨ **Multi-Tenancy Orgânico**: Isolamento de tabelas através de prefixos (`t<admin_id>_tabela`), com suporte a usuários Master, Admin e Moderadores.
- ✨ **Importação de Dados**: Rotas de parse para arquivos `.csv`, `.xlsx` e dumps de SQL (`.sql` contendo apenas `CREATE` e `INSERT`).

### **[26/03/2026] - Versão 1.1.0 (Milestone 1 - Estabilização e CRUD)**
Fechamento do primeiro pacote de manutenções e completude da arquitetura DDL gerada organicamente.

- 🐛 **Correção de Frontend App Router**: Adicionado `use client` nas páginas dependentes de state (`login/page.tsx`).
- 🐛 **Hotfix na API Pública**: Inclusão de conversão nativa (`String` via sqlalchemy) nas buscas globais e filtros.
- 🐛 **Resiliência do Test Engine**: Aplicação de `StaticPool` para o banco de dados em memória do `pytest`, garantindo isolamento confiável nas suítes de teste.
- ✨ **CRUD Data Engine Completo**: Os super-poderes dinâmicos agora contam com verbos `PUT` e `DELETE`.
  - **Backend**: Rotas encapsuladas para update seguro de registros.
  - **Frontend**: Data Tables em `/admin/data/[table]` expandidas com ações embutidas e modals transacionais (Editar e Excluir).
- 🧪 **Teste Automatizado de Auth Mobile**: Construção do fluxo 100% coberto pelo TestSprite garantindo segurança na validação de Tokens do QR Login.

### **[23/04/2026] - Versão 1.2.0 (Milestone 2 - Relações, Import SQL Avançado e Admin V2)**
Fechamento do pacote de relacionamentos entre tabelas dinâmicas, parser robusto de dumps SQL e completude do CRUD genérico. Gate para abrir o Milestone 3 (migração RLS/Supabase).

- 🐛 **BUG-01 fechado — Import SQL Desconectado**: O parser agora intercepta `CREATE TABLE`/`INSERT` via `sqlglot`, reescreve o nome físico com o prefixo do tenant e registra `_tables` + `_columns` em commit atômico ([main.py:859-930](../backend/main.py#L859)). Fim do hack `force_fix_db.py` — tabela importada aparece imediatamente no dashboard.
- 🐛 **BUG-02 fechado — User State UI**: Handlers de `createMod`, `deleteMod` e `resetPassword` em [users/page.tsx](../frontend/src/app/admin/users/page.tsx) chamam `fetchMods()` após cada ação bem-sucedida. Lista atualiza sem refresh manual.
- ✨ **FEAT-01 — Foreign Keys & Relations API + UI**
  - **Modelo**: `DynamicRelation` ganhou `from_column_name` / `to_column_name` ([models.py:81](../backend/models.py#L81)).
  - **API**: CRUD em `/api/relations` (POST), `/api/relations/table/{name}` (GET lookup p/ frontend) e `/api/relations/{id}` (DELETE). Endpoint público `/public/relations/`.
  - **DDL físico**: `create_physical_table` aceita `foreign_keys` e gera `ForeignKeyConstraint` real no backend. Cada FK declarada em `fk_table` / `fk_column` vira um `DynamicRelation` registrado ([main.py:441-452](../backend/main.py#L441)).
  - **UI**: toggle de "Relação Estrangeira" em `/admin/tables/create`; inputs em `/admin/data/[table]` convertidos em `<select>` quando a coluna aponta para outra tabela.
- ✨ **FEAT-02 — Gerenciador Avançado de Import SQL**
  - `/api/import/sql/dry-run` retorna `{summary, statements}` com status `ok`/`blocked`/`conflict` por instrução, sem tocar no banco ([main.py:821-856](../backend/main.py#L821)).
  - `/api/import/sql` retorna `{created_tables, inserted_rows, errors}` em vez de aceitar silenciosamente.
  - Statements que não sejam `CREATE TABLE`/`INSERT` (ex.: `DROP`, `ALTER`, `DELETE`) são explicitamente bloqueados.
- ✨ **FEAT-03 — CRUD Completo de Records Dinâmicos**: `PUT /api/{table_name}/{id}` e `DELETE /api/{table_name}/{id}` com guards por tenant via `get_accessible_tables` ([main.py:694-753](../backend/main.py#L694)).
- 🧪 **Nova cobertura TestSprite**:
  - `test_sql_import_dry_run`, `test_sql_import_destructive` em [tests/test_import.py](../backend/tests/test_import.py).
  - `test_foreign_key_population`, `test_relations_delete` em [tests/test_relations.py](../backend/tests/test_relations.py).
  - `test_dynamic_record_update`, `test_dynamic_record_delete` e dois testes de isolamento cross-tenant em [tests/test_dynamic_records.py](../backend/tests/test_dynamic_records.py).
- 🔧 **Hardening da suíte de testes**:
  - `backend/pytest.ini` fixa `testpaths = tests` para que `pytest -q` ignore arquivos scratch (`*.txt`) na raiz de `backend/` (esses serão removidos na Fase 0.3 do M3).
  - `startup_event` respeita `SKIP_TEST_SEED=1` (setado pelo conftest) para não poluir o DB de teste com `testadmin` pré-seedado de fluxos E2E de frontend.
  - `tests/test_qr.py` refatorado para usar as fixtures `client` / `db_session` do conftest em vez de um `TestClient` global.

### **[04/05/2026] - Versão 1.3.0 (Milestone 5 - Atlas Redesign / Mora Editorial)**
Identidade visual da casa Mora aplicada em todo o produto. PR #1 → #5, todas mergeadas em `main`.

- ✨ **Backend leve**: `workspace_name` + `workspace_slug` em `users` ([models.py](../backend/models.py)) + `meta` (`row_count`, `column_count`, `relation_count`) em `GET /api/tables/`. Endpoint `PATCH /api/admins/me/workspace` com validações de slug. `GET /api/auth/me` exposto.
- ✨ **Tokens & primitivos editoriais**: tokens Mora em [globals.css](../frontend/src/app/globals.css) (4 acentos × 2 modos), fontes Fraunces + IBM Plex Sans/Mono via `next/font`. `ThemeContext` reescrito (`data-theme` + `data-accent`). Primitivos em [components/ui/](../frontend/src/components/ui/): Icon, Eyebrow, Hairline, Button, Pill, Card, Field/Input/Select/Textarea, SectionNum, MMonogram, OwlGlyph.
- ✨ **15 telas redesenhadas**: Login, Tables Index, Data Grid, Dashboard, Sidebar, Schema Editor, Import SQL/Sheet, Moderadores, Grupos, QR Auth, Master Panel, Explore, Theme Studio + Publish (mock), Site Público (`/[workspace]`). Wiring `useAuth()`/fetch real preservado — só estrutura editorial trocou.
- ✨ **Tweaks Panel**: drawer flutuante ([TweaksPanel.tsx](../frontend/src/components/TweaksPanel.tsx)) com density / terminology / persona override. Visível em dev sempre, em prod via `localStorage.mora-tweaks-enabled='1'`.
- ✨ **Polish editorial (Fase 4)**: paper-grain texture, microtipografia Fraunces (`opsz` + `SOFT`), MMonogram + OwlGlyph aplicados, drop-caps em abstracts, tabular nums + ss01 em números, easing editorial em transitions.
- 🐛 **Fix orphans**: landing + admin overview redesenhados (commit `6f39333`); MMonogram em tables-index movido pra inline-left (commit `812c03d`).
- 📚 **Planejamento**: roadmap.md criado, planos enxutos M6 (Publish & Export) e M7 (Schema Visualizer) escritos sem alucinação técnica.

### **[09/07/2026] - Versão 0.7.0 (Milestone 8 - Media Library + File Uploads)** 🏁 régua nova
Primeira entrada da régua nova de versionamento (`0.6.0 → 0.7.0`; fases intermediárias não bumpam — o +0.1 carimba no fechamento). O Atlas ganhou noção de mídia de ponta a ponta: colunas `image`/`file`/`attachment`, biblioteca central de assets, render nos 3 contextos do público e import que cria tabela de planilha. PRs #36–#40 (F0 `8f182d9` + F1–F5).

- ✨ **F0 — Mutação de schema (DDL)**: add-column em tabela existente, drop-column (Postgres pleno; SQLite erro controlado), delete-table com confirmação por nome; `DELETE`/`PUT` dinâmicos leem a row antes (hooks de cleanup); fix do `delete_admin` em SQLite.
- ✨ **F1 — Fundação de mídia + Media Library**: whitelist de `data_type` (fecha o smell da string livre) + tipos `image/file/attachment`; tabela `_assets` (migration + RLS, incl. fix retroativo de `_publication_versions`); bucket `workspace-media` provisionado em código (10MB/arquivo, MIME sem SVG); endpoints `/api/assets/*` (upload/list/delete/GC); refcount automático nos hooks da F0; fallback filesystem em dev.
- ✨ **F2 — DataViewer + mídia**: editor de schema no front (`/admin/tables/[id]/edit`) ligando a F0; tipos de mídia no wizard de criar; `lib/columnTypes.ts` fonte única (mata o fallback silencioso `:Text`); widget de célula (`MediaField`) com upload + picker da biblioteca num modal; master só-preview.
- ✨ **F3 — Mídia no público, snapshot e export**: `PublicSite` renderiza mídia nos 3 contextos (`MediaCell` puro theme-driven, sem bump de `schema_version`); **copy-at-publish** (retrato imutável por-versão — snapshot nunca 404a, refcount limpo); export ZIP **embute** a mídia (`./assets/media/`, link-mode acima do teto); preview do Studio com dados reais (PR4b do M6 fechado, preview==publish).
- ✨ **F4 — Import de planilha que CRIA tabela**: server dry-run infere tipos (ladder canônica, CSV lido como string preserva zero à esquerda) + sanitiza headers (anti-injeção via nome de coluna, 1ª trava do smell) → preview editável (rename/retipa/dropa) → commit reusa `create_table` da F0 + coage valores (Boolean/Integer/Float/DateTime) no load. Bifurcação `criar nova`×`anexar` no import; o append ganhou preview real.
- 🔒 **F5 — Hardening + gate (o fechador)**: content-sniffing pure-python (`filetype`; `.exe` renomeado → 415); quota 250MB/workspace (413 block-at-limit); GC das cópias de snapshot órfãs (reconcile no `/api/assets/gc`, guarda de 24h); caps do ZIP pinados (300 arq/120MB); **gate Playwright E2E `validate-media.mjs`** (round-trip real upload→render→publish→público→ZIP→import, matriz 2×4, budgets, console-errors=fail) — **verde em 09/07/2026**.
- 🐛 **Fixes de integração achados nas QAs das fases**: serving dev de path aninhado das cópias (`5d5c79d`); coerção de Boolean string no load do import; GUC de RLS re-setado pós-`create_table` (transaction-local).
- 🧪 **Cobertura**: backend pytest **192 passed / 7 skipped** (era 100 na F0); vitest 49; smokes ao vivo 13/13 + 19/19 + 12/12 + 12/12; TestSprite nas fases F0–F2; **gate de mídia verde** (matriz 2×4 + budgets + console-errors=fail).

### **[16/07/2026] - Versão 0.7.1 (hotfix — deadlock em Postgres)**
Bugfix (+0.01, PR próprio). Achado ao rodar a suíte em **Postgres pela primeira vez na história do projeto** — o conftest é dual-engine desde o M3, mas ninguém nunca tinha setado `DATABASE_URL=postgres...`. O bug não apareceu como falha: apareceu como *hang*.

- 🐛 **BUG-PG01 — auto-deadlock infinito ao dropar coluna de mídia ou apagar tabela com mídia**: o handler lia os valores da coluna de mídia pela sessão do request e deixava a transação aberta (`ACCESS SHARE`); o DDL logo abaixo roda em **conexão separada** (`engine.begin()`) e pede `ACCESS EXCLUSIVE` — esperando por uma transação que só fecharia numa linha que a mesma thread nunca alcança. Sem `lock_timeout` nem `statement_timeout`, o request pendurava **pra sempre** e queimava uma conexão do pool (5+10); repetir esgotaria o pool. Fix: `_end_read_txn_before_ddl()` (rollback explícito) entre a leitura e o DDL, nos dois handlers, com a identidade da tabela capturada antes (o rollback expira os objetos ORM). Duas ocorrências: `DELETE /tables/{id}/columns/{col_id}` e `DELETE /tables/{id}`.
- 🔍 **Por que estava invisível desde o M8 F0**: só ocorre em Postgres — em SQLite o `StaticPool` usa conexão única (leitura e DDL compartilham, sem conflito de lock) e o drop-column nem chega ao banco (decisão F0). O teste que cobria o caso pior (`test_delete_table_decrements`) **passava em SQLite todo dia**; o outro (`test_drop_column_decrements`) é `skipif(not IS_POSTGRES)` e **nunca executou em lugar nenhum**.
- 🧪 **Prova (A/B, mesmo Postgres 16.14)**: sem o fix → `exit 124`, pendurou até o teto de 90s. Com o fix → 2 passed em 1,75s. Suíte completa em Postgres: **191 passed / 1 failed / 7 skipped em 1:53** (o único vermelho é `test_admin_cannot_forge_tenant_id`, teste velho que assere contra o formato pré-paginação do M-Ops F3 — a propriedade de segurança está intacta, o assert é que está desatualizado).
- 📊 **Custo real do Postgres no CI, medido** (mesma máquina, mesma suíte): SQLite **1:18** × Postgres **1:53** = **+35s**. A estimativa do detalhamento era "+2 a +6 min" — errou por uma ordem de grandeza.
- ⚠️ **Impacto em produção**: latente. `_tables`=0 (nenhuma tabela dinâmica jamais criada em prod), então não há coluna de mídia pra dropar. O bug armaria no primeiro cliente real.
