# 📝 Patch Notes

Registro de mudanças, novas funcionalidades e atualizações do sistema.

> **Versão atual do produto: `1.0.2`** (2026-08-20) — B15: export PNG do Esquema em dark mode. A entrada está no [fim deste arquivo](#-20082026--versão-102).
>
> **Régua (Diretor, 2026-07-05, âncora revista em 2026-08-14):** feature = +0.1, bugfix = +0.01. A regra antiga dizia *"a `1.0.0` carimba no fechamento do M10"*; o Diretor trocou — **o M10 vira `1.1`**, e o motivo está registrado no [roadmap](./roadmap.md#versionamento-do-produto-diretor-2026-07-05).
>
> ⚠️ A numeração `1.0.0–1.3.0+` das entradas **de março a maio** abaixo (era M1–M5) é **legado de changelog interno** e não tem relação com a `1.0.0` do produto. Não renumerar — mas não confundir: a `1.0.0` que vale é a do fim do arquivo, de 14/08/2026.

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

### **[17/07/2026] - Versão 0.7.2 (hotfix — provisionamento de banco novo)**
Bugfix (+0.01, PR próprio). Achado ao validar a migration da F1 do M8.5 contra Postgres real.

- 🐛 **BUG-PG02 — `alembic upgrade head` não completava num banco zerado**: o baseline `ac8fba37080b` faz `create_all` do `models.py` atual (cria `users` já com `supabase_uid`), e a revisão `c4cc157acbad` fazia `ADD COLUMN supabase_uid` sem guard → `DuplicateColumn`, matando a cadeia. Era a **única** migration da cadeia sem guard (as outras 4 já checam antes). Prod é incremental e nunca bateu no bug, mas **nenhum ambiente novo podia ser provisionado** — staging, Supabase novo, restore de DR. Fix: guard `if 'supabase_uid' in get_columns('users'): return`, idêntico ao padrão de `d7e1a92c4f03`. Postgres-only (em SQLite o `batch_alter_table` recria a tabela e não engasga) — por isso invisível: o conftest roda `create_all`, nunca alembic.
- 🧪 **Prova (A/B, Postgres 16.14, DB zerado)**: sem o fix → `exit 1`, `DuplicateColumn`. Com o fix → `exit 0`, chega em head; idempotente; caminho incremental legado intacto. Unicidade preservada (o `create_all` já cria o índice unique).
- 🔧 **Contexto operacional (mesma investida, 2026-07-17)**: descoberto que o `startCommand` do Railway sobrescrevia o Procfile e **o `alembic upgrade head` nunca rodava no deploy** — prod estava 3 revisões atrás do código (a Media Library do M8 nunca funcionou em prod desde 10/07). Corrigido: as 3 migrations pendentes aplicadas à mão + `railway.json` versionado que roda o alembic no deploy (verificado nos logs). Prod agora em `f2c9e04b7a31`, RLS ligado em `_assets`/`_views`.
- 🔑 **Medido em prod**: `rolbypassrls=TRUE` na role da aplicação — o RLS **não** é o guard do app (é defesa contra conexão crua); o isolamento entre tenants depende dos `WHERE`/`owner_id` do código. Confirma o desenho da F1 (escopo por identidade).

### **[04/08/2026] - Versão 0.8.0 (Milestone 8.5 — Views, Gráficos & Impressos)** 🏁
`0.7.2 → 0.8.0`. O Atlas parou de saber mostrar dado de um jeito só. Antes: tabela que vira texto, zero `GROUP BY` no código inteiro, e `recharts`/`jspdf` instalados sem nenhuma página importando. Agora: agregação server-side com views salvas, gráfico congelado no site publicado, e dois impressos que saem em PDF pelo browser. PRs #42, #46–#48, #50, #52, #54, #55, #57 + este.

- ✨ **F1 — Agregações server-side + views salvas** (PR #42): motor puro `backend/aggregation.py` (chamado pelo endpoint **e** pelo publish — o publish roda sem GUC de tenant, então HTTP interno vazaria ou barraria tudo), tabela `_views` + 8 endpoints `/api/views/me/*`, 4 operações (contar / contar distintos / somar / média). Honestidade embutida no contrato: nulo vira grupo `(sem valor)` e nunca zero, top-20 com grupo "resto" e aviso **dentro** do dado, `source_row_count` pra provar sobre quantas linhas o número foi computado. Somável sai do tipo **físico** refletido, não do rótulo (tabela importada por SQL grava rótulo mentiroso — a whitelist por rótulo daria zero coluna somável justo nas tabelas grandes).
- ✨ **F2 — Chart builder + gráfico no público** (PRs #46–#48, #50): `backend/chart_svg.py` desenha o SVG **no publish**, sobre o dado completo — recharts não renderiza fora do browser (medido: `<div>` vazia), então o público RSC e o ZIP script-free precisavam da figura já pronta. `ChartsTab` no Studio com preview vivo, `<ChartSection>` no público com **tabela-alternativa a11y obrigatória** (leitor de tela + sem-JS + daltônico num artefato só), paleta Okabe-Ito fixa. **Invariante da GUC provado em teste** (mesmo motor, com e sem tenant setado, linhas idênticas) — "preview == publish" deixou de ser premissa. Gate `validate-charts.mjs` verde 21/07.
- 🐛 **BUG-CHART01** (PR #52): o gráfico congelado ignorava o tema (cor e fonte) — bug que nenhum motor de PDF conserta, e pré-requisito da F3.
- ✨ **F3 — Impressos: panfleto + acadêmico** (PRs #54, #55, #57 + fechamento): mecanismo é **`@media print` + `window.print()`** (decisão D1 do Diretor) — o browser vira motor de PDF vetorial, texto selecionável, fonte fiel, **zero dependência nova**; o ZIP continua existindo e não é tocado. **Panfleto**: números grandes, cor do tema no papel (`print-color-adjust: exact`), gráfico como figura. **Acadêmico**: sóbrio, mostra os números (alt-table em vez da figura), citação estilo dataset.
- ✨ **Proveniência citável** (PR #54 + UI no fechamento): campo `source` em `DynamicTable` + `PATCH /tables/{id}/source` + editor em `/admin/tables/[id]/edit`. Em branco, a citação usa só o metadado da versão publicada — **o Atlas nunca inventa fonte**, que era o pecado a evitar na "versão acadêmica".
- 🐛 **Corte silencioso na impressão** (achado rodando o gate): SVG de largura fixa e tabela larga cabiam na tela por rolagem — e rolagem não existe no papel. O PDF cortava a borda direita **junto com a legenda "agregado sobre N linhas"**, ou seja, escondia justamente a prova de honestidade. Fix: SVG escala pelo `viewBox`, tabela do acadêmico vira `table-layout: fixed` com quebra de palavra na impressão. Travado por medição no gate (largura do conteúdo ≤ largura do container sob `emulateMedia('print')`).
- 🧪 **Gate `validate-print.mjs`** (`npm run gate:print`) — **verde em 04/08/2026, 24/24**: round-trip real origem → publish → rodapé público → acadêmico citando a origem → `@media print` escondendo o botão e mantendo o dado → **PDF gerado pelo browser** (62 KB acadêmico / 1,8 MB panfleto, ambos inspecionados) → panfleto com o accent do tema medido no pixel → ZIP sem link morto pros impressos. Nada disto é alcançável por unit test: jsdom ignora media query e não imprime PDF.
- 🧪 **Cobertura**: vitest **83** (era 61); backend **247 passed / 7 skipped** em SQLite (era 192 no fechamento do M8); 3 gates Playwright verdes (mídia, gráficos, impressos). A suíte em Postgres não foi rerodada neste fechamento — última medição é a do 0.7.2.

### **[04/08/2026] - Versão 0.8.1 (varredura de bugs antes do M9)**
Bugfix (+0.01, PR próprio). Varredura pedida pelo Diretor antes de abrir o M9 — o registro de bugs só tinha resolvidos, e os abertos viviam como dívida espalhada em plano de milestone. Detalhe completo em [bugfixes.md](./bugfixes.md).

- 🐛 **B1 — o toggle "opcional" do import de planilha não fazia nada, em silêncio**: `Toggle` chamava `onChange()` **sem argumento**, quem escutava recebia `undefined`, `JSON.stringify` sumia com a chave e o backend caía no default `is_nullable=True`. O admin marcava a coluna como obrigatória e a tabela nascia nullable, sem erro nenhum. Eram **2 dos 3 erros** de `tsc` que o projeto tratava como inofensivos — e `ignoreBuildErrors: true` calava o build. Fix: `onChange` entrega o próximo valor; `label` virou opcional com `ariaLabel` (o toggle da grade não tinha nome acessível). Provado no browser: `aria-pressed` `true → false → true` (antes travava no false).
- 🐛 **B2 — título do gráfico saía 2×** no site público e no ZIP (`<h2>` da seção + o título desenhado dentro do SVG). Follow-up do BUG-CHART01, agora fechado: fonte única é o SVG, que precisa do título pra ser figura autossuficiente. Travado por teste que **conta ocorrências** e por assert de zero-heading no gate.
- 🐛 **B3 — `next.config.ts` com chave morta no Next 16** (`eslint` saiu do `NextConfig`): o servidor logava `Invalid next.config.ts options detected` a cada boot. Com este e o B1, **`tsc --noEmit` do frontend fica limpo pela primeira vez**.
- 🐛 **B4 — import por SQL gravava rótulo de tipo fora da whitelist** (`VARCHAR`/`INTEGER`, o nome da classe do dialeto). Novo `canonical_data_type()` em `dynamic_schema.py`, por `isinstance` (cobre o dialeto inteiro sem lista de nomes). **Medido ao testar**: o `sqlglot` transpila pro SQLite (`VARCHAR`→`TEXT`, `BOOLEAN`→`INTEGER`), então o rótulo honesto descreve a coluna **física** — e passa a concordar com a agregação, que sempre leu o físico. Custo de migração zero (prod tem `_tables`=0).
- 🔧 **Robustez dos gates**: o de gráficos falhava por estado herdado (o Studio hidrata da versão **ativa**, que sobrevive entre runs, e os ids são reciclados no SQLite) e por sobra de run morta (duas views com o mesmo nome). Agora zera a publicação ativa antes do passo de UI e carimba o nome da view com o timestamp.
- 🧪 **Cobertura**: vitest **90** (era 83); backend **253 passed / 7 skipped**; `tsc --noEmit` **0 erros** (era 3); gates de gráficos e impressos rerodados **verdes**.

### **[04/08/2026] - Versão 0.8.2 (isolamento entre tenants no revoke de permissão)**
Bugfix (+0.01, PR próprio). Achado **instrumentando** a M9 F1, não numa varredura de segurança.

- 🔒 **B7 — `revoke_permission` não checava dono: admin revogava acesso de outro tenant.** `DELETE /api/database-groups/{group_id}/permissions/{mod_id}` achava a permissão por `(group_id, mod_id)` e apagava. Com uma conta admin qualquer e dois ids inteiros, dava pra tirar o moderador de outro workspace dos grupos dele. Não vaza dado — **derruba acesso alheio**, e a vítima descobre pelo suporte. Os irmãos que mexem no mesmo recurso (`grant_permission`, `delete_database_group`) já checavam; este ficou de fora. Mesma classe do gap de `/api/relations` fechado no M-Ops.
- 🔧 **Fix**: grupo resolvido e checado **antes** da busca da permissão. A ordem é parte do fix — com a checagem depois, o `404` continuaria contando ao vizinho se existe permissão ali. Master preservado (opera sobre qualquer tenant).
- 🧪 **Prova A/B**: sem o fix → 2 failed; com o fix → 11 passed. Os testes usam **2 tenants de verdade** e asseram que a permissão continua de pé depois do 403 — 403 que não protege nada é decoração.
- 💡 **Método que vale registrar**: o audit obriga cada mutação a responder *"de quem é esse dado?"* pra saber em qual trilha gravar. Essa pergunta **é** o teste de ownership — handler cujo dono não é resolvível é suspeito de gap de autorização. Foi assim que este apareceu.
- ⚠️ **Impacto em produção**: nenhum hoje (1 tenant, zero moderadores). Armaria no primeiro cliente com mais de um admin.
- ✅ **B6 fechado junto**: a suíte rodou em **Postgres 16.14** pela primeira vez desde o `0.7.2` — **274 passed / 8 skipped / 0 failed**. É o primeiro zero-vermelho em Postgres da história do projeto (a medição anterior tinha 1, que era o próprio B6). Nenhuma mudança de código foi necessária: era dívida de **verificação**.
- 🔎 **A M9 F1 validada no banco que importa**: `_audit_log` nasce com `relrowsecurity=true` e o índice composto `(owner_id, created_at)` existe — as duas coisas são **no-op em SQLite**, então até aqui eram fé. `alembic upgrade head` fecha e é idempotente num PG zerado (cenário do BUG-PG02).
- 📌 **Receita versionada** no CLAUDE.md (`docker start dynamic-cms-pg` + `DATABASE_URL`): o custo real é ~+35s sobre o SQLite, e não havia motivo pra isso ser conhecimento oral.

### **[07/08/2026] - Versão 0.9.0 (Milestone 9 — Webhooks, API Keys & Audit Log)** 🏁
`0.8.2 → 0.9.0`. O Atlas ganhou as três coisas que separam "app com banco" de "plataforma": memória do que aconteceu, uma segunda via de autenticação que não é a senha de alguém, e um jeito de contar pra fora. PRs #60, #63, #64, #66.

- ✨ **F1 — Trilha de auditoria** (PR #60): `backend/audit.py` (vocabulário de ações + `Actor` polimórfico), tabela `_audit_log` (migration `c9a4d17b3e08`) e ~20 hooks. A regra que define o desenho: handler sob `tenant_db` usa `audit.record()` (entra na transação, pode levantar); handler cuja mutação já é durável — DDL, `import_sql_script` — usa `record_best_effort()`, porque **audit não pode derrubar operação que já funcionou**.
- ✨ **F2 — API keys com escopo** (PR #63): `mora_{prefixo}_{segredo}`, prefixo indexado + SHA-256 do segredo, reveal-once. **v1 é só-leitura**, escopo por tabela, deny-by-default, sem curinga, e **key nunca de master** (barrado na criação *e* na resolução). Leitura via key entra no audit; leitura humana não — chave é integração, e integração sem rastro é o que ninguém consegue auditar depois.
- ✨ **F3 — Webhooks com outbox durável** (PR #64): a outbox é gravada na **mesma transação da mutação**, e nenhum HTTP acontece dentro dela. O drain faz **claim em 2 fases** (marca `in_flight`, commita e **solta a conexão**, faz o POST fora da transação, grava o desfecho): segurar conexão através de um `requests.post` de 10s estoura o pool 5+10. O corpo é serializado **uma vez** e enviado verbatim — re-serializar reordenaria chaves e quebraria a assinatura no receptor.
- ✨ **F4 — Fronteira do nome de tabela** (PR #66): `schemas.validate_table_name` virou régua única nas 3 portas (endpoint, import de planilha, import por SQL). Reservados são **computados das rotas** no startup, não escritos à mão — lista manual atrasa em relação ao router. **Premissa do plano retificada por medição**: só literal de **1 segmento** sombreia, então `views`/`keys`/`webhooks` seguem permitidos de propósito.
- 🔧 **Robustez do drenador** (PR #65): o workflow escondia a causa da falha (`000000`, artefato de `$(cmd || echo 000)`) e quebrava com espaço em branco colado no painel do GitHub.
- ⚠️ **Ação de plataforma ainda pendente:** sem `ATLAS_WEBHOOK_SIGNING_KEY` + `ATLAS_DRAIN_TOKEN` no backend e `DRAIN_URL`/`DRAIN_TOKEN` no repo, **nenhum webhook é entregue**. O workflow falha alto de propósito — drenador verde sem drenar é a falha do `tec-daily-updater` de novo.

### **[14/08/2026] - Versão 0.9.1 (quatro bugs achados auditando o M10)**
Bugfix (+0.01, PR #68). Nenhum deles é *do* M10 — saíram de auditar o plano dele e de um painel adversarial. **O padrão dos quatro: o registro escrito antes de medir estava errado, e em dois deles apontava pro conserto errado.**

- 🔒 **B13 — import por SQL exfiltrava e escrevia entre tenants** (reclassificado de "escalação via `set_config`"). `_parse_sql_statements` classificava só o nó de **topo** e reescrevia só a **primeira** `exp.Table` — nada abaixo era inspecionado. Um admin comum, com um `.sql`, lia a tabela de outro workspace (`INSERT … SELECT FROM t5_alheia`), dumpava `users` com os hashes (`CREATE TABLE … AS SELECT`), **escrevia** em schema alheio (`tenant_2.alvo`), lia `/etc/passwd` e forjava a flag de master. Fix é **allowlist de forma**, não denylist de função: lista de nome envelhece a cada versão do PG, e o vetor pior nem usa função. Custo declarado: `INSERT … SELECT` deixa de funcionar — nenhum dump de ferramenta gera isso, e era exatamente a forma que exfiltrava.
- 🔒 **B10 — publish sem GUC de tenant.** Três correções ao registro: **(1)** não é o `RESET ALL`, é o fim de **qualquer** transação que rodou `set_config` LOCAL — quem consertasse pelo `finally` não resolveria nada, e `public_tenant_db` é endpoint público, então tráfego anônimo suja o pool; **(2)** são **duas** rotas, ambas do publish, via `_build_snapshot_payload`; **(3)** o fix óbvio **abriria um buraco** — medido em role `NOBYPASSRLS`, só o `NULLIF` faz o cenário "is_master forjado + tenant vazio" sair de *nega* pra *vaza 3 linhas*. Amarrar o ramo do master à sentinela `'0'` fecha esse **e** um vazamento que já existia. Pior modo de falha não era o 500: em conexão virgem o publish gerava `rows: []` e **publicava site vazio, sem erro**.
- 🐛 **B11 — admin meio-criado, com o username trancado**: backfill de `app_metadata` rodava pós-commit, fora da compensação. Falhando, o admin existia nos dois lados sem `tenant_id` e o nome ficava ocupado — nem dava pra tentar de novo. Agora compensa (apaga local + Supabase) e devolve 502.
- 🐛 **B12 — dois docstrings que mentiam**: `models.py` dizia que os webhooks consomem o audit (grep = zero), e foi esse texto que induziu erro no detalhamento do M10; `test_rls_raw_bypass.py` dizia que o conftest cria a role `app_user` — **não cria**, então em máquina sem ela o teste **errava em vez de provar**, e era justamente esse teste citado como "já medido".
- 🧪 **Cobertura**: SQLite **412 passed / 14 skipped**; Postgres 16.14 **416 passed / 10 skipped**. Os testes do B10 rodam sob role `NOBYPASSRLS` **de propósito** — como a role do app bypassa RLS, teste que roda como ela é **tautológico**, e é por isso que o B10 podia existir sem nenhum vermelho. Dois testes nossos também foram consertados: um corria contra o relógio e outro **passava em PG pelo motivo errado** (asseria `'admins' not in []`).

### **[14/08/2026] - Versão 0.9.2 (saúde de CI/CD antes da 1.0)**
Bugfix (+0.01, PR #69). Não muda uma linha de produto: muda **o que o CI é capaz de reprovar**. Todo item abaixo fecha uma classe de defeito que este projeto **já teve** — nenhum entrou por higiene genérica.

- 🧪 **Postgres no CI** (o pedido original): a suíte roda em matriz `sqlite × postgres`, com `fail-fast: false` porque os conjuntos de `skipped` são **disjuntos** (import por SQL é SQLite-only, RLS é PG-only) — cancelar uma perna não economiza tempo, perde cobertura. Só é possível **por causa do B12**: até o `0.9.1` os testes de RLS dependiam de uma role criada à mão na máquina do dev.
- 🧪 **Job `migrations`: as migrations nunca tinham sido executadas por nada além da produção.** O conftest monta o schema com `create_all`, não com alembic — a suíte inteira ficava verde sem que uma linha de migration rodasse. BUG-PG02 foi exatamente isso ("migration morta em banco novo"), descoberto em prod. Agora: banco virgem, `upgrade head`, e conferência de que o carimbo bateu na head — porque `upgrade head` **sai 0 mesmo sem aplicar nada**. Pega também **histórico bifurcado** (2 heads), que em produção não dá erro: o alembic aplica uma ponta e a outra some calada.
- 🧪 **`tsc --noEmit` virou gate, e `ignoreBuildErrors` foi desligado.** A dívida que justificava o escape hatch acabou no `0.8.1` — hoje mede **0 erros**, e o build de produção passa com a checagem ligada (verificado). Isto importa porque **2 dos "3 erros pré-existentes de tsc" eram o B1**, que foi pra produção invisível justamente por isso.
- 🧪 **Catraca de lint** (`scripts/lint-ratchet.mjs`): `npm run lint` acusa **38 errors / 6 warnings** de dívida antiga. Exigir zero faria o CI nascer vermelho e ser desligado na semana seguinte; não gatear deixaria o número crescer calado até a 1.0. A catraca trava no valor de hoje — regressão nova quebra, limpeza obriga a **abaixar a baseline**. A/B provado: um arquivo com 1 erro novo derruba o gate.
- 🔧 **`timeout-minutes` em todos os jobs**: o teto padrão do Actions é **6 horas**. BUG-PG01 foi um **hang permanente e PG-only** — uma reincidência queimaria isso caladamente.
- 🔧 **Metade dos minutos de runner era desperdício**: sem filtro de branch no `push`, todo PR rodava a suíte **duas vezes** (grupos de concorrência diferentes, então nem se cancelavam). Com a perna de Postgres entrando, a conta dobraria.
- 🐛 **`keep-alive.yml` tinha o mesmo bug `000000` que o PR #65 corrigiu no irmão** — e interpolava `${{ vars.HEALTH_URL }}` **dentro** do script, o que é injeção de código por textual-substitution. O `webhook-drain.yml` já fazia certo; este ficou pra trás.
- 🔧 **`concurrency` no drenador com `cancel-in-progress: false`** (o oposto do `ci.yml`, de propósito): cancelar um drain no meio deixa entrega presa em `in_flight` até a varredura de órfãs — cancelar não adianta a fila, **atrasa**.
- 🔒 **`permissions: contents: read`** em todos os workflows — nenhum deles escreve no repositório.
- 📌 **Dívida de registro paga**: as entradas `0.9.0` e `0.9.1` acima **estavam faltando** no patch_notes, contra a régua do próprio projeto ("todo PR declara a versão + entrada no patch_notes"). Escritas neste PR.
- 🐛 **O CI novo achou um bug de produto na estreia — `DATABASE_URL` vazia derrubava o backend no import.** `os.environ.get(k, default)` só usa o default quando a chave **não existe**; chave presente e vazia devolve `""`, e `create_engine("")` levanta `ArgumentError` antes de qualquer log subir. Não é artefato de teste: painel do Railway/Vercel deixa variável vazia com a mesma facilidade, porque **apagar o valor não apaga a chave**. `_resolver_url()` passa a tratar ausente, vazia e só-espaço como a mesma coisa (6 testes; A/B reproduz o erro exato do CI na semântica antiga).
- 🔎 **B14 registrado, não consertado**: o `next build` baixa **6 famílias** de `next/font/google` em tempo de build, e a CDN do Google entregou URLs que ela mesma responde com 404 (medido: `UcCB3Fwr…` → 404, enquanto o CSS de hoje serve `UcC73Fwr…` → 200). **O mesmo commit passou 6 min antes.** Vale pro deploy da Vercel também, que roda o mesmo build. O fix robusto é self-host, que exige escolher pesos/subsets e revalidar os impressos — fatia própria. Detalhe em [bugfixes.md](./bugfixes.md). → **resolvido no `0.9.3`**.

### **[14/08/2026] - Versão 0.9.3 (B14 — as fontes deixam de vir da internet)**
Bugfix (+0.01, PR #70). Fechado o B14 do dia anterior. **Procurando a instância registrada, apareceram mais duas** — e a segunda é pior que a original.

- 🔴 **A instância que ninguém tinha visto: o ZIP do export baixava fonte em RUNTIME, e explodia se não conseguisse.** `buildFontBundle` batia em `fonts.googleapis.com` + `fonts.gstatic.com` a cada export e fazia `throw` na falha. Não é build: é **produção, numa feature de cliente**. E o docstring do módulo diz, sem ironia, *"offline real — decisão #2"* — o artefato cujo contrato é ser offline dependia da rede pra ser produzido. Achada porque, **depois** do fix do `layout.tsx`, ainda havia 3 arquivos citando `gstatic` no output do build.
- ⚖️ **Terceiro achado, de licença**: o ZIP **redistribui** os `.woff2` e só *citava* a SIL OFL no README. A OFL exige que o texto acompanhe as cópias — agora vai `assets/fonts/LICENSES.md` dentro do pacote, com a linha de copyright de cada família puxada do repositório oficial `google/fonts`, não escrita de memória.
- 🔧 **29 `.woff2` versionados** (subset `latin`, 1,2 MB) via `scripts/fetch-fonts.mjs`. Script versionado de propósito: a origem fica auditável e atualizar depois não vira arqueologia.
- 🔧 **`adjustFontFallback` explícito por família**: o default do `next/font/local` é `'Arial'`, então as três serifadas herdariam métrica de sans e mudariam o salto de layout enquanto a fonte carrega. No `next/font/google` isso vinha calculado da métrica real e ninguém precisava declarar — é o tipo de detalhe que some numa migração feita no olho.
- 📐 **Eixos da Fraunces conferidos por medição**: 120.788 bytes com `opsz+wght+SOFT` contra 36.620 só com `wght`; o arquivo versionado tem 120.788. O projeto usa esses eixos em **7 lugares** — pegar o arquivo errado teria mudado o desenho da letra sem erro nenhum.
- 🛡️ **Dois gates novos, ambos com A/B**: `fontManifest.test.ts` enumera o espaço de opções **lendo o `PublishContext`** (não uma cópia) e confere contra o disco — apagar um `.woff2` derruba 2 testes com o nome do arquivo; `check-no-remote-fonts.mjs` barra `next/font/google` no CI, porque é o caminho que a própria doc do Next ensina e voltaria pela porta da frente na próxima fonte que alguém adicionasse.
- 🧪 **Verificado o que costuma ser assumido**: `outputFileTracingIncludes` conferido no `route.js.nft.json` do build (**30 entradas** de `src/fonts/` no trace da rota de export) — sem isso o `readFile` acha o caminho em dev e falha na Vercel, que é o pior lugar pra descobrir. E um round-trip real do ZIP assere fonte + licença dentro do pacote e **nenhuma URL do Google no HTML**.
- 🧪 **Cobertura**: vitest **160** (era 90); `tsc --noEmit` 0; catraca de lint inalterada em 38/6.

### **[14/08/2026] - Versão 0.9.4 (B8 — o último bug conhecido)**
Bugfix (+0.01, PR #72). Fecha o **único** item que restava no registro. **Zero bug conhecido em aberto entrando no M10.**

- 🐛 **B8 — os testes de mídia brigavam por um diretório fixo.** O fallback local escrevia em `backend/.media_dev`, caminho derivado da pasta do arquivo. Rodar SQLite e Postgres ao mesmo tempo — o jeito rápido de conferir os dois engines — fazia as suítes apagarem os arquivos uma da outra (`_reset_local_store_for_tests` dá `rmtree` no diretório inteiro) e o `owner_id` coincidia, porque cada banco numera do 1.
- 🔧 **Fix**: `MEDIA_DEV_DIR` lê `ATLAS_MEDIA_DEV_DIR`, e o conftest aponta pra um `mkdtemp()` de cada execução. **Vazia conta como ausente** — é o mesmo cuidado que faltava no `DATABASE_URL` e derrubou o backend no import ontem; aqui daria `rmtree("")`. A linha precisa ficar **antes do primeiro import de `media_storage`**: o módulo lê a variável uma vez, no import, então numa fixture chegaria tarde e o teste passaria a mentir.
- ⚠️ **O registro nomeava a vítima errada**, e isso importou: dizia `test_gc_endpoint_reconciles_pub_copies`; reproduzindo, caiu `test_dev_serving_of_copied_media_nested_path`. **A vítima muda conforme o tempo** — o que é, em si, a prova de que é corrida e não defeito de um teste. Perseguir o nome registrado teria mandado o conserto pro lugar errado.
- 🧪 **A/B no cenário real** (4 suítes de mídia, dois engines, simultâneos): com diretório fixo → **1 failed** em PG; com diretório por execução → **71 passed**. E as suítes **completas** concorrentes agora fecham verdes: SQLite **418 passed / 14 skipped**, Postgres **422 passed / 10 skipped**.
- ⏱️ **Não era só vermelho falso**: era o que impedia o paralelo. Conferir os dois engines caiu de ~8 min para **5m10 de relógio**.

### **[14/08/2026] - Versão 0.9.5 (F0 — a co-edição mentia em três lugares)**
Bugfix (+0.01, PR #74). Primeira fatia do plano do M10 — e **não é M10**: são três defeitos que existiam sem realtime nenhum.

- 🐛 **LWW na LINHA, não na célula.** O `commitEdit` mandava `{...record, [col]: v}` — a linha inteira, relida do estado local. Dois admins editando células **diferentes** da mesma linha se sobrescreviam: o segundo PUT reenviava a versão antiga da célula do primeiro, sem erro e sem aviso. O backend **sempre aceitou parcial**; quem violava o contrato era o cliente. Efeito colateral que ninguém tinha visto: o `changed_columns` do M9 registrava **todas** as colunas a cada edição de uma célula — a trilha existia e respondia errado.
- 🐛 **Sem `ORDER BY`, a listagem não tinha ordem** — aplicado em 3 pontos (rota autenticada, pública e o construtor do snapshot), com a PK como último critério. O do snapshot era o pior: o corte por teto pegava o que a heap devolvesse, então **duas publicações do mesmo dado davam sites diferentes**.
- 🐛 **Falha de carga virava tabela vazia.** `load()` não checava `res.ok` e tinha `.catch(() => ({}))`: token expirado e permissão revogada eram indistinguíveis de tabela realmente vazia. Junto: guarda de sequência (ganhava a última *resposta*, não o último *pedido*) e texto não-numérico em coluna `Integer` parando de **apagar a célula em silêncio**.
- 🧪 **O A/B tem uma parte incômoda**: em Postgres, 3 dos 8 testes falham sem o fix; **em SQLite os 8 passam**. Só o PG pega — família BUG-PG01/PG02. Sem a matriz de CI do `0.9.2`, este bug seria invisível no pipeline.
- 🔎 **Duas correções no próprio trabalho**: o teste do snapshot **passava pelo motivo errado** (precisou de um `UPDATE` entre as leituras pra discriminar), e o teste de backend do PUT parcial prova o *contrato*, não o conserto do cliente — daí a regra ter saído pra `lib/cellPatch.ts`, onde o vitest alcança.

### **[14/08/2026] - Versão 0.9.6 (o site publicado diz de quando ele é)**
Feature pequena (PR #75), saída de responder a decisão 3 do M10 ("gráfico vivo no público?"). **Medindo pra responder, o problema era outro.**

- ⚖️ **O público mostrava dado congelado sem dizer a data.** O snapshot é congelado **por decisão** (M6) e deve continuar — mas o rodapé só dizia "Publicado via Atlas". Um gráfico gerado há três meses se apresentava como o número de hoje, sem nada na tela que permitisse desconfiar. **Congelar é legítimo; não dizer que congelou é mentir por omissão.**
- 🔎 **A incoerência que denunciou**: o impresso **acadêmico**, do mesmo dado, já dizia *"Versão 3 · publicado em 12 de agosto de 2026"*. O `created_at` e o `version_number` existiam no snapshot, **chegavam na página** e eram descartados no map de props.
- 📦 **E o ZIP, que é onde pesa mais**: o export usa o mesmo componente e também não passava os campos. No pacote a procedência importa mais — ele circula solto, aberto por `file://`, meses depois. O README avisa que o dado não se atualiza, mas quem abre o `index.html` direto não lê README.
- 🧪 **O teste mais importante é o inverso**: o preview do Studio renderiza o mesmo componente e ainda não tem versão publicada. Carimbar "hoje" ali seria **fabricar procedência** — o pecado que a M8.5 F3 existiu pra evitar. Sem `publishedAt`, não sai nada.

---

# 🏁 **[14/08/2026] — Versão 1.0.0**

**Fecha o arco M1–M9.** O Atlas sai de "projeto que roda" para "produto que se pode entregar a outra pessoa".

> **Mudança de âncora, registrada.** A régua de 05/07 dizia *"M10 fecha a 1.0.0"* e o CLAUDE.md a chamava de âncora dura. O Diretor a trocou em 14/08: **o M10 vira `1.1`**. O motivo está no [roadmap](./roadmap.md#versionamento-do-produto-diretor-2026-07-05) — o M10 é spike + três features, e a reauditoria de 14/08 mostrou que a decisão de transporte depende de medição contra o Supabase real que ainda não existe. Uma 1.0 com realtime meia-boca é pior que uma 1.0 sem realtime.

## O que a 1.0 é

| | |
|---|---|
| **Motor de tabelas dinâmicas** | schema desenhado na UI vira DDL real, com FK, tipos canônicos e import de CSV/XLSX/SQL |
| **Multi-tenancy** | schema-per-tenant em Postgres com RLS e policy por GUC; master → admin → moderador |
| **Auth** | Supabase Auth ES256, validação por JWKS, QR login mobile-to-web |
| **Publicação** | snapshot versionado, Theme Studio, histórico com rollback, site público RSC e export ZIP offline |
| **Mídia** | colunas de imagem/arquivo/anexo, refcount, quota, GC, mídia embutida no pacote |
| **Views e gráficos** | agregação server-side, gráfico congelado desenhado no publish, tabela-alternativa a11y obrigatória |
| **Impressos** | panfleto e versão acadêmica via `@media print`, com proveniência citável |
| **Integração** | webhooks com outbox durável, API keys com escopo (só-leitura), trilha de auditoria |

## O que mudou nesta semana, e é o que torna a 1.0 defensável

**14 bugs fechados, todos com A/B provado** — não "passou depois do fix", mas **falhou antes**. Dois eram vazamento entre tenants (B7 e B13), e o B13 era exfiltração e escrita cross-tenant por um `.sql` de import.

**O CI mudou de patamar** (`0.9.2`): matriz SQLite × Postgres, `alembic upgrade head` em banco virgem — as migrations **nunca** tinham sido executadas por teste nenhum —, gate de `tsc` e catraca de lint. Na estreia ele achou um bug de produto (`DATABASE_URL` vazia derrubava o backend no import).

**As fontes deixaram de vir da internet** (`0.9.3`). O build e o export do ZIP baixavam de CDN em tempo de execução; a CDN entregou URL que ela mesma responde com 404 e derrubou o CI. O ZIP também passou a levar a licença OFL, que ele redistribui.

**A co-edição parou de mentir** (`0.9.5`) e **o público passou a dizer de quando é o dado** (`0.9.6`).

## O que fica registrado como aberto

- **`1.0.1` — a role do banco.** Medido em produção: a aplicação conecta como `postgres`, que bypassa RLS por **duas** rotas (atributo e posse). Toda a RLS do M3 está desligada; o que separa tenants hoje é código, não banco. **Risco atual zero** (produção tem 0 schemas de tenant), e a janela fecha quando o primeiro workspace criar uma tabela. Tamanho medido: 422/430 testes passam com role sem bypass.
- **`1.1` — M10**, com plano de execução reauditado em [milestone_10_plano_execucao.md](./milestone_10_plano_execucao.md).
- **Ação de plataforma pendente:** sem `ATLAS_WEBHOOK_SIGNING_KEY` e `ATLAS_DRAIN_TOKEN` no Railway, os webhooks estão codados, testados e **desligados**. E `HEALTH_URL` não está setado — o keep-alive é verde e inerte.
- **B8 fechado, nenhum bug conhecido em aberto** no registro de [bugfixes](./bugfixes.md).

---

# 🔧 **[20/08/2026] — Versão 1.0.1**

Primeiro patch pós-1.0, nascido de teste de usuário real (import da base `paidosett`, a IC de budismo que originou o Atlas). Dois achados de UI no caminho do import.

- 🐛 **Painel do Esquema levava pro lugar errado**: o botão "Editar schema" do painel de detalhe apontava pra `/admin/tables/create` fixo — link fossilizado da era M7, quando o editor `/admin/tables/{id}/edit` (M8 F0) ainda não existia. O sintoma reportado foi "não dá pra apagar tabela": dava, mas o caminho pelo Esquema desviava do editor, que é onde a zona de perigo mora. Agora o botão navega pro editor da tabela selecionada ([schema/page.tsx](../frontend/src/app/admin/schema/page.tsx)).
- ✨ **Importar SQL aceita arquivo**: além de colar, dá pra subir o `.sql` direto. Leitura no cliente, despejada no mesmo estado do textarea — dry-run e execução não mudaram uma linha, até porque o backend sempre recebeu arquivo; era a tela que só oferecia colar ([import/sql/page.tsx](../frontend/src/app/admin/import/sql/page.tsx)).
- 🐛 **O resultado do import parou de chamar statement de linha**: "linhas inseridas" virou **"INSERTs executados"** — o backend conta statements (e documenta isso em comentário), e um mysqldump agrupa a tabela inteira num INSERT só: o teste real inseriu 287 linhas com o painel dizendo "8". O rótulo mentia; o número, não.

> **Nota de numeração:** a entrada da 1.0.0 reservava "`1.0.1`" pra role do banco (RLS desligada em produção). O conserto continua reservado e inteiro — só passa a ser **o próximo patch**, porque este saiu antes.

Gates: `tsc` 0 erros · catraca de lint parada na baseline (37 errors / 6 warnings).

---

# 🔧 **[20/08/2026] — Versão 1.0.2**

Fecha o **B15**, aberto no teste de usuário da 1.0.1: o export PNG do Esquema morria em **modo escuro**.

- 🐛 **A causa era o dark mode, provada por A/B**: os tokens escuros produzem cores computadas `color(srgb …)`, e o `html2canvas` — que tem parser de CSS próprio — não conhece essa função. Matriz antes do fix: dark falha nos 3 acentos testados, light passa (por isso o gate de junho, que rodava em light, nunca viu).
- ✨ **Rasterização trocada por `html-to-image`** ([SchemaCanvas.tsx](../frontend/src/components/schema/SchemaCanvas.tsx)): serializa o DOM pra SVG `foreignObject` e deixa o **browser** renderizar o CSS — sem parser próprio, a classe inteira de "função de cor nova quebra o export" deixa de existir.
- 🧪 **Verificação**: matriz tema×acento 4/4 verde pós-fix, PNG dark inspecionado visualmente, e o gate do M7 re-rodado inteiro (24 checks, arestas visíveis no export, zero erros de console).
- 📋 **Registrado como residual**: o export de widget do dashboard (`WidgetWrapper`, era M1) ainda usa `html2canvas` — mesma classe de falha em dark; dono no bugfixes.md.

Gates: `tsc` 0 erros · catraca 37/6 · `gate:schema` completo (Chromium do Playwright; o canal `chrome` não existe na máquina).
