# M8 — Media Library + File Uploads

> **Status:** 🟢 F0 ✅ + F1 ✅ MERGEADAS — F1 mergeada em `main` via **PR #36** (`f3fce34`, 2026-07-05). pytest **119 passed / 7 skipped**; QA TestSprite **10/12** (TC007/TC010 = artefatos do gerador — coluna criada como String em vez de image, desviando do plano; comportamento real reproduzido manualmente e verde — ver `testsprite_tests/f1-test-report-2026-07-05.md`). Próxima: **F2** (decisões de 2ª camada de F3/F4/F5 seguem abertas pros seus detalhamentos; M-Ops F1+F3 seguem pré-requisito duro da F2 — código fechado, falta só ação de plataforma do keep-alive).
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
| **F2 — Upload e render no DataViewer** | `renderField`/`displayValue` ganham o caso mídia: widget de upload na célula (precedente FormData do import) + **picker da biblioteca** (reusar asset), thumbnail/preview na grade, tipo novo na criação de coluna. **Só inicia após M-Ops F1+F3** (ordem dura: mesmo DataViewer, mesmo Storage). |
| **F3 — Mídia no público, snapshot e export** | PublicSite renderiza mídia nos 3 contextos. Snapshot evolui **aditivo e versionado** referenciando assets (o blob já carrega `data_type` por coluna — a quebra real só existe se a **forma do VALOR** da célula virar objeto; desenhar isso upfront). ZIP **embute** a mídia. Resolve o preview do Studio que hoje renderiza com `tables={[]}` (PublishStudio.tsx:233 — pendência PR4b do M6). |
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
