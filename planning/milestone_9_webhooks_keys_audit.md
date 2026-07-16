# M9 — Webhooks + API Keys + Audit Log: porta de serviço e memória

> **Status:** 🟢 esqueleto batido 2026-07-12 (rebate ultracode). 2 forks estruturais fechados com o Diretor; decisões de detalhe seguem fase-a-fase. **Ainda não executar** — vem depois do M8.5; falta detalhar F1 no rebate.
> Fecha `0.9.0` (régua: fase intermediária não bumpa).
> Smells compartilhados do backend: inventariados no [plano do M-Ops](milestone_ops_observabilidade.md) e no [security.md](security.md).

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
