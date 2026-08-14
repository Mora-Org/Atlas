# M9 — Webhooks + API Keys + Audit Log: porta de serviço e memória

> **Status:** ✅ **F1** trilha de auditoria · ✅ **F2** API keys com escopo · ✅ **F3** webhooks com outbox durável · ✅ **F4** fronteira do nome de tabela — **todas em 2026-08-07 exceto a F1 (04/08)**. A milestone fecha `0.9.0`.
>
> **Pendências que NÃO são código** antes de considerar o M9 encerrado: (1) o teste do `ATLAS_WEBHOOK_SIGNING_KEY`, ver F3; (2) a decisão do Diretor sobre mod × publish, ver F4.
>
> ⚠️ **A F3 está codada mas DESLIGADA até o Diretor provisionar 3 variáveis** — ver "Ação de plataforma" na seção da F3. É de propósito que ela falhe alto em vez de fingir que entrega.
> Fecha `0.9.0` (régua: fase intermediária não bumpa).
>
> ### F1 — o que existe em código
> - **`backend/audit.py`**: vocabulário nomeado das ações (String livre no banco, conjunto fechado no módulo), `Actor` polimórfico, `tenant_of()`, `purge_for_owner()`.
> - **`_audit_log`** (model + migration `c9a4d17b3e08`, molde `e4b7a9c31f52`): ator e alvo polimórficos com ponteiro **soft**, `changed_columns` só com NOMES, índice composto `(owner_id, created_at)` no model **e** na migration.
> - **~20 hooks**: CRUD dinâmico, DDL (create/delete tabela, add/drop coluna), os 3 imports, plano de acesso (mod create/delete/reset-senha, grant/revoke, grupos, workspace), publish (create/activate/delete), visibilidade, proveniência, views, relações, mídia (upload/delete/GC).
> - **`delete_admin`**: `purge_for_owner` explícito antes do cascade (decisão D3).
>
> **A regra que o código agora carrega** (decisão G3, e é o que um hook novo erra em silêncio): handler sob `tenant_db` usa `record()` — entra na transação da mutação e **pode levantar**, porque escrever dado sem trilha é o que a fase existe pra impedir. Handler cuja mutação **já é durável** (DDL em `engine.begin()`, `import_sql_script`, `create_table` com seus 5 commits) usa `record_best_effort()` — um audit que levanta ali devolveria erro numa operação que funcionou. Há teste pros dois lados.
>
> **Verificação:** 18 testes novos (`test_audit_log.py`). Suíte **275 passed / 7 skipped** em SQLite e **274 passed / 8 skipped / 0 failed** em **Postgres 16.14** (2026-08-04) — os conjuntos de skip diferem por engine (import por SQL é SQLite-only; RLS é PG-only). Gate de migration verde e idempotente nos DOIS bancos, partindo de zero **e** incremental.
>
> **O que só o Postgres provou** (em SQLite é no-op, então antes era fé): `_audit_log` nasce com `relrowsecurity=true` junto das outras 4 system tables, e o índice composto `(owner_id, created_at)` existe de fato. Foi também a primeira suíte **sem nenhum vermelho** em Postgres na história do projeto — a medição anterior (`0.7.1`) tinha 1, que virou o B6 e agora está fechado.
>
> **Decisão 2 continua ABERTA e não bloqueou a F1:** a fase entrega o lado da ESCRITA. Consulta (tela do admin vs só-API) e retenção seguem sem dono — hoje a trilha só é legível por SQL/teste.
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

## F2 — ✅ CODADA (2026-08-07). Decisões batidas pelo Diretor

