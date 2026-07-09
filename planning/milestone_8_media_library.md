# M8 — Media Library + File Uploads

> **Status:** 🟢 F0 ✅ + F1 ✅ + F2 ✅ MERGEADAS — F2 mergeada em `main` via **PR #37** (`633d8fe`, 2026-07-08), CI verde (backend pytest + frontend vitest+build + Vercel); QA TestSprite **12/14** (TC005/TC012 = fixture do gerador, `testtable1` sem coluna de mídia; fluxo provado por TC011 + 8 uploads — ver `testsprite_tests/testsprite-mcp-test-report.md`). F1 via PR #36 (`f3fce34`); F0 via `8f182d9`. **F3 ✅ codada + auto-verificada 2026-07-08** na branch `m8-f3-media-public` (5 entregas; backend pytest 124/7, frontend vitest 49, `next build` verde; ver §F3) — **aguardando QA visual (TestSprite/Diretor) + review/merge**. Detalhada via ultracode + martelo do Diretor nas 3 decisões abertas (needs-revision → 5 refinamentos, 0 contradições).
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
| **F4 — Import de planilha (rider M7.5)** | Endpoint de inferência (colunas/tipos do CSV/XLSX) + criar-tabela, com validação de reservadas (anti-injeção via nome de coluna) e preview do mapeamento. Parcialmente paralelo (compartilha o caminho de criar-tabela da F0, não a superfície de mídia). |
| **F5 — Hardening + gate** | Validação de tipo/tamanho/MIME no servidor (incl. **SVG-como-XSS**), quota por workspace, cleanup verificado por teste, gate Playwright (matriz 2×4, budgets, console errors = fail). Jurisprudência M6 F5: hardening é marco, não follow-up. |

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
