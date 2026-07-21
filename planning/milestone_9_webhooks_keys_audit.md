# M9 — Webhooks + API Keys + Audit Log: porta de serviço e memória

> **Status:** 🔵 F1 DETALHADA + 4 decisões BATIDAS 2026-07-21 (ultracode, 12 agentes / 1,18M tokens). **Liberada pra codar** quando o M8.5 fechar (falta só a F2.2c/gate). F2/F3/F4 seguem 🟢 esqueleto.
> Fecha `0.9.0` (régua: fase intermediária não bumpa).
> Smells compartilhados do backend: inventariados no [plano do M-Ops](milestone_ops_observabilidade.md) e no [security.md](security.md).

## F1 — decisões BATIDAS pelo Diretor (2026-07-21)

| # | Decisão | Escolha |
|---|---|---|
| **G1** | Escopo (quais mutações) | **Forense completo** — CRUD + DDL + import + auth-plane (reset senha, grant/revoke perm, criar/apagar mod, update workspace) + publish (create/**activate**/delete version) + `toggle_visibility` + views M8.5 + relations + assets. `action` é String livre; o **conjunto de strings nasce nomeado** (não ad-hoc). |
| **D1** | Ator | **Polimórfico**: `actor_type` + `actor_id` (soft, sem FK) + `actor_label` (NULLABLE). Helper `audit.record(db, actor: Actor, …)`. |
| **D3** | Durabilidade | **Morre com o tenant** — `owner_id` CASCADE + companion delete no `delete_admin`. |
| **D4** | IP/UA | **Guardar** — `actor_ip`/`user_agent` NULL; coluna nasce na F1, preenchimento load-bearing na F2. |