| # | Decisão | Escolha | Como ficou em código |
|---|---|---|---|
| **Gate anti-master** | 🔴 achado do cético | **Barrar** | Duas camadas: `_keys_owner_or_403` recusa criação por master/moderador, e o `get_principal` **fail-closed** recusa key cujo dono seja master — cobre linha nascida por bug, migração ou escrita direta no banco. Teste grava a linha na marra e exige 403. |
| **Transporte (GAP 1)** | recomendação aceita | **`Authorization: Bearer` + sniff `mora_`** | O sniff vem ANTES do validador de JWT (`api_keys.looks_like_key`). Sem ele, toda key 401aria no validador errado. |
| **Scopes** | recomendação aceita | **por tabela, verb-aware, v1 só-leitura** | `authorize_table(principal, tabela, modo, db)`. Deny-by-default, **sem curinga** — `*` viraria "toda tabela futura já exposta". `write` é aceito no pacote e negado pelo guard, pra ligar depois não ser migration. |
| **Hash do segredo** | Diretor pediu o desenho profissional | **prefixo indexado + SHA-256, reveal-once** | Hash lento defende segredo de BAIXA entropia; aqui são 256 bits de CSPRNG, sem dicionário a atacar. bcrypt custaria 50-100ms por request num Procfile de 1 processo **e não é indexável** — achar a key exigiria bcrypt contra todas as linhas. Racional completo em `api_keys.py`. |
| **Rate limit** | recomendação aceita | **token bucket em memória, default-ON** | 60/min + 30 de rajada, por key, antes de tocar o banco. A dívida está declarada no módulo: com `WEB_CONCURRENCY>1` o teto multiplica em silêncio → `startup_report()` loga o nº de workers como tripwire. |
| **Superfície (GAP 6)** | Diretor escolheu | **4 rotas de dado + catálogo** | `GET /tables/` e `GET /api/views/me` alcançáveis por key, **filtrados pelo escopo** — sem catálogo o MCP do M11 nasceria castrado; com catálogo inteiro, a key descobriria os nomes do que não pode ler. |

**Acabamentos que entraram junto:** revogação **soft** (`revoked_at`) porque apagar a linha cegaria o audit retroativamente sobre quem usou a credencial vazada; `expires_at` **aplicado** (o plano tinha marcado como coluna morta); escopo citando tabela inexistente é **400 na criação**, não 404 no meio da integração.

**Leitura via key entra na trilha** (decisão 1 do M9), com `rows`/`offset`/`total`/`filtered` no payload — sem isso, mil requests de 1 linha e um request de mil linhas ficam idênticos e a detecção de exfiltração nasce cega. Leitura humana continua fora.

**O teste que o plano exigiu está verde:** leitura **NÃO-VAZIA** através da key dentro do tenant certo. Só negação cross-tenant não serviria — sob FORCE RLS uma sessão VIRGEM sem GUC devolve zero linhas **sem erro** (em conexão reciclada o GUC vem como `''` e a policy levantava 22P02 — corrigido no B10), então um wrapper quebrado passaria verde num teste que só olha "o vizinho não vê".

### Fora da F2, com motivo
- **UI de keys** — a F2 entrega a API. Tela é escopo de front e não bloqueia o M11.
- **`last_used_at`** — seria uma escrita por request; a trilha de leitura já responde a mesma pergunta com mais detalhe.
- **Checksum no token** (estilo GitHub, pra secret scanner detectar vazamento em repo público) — anotado como follow-up barato.

## F2 — detalhamento original (ultracode 2026-07-21)

> 5 frentes + cético + crítico. Reverificado contra HEAD. **Nada codado.** Menu completo em `scratchpad/wfoykbtdw.output`.

### 🔴 ACHADO DE SEGURANÇA (o cético pegou, ninguém tinha visto)
**Nada impede uma key de dono MASTER, e key de master vaza a plataforma inteira.** `get_current_admin` admite master (auth.py:159); `resolve_tenant_id(master)=None` liga `app.is_master=true`; `get_accessible_tables(master)` = TODAS as tabelas de TODOS os tenants (main.py:500-501). Uma key `read:['*']` de master exfiltra tudo e **não "morre com o tenant"**. Fix: key-create rejeita `role=='master'` (espelha create_table:628) + wrapper fail-closed se resolver pra owner master.

