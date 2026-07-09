# Pesquisa — Fechar o M8 (F4 + F5) + próximo milestone (M8.5)

> **Isto é pesquisa pra rebater, não plano fechado.** Levantado via ultracode 2026-07-09 (4 exploradores + síntese) a pedido do Diretor ("comece a pesquisa do próximo módulo e próximo milestone"). Separa reuso (o que já existe) de net-new e consolida as decisões em aberto pro Diretor bater antes de virar execução. Nenhum schema/endpoint/lib está decidido aqui — os anchors ancoram a conversa, não prescrevem. Vira `milestone_8_media_library.md §F4/§F5` e `milestone_8_5_*.md` quando cada um for detalhado + batido.

---

## 1. Fechar o M8 — F4 (import) + F5 (hardening)

### F4 — Import de planilha (criar-tabela a partir de CSV/XLSX)

**Problema.** Hoje "importar planilha" é só *append*: `POST /api/import/data/{table_name}` (`backend/main.py:1677-1738`) casa `df.columns` contra as colunas de uma tabela **que já existe**, filtra a interseção e insere linha-a-linha. O wizard do front (`frontend/src/app/admin/import/data/page.tsx`) tem um "preview" **falso** — só lista as colunas da tabela-alvo como pills "aguardando" (`page.tsx:200-203`). Não há inferência de tipo, nem caminho pra *criar* tabela a partir da planilha. A F4 é isso: inferir schema → preview editável → confirmar → criar tabela (compartilhando o seam da F0) → carregar linhas.

**Reuso (já existe):**
- **Deps de parse server-side prontas:** pandas 3.0.1 + openpyxl 3.1.5 (`backend/requirements.txt:23-24`). CSV+XLSX parseiam no backend sem nova dep. SheetJS `xlsx@0.18.5` também está no front (`frontend/package.json:28`) → preview client-side também viável sem dep nova.
- **Seam correto de criar-tabela (F0):** `POST /tables/` → `create_table` (`backend/main.py:588-687`) → `create_physical_table` (schema-per-tenant + `tenant_id` + RLS). É por aqui que a F4 deve passar — **não** pelo caminho legado sqlglot-com-prefixo do import SQL (SQLite-only).
- **Precedente de infer→preview→commit:** o dry-run do import SQL (`main.py:1555` + `:1593`) é o padrão "server devolve um plano que o usuário confirma" mais próximo a espelhar.
- **Fonte única de tipos:** `ALLOWED_DATA_TYPES` + `ColumnCreate` (`backend/schemas.py:12-15, 88-99`); espelho no front `frontend/src/lib/columnTypes.ts`; type-picker do wizard de criar-tabela (`tables/create/page.tsx`) a reusar no preview.

**Net-new:**
- **Inferência de tipo por coluna** (header→nome + valores amostrados→tipo canônico). Pandas dtype não basta (NaN força float, `object` pra mistas, parsing de data heurístico) — precisa amostragem + heurística própria.
- **Endpoint/fluxo criar-tabela-a-partir-de-planilha** (inexistente).
- **Preview real editável** — o atual é placeholder; tratar como reuso subestima. Praticamente net-new, com bifurcação nova "criar tabela" × "anexar".
- **Sanitizador de nome de coluna / guarda de reservadas.** F4 é a **primeira** feature a alimentar strings de header não-confiáveis em posição de identificador DDL. Hoje o único guard é `RESERVED_TABLE_NAMES=('assets',)` (`main.py:1027`, checado em `:597`); **não há** trava geral de reservadas nem validação de nome de coluna no CREATE (não é injection cru — SQLAlchemy escapa — mas headers vazios/duplicados/lixo quebram o create).
- **Transparência das colunas de sistema no preview:** `_build_columns` injeta `id` (sem PK) e `tenant_id` (Postgres) em silêncio (`dynamic_schema.py:79-104`) — header `id`/`tenant_id` colide sem aviso.

### F5 — Hardening + gate (o fechador do 0.7.0)

**Problema.** F5 fecha as decisões *diferidas* do M8 (não é follow-up — jurisprudência "hardening é marco", M6 F5). #5 (RLS em `storage.objects`) e #10 (`is_public`) foram empurradas F1→F5; sniffing, quota agregada e GC automático das cópias-pub também caem aqui.