### Decorrências (Claude decide — seguem das 4 acima + LGPD)
- **G2 → alvo POLIMÓRFICO** (forçado por G1=completo): `target_type` + `target_id` genérico + `target_label`, molde do ator. Auth/publish não têm tabela-alvo, então `target_table`/`changed_columns` viram o caso *table* de um alvo polimórfico, não o esquema fixo.
- **Decisão 2 = EVENTO só** (não diff): `changed_columns` = nomes, zero valor de célula. LGPD força (diff = 2ª cópia de PII colidindo com erasure); afrouxar depois é coluna aditiva. Se o Diretor quiser before/after de config, reabre.
- **Decisão 5 = bulk AGREGADO**: 1 evento por import (não N por linha); `import_sql_script` recebe evento coarse próprio.
- **G3 = o helper DIFERE POR CAMINHO**: atômico (`tenant_db`) → pode levantar (aborta junto). Não-atômico (DDL/`import_sql_script`, mutação já durável) → `try/except` + `logger` "atlas" (nunca derrubar DDL que já funcionou).
- **G5/G4 = audit é SIBLING, não a fonte de eventos** (a decisão #3 diz que a outbox da F3 serve o payload). Então `_audit_log` **não** precisa de `dispatched_at`/status na 1ª migration — ordenação/entrega é problema da outbox da F3. *(Assunção a confirmar no rebate da F3; se o audit virar a fonte, precisa de coluna de dispatch.)*

## F1 — detalhamento (ultracode 2026-07-21)

> 5 frentes + cético por frente + síntese + crítico de completude. Âncoras reverificadas contra HEAD `8969dda` — sem drift material. **Nada codado.**

### O que os céticos e o crítico mataram (medido, não deduzido)
- **Benchmarks "MEDIDO" NÃO EXISTEM.** As frentes venderam multiplicadores de custo (`1.78x`/`2.41x`/`agg 1.00x`) como medição; `find *bench*` no backend = **0 arquivos**. As decisões sobrevivem na arquitetura (audit barato, bulk agregado), **não** nesses números. Apresentar dedução como medição é o pecado da M8.5 F1 de novo.
- **"Choke-point único de bulk" é FALSO.** `import_sql_script` (`main.py:1680`) é 2º caminho — `engine.begin()` em conexões separadas, conta por STATEMENT, **não-atômico** com `tenant_db`.
- **"O 'quem' sobrevive a QUALQUER delete" é FALSO** (3 frentes repetiram). `db.delete(admin)` (`main.py:287`) com `owner_id` CASCADE apaga a trilha **inteira** do tenant em PG. O `actor_label` sobrevive à deleção do ATOR, não do OWNER.
- **`actor_label` NOT NULL acoplaria bug de audit à escrita de produção** (o INSERT é atômico com a mutação → NOT NULL violado aborta a escrita do cliente). Usar NULLABLE + invariante de app + teste.

### 5 decisões do menu (recomendações)
| # | Decisão | Recomendada |
|---|---|---|
| 1 | **Modelo do ator** | **Polimórfico**: `actor_type` (String, só 'user' na F1) + `actor_id` (Integer, soft pointer, sem FK rígida) + `actor_label` (snapshot NULLABLE do username). Helper `audit.record(db, actor: Actor, …)` recebe abstração, nunca `models.User` cru → F2 emite `('key', id, name)` no mesmo helper, zero migration. |
| 2 | **Evento vs Diff** | **Evento só**: `changed_columns` = lista de NOMES (nunca valor de célula). LGPD: o log nunca vira 2ª cópia de PII → erasure não varre o audit. `sa.JSON` (nunca ARRAY — backend não usa), coluna `details` (nunca `metadata`, reservado). |
| 3 | **Durabilidade vs delete do tenant** (decisão 9, o ÚNICO conflito real) | **Morre com o tenant**: `owner_id` CASCADE + **companion delete explícito no `delete_admin`** (obrigatório — SQLite não enforce FK, CASCADE é inerte em dev). LGPD-limpo. |
| 4 | **IP + User-Agent** | **Guardar** (`actor_ip`/`user_agent` NULL): é o único sinal que detecta exfil de key vazada por localização — a justificativa inteira de auditar leitura-via-key. Custo: `request: Request` em ~15 assinaturas (ou middleware+contextvar, G7). Coluna nasce agora, preenchimento vira load-bearing na F2. |
| 5 | **Bulk import** | **1 evento agregado por import** (hook no handler, não no choke-point) — evita a tempestade de 10k eventos. `import_sql_script` recebe evento coarse próprio (cardinalidade = statements ≠ linhas). |

### Gaps do crítico de completude (upstream do menu, travam a 1ª linha)
- **G1 — ESCOPO: quais mutações a F1 audita?** *A decisão nº1, e o menu não a tinha.* A lista de `ready` cobre só CRUD+DDL+import e **omite ~15 handlers de maior valor forense** — justo os que a decisão #1 cita como motivação: auth-plane (`reset_moderator_password:388`, `grant/revoke_permission`, `create/delete_moderator`), publish-plane (`activate_publication_version:2427` = o site vai ao ar), `toggle_table_visibility:879` (expõe o tenant), e as views do M8.5 (`create/update/delete_view`). `action` é String livre, mas QUAIS strings? Nomear o conjunto explicitamente. **É a decisão que trava `action` + o nº de hooks.**
- **G2 — TARGET polimórfico?** Se auth/publish entram (G1), o alvo é `User`/`Permission`/`PublicationVersion`, não tabela dinâmica — `changed_columns` não descreve reset de senha. O menu resolveu o polimorfismo do ATOR e esqueceu o mesmo no ALVO. Acoplado a G1.
- **G3 — o helper levanta ou engole exceção? DIFERE POR CAMINHO.** A garantia "NOT NULL aborta alto" só vale no caminho atômico (`tenant_db`). Nos não-atômicos (DDL com `engine.begin` já commitado, `create_table` 5 commits, `import_sql_script`) a mutação **já é durável** quando o audit roda → um audit que levanta derruba DDL que já funcionou. **Atômico: pode levantar. Não-atômico: try/except + `logger` "atlas".** Trava o corpo do helper.
- **G4 — a decisão-fechada #3 (outbox atômico com a mutação) não fecha nos caminhos não-atômicos** — não há transação-da-mutação aberta onde pendurar. Ou esses eventos não viram webhook (= G1), ou o outbox aceita best-effort pra eles (contradiz #3). Decidir agora evita descobrir na F3.
- **G5 — ordenar por `created_at` é inseguro SE o audit é a fonte de eventos.** Ambiguidade: o resumo diz "F3/M10 consomem os eventos que a F1 grava" (audit É a fonte) mas a decisão 2 diz "outbox efêmera serve o payload" (audit é sibling). Se fonte, 2 requests concorrentes commitam fora de ordem de timestamp → consumidor por cursor perde evento. Decide se `_audit_log` precisa de `dispatched_at`/status já na 1ª migration.

### Ready (codar sem perguntar, com evidência)
- **Model `AuditLog`**: `id` PK; `owner_id` FK users CASCADE NOT NULL index (molde `_assets:144`); `created_at` NOT NULL; `action` String livre (nunca enum/CHECK); `target_table` String NULL + `target_table_id` Integer NULL **sem FK** (a deleção da tabela É auditada — FK apagaria o evento) + `target_row_id` String NULL; `details` `Column(JSON)` (**nunca `metadata`** — reservado, `database.py:44`); `changed_columns` `Column(JSON)` (**nunca `sa.ARRAY`** — SQLite não tem).
- **Índice composto** `(owner_id, created_at)` — não existe nenhum composto hoje (grep Index em models.py = 0). Tem que estar **no model E na migration** (create_all roda no CI, migration em prod) senão some de um ambiente.
- **Migration** `down_revision='a3f1c8d029e4'` (head confirmado), molde `f2c9e04b7a31`: create+index DENTRO do guard `has_table`, RLS ENABLE (sem FORCE, zero policy, PG-only) FORA do guard. `sa.JSON` nos dois lados, nunca JSONB.
- **Hooks** no molde `media_cleanup` (`main.py:1436/1543/1576`), na sessão `tenant_db` (atômico). `before/after` de graça no update/delete via `dict(_mapping)`; create reconstrói `after={**body,id,tenant_id}` sem SELECT extra.
- **DDL**: o audit-INSERT vai DEPOIS do `_end_read_txn_before_ddl` (o rollback do BUG-PG01 apaga o GUC + expira ORM) e ANTES do commit final, usando os locais já capturados. Pôr antes do rollback = evento perdido.
- **`delete_admin`**: companion delete de `AuditLog` por `owner_id` ANTES de `db.delete(admin)` (SQLite não cascateia). A linha do próprio `delete_admin` é perdida no cascade → vai pro `logger` "atlas" (gap nomeado).
- **NÃO auditar**: GET/leitura humana (decisão #1), preview/dry-runs (não persistem), `/public/*`. **Nenhum hook de leitura na F1** (key não existe ainda).

### Spikes (nenhum bloqueia a 1ª linha)
- **Retenção/poda** não trava escrever o audit, mas trava LIGAR o audit de leitura: sem worker (Procfile 1 processo), a poda é amortizada-no-read (molde `gc_assets:1230`) + piso de scheduler externo. **2 spikes de INFRA**: (a) existe cron grátis no free tier (Supabase pg_cron / Railway cron / GitHub Action)? (b) piso externo que falha silencioso é a classe do `tec-daily-updater` (heartbeat que mente 200) — precisa de sinal observável.
- **Gate de merge obrigatório** (validação, não decisão): `alembic upgrade head` num SQLite E num PG zerados (o CI não roda migration — só code review pega guard/RLS/ordem antes do deploy).

## O problema

O Atlas só conversa com humanos logados: a única credencial é o JWT do Supabase (ES256 via JWKS, `auth.py`). Não há forma de um script, Zapier ou n8n tocar um workspace — grep por `api_key`/`webhook`/`audit` no backend retorna **zero**. E o app roda mudo: nenhuma trilha de mudança. Se um moderador apagar 200 linhas agora, não sobra rastro — a rota dinâmica escreve direto no banco sem registrar quem, o quê ou quando (tabelas dinâmicas nem ganham `created_at`/`updated_at` — `dynamic_schema.py:76-105`; o audit log seria a **única** história de mutação de dados do tenant).

Isso bloqueia três coisas reais: integração externa (Zapier/n8n do roadmap), compliance/debugging ("quem mudou o quê quando") e **o M11 inteiro** — o MCP "traga sua IA" autentica via keys daqui e registra ações no audit daqui. O `security.md:67` nomeia o M9 explicitamente como dono da **fundação de eventos**. Sem M9, o arco de IA não anda.

## O que entrega

Um sistema externo autentica com API key criada e revogável pelo admin, com escopo read/write por tabela; mutações disparam webhooks configuráveis (on_create/update/delete por tabela) pra URLs cadastradas; e toda ação — de humano ou de key — deixa trilha num audit log consultável, nascido tenant-aware. O M11 constrói em cima sem retrabalho: key é a credencial, audit é o registro.

## Fases

| Fase | Entrega |
|---|---|
| **F1 — Trilha de auditoria** | Instrumentar os pontos de mutação — CRUD dinâmico, DDL de schema, imports, publish/activate, mídia (M8), views/gráficos (M8.5) — **+ leituras via API key** (decisão 1; leitura humana fica fora). **Não há caminho único de mutação nem ORM event listener** (`database.py:32` só tem `connect`→search_path): é 1 hook explícito por handler, no molde do refcount da F1 do M8. Esta fase É a fundação de eventos (webhooks F3 e eventual broadcast do M10 consomem os mesmos). Retenção + ciclo de vida vs hard-delete seguem no rebate da fase. |
| **F2 — API keys com scopes** | Segunda via de auth ao lado do JWT: admin cria/revoga na UI, escopo read/write por tabela, ação por key cai no audit identificando a key. **A key precisa replicar o ciclo GUC do `tenant_db`** (set no início + RESET no finally) — senão a leitura dinâmica volta vazia sob FORCE RLS (200 enganoso) ou escreve sem escopo. Rate limiting básico por key entra aqui por default ("a superfície nasce protegida") salvo decisão contrária. |
| **F3 — Webhooks de saída** | URL + triggers por tabela, alimentados pela trilha da F1. **Entrega = outbox durável + retry** (decisão 3): tabela de entregas gravada na mesma transação da mutação, drenada depois (at-least-once, delivery-id pra idempotência) — sem worker novo (Procfile = processo único; `requests` síncrono). Inclui contrato de ordem e **assinatura HMAC** — que **não cabe no bcrypt** (mão-única): o segredo de assinatura exige storage reversível/encrypt-at-rest, sem precedente no repo (decisão 8). |
| **F4 — Fronteira de segurança** | Absorver o fix de `/api/relations` SE o M-Ops não fechou (fallback declarado) + testes de isolamento no padrão `test_rls_isolation.py`. **O teste tem que provar leitura NÃO-VAZIA através da key dentro do tenant certo** (não só a negação cross-tenant) — senão um endpoint de key silenciosamente quebrado pelo trap do GUC passa verde. |

## Dependências

- **Bloqueado por:** M3 (fechado) — audit nasce tenant-aware. Fila: M-Ops → M8 (✅) → M8.5 → M9.
- **Bloqueia:** M11 — keys + audit são o piso do MCP.
- **Fronteira com M-Ops:** paginação da rota autenticada é de lá — é exatamente a rota que as keys expõem a scripts. Keep-alive/upgrade idem (webhook esbarra em prod pausada).
- **Rotação de segredos** (senha Postgres exposta em chat 2026-05-17 + key TestSprite no histórico git): `security.md:46-55` adia pra pós-M10 com executor = **kickoff do M9/M10**. O M9 assume como tarefa de kickoff ("executa, não confere").
- **Fronteira com M11:** M9 entrega credencial + trilha; transporte do MCP, superfície das tools e guards de escrita são 100% M11. A decisão 7 (telemetria) usa o draft do M11 como insumo obrigatório do rebate.

## Riscos

- **Audit em rota quente:** cada mutação ganha escrita extra — custo medido, não assumido (jurisprudência M7). Na mesma sessão `tenant_db` (atômico com a mutação, molde do refcount) é o caminho limpo pro CRUD dinâmico; DDL/import usam `get_db` (commit manual) e re-setam o GUC.
- **Webhook = SSRF + acoplamento:** chama URL arbitrária do usuário a partir do backend; disparo inline síncrono trava o request do usuário se o receptor for lento. Sem assinatura, o receptor não prova que veio do Atlas (webhook forjado — o inverso do SSRF).
- **Idempotência/ordem (novo):** entrega com retry gera duplicatas (precisa de delivery-id estável); entrega assíncrona chega fora de ordem (update antes de create) — quebra consumidor Zapier que espera create→update→delete. É contrato, não detalhe.
- **Tempestade de eventos:** import reusa `create_table` + `_insert_dataframe` (`main.py:1868-1958`) — as N linhas **não** passam por `create_record`, então um hook em `create_record` não pega import em massa. `_insert_dataframe` (`:1750`) é o choke-point único de bulk. 10k linhas = 10k webhooks + 10k linhas de audit sem decisão de agregação.
- **Read-audit (novo):** uma key read-only vazada exfiltra o tenant inteiro **silenciosamente** se leituras não são auditadas — o que derruba o próprio risco "vazamento detectável pelo audit" (só vale pra escrita). Mas auditar todo GET explode o volume. Decisão 1 tem que cobrir leitura-via-key.
- **Audit × hard-delete do tenant (novo):** `delete_admin` (`main.py:244-316`) apaga o tenant em cascata (mods, DROP SCHEMA CASCADE, rows `_assets` por `owner_id`, o User). Um `_audit_log` filtrado por `owner_id` (precedente `_assets`) seria varrido; e FK do ator no molde `uploaded_by` é SET NULL — apagar o moderador zera o "quem". Colide com a razão de existir do audit.
- **LGPD / direito ao esquecimento (novo):** se o audit gravar diff antes/depois, vira 2ª cópia de PII do tenant num "log de produto". Produto brasileiro: pedido de erasure conflita com audit append-only. Pode **proibir** gravar diff de certos campos ou exigir redação field-level — restrição de design, anterior à migration.
- **Key vazada** = acesso programático ao tenant; revogação imediata + rate limit da F2.
- **Buracos herdados:** a superfície que a key expõe tem smells conhecidos (f-string SQL em nome de tabela, CORS default — `security.md:57-63`); API programática amplifica o que o M-Ops não fechar antes.
- **Audit sem teto** num Postgres free tier — sem retenção vira a maior tabela do banco; e **não há worker** pra poda automática (único precedente de expurgo por idade = GC de mídia 24h, disparado por endpoint).

## Decisões fechadas no rebate (2026-07-12)

| # | Decisão | Escolha do Diretor |
|---|---|---|
| 3 | **Webhook: best-effort ou outbox durável?** | **Outbox durável + retry.** Grava a entrega numa tabela na mesma transação da mutação e drena depois; sobrevive a restart (**at-least-once**, com delivery-id estável pra idempotência), sem worker novo. Confiabilidade prometida ao Zapier. |
| 1 | **O que o audit grava?** | **Mutações (humano + key) + leituras via API key.** Registra toda escrita e as leituras feitas por key (detecta key read-only vazada exfiltrando o tenant); leituras humanas ficam FORA pra não explodir o volume no free tier. |

## Decisões abertas (detalhe fase-a-fase)

2. **Retenção + consulta do audit:** admin vê o audit do próprio tenant numa tela nova, ou no M9 a consulta é só-API e a UI fica pra depois? Sem retenção a tabela cresce sem teto (e não há worker de poda); só-API destrava o M11 igual. **(Webhooks precisam de UI de status de entrega mesmo que o audit fique só-API — ver gap de front.)** E: ação de moderador/master aparece pro admin do tenant ou só pro master?
4. **Quais eventos disparam webhook:** só rota dinâmica, ou import em massa e publish também? **Mídia (M8) dispara?** Import de 10k linhas: 10k chamadas, 1 evento agregado, ou não dispara?
5. **Identidade da key:** age "como o admin dono" ou identidade própria com escopo independente (audit mais honesto + key mais restrita que o dono)? Define também se moderador pode ter key. *Recomendação: identidade própria.*
6. **Rate limiting:** confirma o default (entra na F2) ou o Diretor tira? Se sair, precisa de dono nomeado.
7. **Telemetria pro M11/M12 (do arco):** que payload/granularidade o audit captura pra servir de aprendizado ao MCP — e quanto disso é privacidade (dado do tenant em log de produto)? Se gravar só "quem fez o quê", sabemos volume, não intenção — redesenhar o audit no M11 é o retrabalho a evitar. **Rebater com o draft do M11 + a restrição LGPD (risco novo) na mesa.**
8. **Assinatura HMAC + storage do segredo (novo):** assinatura de payload entra no escopo do M9? Se sim, o segredo precisa de encrypt-at-rest (sem precedente, não cabe no bcrypt mão-única) — decidir esquema antes de codar a F3.
9. **Ciclo de vida do audit vs hard-delete (novo):** `delete_admin` varreria um `_audit_log` filtrado por `owner_id` e FK-SET-NULL zera o ator — o audit sobrevive ao tenant/ator apagado (compliance) ou vai junto? Anterior à migration.

## Fatos-âncora (reverificados 2026-07-12)

- Zero `api_key`/`webhook`/`audit`/`rate-limit` no backend; middlewares = só CORS + exception_handler (`main.py:66-130`). Nenhum captura ator/IP/request-id.
- Auth: JWT Supabase ES256 via JWKS; `get_current_active_user`/`_admin`/`_master` resolvem pra `models.User` (`auth.py:114-161`); bcrypt (`auth.py:58-60`) é **mão-única**; token fake `test-<user>` em dev (`auth.py:124-129`). **API key não é um User** — modelagem do ator é aberta.
- Sem service layer nem ORM event listener de mutação (`database.py:32` só `connect`). Hook = 1 chamada explícita por handler (molde `media_cleanup.py:46-65`, chamadas em `main.py:1376/1483/1516`).
- CRUD dinâmico `main.py:1348-1517`: update/delete fazem read-before (row completa em `._mapping`) → vocabulário before/after pronto; create só tem o `data` do body + id novo (não relê defaults). `tenant_db` (`:514-537`) = 1 transação/request, commit no teardown → audit-INSERT aqui é atômico; webhook inline dispararia antes do commit.
- Schema/imports usam `get_db` (commit manual): `create_table` 4 commits (`:588-705`); import reusa `create_table`+`_insert_dataframe` (`:1868-1958`), N linhas via `_insert_dataframe` (`:1750`, choke-point único de bulk); `import_sql_script` via `engine.begin()` em conexões separadas (`:1619-1696`).
- `delete_admin` (`:244-316`) apaga tenant em cascata (mods, DROP SCHEMA CASCADE, `_assets` por owner, User) + Supabase/storage pós-commit.
- System table nova = migration Alembic (schema é Alembic-managed; `create_all` só no conftest — `main.py:74-79`); template `_assets` (`e4b7a9c31f52`): guard `has_table` + `ENABLE ROW LEVEL SECURITY` só PG. **RLS de system table = ENABLE sem FORCE, zero policy** (`b1f6c4e9a2d7:14-17`) — scoping é filtro de aplicação por `owner_id`; **`_assets` não tem `tenant_id`, só `owner_id`**. Nenhum índice composto `(tenant, created_at)` existe.
- Trilha parcial hoje: `_publication_versions` (`created_by`/`activated_at`, FK SET NULL — `models.py:168-174`) e `_assets` (`uploaded_by`, SET NULL — `:142/148`).
- **Não há worker:** Procfile = 1 processo web; `requests==2.32.5` síncrono; `BackgroundTasks` disponível mas não-usado (in-process, best-effort). Único expurgo por idade = GC mídia 24h por endpoint.
- Front: nav do admin em grupos fixos (`admin/layout.tsx:49-83`); zero página de keys/webhooks/audit (glob confirma). O M9 é **≥3 telas novas** + seção de nav + reveal-once + UI de status de entrega de webhook — não dimensionado no faseamento.
- `test_rls_isolation.py` existe como padrão de prova de isolamento.

## Não-objetivos

- Servidor MCP e tools de IA — M11; aqui é só o piso (credencial + trilha).
- Webhooks de ENTRADA — fora; M9 é só saída.
- Retroatividade do audit — a história começa no deploy do M9.
- Observabilidade geral (Sentry, /health) — M-Ops; audit é trilha de negócio.
- Paginação/filtros da rota autenticada — M-Ops; M9 cobra pronta.
- Doc pública/OpenAPI pra terceiros — o que o MCP precisa se decide no M11.
- Realtime/notificações in-app sobre eventos — M10.