### Decisões pro Diretor (5)
| # | Decisão | Recomendada |
|---|---|---|
| 1 | Onde a key vira principal + ciclo GUC | **Wrapper key-aware de `tenant_db` só nas 4 rotas `/api/{table}`**; `get_accessible_tables`/`resolve_tenant_id` intactos (recebem o OWNER). Blast radius real = 4 rotas × 2 deps + 1 wrapper (o cético mediu: são 13 call sites de get_accessible_tables, não "1 linha"). |
| 2 | Gate anti-master | **key-create rejeita master + fail-closed** (o achado acima) |
| 3 | Scopes | **por-tabela verb-aware, v1 SÓ-LEITURA** (write dormente, deny-by-default). Helper `authorize_table(principal,table,mode,db)` devolve db_table, `.get(id,[])` nunca pelado, 403 vs 404. write-via-key reabre todo o vocabulário de mutação — não paga na v1. |
| 4 | Hash do segredo | **prefixo indexado (`token_hex(4)`) + SHA-256(`token_urlsafe(32)`)** via hashlib+hmac.compare_digest, reveal-once. Não bcrypt (50-100ms/request num single-process é latência real; token de 256 bits não tem dicionário a defender). |
| 5 | Rate-limit | **token-bucket em-memória default-ON** (zero infra), MAS é dívida com tripwire: se `WEB_CONCURRENCY`>1 (env de plataforma invisível) o limite multiplica em silêncio → logar worker-count no startup. |

### Gaps do crítico (travam a 1ª linha)
- **GAP 1 (bloqueador nº1): o transporte não foi decidido.** `oauth2_scheme` é um header só (`Authorization: Bearer`, auth.py:69). Hoje uma key `mora_...` 401a em todo lugar. Recomendação: `Authorization: Bearer` com **sniff de prefixo `mora_` ANTES de tentar JWT/`test-`**. Sem isso, `get_principal` não tem 1ª linha.
- **GAP 5 (gate de merge): F1-audit NÃO existe em código** (grep `ApiKey|actor_type|audit.record` = ZERO). O valor de segurança inteiro da F2 (detecção de exfil) é condicional à F1 estar viva. F2 não entra sem `AuditLog`+`audit.record` de leitura testados — **ordem de ship: F1 antes de F2**.
- **GAP 6: a superfície de leitura via key é maior que 4 rotas — e é o piso do MCP (M11).** Se `get_principal` só entra nas 4 rotas dinâmicas, a key não LISTA tabelas (`GET /tables/` 401a) nem lê views. O MCP nasce castrado. Decidir explícito o conjunto de rotas que a key alcança.
- Menores: wildcard `*` no escopo (recomendo sem `*` na v1), `expires_at` coluna morta, payload do audit-de-leitura precisa de row_count/offset (senão a detecção nasce cega), cap de nº de keys.

### Spikes
- **Wiring do principal** (dimensiona toda a F2): teste RODANDO provando que a key resolve pro tenant do owner + replica set_tenant+RESET ALL, 6 cenários verdes em SQLite E PG.
- **WEB_CONCURRENCY real no Railway** (não medível do repo): se >1, o rate-limit em-memória é teatro → cai pra contador-em-tabela.
- **Proxy/actor_ip**: qual header o Railway injeta com o IP real — sem isso `actor_ip` grava o IP do proxy e a detecção de exfil nasce morta.
- **Re-confirmar rolbypassrls=TRUE** na role real do pooler (a fonte é um comentário datado, não medição fresca).

---

## F4 — ✅ CODADA (2026-08-07). Re-escopada, e uma premissa retificada

As duas entregas do plano original **já tinham sido feitas** (o fix de
`/api/relations` no M-Ops; o teste de leitura não-vazia via key na F2). A fase
virou o backlog de segurança que sobrou — e a primeira coisa medida derrubou uma
premissa do `security.md`.

### A retificação: NÃO havia injeção pelo nome da tabela
O `security.md` chamava a f-string do motor DDL de "superfície de injeção".
Sonda mediu o contrário: o CREATE passa pelo SQLAlchemy (escapa) e os ALTER/DROP
passam por `_quote_ident`, que rejeita aspa dupla. Com a tabela hostil criada,
`users` continuou existindo.