**Reuso (já shipado F1/F3):**
- Cap por-arquivo + MIME whitelist: `MAX_FILE_BYTES=10MB` (`media_storage.py:30`); `ALLOWED_MIME` com SVG/html fora (`media_storage.py:37-49`); enforce em app **e** bucket (`ensure_bucket`).
- GC de órfãos já existe: `POST /api/assets/gc` (`main.py:1157-1178`) varre refcount≤0 > 24h — modelo pra qualquer sweep novo.
- Precedente de gate: `frontend/scripts/validate-schema.mjs` (M7, 24 checks; download-then-assert-bytes; console-errors=fail). Clone-target pro `validate-media.mjs`. Playwright `^1.60.0` já no `package.json`.

**Net-new:**
- **Content-sniffing (magic-number)** — hoje só valida `content_type` declarado (`main.py:1074`). Decisão de lib (imghdr saiu no 3.13): `filetype`/`puremagic` (pure-python) vs `python-magic` (precisa `libmagic` no Railway — risco de deploy). Regra M7: dep nova = spike.
- **Quota agregada por workspace** — zero cap agregado. `SUM(size_bytes) WHERE owner_id` é barato; falta número + ponto de enforce + UX.
- **RLS em `storage.objects`** (#5) — só faz sentido se o bucket deixar de ser público (acopla ao `is_public`).
- **Sweep automático das cópias-pub órfãs** (F3-diferido) — hoje só saem em 3 seams de deleção explícitos; sem reconcile periódico.
- **Gate de mídia** (`validate-media.mjs`) + **pin dos números do ZIP embed** (placeholder `MEDIA_MAX_FILES=300`/`120MB`, `exportStatic.tsx`, comentado "spike afina").

**Honestidade sobre o XSS.** O blob é servido com o content-type do upload e SVG/html já estão fora da whitelist — um arquivo que mente "image/png" mas é HTML ainda é servido *como* image/png (browser não executa). O valor do sniffing é **integridade + rejeitar lixo**, não fechar um XSS vivo. Residual barato: dev-serve sem `X-Content-Type-Options: nosniff`.

---

## 2. M8.5 — Views / Gráficos / Impressos (próximo marco, 0.8.0)

**Problema de fundo.** **Não existe agregação server-side em lugar nenhum.** As rotas dinâmicas (auth `main.py:1353-1416`, pública `:1237-1296`) só fazem filtro + busca + sort + paginação; as `func.count()` são contadores de total, não agregação. Fase 1 (agregação) é alicerce; fase 2 (chart builder) consome; fase 3 (impressos) consome a 2. **Estritamente sequencial.**

**Reuso (já existe):**
- Libs prontas: recharts 3.8.0, jspdf 4.2.1, html2canvas 1.4.1, jszip, xlsx (`frontend/package.json`). Sem dep nova pra print raster.
- Snapshot versionado: `_build_snapshot_payload` (`main.py:1747-1830`) + `_publication_versions` (`models.py:153-181`, já guarda JSON freeform) — casa de um config de chart/view ou espelho pra `_views`. Molde Alembic: `e4b7a9c31f52` (`_assets` c/ RLS).
- Render editorial 3 contextos: `PublicSite.tsx`; o **`MediaCell` do F3** é o precedente exato de componente puro theme-driven que **não reusa** o componente client — é assim que um chart público tem que ser.
- Pipeline de export (reuso pesado p/ impressos): `exportStatic.tsx` (`buildExportZip`, `renderToStaticMarkup`, `buildMediaBundle`) + `api/export/[versionId]/route.ts`.
- Raster PDF/PNG em prod: `SchemaCanvas.tsx:242-309` (`exportPNG` com gotchas de html2canvas já documentadas).

**Net-new:**
- **Endpoint de agregação** GROUP BY + COUNT/SUM/AVG/MIN/MAX sobre tabela dinâmica multi-tenant, RLS-safe, validando nome de coluna contra `table.columns` (mesma superfície de identifier-injection do F0/F4).
- **Tabela `_views`** (migration + RLS) pra saved views/configs.
- **Chart builder admin** (filtro A vs B) + **componente de chart Mora theme-aware static-safe**. Trap: recharts é `use client`/SVG, `ResponsiveContainer` **não renderiza em `renderToStaticMarkup`** — precisa SVG dimensão-fixa ou pré-rasterizar no publish (como F3 faz c/ mídia).
- **Evolução do schema do snapshot** pra config de chart sobrevivendo aos 3 contextos + aos v1 já publicados (disciplina aditiva/no-bump do F3, ou `schema_version:2`).
- **Impressos (fase 3):** CSS de print (`@page`, page-break) — **zero precedente** no front. Dois templates (panfleto / acadêmico); "fontes citadas" do acadêmico **não tem fonte de dados** hoje (nenhum campo de proveniência).

**Armadilha registrada.** `frontend/src/components/widgets/` (`BarChartWidget` + `WidgetWrapper`) *parece* base de chart mas é **dead code** (importado em lugar nenhum, cores dark hardcoded não-Mora, `react-grid-layout` instalado e não-usado). Referência de export raster, não drop-in — planejar como reuso engana.

---

## 3. Reuso-chave & riscos transversais

**Os 3 seams que carregam o arco:**
1. **F0 create-table** (`main.py:588-687` → `create_physical_table`) — F4 passa por aqui.
2. **Snapshot + `_publication_versions`** (`main.py:1747-1830`, `models.py:153-181`) — casa de config de view/chart do M8.5.
3. **`PublicSite` + `exportStatic` + `MediaCell`** — render nos 3 contextos; o F3 já resolveu "servir dado novo sem componente client" pra mídia = mapa pro chart público.

**Riscos a carimbar cedo:**
- Trava de reservadas/nome de coluna é smell aberto (`security.md`) e F4 é quem primeiro o exercita com dado não-confiável.
- Zero teto de tamanho/linhas no import (`main.py:1702-1704` lê o arquivo inteiro na RAM) — risco OOM/timeout Railway; F4 herda, F5/export têm o mesmo placeholder a pinar.
- Rota reservada/shadowing (CLAUDE.md): `/api/views`, `/api/{table}/aggregate` declaradas depois do bloco dinâmico (`~main.py:1353`) são engolidas — registrar antes + reservar `views`.
- `renderToStaticMarkup` × recharts shapeia fase 2 **e** 3 — subestimá-lo repete o problema que o F3 resolveu pra mídia.
- Fork **`is_public`** (F5) e fork **snapshot-vs-live** (M8.5) cascateiam: "bucket privado + signed URLs" reabre F1/F3 (o `replaceAll` verbatim do ZIP quebra com query-string); "chart live" viola a imutabilidade do M6. **Ambos = call do Diretor antes de codar.**
- **F3 (PR #38) ainda aberto.** F5 constrói direto sobre copy-at-publish + `buildMediaBundle`; assume F3 aterrissado.

---

## 4. Sequenciamento sugerido (a confirmar — não decisão)

- **Fechar o M8:** F4 é **independente do PR #38** (passa pelo seam de create-table da F0, não toca mídia) → pode andar **em paralelo/primeiro** enquanto o review do F3 assenta, e é mergeável sozinha. **F5 é o fechador do 0.7.0** e constrói sobre copy-at-publish + `buildMediaBundle` do F3 → depende do F3 aterrissar **e** do call do Diretor sobre `is_public` **antes** de qualquer código. Logo: **F3 merge → F4 (paralelo) → F5 por último** (fecha as diferidas #5/#10/sniffing/quota/GC/gate).
- **M8.5:** ordem forçada pela dependência de dados: **fase 1 (agregação + `_views`) → fase 2 (chart builder + componente static-safe) → fase 3 (impressos)**. As 2 decisões de escopo (snapshot-vs-live e renderToStaticMarkup/recharts) têm que ser batidas **antes** da fase 2 tocar o público/export, senão viram retrabalho.

---

## 5. Decisões abertas pro Diretor (14, agrupadas — rebater antes de detalhar cada fase)

### F4 — Import
1. **Fluxo novo vs reforma:** F4 é fluxo NOVO (só "criar tabela da planilha") ou reforma da página import/data com bifurcação "criar nova" × "anexar em existente"? Uma entrada de menu ou duas? *(Define toda a superfície de UI.)*
2. **Arquitetura do preview:** client-parse (SheetJS já no front, instantâneo) vs server-dry-run (pandas já lá, fonte de verdade, casa com o guard anti-injeção no backend)? *(Gate da arquitetura inteira da F4; client-parse arrisca preview≠commit.)*
3. **Cabeçalhos problemáticos:** vazio/duplicado/`Preço (R$)`/colisão com id·tenant_id — sanitizar em silêncio (snake_case+dedupe) ou forçar correção no preview? Mostrar as colunas de sistema auto-injetadas? *(F4 é a 1ª a alimentar header não-confiável em DDL; sem trava geral hoje.)*
4. **Teto + edição:** qual o cap de tamanho/linhas (hoje ZERO limite, risco OOM)? O admin sobrescreve tipo inferido / renomeia / marca PK no preview, ou a inferência é final?
5. **Formatos:** só CSV+XLSX (1ª aba)? multi-aba? .xls? sem cabeçalho? encoding/delimitador auto ou configurável?

### F5 — Hardening
6. ~~**`is_public` (o maior fork do M8)**~~ — **✅ BATIDO 2026-07-09 (Diretor): manter bucket PÚBLICO + path UUID opaco.** Aceita a privacidade fraca (path alcançável por quem tiver a URL), consistente com a decisão #3 (2026-06-15) que já concedeu isso. Motivo: privado+signed-URL reabriria a F1 (esquema de path) **e quebraria o embed do ZIP da F3** (query-string derrota o `replaceAll` verbatim); o path UUID já dá não-enumerabilidade. **F5 NÃO vira bucket privado** — só o hardening barato (`nosniff` no dev-serve `main.py:1206`, content-sniffing pra integridade, quota por workspace). Consequência: **#5 (RLS em `storage.objects`) sai do escopo** (só faria sentido com bucket privado). Reversível, mas com o custo de reabrir F1/F3.
7. **Números de quota:** cap agregado por workspace (MB/GB, contagem)? Conciliar com free-tier Supabase (~1GB TOTAL entre tenants)? Bloqueia (413) ou soft-warn?
8. **Lib de sniffing:** pure-python (`filetype`/`puremagic`, sem dep de sistema) vs `python-magic` (precisa `libmagic` no Railway) vs magic-bytes manual pros poucos tipos da whitelist? *(python-magic pode surpreender no deploy, classe-Pillow.)*
9. **F5 fecha mesmo as diferidas** (#5 RLS storage.objects, #10 is_public, sniffing, quota, GC-cópias) ou re-difere? Os números do ZIP (300/120MB) saem por fiat ou por spike de "workspace grande"?

### M8.5 — Views/Gráficos/Impressos
10. **Snapshot-vs-live (decisão registrada, roadmap.md:103):** chart público **congela** o agregado no snapshot no publish (imutável, ZIP-embeddable, stale até republicar) ou consulta **live** contra `/public/api` (sempre atual, contradiz M6, vaza escopo do M10)? Impressos seguem o mesmo? *(Gate do design público inteiro do M8.5.)*
11. **Static-export do chart:** um chart público precisa sobreviver ao `renderToStaticMarkup` (sem DOM)? Se sim, recharts `ResponsiveContainer` está fora — SVG dimensão-fixa ou pré-rasterizar no publish e embutir como F3 faz? *(Trap que shapeia fase 2 e 3.)*
12. **Escopo de "saved view":** só configs de agregação/chart ou também views de tabela filtradas/ordenadas (backlog "Saved views")? Ferramenta privada de análise, publicável, ou ambos? Modelo de acesso do moderador (workspace-wide como `_assets` ou scoped)?
13. **Chart no layout público:** PublicSite só tem list/grid/essay — o chart é um tipo de seção top-level novo (bloco), interleaved com tabelas, ou uma superfície "dashboard" separada? *(Molda o schema do snapshot + o quanto o PublicSite evolui sem quebrar v1.)*
14. **Impressos:** 2 templates FIXOS opinados (panfleto/acadêmico hardcoded) ou CONFIGURÁVEIS (theme-driven como os 4 presets)? Mecanismo: raster (html2canvas+jspdf) vs vector (`@media print`+`window.print`) vs server HTML→PDF (dep nova = spike)? E de onde vêm as "fontes citadas" do acadêmico (nenhum campo de proveniência existe)?
