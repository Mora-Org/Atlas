# M8 — Media Library + File Uploads

> **Status:** 🟢 F0 ✅ + F1 ✅ + F2 ✅ MERGEADAS — F2 mergeada em `main` via **PR #37** (`633d8fe`, 2026-07-08), CI verde (backend pytest + frontend vitest+build + Vercel); QA TestSprite **12/14** (TC005/TC012 = fixture do gerador, `testtable1` sem coluna de mídia; fluxo provado por TC011 + 8 uploads — ver `testsprite_tests/testsprite-mcp-test-report.md`). F1 via PR #36 (`f3fce34`); F0 via `8f182d9`. **F3 ✅ MERGEADA** (PR #38, `dfcc92e`, 2026-07-09) — QA E2E ao vivo **12/12** (TestSprite cloud fora do ar, `bootstrap` timeou 2×) + bug real achado/corrigido (`serve_dev_asset` path aninhado, `5d5c79d`); pytest 125/7, CI verde. Ver §F3 + `testsprite_tests/f3-e2e-report-2026-07-09.md`. **F4 ✅ MERGEADA** (PR #39, `44d3793`, 2026-07-09) — import que CRIA tabela (dry-run infere+sanitiza → preview editável → commit reusa `create_table`); pytest 166/7, smoke 12/12, CI verde (ver §F4). `is_public` batido (bucket público + path opaco → #5 RLS storage.objects sai do escopo da F5). **F5 ✅ CODADA + VERIFICADA** (branch `m8-f5-hardening`, PR #40) — sniffing pure-python `filetype` (415), quota 250MB block-at-limit (413), GC das cópias-pub órfãs (guarda 24h), caps do ZIP pinados, **gate Playwright `validate-media.mjs` VERDE 2026-07-09** (E2E real: upload→célula→publish→público→ZIP→import F4, matriz 2×4, budget, console-errors=fail); pytest 192/7 + vitest 49 + eslint limpo (ver §F5). **F5 fecha o M8 → PR #40 carimba `0.7.0`.**
> Smells compartilhados do backend: inventariados no [plano do M-Ops](milestone_ops_observabilidade.md) (fonte única) e no [security.md](security.md).

## O problema

O Atlas não tem nenhuma noção de mídia. O motor de tipos honra exatamente 5 (Integer, String, Boolean, DateTime, Float) com **fallback silencioso pra String** (dynamic_schema.py:23-31) — a UI de criação já oferece 7 opções (incluindo Date e Text, tables/create/page.tsx:91-97), e Date/Text também caem no fallback: a UI promete mais do que o motor honra. Não existe endpoint que aceite binário: os únicos uploads são .sql e .csv/.xlsx (dados, nunca arquivo). O admin que quer foto de produto cria coluna String e cola URL do Imgur; o DataViewer trata como texto puro e o site público imprime a URL literal — `rowDisplay` reduz tudo a `String()` (PublicSite.tsx:240-250). Zero render de imagem em qualquer dos 3 contextos (Studio client, RSC público, `renderToStaticMarkup` do export).

A dor composta: o M6 vendeu site público + export "offline de verdade" (precedente woff2 — fontes embutidas no ZIP), mas um site com URLs externas entrega links quebrados sem internet e mídia hospedada em terceiro que pode sumir. É a milestone que o roadmap descreve como a que transforma os sites públicos de "tabela bonita" em "site de verdade" (roadmap.md:76).

## O que entrega

O admin **adiciona** uma coluna de tipo mídia a uma tabela existente, sobe o arquivo direto do DataViewer (ou reusa um já subido, via a **biblioteca central** do workspace), vê thumbnail na grade, a imagem/arquivo renderiza no site público nos 3 contextos e sobrevive ao export estático (mídia **embutida** no ZIP). Cada arquivo tem dono, tenant e ciclo de vida — deletar registro/coluna/tabela/admin limpa o storage por refcount — com limites e validação no servidor. O padrão bucket + path por owner + cleanup já está provado em `publication_storage.py` (JSON-only hoje); o M8 estende pra binário e adiciona a noção de **asset central** (`_assets`).

## Decisões fechadas no rebate (2026-06-15)

| # | Decisão | Escolha do Diretor |
|---|---|---|
| 1 | **Mutação de schema** (o verbo central não tinha rota) | **Construir no M8.** add-column em tabela existente + delete-table + drop-column, com os hooks de cleanup de mídia. Hoje **não existe** nenhum desses endpoints (achado ultracode — ver Fatos-âncora). |
| 2 | **Storage backend** | **Supabase Storage.** Cliente admin pronto (supabase_admin.py:31-41), mesmo padrão do `publication_storage`. Herda o free tier — keep-alive do M-Ops cobre o auto-pause. |
| 3 | **Acesso + offline** (URL × snapshot × ZIP, acoplados) | **URLs públicas + embutir no ZIP.** Offline de verdade (fiel ao precedente woff2). Aceita a privacidade fraca (path alcançável) e o ZIP que engorda — teto de embutir é decisão de 2ª camada. |
| 4 | **Biblioteca** | **Media Library central na v1.** Tabela `_assets` por workspace (subir 1×, reusar em N células) com refcount/detecção de órfão — não só célula-acoplada. |
| 5 | **Tipos na v1** | **image / file / attachment.** 3 comportamentos de render (imagem=thumbnail, PDF=preview/ícone, genérico=download). Fecha de quebra o smell do `data_type` string-livre (vira whitelist validada). |
| 6 | **Rider M7.5** (import de planilha) | **Dentro do M8.** Endpoint novo que infere colunas/tipos do CSV/XLSX, valida reservadas e **cria** a tabela (hoje o import só faz append em tabela existente). |

> **Consequência honesta:** o M8 deixou de ser enxuto. São 3 frentes pesadas num só guarda-chuva (mutação de schema + biblioteca de assets + render/snapshot/export de mídia) + o rider de import. As fases abaixo sequenciam isso; F0 é candidato a checkpoint próprio.

## Fases