**O risco real era outro:** sem validação de nome, a tabela com aspa nascia
**indeletável** — `ValueError` não tratado no DELETE, 500 pra sempre. Registrar
isso importa porque uma milestone poderia ter sido gasta consertando o que já
estava protegido, enquanto o problema de verdade seguia invisível.

### O que entrou

| Achado | Fix |
|---|---|
| `POST /tables/` aceitava **qualquer** string como nome (medido: 10/10 casos hostis com 200) | Régua única em `schemas.validate_table_name`, aplicada nas **3 portas** — endpoint, import de planilha e import por SQL. Antes elas discordavam: o import sanitizava, o endpoint não validava nada. |
| **B5** — trava de reservados com só `assets`, e o import por SQL passava por fora | Lista **computada das rotas do app montado**, não escrita à mão: rota nova entra sozinha. A manual já tinha atrasado duas milestones. |
| `CORS_ORIGINS` vazio em prod | **Aviso alto no startup.** Não fecho automático: derrubaria um frontend que depende do default hoje. |

**Precisão que evitou exagero:** só literal de 1 segmento sombreia. `views`,
`keys`, `webhooks`, `publications` **não** conflitam — tem teste garantindo que
seguem permitidos, pra a trava não virar proibição genérica.

### Fora da F4, com motivo
- **Coerência mod × publish** (moderador publica o workspace inteiro sem checagem de grupo, dívida do M8.5): é **mudança de comportamento** — moderador perde algo que hoje pode. Decisão do Diretor, não minha.
- **Rotação de segredos**: ação de plataforma, `security.md` adia pra pós-M10.

## F3 — ✅ CODADA (2026-08-07). Decisões batidas pelo Diretor

| # | Decisão | Escolha | Como ficou |
|---|---|---|---|
| **F3-1** | Drenagem | **híbrido: cron externo é a garantia** | `POST /api/webhooks/drain` (serviço, all-tenant, token em env) + `.github/workflows/webhook-drain.yml` a cada 5 min. `BackgroundTasks` fica pra depois, só como redução de latência. |
| **F3-2** | Escopo de eventos | **row-CRUD + import agregado** | `row.created/updated/deleted` + `rows.imported`. São os que rodam sob `tenant_db`, onde a outbox é atômica de verdade; DDL e import por SQL quebrariam a garantia, e auth-plane pra URL do usuário seria exfiltração. |
| **F3-3** | SSRF | **resolve-and-pin + https-only + sem redirect** | Valida **todos** os IPs resolvidos (round-robin misturando público e loopback passaria se olhasse só o primeiro), desembrulha IPv4-mapeado-em-IPv6, e `allow_redirects=False`. |
| **F3-4** | Segredo do HMAC | **Fernet encrypt-at-rest** | Reveal-once é impossível aqui: o HMAC é recomputado a cada tentativa no drain, então o segredo precisa voltar em claro. `cryptography` deixou de ser pin órfão. |
| **F3-5** | Contrato | **at-least-once idempotente, ordem best-effort** | `delivery_id` estável entre tentativas; assina `ts . id . corpo` — com o timestamp fora do MAC o anti-replay seria decorativo. |
| **G-A** | Conteúdo do payload | **linha inteira, relida no emit** | O `PUT` recebe body parcial e o PK vem no path: mandar o diff entregaria mudança **sem identidade da linha**. `changed` vai junto, como extra. No delete vai a linha como era — é a última vez que aquele dado existe. |
| **G-B** | TEXT vs JSONB | **TEXT, serializado 1×** | É o corpo assinado E enviado. Re-serializar reordenaria chaves e quebraria a assinatura no receptor, que recusaria entrega legítima sem saber por quê. |
| **G-C** | Retry | **5 tentativas → `dead`** | Backoff exponencial com piso na cadência do cron (adiantar não acelera: ninguém drena antes da próxima passada). Sem `dead`, endpoint morto retenta pra sempre e a outbox cresce sem teto. |

### O claim em DUAS FASES é o coração da fase
O Procfile é **um processo** com pool 5+10. Se a conexão ficasse presa durante o `requests.post`, **10 receptores lentos esgotariam o pool** e o app pararia de responder por causa de webhook, não de carga. Então: marca `in_flight` e **commita** (solta a conexão) → POST fora de transação → grava o desfecho. O custo honesto: processo que morre no meio deixa `in_flight` órfã — que volta pra fila depois de 120s, como retentativa. É at-least-once, e é pra isso que o `delivery_id` é estável.

### O footgun foi invertido
O `keep-alive.yml` deste repo faz `exit 0` quando falta config — verde sem fazer nada. Pro drenador isso seria a falha do `tec-daily-updater` (respondia 200 e não atualizava). Aqui: sem `ATLAS_DRAIN_TOKEN` o endpoint devolve **503**, e o workflow **falha ruidosamente** até alguém configurar. Entrega que virou `dead` sai como `::warning::` no resumo do job.

### Ação de plataforma — estado em 2026-08-07

| Item | Estado | Como foi confirmado |
|---|---|---|
| `ATLAS_DRAIN_TOKEN` (Railway) | ✅ | `POST /api/webhooks/drain` sem token devolveu **401** (não 503) |
| `DRAIN_TOKEN` (secret do repo) | ✅ | sai como `***` no log do Actions — se fosse variable, apareceria em claro |
| `DRAIN_URL` (variable do repo) | ✅ | workflow verde: `-> 200 {"claimed":0,…}` |
| Cron de 5 min | ✅ ligado | run `31210972998` |
| **`ATLAS_WEBHOOK_SIGNING_KEY`** | ⏳ **PENDENTE DE TESTE** | ver abaixo |

**⏳ Teste pendente (combinado com o Diretor: fazer junto do PR da F4, se ainda não tiver sido feito).**
É o único item que não dá pra verificar de fora — só é exercitado ao criar um webhook, o que exige login de admin. Como testar:

`POST /api/webhooks/me` autenticado como admin, com `{"name":"teste","url":"https://…","events":["row.created"]}`.
- **503** citando `ATLAS_WEBHOOK_SIGNING_KEY` → a variável não chegou no Railway.
- **200** com `secret` começando em `whsec_` → está tudo no lugar. Guardar o segredo: ele aparece **uma vez só**.

Fechar esse teste é o que permite dizer que a F3 está viva de ponta a ponta, e não só deployada.

### Percalços da 1ª configuração (registrados no `bugfixes.md` como B9)
`DRAIN_TOKEN` foi criado como **variable** em vez de **secret** (não é lido por `secrets.`, e não é mascarado no log → token rotacionado), e o `DRAIN_URL` foi colado com `\r\n` no fim, o que fazia o curl falhar antes de conectar. O log mostrava `000000` — um código impossível, bug de shell do próprio workflow, corrigido no PR #65.

Limite conhecido, registrado e não escondido: o cron do GitHub Actions **atrasa sob carga** e é **auto-desabilitado após 60 dias sem commit**. Pra SLA real o caminho é `pg_cron` no Supabase ou cron do Railway — não muda uma linha do backend, só quem chama o `/drain`.

## F3 — detalhamento original (ultracode 2026-07-21)

> Menu completo em `scratchpad/w8ln10xd8.output`.

### A verdade medida: a decisão #3 (outbox durável) hoje é PROMESSA, não mecanismo
A durabilidade repousa num drainer que não existe. O cético mediu: `.github/workflows/keep-alive.yml` **prova que GH Actions cron roda grátis neste repo** — mas roda a 6h, bate num `/health` público, e faz **exit-0 (verde) quando não-configurado** (e HOJE segue sem `HEALTH_URL`). O net-new não é "existe cron?" (existe), é: endpoint de serviço all-tenant AUTENTICADO (o `/drain` MUTA), intervalo curto (6h = webhook atrasado 6h = falha pro Zapier), e **inverter o footgun pra FALHAR LOUD** quando não-configurado (classe tec-daily-updater).