| Fase | Entrega |
|---|---|
| **F0 — Mutação de schema (DDL)** | Os endpoints que faltam e que o verbo central exige: **add-column** em tabela existente (ALTER schema-per-tenant + RLS), **drop-column**, **delete-table** — cada um com o hook de cleanup. Inclui `DELETE /api/{table}/{id}` passar a **ler a row antes de deletar** (pra achar o path do arquivo) e fechar o buraco do `delete_admin` que em SQLite não dropa as tabelas físicas. Independente de mídia — pode fechar como checkpoint. **Detalhada e rebatida 2026-06-15 — ver §F0 abaixo.** |
| **F1 — Fundação de mídia + Media Library** | Tipos image/file/attachment no motor + validação (whitelist, fecha o smell do `data_type`). Tabela `_assets` central (dono+tenant), caminho de upload pro Supabase Storage (bucket público), refcount + ciclo de vida ligado aos hooks da F0. **Detalhada e batida 2026-07-05 — ver §F1 abaixo.** |
| **F2 — DataViewer + mídia (split F2a/F2b, 2026-07-06)** | **F2a:** editor de schema no front (`/admin/tables/[id]/edit`, inexistente) ligando add/drop-column + delete-table da F0 + tipo mídia (image/file/attachment) na criação de coluna. **F2b:** widget de upload + picker da biblioteca + render (thumbnail/ícone) na célula, religando os caminhos de edição de registro existente. M-Ops F1+F3 (pré-requisito) confirmados em `main`. **Detalhada — ver §F2.** |
| **F3 — Mídia no público, snapshot e export** (🔵 em execução, batida 2026-07-08) | PublicSite renderiza mídia nos 3 contextos (render **NÃO** bumpa `schema_version` — o blob v1 já carrega `data_type` + URL string; herança da F1). Publish **copia** a mídia pra local imutável por-versão (decisão #3=A). ZIP **embute** a mídia (degrada pra link-mode acima do teto). Fecha o preview do Studio (`tables={[]}`, PR4b do M6). **Detalhada — ver §F3.** |
| **F4 — Import de planilha (rider M7.5)** (✅ codada 2026-07-09) | Import que **cria** tabela do CSV/XLSX: server dry-run infere tipos + sanitiza headers → preview editável → commit reusa `create_table` da F0 + carrega linhas (coage Boolean/Integer/Float/DateTime). Bifurcação `create`×`append` no import existente. Anti-injeção via sanitizador de nome de coluna. **Detalhada + verificada — ver §F4.** |
| **F5 — Hardening + gate** (✅ codada + gate verde 2026-07-09) | Content-sniffing pure-python (`filetype`, 415 no mismatch; SVG/html já fora da whitelist desde a F1), quota 250MB/workspace (413 block-at-limit), GC das cópias de snapshot órfãs (reconcile no `/api/assets/gc`), pin dos caps do ZIP, gate Playwright E2E `validate-media.mjs` (**verde 2026-07-09**, `npm run gate:media`). **Fecha o M8 → carimba `0.7.0`. Detalhada + verificada — ver §F5.** |

## Decisões abertas (2ª camada — pro detalhamento, não bloqueiam o esqueleto)

1. **Protocolo/atomicidade de upload:** endpoint de upload separado que devolve path → POST/PUT referencia, vs multipart inline no POST/PUT, vs duas-fases com prefixo de staging + GC. Define a necessidade de coleta de órfão (upload OK + POST falha = asset sem referência).
2. **Direct-to-Storage vs proxy pelo backend:** browser sobe direto pro Supabase via signed-upload-URL (tira banda/memória do Railway, move parte do guard pro cliente) vs multipart → FastAPI → Storage (guard único no backend, mas Railway come memória/timeout em arquivo grande — mesmo risco de explosão que vale pro export).
3. **Permanência da mídia no publish:** no snapshot, a mídia é **copiada** pra um local imutável (como as rows já são) ou o `/public/{slug}` referencia mídia viva que vira 404 quando a origem é trocada/deletada? ("snapshot não é live" vale pra mídia também.)
4. **Esquema de path/nomeação:** legível/determinístico (`{owner}/{table}/{record}/{col}` — cleanup trivial, mas **adivinhável** num bucket público = information disclosure) vs UUID opaco (não-adivinhável, cleanup precisa de índice via `_assets`).
5. **RLS de Storage:** Supabase Storage **suporta** policies em `storage.objects`/bucket — usar (defesa em profundidade) ou guard só-backend? (Correção: a afirmação antiga "Storage não tem RLS" era falsa.)
6. **Thumbnails:** backend gera no upload (Pillow/ImageMagick → dep nova → spike medido, jurisprudência M7), transformação do provedor (Supabase Image Transformation, pode ser pago), browser redimensiona antes de subir, ou v1 serve original com CSS e adia. O roadmap lista "thumbnail generator" — cortar precisa ser explícito.
7. **Quota e limites:** teto por arquivo, quota por workspace, total por tenant, aplicado onde (cliente/backend/bucket policy) e quais números — vs o default de 50MB/arquivo do free tier do Supabase. Hoje não existe limite de nada.
8. **Forma do `_assets` e onde vivem os metadados:** colunas da tabela (mime, size, original_name, refcount) + se a célula guarda FK pro asset vs path nu + object-metadata do Storage.
9. **Semântica de substituir mídia:** overwrite-in-place (quebra snapshot que referenciava os bytes antigos) vs novo-path-on-replace (órfão até GC).
10. **Interação com `is_public`:** mídia de tabela privada é alcançável por URL pública? (Com a escolha "público", isto vira política explícita de F5.)
11. **Sub-decisões do import (F4):** formatos, override de tipo inferido, colunas ambíguas/mistas, transparência do `tenant_id` auto-adicionado no preview, client-parse vs server-dry-run.

## F0 — Detalhamento + Implementação (✅ MERGEADA 2026-06-15)

> **✅ Implementada e mergeada em `main` (`8f182d9`, 2026-06-15).** pytest **100 passed / 6 skipped** + CI verde. QA TestSprite: **6/9** — TC004/TC006/TC007 foram **artefato de ambiente** (colisão de nome no SQLite persistente do dev server + mensagens PT vs EN esperadas pelo gerador), não bugs: cada comportamento que elas checavam está verde e isolado no pytest (`test_drop_column`, `test_drop_column_blocks_pk`, `test_delete_table_wrong_confirm`).
>
> Detalhado via ultracode (5 exploradores + crítico de completude; a síntese caiu por erro transitório, o crítico reconciliou). **F0 é backend-only / checkpoint** — endpoints + testes pytest, nenhuma UI (vem na F2). Mídia em si (tipos, `_assets`, whitelist, render) é F1+ — a F0 só **arma os hooks** de cleanup.

### Decisões fechadas (Diretor)

| Decisão | Escolha |
|---|---|
| **SQLite** | **Postgres pleno, SQLite parcial.** add-column e delete-table funcionam nos dois; **drop-column** é pleno só em Postgres — em SQLite devolve erro controlado ("use Postgres pra isso"), evitando recreate-and-copy num caminho que prod não usa. Dev testa drop-column em Postgres local. |
| **Reversibilidade** | **Hard-delete + confirmação forte.** DROP irreversível; a trava real é server-side (o endpoint exige o nome da tabela/coluna como parâmetro). Lixeira/soft-delete continua no backlog, fora da F0. |
| **Permissão** | **Igual ao criar tabela** (`POST /tables/`): admin + moderador-com-permissão mutam; master bloqueado. Guard único reaproveitando `get_accessible_tables`. |
| **Superfície** | **Backend-only / checkpoint.** Sem UI na F0; botões e editor de schema (`/admin/tables/[id]/edit`, hoje inexistente) ficam pra F2. |

### Entregas

1. **add-column** a tabela existente — Postgres ALTER + SQLite ADD COLUMN (ambos nativos). Coluna nova em tabela com dados: exige default OU nullable (falha cedo, em vez de o banco rejeitar).
2. **drop-column** — Postgres `ALTER ... DROP COLUMN`; SQLite = erro controlado (deliberado, sem recreate-and-copy na F0). Guards: bloqueia coluna de sistema (`id`, `tenant_id`) e o CHECK `tenant_id_matches`; trata coluna que é origem de FK ou está referenciada em `_relations` (bloqueia ou limpa a relação órfã).
3. **delete-table** — DROP da física + linhas ORM (`_tables`/`_columns`/`_relations`) atomicamente; trata FK física **entrante** (outras tabelas do tenant podem apontar pra esta — CASCADE/ordem). Confirmação por nome.
4. **Fix `DELETE /api/{table}/{id}`** — passa a **ler a row antes de deletar** e armar o hook de cleanup (inerte até F1). **Gêmeo no `PUT /api/{table}/{id}`**: trocar valor arma o mesmo hook (mídia trocada orfana asset — F1 usa).
5. **Fix `delete_admin` em SQLite** — dropar as físicas `t{id}_*` (hoje só `DROP SCHEMA CASCADE` em Postgres; SQLite deixa órfãs). Reconstruir o nome físico como `t{id}_{name}` — o `physical_name` é não-confiável em SQLite (`dynamic_schema.py:531-545`).
6. **Testes pytest** — add/drop/delete por tenant, isolamento cross-tenant, guards de coluna especial, hard-delete por nome, permissão admin+mod, e o fix do SQLite.

### Notas de implementação (resolvo na execução — não são martelo do Diretor)

- **Atomicidade:** a DDL já roda numa conexão própria (`engine.begin()`), separada da sessão ORM do request — o `create_table` commita o ORM e *depois* abre a conexão de DDL (`main.py:552-645`, `dynamic_schema.py:128`). Os ALTER novos respeitam esse modelo de duas fases; a física é a fonte de verdade na releitura (`_load_physical_table`).
- **Timing do cleanup:** `delete_record`/`update_record` usam `tenant_db`, cujo commit roda no teardown (`main.py:478-501`), *depois* da função — então o hook não pode "limpar após commit" no corpo como o `delete_admin` (que usa `get_db` + commit manual). Seguir o precedente do `import_data`, que usa `db.begin_nested()` (savepoint) sob `tenant_db` (`main.py:1325`).
- **Injeção de identificador:** o `ALTER ... ADD COLUMN` interpola o nome da coluna — quoting/validação de identificador (distinto da trava de palavras-reservadas, que segue no backlog do [security.md](security.md)).
- **RLS:** a policy `tenant_isolation` é row-level (sobre `tenant_id`), column-agnostic — ADD/DROP de coluna comum não a toca. Sem framework de policy na F0.

### Não é F0 (guarda de escopo — o que os exploradores tentaram puxar pra cá)

- Whitelist de `data_type` + tipos image/file/attachment → **F1**.
- `_assets`, refcount, cleanup real do Storage → **F1** (a F0 só arma o hook).
- Editor de schema no front, edição inline de coluna, rename → **F2**.
- Bloquear delete de tabela publicada / semântica de snapshot → **M6/F3**, não F0.

## F1 — Detalhamento + Decisões (✅ MERGEADA 2026-07-05, PR #36 `f3fce34`)

> Detalhada via ultracode 2026-07-05 (5 exploradores + síntese + crítico de completude — veredito: sólida, 0 contradições com o rebate, 0 vazamentos de escopo). **Martelo do Diretor batido 2026-07-05.** Como a F0: **backend-only / checkpoint** — endpoints + migration + pytest, zero UI (widget/picker/render → F2/F3).

### Decisões fechadas (nº = decisão da 2ª camada)

| Decisão | Escolha |
|---|---|
| **#1 Protocolo de upload** | Endpoint próprio `POST /api/assets/upload` → devolve `{id, url}`; o POST/PUT dinâmico referencia a URL na célula, refcount na mesma sessão `tenant_db`. Órfão (upload ok + registro nunca veio) é aceito e coberto por GC (`refcount==0` + idade mínima **24h**). |
| **#2 Direct vs proxy** | **Proxy pelo backend** (UploadFile → Storage; content-type SEMPRE explícito — o default da lib é `text/plain` e corromperia o MIME servido). Signed-upload-URL (a lib pinada suporta) fica documentado como upgrade futuro se arquivo grande doer. |
| **#4 Path** | **Opaco**: `{owner_id}/{uuid}{ext}` em bucket novo dedicado, imutável, nunca reutilizado. Índice canônico de cleanup = `_assets` (não `list()` do Storage — raso e capped em 100). Path legível vazaria estrutura do tenant num bucket público. |
| **#5 RLS de Storage** | Guard só-backend na F1; policies em `storage.objects` → F5. Defesa em profundidade via **bucket provisionado em código** (idempotente no startup: `public=True`, `file_size_limit`, `allowed_mime_types`) — mata o smell do provisioning manual do dashboard. |
| **#6 Thumbnails** | **Cortado na v1** (ok explícito do Diretor 2026-07-05). Original com CSS na F2/F3; `mime`+`size_bytes` em `_assets` mantêm qualquer estratégia futura aberta. |
| **#7 Quota/limites** | **10MB/arquivo** (Diretor 2026-07-05), dupla camada: rejeição por Content-Length antes do read + `len(content)` pós-read + `file_size_limit` do bucket. Quota por workspace → F5. |
| **#8 `_assets` e forma da célula** | `_assets` **global** em public via migration Alembic (RLS enabled; corrige de quebra o gap de `_publication_versions` sem RLS): `id, owner_id FK CASCADE, uploaded_by, path UNIQUE, mime, size_bytes, original_name, refcount default 0, created_at`. **Célula guarda STRING = URL pública absoluta** — sobrevive ao round-trip do DataViewer (PUT ecoa o record inteiro), ao snapshot verbatim e ao ZIP **sem bump de `schema_version`**. Resolução URL→asset por prefixo determinístico + lookup em `path`. Object-metadata do Storage não é usado. |
| **#9 Substituição** | **Novo-path-on-replace sempre**; upload de mídia NUNCA usa upsert (o `upsert='true'` do publication_storage é pra retry de snapshot, motivação que não transfere). PUT decrementa o antigo → órfão até o GC. |
| **#3 Permanência no publish** | → **F3**. F1 não fecha a porta: paths imutáveis + GC nunca automático nos hooks + janela de 404 pós-publish documentada até a F3 decidir cópia-no-publish vs refcount-de-snapshot. |
| **#10 `is_public`** | → **F5**. Mitigação estrutural da F1: path UUID não-enumerável. |
| **#11 Import** | → **F4**. Hooks tratam valor que não resolve pra `_assets` (URL externa legada, import) como **no-op** — sem refcount fantasma, nada quebra. |
| **Moderador × biblioteca** | Biblioteca é do **workspace inteiro** (sem recorte por grupo): moderador com permissão vê, usa e sobe (Diretor 2026-07-05). `uploaded_by` preserva autoria. |
| **SVG** | **Fora da whitelist de MIME da v1** — fecha a janela de stored-XSS F1→F5 de graça. Sniffing/validação de conteúdo → F5. |
| **Dev sem Supabase** | Fallback **filesystem** (`backend/.media_dev/`, gitignorado) + rota GET servindo os bytes em dev; pytest usa o mesmo com reset entre testes. Gate único: `supabase_admin.is_configured()`. |

### Entregas

1. **Whitelist de `data_type` na borda Pydantic** (`ColumnCreate`) — cobre os 2 endpoints de criação de coluna (POST /tables/ e add-column da F0). Aceita os tipos do motor + grafias que a UI já envia + `image/file/attachment` (grafias canônicas — congelam em snapshot). Fallback do motor **intocado** (o import SQL grava `data_type` refletido e depende dele); mapping ganha entradas explícitas image/file/attachment → String.
2. **Migration Alembic `_assets`** (molde `c5dad43f9889`) + `ENABLE ROW LEVEL SECURITY` (incluindo o fix retroativo de `_publication_versions`).
3. **`media_storage.py`** (molde `publication_storage.py`): bucket provisionado em código, upload com content-type explícito, remove em batches, fallback filesystem + rota de serving local em dev.
4. **Endpoints registrados ANTES do bloco dinâmico** (Starlette casa por ordem de registro): `POST /api/assets/upload`, `GET /api/assets` (paginado), `DELETE /api/assets/{id}` (409 se `refcount>0`), sweep de GC como endpoint do workspace. Guard: admin+mod, master 403 (mesma régua das tabelas). Nome `assets` **reservado** no POST /tables/ (mini-trava; a trava geral segue no security.md).
5. **Refcount + ciclo de vida** nos 4 hooks da F0 — respeitando os **dois regimes transacionais** (DELETE/PUT de row: `tenant_db` com commit no teardown, tudo na mesma sessão; drop-column/delete-table: `get_db` + commit manual **e GUC de RLS setado antes de ler a física**, senão FORCE RLS devolve 0 rows silenciosamente em Postgres) + `delete_admin` limpa rows de `_assets` pré-commit e blobs pós-commit (never-raise, dirigido por `_assets`).
6. **pytest**: whitelist (aceita/rejeita nos 2 endpoints, import SQL segue verde), upload no fallback dev (teto 10MB, MIME, SVG rejeitado, master 403, isolamento cross-tenant), refcount nos 5 fluxos + reuso (1 asset em 2 células) + PUT parcial (chave ausente ≠ mudou), DELETE de asset referenciado → 409, GC, delete_admin, valor não-gerenciado = no-op.

### Kickoff checks (ações de verificação, não código)

- **Free tier / pause:** confirmar que o keep-alive cobre o caminho de mídia (o pause congela Storage também); upload/leitura com projeto pausado deve degradar em erro controlado, não 500.
- **Colisão de nome:** verificar em prod se algum tenant já tem tabela dinâmica `assets` (`SELECT` em `_tables`) — a rota literal nova sombrearia os dados dele.

## F2 — Detalhamento (split F2a → F2b, batido 2026-07-06)

> Detalhada via ultracode 2026-07-06 (5 exploradores + crítico de completude, 0 contradições). **Achado que reformou a fase:** F2 escrita bundlava DUAS features do zero que só dividem a palavra "mídia" — (a) o **editor de schema no front** (`/admin/tables/[id]/edit`, inexistente) ligando os endpoints backend-only da F0, e (b) o **subsistema de mídia** no DataViewer. Nenhuma estende UI existente. **Diretor bateu: quebrar em F2a + F2b** (jurisprudência F0 = grande demais vira checkpoint). F2a fecha a herança da F0 **e destrava a F2b** (coluna de mídia precisa existir antes da célula). **Desbloqueio confirmado por leitura:** M-Ops F1 (keep-alive `/health` que toca o DB, `main.py:142-152`) + F3 (rota dinâmica pagina `{data,total,limit,offset}` `main.py:1338-1401` e DataViewer já pagina) em `main` — a branch de mídia entra *dentro* desse pipeline sem quebrar o contrato.

### F2a — Editor de schema + tipo mídia (✅ codado + auto-verificado 2026-07-06 — aguardando QA/PR)

> **Verificação (Claude, 2026-07-06):** `tsc --noEmit` 0 erros nos arquivos novos; `eslint` sem regressão (os 2 erros de `tables/page.tsx` são pré-existentes, linhas 21/69); `next build` exit 0 (rota `ƒ /admin/tables/[id]/edit` força-compilada). **Smoke de contrato 13/13** contra backend vivo (SQLite/test-auth, login `testadmin`) replicando as chamadas HTTP exatas do editor: add-column `image` (minúsculo) → 200; `Image` (maiúsculo) → 422 (whitelist); `is_primary`/NOT-NULL → 400; drop-column SQLite → 400 controlado; delete-table confirm errado → 400 / certo → 200 + cleanup. **Browser não disponível nesta sessão bg (extensão Chrome desconectada) → QA visual da UI = passo TestSprite/Diretor.**

Liga a UI aos 3 endpoints já shipados/testados na F0 + oferece os tipos de mídia na criação de coluna. Backend F0 pronto: `POST /tables/{id}/columns` (add — só nullable/non-PK/non-FK, 400 senão), `DELETE /tables/{id}/columns/{col_id}` (drop — 400 em relação-em-uso/PK/coluna-sistema; pleno só em Postgres, SQLite = erro controlado), `DELETE /tables/{id}?confirm_name=` (delete-table, confirm por nome). Guard: admin+mod, master 403.

Entregas:
1. Rota nova `/admin/tables/[id]/edit` (espelha o wizard de criar) — lista colunas, add-column (form restrito aos limites da F0), drop-column (trata os 400 de guard), delete-table (digita o nome pra confirmar).
2. `image/file/attachment` como tipo selecionável — literais **LOWERCASE** (trap: o wizard de criar tem fallback silencioso `: Text` em `create/page.tsx:91-97`; add-column sem branch casada grava `'Text'`). **Fonte única de tipos** dirigindo wizard + editor, ancorada em `ALLOWED_DATA_TYPES` pra não driftar.
3. Estende o wizard de criar (`tables/create`) com os mesmos tipos.
4. Ponto de entrada: link editar/gerenciar por linha na lista de tabelas (`admin/tables/page.tsx`, hoje só abrir + toggle de visibilidade).
5. pytest/QA: add/drop/delete via UI contra os guards da F0.

Calls de execução (padrão F0/F1, resolvo eu): form de add-column esconde/desabilita is_primary/FK/NOT-NULL-sem-default; drop-column Postgres-only surfaça o erro controlado em SQLite dev; glyphs de mídia em `Icon.tsx`; página dedicada (não inline no DataViewer) casando o modelo mental do wizard.

### F2b — Mídia na célula (✅ codado + auto-verificado 2026-07-06 — aguardando QA/PR)

> **Verificação (Claude, 2026-07-06):** `tsc` 0 erros no fonte (o ruído em `.next/dev/types/*` é arquivo gerado, não fonte); `eslint` limpo nos 3 arquivos novos, sem regressão no DataViewer (os `any`/set-state-in-effect apontados são linhas pré-existentes); `next build` exit 0 (força-compila `Modal`+`MediaField`+DataViewer). **Smoke de data-path 19/19** contra backend vivo: upload PNG → URL dev absoluta + name/mime pro picker; a URL de serving devolve os bytes da imagem (alvo do `<img src>`); inserir a URL na célula faz o hook da F1 resolver URL→asset (refcount 0→1 — prova que gravo o valor certo); clear (PUT null)→0, re-set→1, DELETE de asset referenciado→409, delete do registro→0, DELETE do asset livre→200. **Browser não disponível (extensão desconectada) → QA visual de pixel/interação = passo TestSprite/Diretor.**

`renderField`/`displayValue` ganharam a branch de mídia (após Boolean, antes do Input genérico). Widget de upload (`POST /api/assets/upload`, multipart field `file` → grava a **URL string** na célula) + picker da biblioteca (`GET /api/assets`) num **Modal primitivo novo** (`ui/Modal.tsx`) + render (imagem→`<img>` thumbnail; file/attachment→ícone+download) na grade/cards + **religadas as edições de registro existente** (`commitMediaEdit` = PUT full-record; a edição inline de texto e o form de card agora desviam pra `MediaField` nas colunas de mídia) + clear (grava null→decrementa refcount) + guard client-side pro master (`canEdit={!isMaster}` → só preview). Arquivos: `ui/Modal.tsx`, `components/media/MediaField.tsx` + `MediaPreview.tsx`.

**Decisões de 2ª camada resolvidas (Claude, martelo do Diretor "resolvo eu"):** upload+biblioteca vivem num **único Modal** aberto por botão compacto na célula (32px não hospeda dropzone) — dropzone em cima, grid da biblioteca embaixo; **filtro client-side** no picker (busca por `original_name` + só-imagens quando a coluna é `image`); render adaptativo (thumbnail 40px na célula, mesmo componente `MediaPreview` no read e no widget); **sem progresso real** (fetch+FormData não emite eventos → swap "Enviando…"); coluna de mídia **excluída do título do card** (`titleCol` = primeira não-mídia); botão "editar 1ª coluna" escondido quando a coluna 0 é mídia. **Zero endpoint novo** — a busca é toda client-side sobre a página buscada.

### Guard-rails (não-F2)

- Render no **site público/snapshot/export** = **F3** (não tocar `PublicSite.tsx`/`exportStatic.tsx`; `rowDisplay` String()-coage e é compartilhado nos 3 contextos).
- **Hardening** MIME/tamanho/SVG + quota + gate Playwright = **F5** (a whitelist da F1 já existe; F2 confia no contrato). `accept="image/*"` client é UX, não controle de segurança.
- **Import de planilha** = **F4** (F2b copia só o idiom de dropzone do import, não mexe na feature).
- **Refcount** é 100% automático server-side (hooks `media_cleanup`); F2 só grava/limpa a URL string.

### Kickoff checks (Diretor — pra antes da F2b/mídia ir pra prod; **não bloqueiam a F2a**)

- **keep-alive real:** setar `HEALTH_URL` + Sentry DSN (ação de plataforma do M-Ops, ainda pendente).
- **Pause × Storage:** confirmar se o pause do free-tier do Supabase congela o Storage independente do DB que o `/health` pinga — se congelar sozinho, mídia pode dar 5xx mesmo com keep-alive verde.
- **Colisão de nome:** rodar em prod `SELECT id,name FROM _tables WHERE lower(name)='assets'` (leitura via MCP foi bloqueada na F1) — tabela dinâmica homônima seria sombreada pela rota literal.

## F3 — Detalhamento (mídia no público, snapshot e export; batido 2026-07-08)

> Detalhada via ultracode 2026-07-08 (5 exploradores + síntese + crítico de completude). **Veredito needs-revision** = 5 refinamentos incorporados (a correção de plataforma foi a material), **0 contradições** com F0/F1/F2. **Martelo do Diretor batido 2026-07-08** nas 3 decisões abertas. Herança da F1 confirmada por leitura: o blob `schema_version:1` já carrega `data_type` por coluna (`main.py:1798`) + a URL string na célula verbatim (`main.py:1775`) → **render nos 3 contextos + embed no ZIP NÃO bumpam `schema_version`**. O renderer TEM que tratar o v1 (snapshot com mídia passa a existir assim que uma tabela com coluna de mídia for publicada).
>
> **✅ Codada + auto-verificada 2026-07-08 (branch `m8-f3-media-public`).** As 5 entregas fechadas: (1) render nos 3 contextos, (2) copy-at-publish, (3) embed no ZIP, (4) preview PR4b, (5) pytest. **Gate:** backend pytest **124 passed / 7 skipped** (+5 F3, zero regressão) · frontend **vitest 49 passed** (+5 do `buildMediaBundle`, fetch mockado) · `tsc`/`eslint` limpos · `next build` exit 0 · smoke de copy-at-publish no fallback dev **15/15**. **QA visual (render de mídia no público/preview + download/unzip do ZIP) = passo TestSprite/Diretor** — browser não disponível nesta sessão bg (mesma situação da F2). **Sem bump de versão** (fase intermediária; o +0.1 → `0.7.0` sai no fechamento do M8).

### Decisões fechadas (Diretor 2026-07-08)

| Decisão | Escolha |
|---|---|
| **#3 Permanência no publish** | **A — Copiar no publish.** Retrato imutável de bytes: o publish copia os assets referenciados pra um prefixo por-versão no bucket (imutável). Snapshot nunca 404a, ZIP sempre embute bytes vivos. **Refcount fica LIMPO** (sem dimensão de snapshot — o ciclo da cópia = ciclo do snapshot; deletar versão/owner/admin remove a cópia por prefixo). Honra o contrato "snapshot é retrato imutável" + o precedente woff2 (embute, não referencia). Custo aceito: duplica bytes por versão retida; primitiva `copy()` nova + 3 seams de deleção + rollback. |
| **Preview do Studio (PR4b M6)** | **Fechar completo.** Endpoint de draft-preview reusando `_build_snapshot_payload` sem persistir → preview == publish (zero drift), conserta toda a fidelidade do preview (não só mídia). Mecanismo (endpoint vs client-fetch) = call de execução: **endpoint**, pra não ter preview≠publish. |
| **Prominência da imagem** | **Figura modesta inline.** Mídia renderiza nos slots que o layout já expõe (título/meta/rest[0]), theme-driven, `object-fit` limitado, **pulando mídia na escolha do título** (igual F2b: `columns.find(c => !isMediaBackendType)`). Mídia além do slot exposto fica invisível como qualquer coluna >=4 hoje. Sem virar sistema de blocos (M8.5). |

### Entregas

1. **PublicSite media-aware** — helper puro `MediaCell({url, mediaType, theme})` **DENTRO** de `PublicSite.tsx` (NÃO reusa o `MediaPreview` da F2 — é `'use client'` + usa CSS vars do admin-shell que não existem no `<head>` do export → quebraria o `renderToStaticMarkup`, um dos 3 contextos). `rowDisplay` passa a carregar `data_type` por campo (hoje seu param é `{name}[]` e dropa o `data_type` que `table.columns` já traz — `PublicSite.tsx:240,246`); importa só `isMediaBackendType` de `@/lib/columnTypes` (runtime-pure, seguro nos 3 contextos) + glyphs do `Icon` (puro). `image` → `<img src>`, `file`/`attachment` → `<a href>` + glyph. **Estilo 100% pelo prop `theme`** (`t.colors`/`t.typography`, zero CSS var). Acende RSC + export de uma vez, sem tocar `page.tsx` nem o snapshot. Título pula mídia (igual DataViewer/F2b).
2. **Copy-at-publish (#3=A)** — na costura entre `_build_snapshot_payload` (`main.py:1898`) e `upload` (`main.py:1906`): varre as colunas de mídia do payload, `copy()` os blobs gerenciados pra prefixo por-versão (`{owner}/snapshots/v{N}/…`), reescreve a URL na célula pro path copiado **antes** do upload. Primitiva `copy(src,dst)` nova em `media_storage.py` (Supabase `storage.copy` = server-side, N round-trips e não N×bytes pelo app; dev = `shutil.copy`). **+3 seams de deleção** removem as cópias por prefixo: `delete_publication_version` (`main.py:1992`), `delete_owner_snapshots` (`publication_storage.py`), `delete_admin`. Rollback (`main.py:1924`) estendido pra limpar as cópias se o commit falhar. **Sem bump de `schema_version`** (rewrite-in-cell — a célula continua string, agora apontando pro path copiado imutável).
3. **Embed no ZIP** — `buildMediaBundle(snap)` clonando o pipeline woff2 (`exportStatic.tsx:102-114`): coleta as URLs de mídia do payload, filtra as gerenciadas via a lógica de prefixo (`media_storage.url_to_path` espelhada server-side), fetch dos bytes (bucket público, sem auth), `markup.replaceAll(abs, './assets/media/'+base)` (mesmo mecanismo do `:113`), `zip.file('assets/media/…', bytes)`. **Degrada pra link-mode** (mantém a URL absoluta, `log()` do que ficou de fora — **sem corte silencioso**) acima de um teto de bytes/contagem — o spike mede o teto. **Plataforma: função serverless Vercel/Next** (`/api/export/[versionId]/route.ts`, não Railway) — `maxDuration` na route + guard de OOM são config Vercel; verificar a API contra os docs do fork (AGENTS.md). Sem cache global de bytes por request.
4. **Preview do Studio (PR4b completo)** — endpoint de draft-preview reusando `_build_snapshot_payload` sem persistir; `PublishStudio.tsx:233` passa a receber os dados reais das tabelas selecionadas (hoje `tables={[]}` cai no `SAMPLE_TABLE` sem mídia). `PublishContext` só carrega metadata de seleção (`{table_id,order,layout}`, `PublishContext.tsx:49`) — o preview busca as rows pelo endpoint (client-fetch montaria payload ≠ do publish).
5. **pytest/QA** — render de mídia nos 3 contextos com blob `schema_version:1` (fixture: **publicar** uma tabela com mídia — F2 já em main — ANTES do QA, nenhum snapshot em prod carrega mídia ainda); copy-at-publish (cópia criada no publish + removida no delete de versão/owner/admin + rollback); embed do ZIP (bytes presentes + URLs reescritas pra `./assets/media/`); degradação controlada pra link-mode acima do teto; preview==publish.

### Calls de execução (resolvo eu — padrão F0/F1/F2)

- **Discriminação de URL:** render chaveia pelo `data_type` da **coluna** (`image`→`<img>` mesmo pra URL externa colada); embed chaveia pelo **prefixo de URL gerenciada** (`url_to_path` — só embute o que é nosso; URL externa fica link absoluto offline, degrada só ela, igual qualquer link de 3º).
- **Env do prefixo gerenciado:** o coletor do export precisa da base do bucket público (`SUPABASE_URL`/`API_BASE_URL`) no env **server-side** da função Next; se faltar, tudo vira "externo" e nada embute (no-op silencioso) — guard explícito que loga.
- **Query-string na URL:** hoje as URLs são query-free (bucket público + proxy dev, `media_storage.py:68`) → `replaceAll` verbatim é seguro; signed-URL futuro reabriria (flag, não ação F3).
- **Nome do arquivo no ZIP:** mesmo idiom do woff2 (`url.split('/').slice(-2).join('-')`, `exportStatic.tsx:104`) — o path opaco `{owner}/{uuid}{ext}` já é único.

### Guard-rails (não-F3)

- Hardening MIME/tamanho/SVG, quota por workspace, gate Playwright, **GC automático das cópias**, sniffing de conteúdo, RLS de `storage.objects` = **F5**. O guard de OOM/embed da F3 é anti-estouro, não quota nem validação de conteúdo (a whitelist da F1 já cobre a borda).
- Thumbnail/resize server-side (cortado na F1 — original + CSS `object-fit`) **não volta** pra encolher o ZIP.
- Import de planilha = **F4** — nenhum parse/inferência entra aqui.
- Gráficos/blocos/galeria + **promoção de imagem a hero/bloco** = **M8.5**. Os 3 layouts (list/grid/essay) ficam media-aware sem virar sistema de blocos; não expandir quais colunas o layout expõe.
- Direct-to-Storage / signed-URL, path scheme, `is_public` — já batidos na F1 ou empurrados pra F5; a F3 não reabre.

### Riscos

- **ZIP explode** (woff2 ~50KB → 2000 linhas × coluna de 10MB = ~20GB teórico, ~dobrado pelo `nodebuffer` do JSZip). Geração síncrona na função **Vercel/Next** → timeout/OOM. **Link-mode acima do teto é obrigatório, não opcional**; o payload NÃO carrega `size_bytes` (vive em `_assets`, nunca joinado no snapshot — `main.py:1795-1802`) → o teto é por contagem + tamanho medido no fetch. Spike mede antes de fechar.
- Blob `schema_version:1` passa a conter mídia assim que uma tabela com coluna de mídia for publicada — o renderer TEM que tratar o v1 sem quebrar snapshot já publicado nos 3 contextos.
- `PublishContext` só tem metadata de seleção sem rows (`PublishContext.tsx:49`) — o fix do preview precisa de fonte de dados real (o endpoint); client-fetch arriscaria preview≠publish.
- **Copy-at-publish** adiciona latência ao publish (N round-trips do `storage.copy`) e duplica storage por versão retida — aceito pelo Diretor; monitorar se o publish fica lento em galeria grande (o `copy` é server-side, não passa bytes pelo app, então o risco é latência de N chamadas, não memória).

## F4 — Detalhamento (import de planilha que CRIA tabela; rider M7.5)

> Detalhada via ultracode 2026-07-09 (inferência + sanitizer/guard + endpoints/UI) sobre as **4 decisões batidas do Diretor** (2026-07-09). Compartilha o caminho de criar-tabela da F0 (`create_table` como função, não a superfície de mídia). **Nenhuma decisão do Diretor pendente** — as 4 estão marteladas; o resto é resolvo-eu. Herança confirmada por leitura: `create_table` já valida reservada (`main.py:597`), rollback do físico (`main.py:681-684`) e devolve `db_table` (`main.py:705`); a whitelist de `data_type` da F1 (`schemas.py:88-99`) valida a borda de graça.
>
> **Correção material (achado da leitura):** `set_tenant_for_session` usa `set_config('app.tenant_id', :tid, true)` — `true` = **transaction-local** (`tenant_context.py:58-65`), então o GUC de RLS é **apagado por qualquer COMMIT**. Como `create_table` dá 4 `db.commit()` manuais (`main.py:633/671/688/702`), o commit do import NÃO pode rodar sob `tenant_db` esperando o GUC sobreviver. O modelo certo já existe no `delete_table` (`main.py:997-1017`): `get_db` + `set_tenant_for_session` **re-setado antes de tocar a física** + `db.commit()` manual. F4 commit espelha isso.
>
> **✅ Codada + verificada 2026-07-09 (branch `m8-f4-import-planilha`).** 7 entregas fechadas. **Fix de integração achado no smoke ao vivo** (não previsto no design): CSV chega tudo string e o tipo **Boolean do SQLAlchemy rejeita `'sim'` cru** (derruba a linha) → `coerce_for_load` coage Boolean/Integer/Float/DateTime pro tipo Python antes do insert. **Gate:** backend pytest **módulo puro 29/29 + endpoints 12/12** (inclui contrato transacional + re-sanitize + coerção) · frontend `tsc`/`eslint` limpos + `vitest 49` + `next build` verde · **smoke ao vivo 12/12** (dry-run create infere Date/Boolean + sanitiza, commit cria+insere, dry-run append casa colunas). Ressalva: o **RLS GUC re-set** é correto-por-construção (espelha `delete_table`) mas **só reproduz em Postgres** — SQLite/CI não força RLS, então não é test-verificado localmente. QA visual do editor de schema = passo TestSprite/Diretor.

### Decisões batidas (Diretor 2026-07-09)

| # | Decisão | Escolha |
|---|---|---|
| 1 | **Bifurcação no import** | Toggle `create`\|`append` no `/admin/import/data`. **append** ganha preview REAL (hoje é fake, `import/data/page.tsx:200-203`); **create** = editor de schema novo. Commit do append segue no endpoint EXISTENTE (`main.py:1677`), intocado. |
| 2 | **Server dry-run** | Parse + inferência + sanitização **100% no servidor** (backend = fonte única). Sem client-parse. 2 endpoints (dry-run + commit), **re-upload** do `File` no commit (espelha o import SQL) — sem staging/tempfile no Railway efêmero. |
| 3 | **Sanitize + editable preview** | Headers sanitizados de forma transparente (mostra `original → proposto` + badge do motivo); o admin **renomeia / retipa / dropa** coluna antes de gravar. Coluna não reenviada no commit = dropada. |
| 4 | **Tipos editáveis** | Inferência **propõe** o tipo, o admin **sobrescreve** no Select `TYPE_META` completo (inclui `image/file/attachment` e Date/Text). Inferência nunca emite mídia. |

### Entregas

1. **Módulo puro `backend/import_infer.py`** (unit-testável sem FastAPI): `parse_spreadsheet(content, filename) → DataFrame`, `infer_column(series) → str`, `sanitize_headers(headers) → list[proposal]` (+ `sanitize_column_name`), `SYSTEM_COLUMN_NAMES = ("id","tenant_id")` e as constantes de cap no topo.
2. **`POST /api/import/table/dry-run`** (`mode` = create|append) — 3 segmentos, imune ao bloco dinâmico; co-locado após o append (`main.py:1738`). Guard admin+mod, master 403.
3. **`POST /api/import/table/commit`** (só `mode=create`) — re-upload, re-sanitiza, reusa `create_table()` + carrega as linhas.
4. **Extrair `_insert_dataframe(df, table, db_table, db)`** do loop de append (`main.py:1721-1735` — savepoints `begin_nested`, força `tenant_id` em PG); reusado pelo commit.
5. **UI** (`admin/import/data/page.tsx`): toggle no topo + editor de schema no preview do `create` (espelha o create-wizard) + preview real do `append` substituindo o fake.
6. **`fromBackendDataType(backend) → DataType`** em `columnTypes.ts` (reverso do `toBackendDataType`, pro Select do preview partir da grafia canônica).
7. **pytest** cobrindo módulo puro + os 2 endpoints.

### Heurística de inferência (`infer_column`, servidor)

Emite **exatamente** uma das 7 grafias não-mídia que o `ColumnCreate` aceita (`schemas.py:88-99`) — nunca mídia, nunca minúsculo. Cada coluna: `is_nullable=True, is_unique=False, is_primary=False` (o `id` PK é auto-injetado por `_build_columns`, `dynamic_schema.py:79-80`).

- **Leitura (a decisão de robustez):** CSV com `dtype=str` (preserva zero à esquerda — CEP/CPF, difere TODA decisão de tipo pro classificador). XLSX (1ª aba, `sheet_name=0`) lido tipado → dtype fast-path pra numérico/bool/datetime; object cai no classificador.
- **Dispatch:** bool→Boolean; int→Integer se cabe em **int32** senão String (PG INTEGER é 32-bit — ID grande/telefone estoura no insert); float integral→Integer/String senão Float; datetime64→Date se todo meia-noite senão DateTime; object→classificador.
- **Ladder do classificador** (varre a coluna INTEIRA capada, sem subamostragem): (1) **Boolean** só com token TEXTUAL (`sim/não/true/false/…`) — `{0,1}` puro→Integer; (2) **Integer** estrito `^[+-]?(0|[1-9]\d*)$` int32 (zero à esquerda→String); (3) **Float** só ponto-decimal/expoente (vírgula BR `3,14`=String, ambíguo); (4) **Temporal** via whitelist `strptime` (dd/mm antes de mm/dd), 100% casa — **depois** de int/float (então `"2020"` é Integer, nunca data); (5) **String vs Text** por comprimento (>255→Text).
- **Interação honesta com o motor (documentar, não é bug de F4):** `get_sqlalchemy_type` (`dynamic_schema.py:23-36`) **não tem Date/Text** → caem em String (VARCHAR) verbatim. Só **DateTime** vira TIMESTAMP → o load normaliza essas colunas pra ISO antes do insert (senão psycopg mistparseia dd/mm por-linha).
- **Caps (guard de OOM — hoje inexistente, `main.py:1697`):** `MAX_BYTES=10MB`, `MAX_ROWS=50_000`, `MAX_COLS=100`, hardcoded.

### Sanitizer + guard de coluna de sistema (`sanitize_headers`)

Risco NÃO é injeção SQL (`_quote_ident` `dynamic_schema.py:193` barra `"`/NUL). É: header vazio→`Column("")`; duplicata→erro; colisão com auto-injetadas — header `id` sem PK é **silenciosamente DROPADO** (`dynamic_schema.py:83-84`, perda de dados) e `tenant_id` em PG vira 2º `tenant_id` (500). Guard = normalizador determinístico + set reservado de 2 nomes (NÃO blacklist SQL — SQLAlchemy auto-quota `order/select`).

- **Normalizar:** NFKD + ascii-fold (`Preço`→`preco`) → lower → `[^a-z0-9]+`→`_` → colapsa → `strip("_")`; vazio→`column_{pos}`; começa com dígito→`col_`; trunca a **63**.
- **Reservado (auto-rename):** `id`→`id_col`, `tenant_id`→`tenant_id_col`, badge `reserved`.
- **Dedupe:** `_2,_3…` (`seen` semeado com nomes de sistema). Invariante de saída: `^[a-z][a-z0-9_]*$`, ≤63, ∉ sistema, único.

### Endpoints

**(A) dry-run** — `Depends(tenant_db)` (o append lê rows-amostra sob RLS). Byte-cap antes do read (413), parse, row/col-cap.
- **create:** `sanitize_headers` + `infer_column`; `name_status` = reserved/conflict/ok; bloco `system_columns` explícito. Response espelha summary/statements do SQL dry-run: `{mode, table_name, name_status, summary, columns:[{original_header, name, data_type, is_nullable, note, sample_values}], system_columns, sample_rows, warnings}`.
- **append:** SEM sanitização — casa RAW (sanitizar mentiria). Torna real o preview fake: `columns:[{original_header, match, target_type, sample_values}]`. Commit segue no endpoint existente.
- **JSON-safety:** `json.loads(df.head(5).to_json(orient='records'))` mata NaN/numpy do XLSX.

**(B) commit** (só create) — **`Depends(get_db)`** (commit manual). Fluxo: (1) guard+byte-cap+re-parse; (2) recebe `columns` JSON `[{original_header, name, data_type, is_nullable}]` (multipart não aninha); coluna sem `original_header` = dropada; (3) **re-roda `sanitize_headers` sobre os `name` editados** (idempotente) + `ColumnCreate` valida `data_type`; (4) **reusa o seam F0:** `TableCreate` → `create_table(...)` como função (herda reserved-check, rollback físico, auto id/tenant_id); (5) **re-seta o GUC** `set_tenant_for_session` **depois** do `create_table` e **antes** do insert (correção transaction-local); `_insert_dataframe` (savepoints); (6) **contrato atômico-no-grosso/best-effort-na-linha:** create atômico; célula ruim→`errors[]`; **falha DURA no load → dropa a tabela** (nunca deixa órfã vazia). Response: `{created, table, columns, inserted_rows, total_rows, errors[:10]}`.

### UI — bifurcação + preview editável (`admin/import/data/page.tsx`)

- **Toggle** (segmented control Mora), default **`append`** (muscle-memory; create opt-in). Dropzone reusada.
- **append:** Select de tabela → dry-run(append) → matched/unmatched + sample_rows, **substituindo o fake `:200-203`**. Commit = `handleUpload` EXISTENTE, INTOCADO.
- **create:** dropzone + Input nome (default = filename sanitizado) → dry-run(create) → **editor de schema** (espelha `tables/create/page.tsx`): por coluna `original_header`+`sample_values`, rename, Select `TYPE_META` (via `fromBackendDataType`), Toggle nullable, drop; `id/tenant_id` read-only; banner `name_status`. Commit = FormData `{file, table_name, columns:JSON}` → `/api/import/table/commit`.

### Calls de execução (resolvo eu — padrão F0/F1/F2/F3)

- Módulo único `import_infer.py` (parse+inferência+sanitizer, puro). Over-cap: byte→413; rows/cols→**400 rejeita** (NÃO trunca calado — tabela parcial é armadilha). Números: 10MB/50k/100; sample_rows=5, sample_values=3.
- Reserved `id_col`/`tenant_id_col`; dedupe `_2`; vazio→`column_{1-based}`; cap 63. `nullable=True` sempre; `fromBackendDataType` default `'string'`.
- **Commit re-seta o GUC** antes do insert. **Normalização temporal** só em colunas DateTime (TIMESTAMP); Date/Text são VARCHAR.

### Guard-rails (não-F4)

- **Mídia** (`_assets`, upload, render, refcount) = F1/F2/F3 — F4 só copia o idiom de dropzone.
- **Relações/FK inferidas** — fora; import cria tabela sem FK (ajustar a cópia "sugere relações" do header).
- **Hardening** de upload de planilha além dos caps, quota, gate = **F5** (o cap de F4 é anti-OOM, não validação de conteúdo).

### pytest

Módulo puro (sem FastAPI) + os 2 endpoints contra backend vivo. Inferência (zero à esquerda, int32, {0,1}vs{sim,não}, dd/mm, `"2020"`→Integer, >255→Text), sanitizer (`Preço (R$)`, dedupe, `id`→`id_col`, idempotência), dry-run (create/append, name_status, system_columns, caps, master 403), commit (happy-path, **RLS cross-tenant pós-`create_table`**, re-sanitize, contrato transacional, normalização temporal, drop-on-hard-failure).

## F5 — Detalhamento (hardening + gate; **fecha o M8 → carimba `0.7.0`**)

> Detalhada via ultracode 2026-07-09 (3 áreas: sniffing+quota, GC das cópias de snapshot, gate Playwright — sobre as 3 decisões batidas do Diretor). **Backend-only nas 2 primeiras** (zero import novo em `main.py`: `func`@`main.py:4`, `media_storage`@`main.py:10`, `models` já presentes); a 3ª estende o endpoint de GC existente sem rota nova (imune à armadilha da rota dinâmica). O gate é frontend/E2E. **Jurisprudência M6 F5: hardening é marco, não follow-up** — F5 é a fase de fechamento do M8.
>
> **F5 CARIMBA `0.7.0`.** Régua de versão (Diretor 2026-07-05, CLAUDE.md): fase de **fechamento de milestone = +0.1 minor, zera o patch** (`0.6.0 → 0.7.0`). O PR de F5 declara `0.7.0` na descrição + entrada nova no [patch_notes.md](patch_notes.md) (régua nova) + atualiza o status em `milestone_8_media_library.md:3`, o [roadmap](roadmap.md) e o "Estado Atual" do CLAUDE.md. As fases intermediárias (F1–F4) **não** bumparam de propósito — o +0.1 sai aqui.

### Decisões fechadas (Diretor 2026-07-09)

| # | Decisão | Escolha |
|---|---|---|
| A | **Sniffing de conteúdo** (o `.exe` renomeado pra `.jpg`) | **Pure-python** (`filetype==1.2.0`, zero-dep, MIT, ~19KB). Escopo **honesto = integridade** (rejeita lixo que não bate com o content-type declarado), **NÃO fecha XSS** — SVG/html já estão fora da whitelist da F1 (`media_storage.py:34-36`) e o content-type é sempre explícito no `upload()`. Mismatch → **415**. |
| B | **Quota por workspace** | **250MB, block-at-limit.** `SUM(size_bytes)` por `owner_id` + `len(content)` > teto → **413**, ANTES de escrever no Storage. Soft cap (sem row-lock; TOCTOU tolerado). |
| C | **GC das cópias de snapshot órfãs** ("fechar tudo") | **Estende `POST /api/assets/gc`** (não é rota nova), **por-owner**, com reconcile das cópias `{owner}/pub/vN__…` cujo `N` não está mais vivo, com guarda de idade de 24h. Fecha o único vazamento de storage que a F3 deixou aberto (cópia cujo snapshot sumiu por um caminho que pulou `remove_pub_media`, ou publish interrompido pós-`_freeze`). |

> **Consequência honesta:** o sniffing não cobre `text/plain`/`text/csv`/`application/json` nem Office legado OLE (`.doc`/`.xls`) — não têm magic bytes; `filetype.guess` volta `None` e nesses tipos confia-se no declarado. Um binário inerte disfarçado de `text/*` passaria (aceito: bytes inertes, bucket público+opaco, privacidade fraca já aceita na F1). Qualquer coisa COM magic reconhecível (o `.exe` = `application/x-msdownload`) volta não-`None` e é rejeitada. A quota conta órfãos `refcount=0` (ocupam bytes reais até o GC) e **NÃO** conta as cópias de snapshot (não têm linha em `_assets`) — o uso real do bucket pode passar do teto nominal; ambos documentados, não são bug.

### Entregas

1. **Sniffing na borda do upload** — `filetype==1.2.0` pinado (`requirements.txt`, alfabético entre `et_xmlfile==2.0.0`@`:14` e `fastapi`@`:15`); helper puro `sniff_ok(content, declared_mime) -> bool` + `_SNIFFLESS_MIME` + `_ZIP_FAMILY` em `media_storage.py` (após `ALLOWED_MIME`, `:49`); a chamada 415 em `upload_asset` logo após o empty-check (`main.py:1082`), ANTES do `original_name` (`:1084`).
2. **Quota por workspace** — `WORKSPACE_QUOTA_BYTES = 250*1024*1024` em `media_storage.py` (após `MAX_FILE_BYTES`, `:30`); o `SUM` + 413 em `upload_asset`, DEPOIS do sniff e ANTES do `media_storage.upload` (`main.py:1092`).
3. **GC das cópias órfãs** — helper `reconcile_pub_media(owner_id, live_versions, min_age_hours=GC_MIN_AGE_HOURS)` em `media_storage.py` (standalone, ao lado de `remove_pub_media`@`:181`, molde collect-then-remove + paginação, never-raise); `POST /api/assets/gc` (`main.py:1157-1178`) passa a montar o set de versões vivas e devolver `{"removed": N, "removed_pub_copies": M}` (campo **aditivo**, backward-compat).
4. **Pin do teto de embed do ZIP (F3)** — os caps provisórios do spike da F3 (`MEDIA_MAX_FILES`/`MEDIA_MAX_TOTAL_BYTES`, `exportStatic.tsx:134-135`) viram os números committados do hardening; o gate (check 6) guarda o caminho abaixo-do-teto. Sem mudança de comportamento — é a formalização.
5. **Gate Playwright `frontend/scripts/validate-media.mjs`** — E2E contra backend+frontend REAIS (fallback filesystem, sem Supabase), matriz 2×4 de tema, budgets, console-errors=fail. `"gate:media"` em `package.json` scripts (`:5-11`).
6. **pytest** — matriz de sniffing (1 arquivo real por tipo binário → 200; `.exe`→`.png` → 415), quota (N uploads passando de 250MB → 413), reconcile de cópias órfãs (`backend/tests/test_f5_pub_gc.py`).
7. **Carimbo `0.7.0`** — patch_notes + bump de versão nos docs (ver blockquote).

### (a) Sniffing — regras (helper puro em `media_storage.py`)

`sniff_ok` roda **depois** da whitelist de MIME declarado (`main.py:1075-1076`, então `mime` já ∈ `ALLOWED_MIME`) e adiciona a checagem de conteúdo por cima. Regra:

- `sniff == declared` → **ok**.
- `sniff is None` **E** `declared ∈ _SNIFFLESS_MIME` (`text/plain`, `text/csv`, `application/json`, `application/msword`, `application/vnd.ms-excel`) → **ok** (sem magic; confia no declarado).
- ambos ∈ `_ZIP_FAMILY` (`application/zip` + os 2 OOXML docx/xlsx) → **ok** (browser rotula container OOXML como zip genérico e vice-versa; mesmo container, todos na whitelist).
- senão → **415** (`main.py`: `raise HTTPException(415, "O conteúdo do arquivo não corresponde ao tipo declarado.")`).

Empiricamente verificado contra a whitelist F1 (`media_storage.py:37-49`): jpg/png/gif/webp/avif/pdf/zip/mp3/mp4/webm detectados; docx/xlsx → mime OOXML exato (peek no zip); `.exe` renomeado → `application/x-msdownload` (pego); texto/JSON/OLE-variante → `None` (tolerado). Escolhido sobre `puremagic` por: `None` limpo no desconhecido (puremagic levanta `PureError`) + fingerprint exato do OOXML. Roda in-memory sobre o buffer já lido (só inspeciona header/1º entry do zip → CPU negligível), antes de qualquer query.

### (b) Quota — `SUM` por owner, teto duro, 413

`owner_id` = o mesmo `tenant_id` de `_media_tenant_or_403` (`main.py:1066`), idêntico ao filtro de `list_assets`/GC (`main.py:1121/1169`). `size_bytes` = `models.py:145` (Integer → `SUM` volta int). No handler, logo após o bloco de sniff e antes do `upload`:

```python
used = db.query(func.coalesce(func.sum(models.Asset.size_bytes), 0)).filter(
    models.Asset.owner_id == tenant_id
).scalar() or 0
if used + len(content) > media_storage.WORKSPACE_QUOTA_BYTES:
    quota_mb = media_storage.WORKSPACE_QUOTA_BYTES // (1024 * 1024)
    raise HTTPException(413, f"Cota do workspace ({quota_mb}MB) atingida. Libere espaço na biblioteca.")
```

`func`@`main.py:4` (sem import novo). Códigos alinhados à convenção: 413 pra tamanho/quota (`main.py:1072/1080`), 415 pra tipo (`main.py:1076`). Cap por-arquivo (10MB, `MAX_FILE_BYTES`) « quota (250MB) → um upload sozinho nunca estoura a quota; sem interação entre os dois. Sem lock (soft cap): 2 uploads concorrentes podem ambos passar e furar o teto por ~1 arquivo cada — aceito.

### (c) GC das cópias órfãs — reconcile por-owner no `/api/assets/gc`

O buraco (problem-first): as cópias `{owner}/pub/v{N}__{basename}` (`media_storage.py:157-159`) só são removidas em 3 costuras explícitas — rollback de create (`main.py:2173`), `delete_publication_version` (`main.py:2270`), `delete_admin` (`main.py:297`), todas por `remove_pub_media`. **Não há reconcile**: uma cópia cujo `PublicationVersion` sumiu por um caminho que pulou `remove_pub_media`, ou deixada por um publish interrompido pós-`_freeze_snapshot_media` (`main.py:2152`) mas antes do commit da linha da versão (`main.py:2157`), **vaza pra sempre**.

Estende o sweep existente (`main.py:1157-1178`), mesma guarda (`_media_tenant_or_403`, master 403) e mesmo tenant — 1 ação de limpeza do workspace, não 2. Por-owner é **suficiente**: todo órfão vive sob exatamente um `{owner}/pub/`, e cópias de owner deletado já são varridas em massa por `delete_admin`. Após o commit do sweep de assets (`main.py:1176`):

```python
live = {r[0] for r in db.query(models.PublicationVersion.version_number)
        .filter(models.PublicationVersion.owner_id == tenant_id).all()}
removed_pub = media_storage.reconcile_pub_media(tenant_id, live)
return {"removed": len(paths), "removed_pub_copies": removed_pub}
```

Namespaces disjuntos (asset = `{owner}/<uuid>{ext}` flat; cópia = `{owner}/pub/vN__…`) → ordem indiferente, zero risco de deleção cruzada. O helper `reconcile_pub_media` remove `{owner}/pub/vN__…` cujo `N` (parse `^v(\d+)__`) **não** está em `live_versions` E é velho o bastante:

- **Guarda de idade (o pulo do gato):** `_freeze_snapshot_media` copia os blobs ANTES do commit da linha da versão (`main.py:2152→2157`), então um `vN` recém-publicado parece "órfão" (cópia existe, linha ainda não) por uma janela. O default 24h (`GC_MIN_AGE_HOURS`, `media_storage.py:31`) protege isso — mesma guarda do GC de asset. Fonte de idade difere por backend: dev = `os.path.getmtime`; Supabase = `created_at`/`updated_at` da list-entry (não há linha em `_assets` pra uma cópia → a idade vem do objeto do Storage). Timestamp nulo → conservador, não coleta.
- **Nome fora do padrão** `vN__` (regex miss) → nunca deletado.
- **Falso-negativo conhecido** (documentar em comentário): deletar o maior `vN` por um caminho que deixa a cópia + recriar `vN` (`next_number = max+1` reusa `N`, `main.py:2139`) → `N` fica vivo e o reconcile MANTÉM a cópia velha `vN__old` (basename diferente). Peso morto inofensivo, não é bug de serving.

### (d) Gate Playwright — `validate-media.mjs` (E2E, não mock)

**Diferença arquitetural do gate de schema:** `validate-schema.mjs` route-MOCKA o backend (só renderiza fixture estática); mídia **não pode ser mockada** — o valor é o round-trip upload→store→serve→publish→export→unzip. Roda **E2E contra backend+frontend REAIS** com o fallback filesystem (mesmo rig dos smokes F3/F4: `.media_dev/` servido por `GET /api/assets/dev/…`, `main.py:1181`; sem Supabase). Consequência que o gate de schema não tinha: **MUTA dados reais** → cada run usa `gate_media_${Date.now()}` + teardown best-effort (`DELETE /tables/{id}`, try/catch não-fatal) pra re-runs não colidirem. Todo scaffolding idêntico ao `validate-schema.mjs` (launch `channel:'chrome' headless`, listeners de console/pageerror, `GATE_BASE`, `mkdirSync(argv[2])`, `process.exit`). Login `testadmin`/`TestAdmin123!`.

Checks (cada um `[ok]`/`[FAIL]`, vira `failed`): **0** login · **1** criar tabela c/ coluna `image` pelo editor de schema (`create/page.tsx`, `selectOption('image')`) → prova F2a · **2** upload PNG válido no DataViewer + célula renderiza `<img>` com `src` incluindo `/api/assets/dev/` e `naturalWidth>0` (decodificou de verdade) → F1+F2b · **3** (**F5 sniffing negativo**) upload de `evil.png` com bytes `MZ…` spoofado `image/png` → **rejeitado** (div de erro do `MediaField`, sem `<img>`) → único proof E2E do sniffer · **4** publicar versão (exercita copy-at-publish F3) · **5** site público renderiza `<img>` com `naturalWidth>0` (as cópias servem) → F3 · **6** export ZIP baixa (`bytes>5000`) + `jszip` (dep@`package.json:18`) confere `index.html` + ≥1 entry sob `assets/media/` com `byteLength>0` → prova F3 embed + que os caps pinados não quebram o caminho normal · **7** import CSV cria tabela → F4 · **8** matriz 2×4 tema×acento (screenshots de inspeção, não hard-assert) · **9** budget `reload→tabela<2000ms` · **10** console-errors=fail (allowlist só `favicon`; `<img>` quebrado vira console error → backstop dos checks 2/5) · **11** teardown.

**Quota (250MB→413) fica FORA do gate de propósito** — subir 250MB headless é impraticável/flaky; é território de pytest backend (`SUM` + 413). O único proof de hardening no Playwright é o sniffing negativo (barato, DOM-observável). Invocação (no header do script, 3 terminais): T1 `uvicorn :8000` (SQLite/test-auth + fallback dev), T2 `next build && next start :3000` (**`start`, não `dev`** — a route de export download + a página ISR pública precisam do build de prod), T3 `npm run gate:media`; one-time `npx playwright install chrome`.

### Calls de execução (resolvo eu — padrão F0–F4)

- Lib = `filetype==1.2.0` (pure-python zero-dep, `None` limpo no desconhecido, fingerprint OOXML exato — verificado empiricamente); `sniff_ok`/`WORKSPACE_QUOTA_BYTES`/`reconcile_pub_media` vivem em `media_storage.py` (unit-testáveis puros), `main.py` só chama — handler fino.
- Ordem no handler: **sniff (in-memory) → quota (DB SUM) → `media_storage.upload`** — rejeita do jeito mais barato primeiro, nunca escreve bytes rejeitados no Storage.
- 415 pra sniff-mismatch (espelha `main.py:1076`); 413 pra quota (espelha `main.py:1072/1080`). `WORKSPACE_QUOTA_BYTES` = constante hardcoded (house style, fácil de tunar), não env var. Sem lock/advisory-lock na quota (soft cap, TOCTOU tolerado).
- GC: **estende** `/api/assets/gc` (não rota nova — evita o sombreamento da rota dinâmica), por-owner, resposta aditiva; `reconcile_pub_media` standalone (não refatora `remove_pub_media`), never-raise, idade default = `GC_MIN_AGE_HOURS`, param `min_age_hours` pros testes passarem 0.
- Gate: nome único `gate_media_${ts}` + `DELETE /tables/{id}` best-effort; fixtures inline como buffers (PNG 1×1 real, junk `MZ…` `evil.png`, CSV); `jszip` (dep existente) pro ZIP; budgets folgados (`<2000ms`, `bytes>5000`); `"gate:media"` em `package.json` (opcional `gate:schema` por paridade).
- Pin do ZIP: confirmar/committar os números de `exportStatic.tsx:134-135` como os finais (herança do spike F3).

### Aberto (não bloqueia o build — mínimo)

- **Run do gate = passo Diretor/QA** (browser não disponível em sessão bg, igual F2/F3/F4): eu codo `validate-media.mjs` + auto-verifico o backend (pytest + smoke), o Diretor roda os 3 terminais + TestSprite.
- **Sanity de plataforma (não-código):** confirmar que 250MB por workspace tem folga no free tier do Supabase Storage antes de prod (número é tunável numa constante). O `HEALTH_URL`/Sentry DSN seguem como ação de plataforma pendente do M-Ops (já rastreado, não é F5).

### Guard-rails (não-F5)

- **RLS de `storage.objects`** (policies no bucket) = fora do escopo — `is_public` foi batido na F1 (bucket público + path opaco); a decisão #5 saiu do escopo da F5 conforme `milestone_8_media_library.md:3`.
- **Thumbnails/resize** (cortado na F1) não voltam. **Import de planilha** = F4 (o cap de F4 é anti-OOM, não é o hardening de mídia daqui). **Blocos/galeria/promoção a hero** = M8.5.
- Sniffing **não** é anti-XSS (SVG/html já fora da whitelist); a quota **não** é RLS; o guard de embed do ZIP (F3) é anti-estouro, não validação de conteúdo.

### pytest

- **Sniffing** (`test_media_assets.py` ou novo): 1 arquivo real por tipo binário da whitelist (jpg/png/gif/webp/avif/pdf/docx/xlsx/mp4/webm/mp3/zip) → 200; `.exe`→`.png` (bytes `MZ`, declarado `image/png`) → 415; `.gif` renomeado `.png` declarado `image/png` (mismatch cross-format) → 415; texto/csv/json com `None` no sniff → 200 (tolerado no declarado).
- **Quota** (`test_media_assets.py`): N uploads empurrando `SUM(size_bytes)` além de 250MB → 413; workspace vazio → `coalesce(...,0)`; um arquivo isolado nunca estoura.
- **Reconcile** (`backend/tests/test_f5_pub_gc.py`, reusa fixtures de `test_f3_media_snapshot.py:21-64` + padrão de backdate de `test_media_assets.py:286`): (1) remove órfão `v9__`, mantém `v1__` vivo, `min_age_hours=0` → retorna 1; (2) órfão fresco com default 24h → retorna 0 (prova a guarda da janela de publish); (3) nome fora do padrão → 0 (intocado); (4) E2E HTTP: publica v1 (cópia real via `main.py:2152`), forja órfão `v99__`, `os.utime` pra >24h, `POST /api/assets/gc` → 200, `removed_pub_copies>=1`, cópia v99 sumiu, cópia v1 viva, master → 403.
- GC de asset atual segue verde (testes leem `res.json()["removed"]` por chave — campo aditivo é seguro).

### ✅ Verificação (2026-07-09/10)

- **Backend pytest: 192 passed / 7 skipped** (suíte completa; inclui `test_f5_hardening.py` com 26 testes novos — matriz de sniffing por tipo, 415 cross-format, quota→413 com monkeypatch do teto, reconcile unit + GC E2E HTTP com órfão forjado backdated). Fix de fixture: `test_f3_media_snapshot.py` subia bytes fake como PNG — trocado pela assinatura real (`\x89PNG…`) depois que o sniffing novo passou a rejeitá-los (o 415 funcionando).
- **Frontend: vitest 49 passed + eslint limpo.**
- **Gate `validate-media.mjs`: VERDE 2026-07-09** — ao contrário do previsto no "Aberto" abaixo, rodou **na própria sessão** (Playwright headless não precisa da extensão do Chrome; fallback chrome→msedge→chromium). 4 runs até o verde: fixes de robustez do próprio gate (`waitDecoded` = `naturalWidth>0` em vez de attach; `networkidle` settles pra navegações não abortarem fetches in-flight e sujarem o console-check). Screenshots da matriz 2×4 inspecionados (`frontend/media-shots/`).
- **Sanity de plataforma** (250MB × free tier Supabase) segue pendente como ação do Diretor — não bloqueia o merge.

## Dependências

- **M-Ops — ordem dura:** **F1 (keep-alive/upgrade) e F3 (paginação+DataViewer) do M-Ops fecham antes da F2 daqui** (mesmo DataViewer, mesmo Storage). CI e segredos já fechados/paralelos. O pause do free tier congela o projeto inteiro, **Storage incluso** (confirmar no kickoff): mídia herda o incidente de 2026-06-11; keep-alive pinga o `/health` (toca o DB, não o Storage diretamente).
- **M3 fechado** — Supabase com Storage em uso (bucket `public-snapshots`, padrão JSON-only) e cliente admin pronto (supabase_admin.py:31-41). Provisioning de bucket é **manual** no dashboard (zero `create_bucket` no repo) — o bucket de mídia repete o smell se nada mudar; precisa também de CORS pro multipart/OPTIONS do browser.
- **M6 fechado** — snapshot `schema_version:1` (columns+rows, MAX_ROWS=2000, sem conceito de asset). A F3 evolui de forma **aditiva e versionada**: os 3 contextos de render precisam entender o esquema novo E o antigo, ou snapshots publicados quebram.
- **M7 fechado** — gate Playwright verde 2026-06-15 (em main); não atravanca.

## Riscos

- **ZIP explode** ordens de magnitude (woff2 ~50-225KB → galeria de 50 fotos × 2MB = 100MB). Geração síncrona em Railway (`renderToStaticMarkup` + JSZip) pode dar timeout/estourar memória — **spike obrigatório** medindo em workspace grande antes de fechar o teto de embutir.
- **Upload de binário** abre superfície nova (content-type forjado, `.exe` como `.jpg`, **SVG = stored-XSS** servido do nosso bucket). Mesmo risco de memória/timeout do export vale pro upload via proxy (ver decisão 2).
- **URL pública = discovery:** com a escolha "público", o path é alcançável; se for legível/adivinhável, vaza mídia de tabela nunca publicada de outro tenant. Acopla path-scheme (decisão 4) + `is_public` (decisão 10).
- **Refcount/orfandade** da biblioteca central: deletar a última referência tem que limpar o asset; bug de refcount = arquivo órfão (custo) ou delete prematuro (404 em quem ainda usa). Caminho novo, sem precedente no repo.
- **Evolução do snapshot** precisa sobreviver aos 3 contextos — quebrar um quebra produto **já publicado**. Versionar a forma do valor da célula upfront, não improvisar.
- **DDL mutation em multi-tenant** (F0): ALTER em schema-per-tenant + RLS é superfície nova e sensível; o `delete_admin` já tem buraco conhecido em SQLite (não dropa físicas).
- **Lib de imagem** (se thumbnail pedir): nenhuma em `requirements.txt`; Pillow (C extensions, deploy size/memória) → spike medido por jurisprudência M7.

## Fatos-âncora (corrigidos pós-crítico ultracode 2026-06-15; **revisados pós-F0 em 2026-07-05** — line-refs abaixo drifteram com o merge da F0, âncoras atualizadas no detalhamento do §F1)

- ~~**Mutação de schema inexistente**~~ **RESOLVIDO PELA F0:** add-column (main.py:848), drop-column (main.py:893) e `DELETE /tables/{id}` (main.py:935) existem; `DELETE /api/{table}/{id}` (main.py:1205-1235) **lê a row antes** (hook F1 em 1229-1233) e o PUT idem (1196-1201); `delete_admin` (main.py:239-295) dropa as físicas também em SQLite. Nota do detalhamento: os "hooks" da F0 são o read + comentários `# F1 hook:` — a interface de cleanup em si a F1 cria do zero (liberdade de design, não retrabalho).
- Motor: 5 tipos honrados + fallback silencioso (dynamic_schema.py:23-31); UI oferece 7 (create/page.tsx:91-97); `data_type` é string livre sem enum no ORM (models.py:89) nem Literal no Pydantic (schemas.py:71).
- CRUD é **JSON-only** (`await request.json()`, main.py:929/1021) — sem multipart/UploadFile no fluxo de dados. Uploads existentes: import SQL (~main.py:1187), import/data append CSV/XLSX (main.py:1271-1332, ainda no caminho legado de prefixo, não schema-per-tenant).
- Storage provado JSON-only: bucket `public-snapshots`, path `{owner_id}/v{N}.json`, upsert, cleanup por owner chamado no `delete_admin` (publication_storage.py:11-143; chamada real em **main.py:265**). `json.dumps` usa `default=_json_default` (publication_storage.py:47-59; bytes via `.decode(errors='replace')`).
- **Supabase Storage SUPORTA RLS** (policies em `storage.objects`/bucket) — usar pra mídia é decisão aberta (não "não tem RLS").
- PublicSite renderiza nos 3 contextos inclusive `renderToStaticMarkup` (exportStatic.tsx:123,134); `rowDisplay = String()` (PublicSite.tsx:240-250); o blob do snapshot já carrega `data_type` por coluna (publication_storage.py:23).
- Export ZIP via JSZip com woff2 embutido (exportStatic.tsx:82-116, 232-253); precedente em milestone_6_fase5_export_plano.md:30-31.
- Frontend: `ui/Field.tsx` é wrapper de input de texto (não comporta estados idle/uploading/preview/error); `renderField` é if-else de ~40 linhas em 2 view modes; `package.json` sem lib de upload/imagem (tem html2canvas/jspdf/jszip/xlsx/lucide). Precedente de upload nativo HTML5 + FormData em `admin/import/data/page.tsx`.

## Não-objetivos

- Gráficos/blocos/views/layout do público além do render de mídia — **M8.5** (a evolução do snapshot daqui só abre caminho, não antecipa o tipo de conteúdo do M8.5).
- N arquivos por célula / galeria ordenada — a biblioteca central resolve **reuso** (1 asset → N células), não múltiplos por célula; galeria fica fora.
- Paginação, CI, error tracking, keep-alive — **M-Ops**; o M8 depende, não absorve.
- Audit de uploads e webhook de evento de mídia — **M9** (já listados lá).
- Realtime de qualquer espécie — **M10**.
- Editor de imagem, CDN dedicada, otimização avançada — backlog se houver demanda.
- Migração automática das colunas String com URLs externas pro tipo novo — admin recria; vira follow-up se doer em uso real.
- Itens do `backlog_export_pacotes.md` continuam sem dona — a mídia no ZIP não os puxa.