### Decisões pro Diretor (5)
| # | Decisão | Recomendada |
|---|---|---|
| 1 | Drenagem + durabilidade | **híbrido: cron externo (baseline da #3) + BackgroundTasks (só latência, depois)**. `drain_outbox` abre sessão própria, **claim em DUAS FASES** (marca in_flight e SOLTA a conexão → POST fora de txn → marca delivered/failed). NUNCA segurar lock através do `requests.post` (pool 5+10 estoura). |
| 2 | Escopo de eventos v1 (G4) | **só row-CRUD (create/update/delete) + import agregado** — todos `tenant_db`, outbox atômica de verdade. DDL/import_sql são não-atômicos (quebram a #3); auth-plane pra URL do usuário = exfil. |
| 3 | SSRF | **resolve-and-pin + https-only + `allow_redirects=False`**. Correção crítica do cético: resolve-and-pin sozinho é furável por redirect 30x (`302→169.254.169.254` sem revalidar). É o 1º HTTP outbound-pra-URL-arbitrária do app. |
| 4 | Storage do segredo HMAC (#8) | **Fernet encrypt-at-rest** (`cryptography==46.0.5` já no build, mas é pin ÓRFÃO, 0 imports — marcar first-class) + env `ATLAS_WEBHOOK_SIGNING_KEY` lida LAZY. Reveal-once puro é impossível (o Atlas recomputa o HMAC no drain assíncrono). |
| 5 | Contrato de entrega | **at-least-once idempotente, ordem best-effort documentada** (modelo GitHub/Stripe). `delivery_id` UUID reusado no retry; **assinar ts+id+body juntos** (não só body — timestamp fora do MAC = anti-replay falso), dedup no delivery_id. |

### Gaps do crítico (Tier 1 — travam schema+contrato)
- **G-A: o CONTEÚDO do payload nunca foi decidido.** `update_record.data` é body PARCIAL (só colunas mudadas) e o PK é path-param, não está no body. Sem decisão, o `updated` chega no Zapier como diff parcial SEM identidade da linha. Decidir: snapshot da linha inteira (re-SELECT no emit) vs diff, sempre carimbando `{table, pk, event, occurred_at, actor}`.
- **G-B: TEXT vs JSONB é decisão de tabela.** Se o payload é JSON re-serializado no drain, a ordem de chave muda e a **assinatura HMAC quebra** no receptor. O body tem que ser persistido como bytes canônicos (TEXT, serializado 1x no emit) e assinado+enviado verbatim.
- **G-C: política de retry indefinida** (max tentativas, backoff, failed→dead). Endpoint morto permanente retenta pra sempre, nunca vira `dead`, a poda nunca dispara, `_outbox` cresce sem limite. A cadência do cron (~5min) é o PISO do backoff.

### Spikes
- **Gate bloqueante: provisionar o scheduler do /drain** (GH Actions cron provado, mas 6h/drift/auto-desabilita-60d/silent-skip; Supabase pg_cron exige pg_net + pausa após 7d idle).
- **SSRF resolve-and-pin com TLS**: HTTPAdapter que resolve DNS, valida IPs, conecta no IP pinado preservando SNI+cert, `allow_redirects=False`, rejeita IPv4-mapped-IPv6.
- **BackgroundTasks ordem-vs-commit** em fastapi 0.135.2 (se dispara pré-commit, dropar — o cron já satisfaz a #3).
- **Provisionar `ATLAS_WEBHOOK_SIGNING_KEY`** no Railway (3º segredo de plataforma — avisar, amarrar na rotação do security.md).

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
| **F4 — Fronteira de segurança** ✅ | As duas entregas ORIGINAIS já tinham acontecido: o fix de `/api/relations` fechou no M-Ops (`c57b819`) e o teste de leitura não-vazia via key entrou na F2. A fase foi **re-escopada pro backlog de segurança** — ver abaixo. |

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
