# M10 — Real-time + Collaborative Editing · Plano de execução

> **Versão do plano:** 2026-08-14. Substitui o detalhamento de 2026-08-07 (`planning/milestone_10_realtime_collab.md`), que foi escrito contra o código 0.9.0 e envelheceu em 4 versões (0.9.1 → 0.9.4, PRs #68–#72).
> **Carimba a 1.0.0.** É o último escopo antes do lançamento.
>
> **Procedência.** Cada afirmação abaixo carrega uma etiqueta:
> `[cód. 14/08]` = eu abri o arquivo nesta sessão e li a linha citada.
> `[medido]` = SQL/script rodado contra PostgreSQL 16.14 (container `dynamic-cms-pg`) ou contra o app com TestClient, na auditoria de 6 frentes ou na refutação adversarial.
> `NÃO MEDIDO` = ninguém mediu. Não há terceira categoria, e nenhum número deste documento é estimativa disfarçada.
> **Nada foi medido contra o Supabase real** — não existe credencial neste ambiente (`backend/.env` e `frontend/.env.local` com as 4 variáveis vazias, `[medido]`).

---

## 1. O que mudou desde 07/08

Esta é a seção de maior valor: **duas das quatro objeções que reprovaram o terceiro caminho caíram**, e três afirmações centrais do plano velho são hoje factualmente falsas. Quem executar o M10 lendo o documento de 07/08 vai abrir linhas erradas e reconstruir trabalho já feito.

### 1.1 A seção 0 (B10/B11/B12) é histórico, não pendência

Os três bugs estão fechados no `main` de hoje (0.9.1, PR #68).

- **B10** — `dynamic_schema.py:106` define `_TENANT_GUC = "NULLIF(current_setting('app.tenant_id', true), '')"`, aplicado em `TENANT_POLICY_USING` (`:108-111`) e `TENANT_POLICY_CHECK` (`:117`) `[cód. 14/08]`. Migration `backend/migrations/versions/f3a80c5d1e97_fix_tenant_policy_nullif.py` existe `[cód. 14/08]`. Teste trava a expressão: `test_tenant_policy_b10.py:137` `[medido]`.
- **B11** — `main.py:261-278`: o PATCH de `app_metadata` está dentro de `try/except` que apaga o admin local e o usuário do Supabase antes de levantar `[medido]`.
- **B12** — os dois docstrings mentirosos foram corrigidos na fonte (`models.py:259-265`, `test_rls_raw_bypass.py:13-16`) `[medido]`.

**Consequência que não pode passar batido:** o fix real é **estritamente mais forte** do que o que a seção 0 prescreve. O plano diz *"Fix: `NULLIF(current_setting(...), '')::int` na policy"* — e só isso **alargaria** um vazamento que já existia. O comentário de `dynamic_schema.py:87-99` registra a medição: a policy antiga aceitava a flag `app.is_master` sozinha; `is_master` forjado + tenant certo **vazou 3 linhas de outro tenant**, e `is_master` forjado + tenant vazio negava por acidente (erro 22P02) `[cód. 14/08]`. Só o NULLIF, sem amarrar o master à sentinela `'0'`, transformaria o segundo caso em vazamento também. **Quem usar a seção 0 como especificação de conserto reintroduz o buraco.**

### 1.2 O mecanismo do B10 estava atribuído à causa errada

O plano diz que *"depois de `set_config` + `RESET ALL` (`main.py:666` e `:707`), o GUC volta como `''`"*. Medido, **sem `RESET ALL` nenhum**: `BEGIN; set_config('app.tenant_id','777',true); COMMIT;` já deixa o GUC em `''` na mesma conexão — com `ROLLBACK` também `[medido]`. O gatilho é o **fim de qualquer transação** que rodou `set_config` LOCAL (`tenant_context.py:58-65`), não o `RESET ALL`. O próprio código já registra isso em `dynamic_schema.py:81-83` `[cód. 14/08]`.

E as âncoras morreram: `RESET ALL` hoje é `main.py:699` e `main.py:740`; os commits são `:692` e `:733`, ambos **depois** do `yield db` `[cód. 14/08]`.

### 1.3 As objeções ao "terceiro caminho": 2 caíram, 2 endureceram

| Objeção do plano (07/08) | Hoje | Evidência |
|---|---|---|
| **1 — bypassa autorização de moderador** | **CONFIRMADA e pior** | A linha física tem só `id, <colunas>, tenant_id` (`_build_columns`, `dynamic_schema.py:157-186`, `[cód. 14/08]`); `group_id` mora em `public._tables` (`models.py:65`). Medido com a policy estendida: claim de moderador do tenant 701 leu `membros` (3 linhas) **e** `folha` (2 linhas), sem nenhuma `ModeratorPermission` — porque `main.py:436-441` provisiona o JWT do mod com `tenant_id = admin.id` `[medido]`. **Não é policy mal escrita: é inexprimível em policy sobre a tabela física.** |
| **2 — quebra o backend sem `NULLIF`** | **CAIU** | Mecanismo confirmado, mas o NULLIF é o idioma da casa desde o PR #68, com teste travando a expressão e migration-molde propagando `[medido]`. Com NULLIF no ramo do JWT, a query legítima do backend volta a ler 3 linhas `[medido]`. O próprio plano se contradiz três parágrafos abaixo ("Se ainda assim for adotado: NULLIF nos dois ramos"). |
| **3 — master sem porta** | **CONFIRMADA e pior** | `auth.py:300-305` chama `provision_user(..., role="master")` sem `tenant_id`, e `supabase_admin.py:84-86` só grava a chave quando `tenant_id is not None` `[medido]`. E o ramo de master hoje exige **dois GUCs** (`app.is_master='true'` **E** `NULLIF(app.tenant_id,'')='0'`, `dynamic_schema.py:110`, `[cód. 14/08]`) que JWT nenhum alcança. |
| **4 — exige migration que não existe** | **FALSA** | `f3a80c5d1e97` faz exatamente a varredura: `_alvos()` enumera por `pg_policies WHERE policyname='tenant_isolation' AND schemaname ~ '^tenant_[0-9]+$'` e `_aplica()` roda `ALTER POLICY` com `SET lock_timeout='3s'` `[medido]`. O CI roda `alembic upgrade head` em banco virgem e confere a head (`ci.yml:126-139`, `[cód. 14/08]`). Replicado num DO-block: `NOTICE: policy estendida em 3 tabela(s)` `[medido]`. |

**Efeito na decisão 1:** o ranking de **custo de build** inverteu — hoje o terceiro caminho é o mais barato de construir (1 linha em `TENANT_POLICY_USING` + 1 migration copiando molde exercitado em CI). **O topo não mudou**, porque o eixo que decide é autorização, e nele as duas objeções sobreviventes ficaram mais duras. A frase da tabela da seção 7 do plano velho ("Broadcast exige mecanismo pós-commit que não existe" + "migration que não existe") **cobra dois custos que não existem mais** e precisa ser reescrita.

### 1.4 "Uma sessão com `request.jwt.claims` lê todas as linhas do tenant" — falso sobre o sistema de hoje

Com a policy **que está no repo**, a mesma sessão lê **ZERO** `[medido]`: role com GRANT, `set_config('request.jwt.claims', '{"app_metadata":{"tenant_id":777,"role":"admin"}}', true)` → 0 linhas em `membros` e em `pacientes`; controle com o GUC do backend na mesma sessão → 3 linhas. A frase só vale sob a DDL **estendida hipotética**. Lida fora de contexto vira "o Atlas de hoje vaza tenant por JWT", que é falso e é o tipo de frase que o projeto proíbe.

### 1.5 "O mecanismo pós-commit não existe" — falso

Ele está **em produção** desde o M8: `delete_admin` (`main.py:329`) commita em `:383` e roda cleanups externos em `:390-398`, sob o comentário literal *"Cleanups externos vão depois do commit local"* `[medido]`. Funciona porque esse handler usa `Depends(get_db)` e é dono do próprio commit. A frase correta é **"não existe no regime `tenant_db`/`tenant_db_principal`"** `[cód. 14/08: main.py:678-701 e :704-742]`.

E o spike que o M9 deixou aberto está **resolvido, com resposta negativa**: `BackgroundTasks` roda **antes** do commit. Ordem medida com sonda ASGI (fastapi 0.135.2 / starlette 1.0.0): `4 handler/emit → 5 response.start → 6 response.body FIM → 7 BACKGROUND TASK → 8 COMMIT → 9 RESET ALL → 10 get_db close`, reproduzida em 3 variantes `[medido]`. Causa em `fastapi/routing.py:116-121`. **`BackgroundTasks` está dropado para pós-commit.**

O que **funciona**, medido: uma dependency-with-yield declarada **antes** de `get_db` na assinatura tem teardown em LIFO, depois do commit e depois do `get_db.close()` — caminho feliz `commit_ok=True` com payload intacto, caminho de erro `commit_ok=False` `[medido]`. **A 1b deixa de ser bloqueante de arquitetura e vira escolha entre dois padrões que já moram no repo.**

### 1.6 A F3 e o `ORDER BY`: o plano subestimou o próprio achado

- *"Não existe `ORDER BY` na listagem"* → **desatualizado**. Existe condicional em `main.py:1999-2001` e na rota pública `:1860-1862`, alimentado por `sort`/`order` (`main.py:1947`) `[cód. 14/08]`. O que não existe é **default**, e o frontend nunca manda `sort` (`page.tsx:70` monta só `limit`/`offset`/`search`, `[cód. 14/08]`).
- *"[o conserto do LWW] é o item de maior valor por esforço da milestone inteira"* → **falso como ranking**. O `ORDER BY` vale mais e custa menos, e o dano é **visível hoje, sem realtime**:
  - usuário sozinho: editar a linha `id=42` moveu ela da posição 36 pra 40, e `commitEdit` chama `load()` logo depois (`page.tsx:229`, `[cód. 14/08]`) — a pessoa vê a própria linha pular toda vez que salva `[medido]`;
  - dois admins: parado na página 2, com outro editando 5 células da página 1, o Recarregar trocou 5 de 50 linhas (5 sumiram, ids 101-105 apareceram). Com `ORDER BY id`: 0 e 0 `[medido]`;
  - **publicação** — o achado que o plano não viu: `main.py:2791` monta o snapshot público com `select(phys).limit(limit + 1)` **sem ORDER BY nenhum e sem parâmetro `sort`** `[cód. 14/08]`, cortado em `MAX_ROWS_PER_TABLE = 2000`. Numa tabela de 2005 linhas, editar 3 células fez **exatamente essas 3 linhas caírem fora do site publicado** na republicação `[medido]`.
- *"Hoje é raro (só mount/busca/paginação)"* → **falso**. `load()` tem 9 pontos de chamada (`page.tsx:91, 113, 199, 229, 242, 250, 341, 589, 593`), **4 deles logo depois de mutação** `[medido]`. O 401 que apaga a tabela já acontece hoje, no pior momento: logo depois de salvar.

### 1.7 A seção 6 (F4) se contradiz com a seção 5 — e o predicado "consertado" também está errado

*"A otimização óbvia está morta"* é verdadeira **enquanto** o `commitEdit` mandar a linha inteira. Medido: PUT linha-inteira → `audit.changed_columns = ['id','titulo','ano','autor']` (registra até a PK); PUT parcial → `['ano']` `[medido]`. `main.py:2064` e `:2074` leem a mesma fonte `[cód. 14/08]` — ou seja **a trilha de auditoria do M9 mente em toda edição do DataViewer hoje**.

Mas o predicado que o plano propõe para o mundo consertado (`changed_columns ∩ {group_by, metric_column}`) **também está errado**: view com `slices[].filter_col` foi invalidada por PUT parcial em `vendedor` (agregado caiu de 3.0 para 2.0) `[medido]`, e `aggregation.py:248-253` faz `ilike` em **toda** coluna quando há `search`. Pior: `count`/`count_distinct` mudam com INSERT/DELETE **sem nenhuma coluna mudar** — `main.py:2109` deixa `changed_columns` vazio de propósito no delete `[cód. 14/08]`. **O evento certo para a F4 é `(tabela, tipo-de-evento)`, não `(tabela, colunas)`.**

E *"a descoberta view→tabela não precisa de backend novo"* é **falsa** se o canal for chaveado por nome: `GET /api/views/me` devolve `table_id`, nunca o nome da tabela, e o tenant B não resolve `table_id → nome` por rota autenticada nenhuma `[medido]`.

### 1.8 Correções nos "Fatos-âncora" e nos "Riscos"

- *"websockets no requirements é transitiva do uvicorn"* → **falso**: `pip show websockets` → `Required-by: realtime`, e `realtime 2.30.0` vem de `supabase==2.30.0`, pinado em `requirements.txt:45` `[medido]`. O cliente Realtime Python **já é dependência do backend**. Ressalva medida na refutação: `SyncRealtimeClient.channel()` levanta `NotImplementedError`, `send_broadcast` exige canal já unido, e `_broadcast_endpoint_url` é calculado e **nunca usado** — o POST HTTP seria escrito à mão com httpx `[medido]`.
- *"DataViewer: fetch inteiro no mount (77-80)"* → **falso** desde o M-Ops F3, e **o próprio documento já se corrige na seção 1(a)** e não atualiza as linhas 272 e 317. Duas afirmações falsas na seção que o plano apresenta como base factual.
- *Risco "o worker do Realtime não seta GUC"* → **motivo errado**. O que mata é o **privilégio**, que precede a RLS: role sem GRANT recebe `permission denied for schema tenant_777` **mesmo com o GUC certo setado**; `has_column_privilege(...)` → `f` `[medido]`. A seção 3 do mesmo documento já traz o motivo certo — segunda contradição interna.
- **Novo, e muda a barra:** o CI passou a rodar Postgres (`ci.yml:51-60`) e um job de migrations (`:126-139`) `[cód. 14/08]`. A metade RLS/migration do M10 **nasce coberta**; o risco de "teste de fachada" vale só para o transporte.

### 1.9 Achados novos que não existiam no plano de 07/08

| Achado | Evidência | Onde entra |
|---|---|---|
| `getSupabase()` **levanta** quando não configurado (não devolve null) | `supabaseClient.ts:18-23`; guard separado em `:35-40` `[medido]` | Degradação é obrigatória na 1ª linha: guardar em `isSupabaseConfigured()`, nunca try/catch |
| Nenhum harness roda `useEffect` | `vitest.config.ts:16` `environment:'node'`; sem jsdom/@testing-library `[medido]` | Decisão 5: gate honesto só via Playwright |
| `page.routeWebSocket` funciona (Playwright 1.60.0) | interceptou `wss://…/realtime/v1/websocket`, leu o `phx_join`, devolveu frame `[medido]`. **Exige origem real** — com `page.setContent` (about:blank) o WS erra e o mock nunca dispara | Gate `validate-realtime.mjs` |
| `emit_webhook` devolve **0 em todo ambiente de hoje** | short-circuit em `main.py:783-785`; endpoint exige `ATLAS_WEBHOOK_SIGNING_KEY`, ausente no `.env` `[medido]` | O "padrão provado" do M9 F3 foi provado em teste, **não em tráfego** |
| `_row_snapshot` vaza `tenant_id` | `main.py:810-818` `return dict(linha._mapping)`, sem pop `[cód. 14/08]` | Higiene de payload antes do transporte |
| `AuthContext.tsx:14` diz montar o usuário de `app_metadata` e **não monta** | `fetchMe()` só chama `/api/auth/me`; grep de `app_metadata` em `frontend/src` = 1 hit, o próprio comentário `[medido]` | Terceiro docstring da família B12, e é sobre o claim que o M10 quer usar |
| Tabela com PK não-inteira é **write-once** | `main.py:2024` e `:2081` declaram `record_id: int` `[cód. 14/08]`; `PUT /api/produtos/SKU-1` → **422** `[medido]` | F3 tem que degradar **por tabela** |
| O filtro da listagem **falha aberto** | `main.py:1971` exige as 3 condições; falhando qualquer uma, o filtro é descartado e a rota devolve 200 com a página inteira `[cód. 14/08 + medido: 5 casos, todos 200 total=5]` | Mata o refetch-por-PK ingênuo |
| `public.t{N}_*` (import SQL) nasce **sem RLS** | `main.py:2302` usa `Depends(get_db)`; único `ENABLE ROW LEVEL SECURITY` de tabela dinâmica é `dynamic_schema.py:216`; medido `public.t2_boa_tabela relrowsecurity=f` `[medido]` | **Item de segurança de produção, fora do M10** (§5) |
| `xmin` é contador **global do cluster** | tenant_701 fez 1 escrita própria e o xmin andou 74 `[medido]` | Se a decisão 2 virar detecção, o token tem que ser opaco |
| O teardown **escapa** do limiter de 40 do AnyIO | `fastapi/concurrency.py:19-30` cria `CapacityLimiter(1)` por chamada, com o comentário literal; medido: 200 PUTs com publish pendurado = **201 threads**, `limiter_borrowed=0` `[medido]` | Muda a mitigação da 1b: semáforo, não só timeout |
| Refetch por linha vs por página, **na porta da API**: 21,9 ms vs 23,0 ms (p50) | `[medido — refutação]`. Os 0,056 ms vs 19,3 ms do dossiê são **camada SQL** (~6% do request) | A escolha continua, o argumento muda |

---

## 2. As decisões

Legenda de dono: **T** = tem resposta técnica (medição decide) · **D** = do Diretor (não tem resposta técnica) · **S** = depende de Supabase real.
Legenda de refutação: **✅ sobreviveu** · **⚠️ sobreviveu com correção** · **❌ a justificativa caiu** · **➖ não submetida ao cético**.

| # | Decisão | Recomendação | Por quê (1 linha, com procedência) | Custo declarado | Refutação |
|---|---|---|---|---|---|
| **1** | Transporte | **Híbrido**: backend publica **sinal sem payload** (`{v, seq, table_name, event, pk_col, pk, actor_type}`), cliente refaz o fetch pela API. **Canal privado é condição de entrada, não plano B.** Terceiro caminho REPROVADO (objeções 1 e 3 apenas). Nativo = spike com critério de morte. **T + S + D** | A rota de leitura já aplica moderador (`main.py:846`), escopo de key (`:854-866`) e RLS por GUC (`:704-742`) `[cód. 14/08]` — reusá-la é a única forma de não reescrever essas 3 regras em SQL | (a) escrita fora da API não gera evento; (b) +1 request por evento por espectador, **sem rate limit no caminho humano** (`main.py:723` só cobre key) e pool de 15 (`database.py:41`) `[medido]`; (c) sem *old record*; (d) F2 **não** se liberta da F1; (e) pôr payload depois = versionar contrato; **(f) o sinal é at-most-once sem replay** | ⚠️ A frase "não compra briga nenhuma" **caiu**: o híbrido reduz o dano da briga de autorização de canal, não a evita |
| **1b** | Pós-commit | **Dependency `realtime_buffer`** injetada antes de `get_db` em `tenant_db`/`tenant_db_principal`; flag `commit_ok` na linha seguinte a `main.py:692` e `:733`; publish no teardown. **T** | LIFO medido nos dois caminhos; `BackgroundTasks` roda antes do commit (passo 7 vs 8) e está **dropado** `[medido]` | Sem entrega garantida (POST que falha = evento perdido); acoplamento novo em 2 dependencies; **não conserta** o 200 enviado antes do commit (comportamento de hoje) | ⚠️ Arquitetura sobreviveu; **o custo (a) caiu**: o teardown não estrangula, ele cresce sem teto (201 threads medidas) → exige **semáforo global + timeout + descarte**, e **2 contadores**, senão a queda é invisível |
| **1c** | `ORDER BY` default | **SIM, `ORDER BY pk asc`**, em 3 pontos: `main.py:1999-2001`, `:1860-1862` e **`:2791`** (snapshot público). Sem spike. **T** | Não há trade-off: Index Scan **sem nó Sort**, +0,057 ms contra os 9,2 ms que o `count(*)` de `main.py:1996` já gasta na mesma request (62,9 ms com busca) `[medido]`; suíte inteira 422 passed com a mudança aplicada `[medido]` | Ordem visível muda para consumidor programático (a rota é a que a API key lê); `/explore` deixa de variar a prévia de 2 linhas | ✅ + custo novo: ordem estável transforma paginação por offset em **dump completo e reproduzível** para key só-leitura — a detecção existe (`main.py:2008-2016`) e **não pode ser removida nem amostrada** |
| **2** | Conflito na co-edição | **Merge por célula agora** (item 1 do F0). Detecção = decisão **separada**; se o Diretor quiser, `xmin` com **token opaco**. **T + D** | O contrato do PUT **já é parcial e já é testado** (`main.py:2058-2059`, `media_cleanup.py:51`, `test_audit_log.py:82`) `[cód. 14/08 + medido]` — quem viola é o cliente | **Colisão na mesma célula continua LWW silencioso** (medido: 2º PUT vence, 200 OK). `xmin` = Postgres-only, intestável no modo padrão (SQLite não tem `xmin`, `rowid` não muda no UPDATE) `[medido]` | ⚠️ Merge sobreviveu inteiro; **`xmin` cru refutado**: é contador global do cluster, vaza volume de escrita dos vizinhos → só serializado como HMAC opaco |
| **3** | Live charts no público | **Público continua congelado** (confirma o M8.5) **e a F4 troca de alvo**: invalidar o **preview congelado** do Studio. Se o Diretor recusar a troca, **cortar a F4**. **D** | O único consumidor de `/data` é `LiveChartPreview` numa **aba condicional** (`PublishStudio.tsx:259`); ao lado, o mesmo Studio já renderiza o SVG congelado de propósito `[medido]` | Entrega **menos** do que "live charts" do roadmap: ninguém vê gráfico se animando. Ir vivo custa 5 coisas: endpoint anônimo de agregação (não existe), checagem de fonte publish-time→por-leitura, GROUP BY em Seq Scan no caminho do anônimo (6,6-8,7 ms/gráfico medidos em 50k), dessincronizar 4 superfícies, perder `alt_table`+avisos | ➖ Não submetida ao cético |
| **4** | Cotas do free tier | **Item medido do spike + ação de plataforma bloqueante**: setar `HEALTH_URL` antes de começar. **Corrigir a premissa.** **S + D** | O M-Ops **não cobriu** Realtime: `milestone_ops:44` e `:55` nomeiam o M10 como reabertura; e o keep-alive é **verde e inerte** sem `HEALTH_URL` (`keep-alive.yml:34-38` faz `exit 0`) `[medido]` | Adia o fechamento da decisão 1 até haver projeto Supabase; transfere trabalho de plataforma pro Diretor; se a medição vier apertada, vira decisão orçamentária no meio da milestone | ➖ Não submetida |
| **5** | Enhancement vs dependência dura | **Enhancement**, com gate `validate-realtime.mjs` (Playwright `routeWebSocket`). **D** | Já é o que o repo faz em 3 subsistemas (21 chamadas de `is_configured()` em 4 módulos); o conftest **remove** as env de Supabase no import (`conftest.py:35-36`), e são 432 testes nesse regime `[medido]` | O caminho **com** realtime nunca roda em CI. Autorização de canal, entrega, latência e reconexão ficam sem cobertura automatizada **para sempre**. "Verde no CI" nunca vai significar "o realtime funciona" | ➖ Não submetida |
| **6** | Escopo do optimistic UI | **Só célula**, e só depois de 3 pré-requisitos. Contrato de rollback **reescrito** (ver 2.6). **T + D** | Os 3 pré-requisitos são bugs de hoje, não requisitos novos: sem `res.ok`, sem guarda de sequência, e chave de linha quebrada em PK customizada `[medido]` | Create/delete continuam pessimistas (pagam o `count(*)` a cada ação); o caminho otimista fica **desligado** em tabela com PK não-inteira | ❌ Duas cláusulas caíram: **"em 2xx não refaz fetch"** e **"em 404 remove a linha"** (ver 2.6) |
| **F0** | Fatiar o conserto do LWW fora do M10 | **SIM — fatia própria, `0.9.5`, antes de qualquer decisão de transporte.** 5 itens. **T + D (só o carimbo de versão)** | Fecha 3 bugs de produção que existem hoje sem realtime, devolve honestidade ao audit do M9 e desbloqueia o predicado da F4, sem depender do único item que precisa de Supabase | O item 1 **não** resolve colisão na mesma célula — vender F0 como "conflito resolvido" seria vender dedução como medição | ✅ |

### 2.1 Decisão 1 — o que sobrou depois do cético

O cético derrubou a frase de venda, não a escolha. Onde dossiê e refutação discordam, **eu sigo a refutação**, porque ela mediu na camada em que a decisão é tomada:

- **Custo do refetch.** O dossiê vende "0,056 ms por linha contra 19,305 ms por página" — isso é **tempo de SQL**. Na porta da API, mesmo banco, 50k linhas: linha p50 **21,892 ms** / p95 26,289 ms; página p50 **22,989 ms** / p95 27,068 ms `[medido]`. Diferença real: ~1,1 ms, não 19,2. O SQL é ~6% do request; o piso do instrumento (`GET /health`, só `SELECT 1`) já é 10,7 ms. **Refetch por linha continua sendo a escolha certa — por preservação de estado de tela (não embaralha scroll, não mata célula em edição), não por performance.**
- **"Não compra briga nenhuma no eixo do moderador."** Falso. O default do SDK é canal **público** (`RealtimeChannel.ts:249 private: false`) `[medido]`; a anon key é servida a **visitante anônimo** do site publicado (`AuthProvider` no root layout, sem middleware) `[medido]`; e `GET /public/tables/` devolve, sem auth, o `id` global e o nome de toda tabela pública da plataforma (`main.py:1785-1797`) `[medido]`. Um sinal carregando `table_name` num canal por tenant entrega de graça, em modo push, exatamente o oráculo que `main.py:840-844` foi escrito pra negar `[cód. 14/08]`. **A briga foi movida do RLS para o nome/autorização do canal — não foi resolvida.**
- **Sem replay, o badge "ao vivo" mente.** Medido contra servidor Phoenix mínimo: servidor emitiu 6 sinais, cliente entregou **[1, 2, 6]**, e o app viu `SUBSCRIBED → CHANNEL_ERROR → SUBSCRIBED`. O payload do 2º `phx_join` é **byte-idêntico** ao do 1º — sem `since`, `cursor` ou `offset` `[medido]`. É o padrão do drenador verde sem drenar.

**Correções obrigatórias no contrato do sinal, antes de escolher transporte:**

1. `private: true` é **proibição de desenho** para canal público — não é preferência.
2. O sinal carrega `seq` monotônico **por tenant**; o cliente detecta lacuna.
3. **Toda** transição de volta para `SUBSCRIBED` dispara refetch completo da página. Enquanto `seq` não existir, a UI não pode dizer "ao vivo" — no máximo "conectado".
4. Refetch por PK é **fail-closed**: ou `main.py:1971` passa a devolver 400 com filtro inválido, ou o cliente exige `total === 1` antes de aplicar. Hoje o refetch com filtro inválido devolve **a linha errada com 200** `[medido]`.
5. Granularidade do canal **é decisão aberta**: por tenant vaza nome de tabela e frequência de escrita para moderador fora do grupo. Por grupo resolve o vazamento e recompra a complexidade do `ModeratorPermission`.
6. `tenant_id` sai do payload (o `_row_snapshot` de hoje não dá pop).

**Plano B nomeado:** se o Supabase não autorizar canal privado por tenant/grupo, o transporte cai para **WebSocket no nosso FastAPI** (`websockets==15.0.1` e `fastapi`/`uvicorn` já pinados, `requirements.txt:15/51/53`, `[medido]`). Ganha: autorização 100% nossa, master funciona, é a única variante testável ponta a ponta em dev (onde o token nem é JWT — `auth.py:123` casa `test-<username>`). Perde: hoje roda 1 processo (`Procfile` sem `--workers`), e no dia em que virar 2 réplicas o fanout em memória quebra **em silêncio**; contradiz `roadmap.md:121`. **Por isso o contrato do sinal é congelado na F1 ANTES do transporte** — para que o frontend não seja jogado fora.

### 2.6 Decisão 6 — o contrato de rollback, corrigido

Duas cláusulas do dossiê caíram no cético e precisam entrar corrigidas:

- ~~"em 2xx mantém o valor otimista e NÃO refaz fetch"~~ → **"em 2xx, reconciliar a célula com o valor que o servidor devolver"**. O servidor reescreve: `PUT quando="05/03/2026"` → 200 OK → banco grava `2026-05-03` (dois meses de diferença, ninguém avisado) `[medido]`. Com a cláusula original, quem escreveu é **a única pessoa que vê o valor errado**, e nunca descobre — os outros espectadores refazem o fetch pelo sinal e leem o certo. Agravante: o mesmo PUT em SQLite dá 500, então **a família DateTime só existe em produção** `[medido]`.
- ~~"em 404 remove a linha"~~ → **discriminar por `detail`**. São dois 404 opostos no mesmo código: `"Table not found or no access"` (`main.py:849`) e `"Record not found"` (`main.py:2052`, `:2103`) `[cód. 14/08]`. Um admin revogando permissão de grupo com a aba do moderador aberta faria a tela **apagar linhas uma a uma** — e no híbrido, com refetch por sinal, vira cascata. Pré-requisito: o `if (!res.ok)` do F0 **tem que ler o corpo**; hoje `page.tsx:73` engole com `.catch(() => ({}))` `[cód. 14/08]`.
- Pré-requisito da chave de linha é **do backend**, não do cliente: `record_id: int` em `main.py:2024`/`:2081` → `PUT /api/produtos/SKU-1` = 422 `[medido]`. Trocar `record.id` por chave de PK no frontend não conserta nada.

---

## 3. Fases de execução

### F0 — Conserto do LWW-na-linha, ordem estável e leitura honesta  · `0.9.5`, **fora do M10**

| | |
|---|---|
| **Entrega** | 5 itens: (1) PUT parcial no `commitEdit` e no `commitMediaEdit`; (2) `ORDER BY pk` default nas 2 rotas de listagem; (3) `ORDER BY pk` no construtor de snapshot público; (4) `if (!res.ok)` com estado de erro **lendo o `detail`**; (5) guarda de sequência + chave de linha por PK. |
| **Arquivos** | `frontend/src/app/admin/data/[table]/page.tsx` (`:221`, `:236`, `:69-77`, chaveamento em `:215/:402/:523`); `backend/main.py` (`:1999-2001`, `:1860-1862`, **`:2791`**). |
| **Como se prova** | Testes novos: (a) dois PUTs parciais em colunas diferentes da mesma linha — o valor do primeiro **sobrevive** `[cenário já reproduzido: sem o fix, `ano=1999` volta pra 1900]`; (b) `audit.changed_columns == ['ano']` após edição de 1 célula; (c) listagem determinística sob UPDATE concorrente (o probe de 200 linhas: 5 trocadas → 0); (d) snapshot público estável sob edição em tabela >2000 linhas (3 linhas perdidas → 0). Gate: suíte completa em **PG** — baseline medida com a mudança do `ORDER BY` aplicada: **422 passed / 10 skipped**, zero teste quebrado `[medido]`. |
| **Critério de morte** | Se existir consumidor programático em produção que dependa da ordem física atual (**NÃO MEDIDO** — só o banco de prod responde), o item 2 vira mudança anunciada, não silenciosa. Nada mais nesta fase pode morrer: são bugs. |
| **O que NÃO faz** | Não resolve colisão na **mesma** célula (medido: 2º PUT vence em silêncio). Não implementa detecção de conflito. Não implementa optimistic UI (só instala os pré-requisitos). Não toca realtime. |

### F1 — Spike do transporte + contrato do sinal congelado

| | |
|---|---|
| **Entrega** | Decisão 1 fechada **com medição**; contrato do sinal (v1) congelado; padrão de degradação escrito. |
| **Arquivos** | **Nenhum de produção.** Scripts descartáveis no scratchpad + 1 projeto Supabase de teste. A única saída versionada é o contrato do sinal (documento) e o guard `isSupabaseConfigured()` como padrão. |
| **Como se prova** | Matriz de controles obrigatória (§4). Nenhuma conclusão pode citar `SUBSCRIBED`. |
| **Critério de morte** | Nativo morre se: (b) com GRANT e policy de hoje entregar ≥1 evento (WALRUS não avalia nossa policy → **inseguro por construção**); ou o `ALTER PUBLICATION` exigir privilégio que a aplicação não tem; ou `tenant_N` não for alcançável. Híbrido sobre Supabase morre se canal privado não for autorizável por tenant/grupo → cai para WebSocket próprio, **sem teimosia** (jurisprudência do M7). |
| **O que NÃO faz** | Não mede a UI. Nada que sair da F1 prova que o DataViewer atualiza. Não escreve código de produto. |

### F2 — Presence

| | |
|---|---|
| **Entrega** | Quem está online e em qual tabela, no DataViewer e na lista. Visual editorial Mora. |
| **Arquivos** | `frontend/src/lib/supabaseClient.ts` (ponto de entrada, guardado), hook novo de canal, `data/[table]/page.tsx`, lista de tabelas. |
| **Como se prova** | `presenceState()` populado com **DOIS clientes** — nunca o status do subscribe. Motivo medido: no SDK 2.105.4 presence é **opt-in no join** (`RealtimeChannel.ts:290-298`), e um canal que só chama `track()` sem binding entra com `enabled: false` `[medido]` — a F2 pode nascer muda com `SUBSCRIBED` normal. |
| **Critério de morte** | Sem canal privado autorizável, presence sobre Supabase **não sai**. Não existe versão "barata com canal público agora, privada depois": qualquer replay/histórico levanta erro duro no construtor (`RealtimeChannel.ts:266-270`) `[medido]`. |
| **O que NÃO faz** | Não mostra "quem está editando qual célula" (isso é F3). Não é lock. |

### F3 — Dados vivos + optimistic UI de célula

| | |
|---|---|
| **Entrega** | DataViewer reage a evento alheio aplicando o refetch da **linha**; edição própria otimista de célula com rollback pelo contrato de 2.6. |
| **Arquivos** | `backend/main.py` (dependency `realtime_buffer` + flag `commit_ok` em `:692`/`:733`; publish); os 3 pontos de emissão (`:1935`, `:2069`, `:2117`); `frontend/.../page.tsx`. |
| **Como se prova** | Gate `validate-realtime.mjs` com `page.routeWebSocket` (medido que funciona, **com origem real**): chega evento → tela muda; canal cai → tela **não** apaga; volta o `SUBSCRIBED` → **refetch completo**; evento fora de ordem → não regride célula. Backend: teste com TestClient provando ordem (buffer teardown depois do commit, `commit_ok=False` no caminho de erro). |
| **Critério de morte** | Se o refetch por PK não puder ser fail-closed, a F3 não aplica linha por sinal — vira invalidação de página, e aí o custo volta a ser o `count(*)` (9,2 ms sem busca / 62,9 ms com busca, medidos) por evento por espectador. |
| **O que NÃO faz** | **Degrada por tabela**: tabela com PK não-inteira não tem UPDATE nem DELETE hoje (422 medido) — só CREATE. Não cobre escrita fora da API (import SQL, psql, migration). Não faz create/delete otimistas. Não faz lock. Não cobre o evento de import em massa (`EV_IMPORTED`, `main.py:2467-2476`, que emite **sem linha**) — quinta categoria que a enumeração do plano velho não previa. |

### F4 — Live charts (escopo redefinido, ou cortada)

| | |
|---|---|
| **Entrega recomendada** | **Invalidar o preview congelado do Studio** quando o dado da fonte muda — o gráfico que o admin de fato usa pra decidir publicar, e que é bit-a-bit o que vai pro público. |
| **Arquivos** | `frontend/src/components/publish/PublishStudio.tsx` (o efeito `:43-51` hoje depende de `state.tables`/`state.charts`, nunca do dado), `ChartsTab.tsx`. Backend: nenhum, se reusar `POST /api/publications/me/preview`. |
| **Como se prova** | Editar célula de uma tabela-fonte com o Studio aberto → o SVG congelado do preview muda sozinho. Invalidação chaveada em **`(tabela, tipo-de-evento)`**, nunca em `changed_columns` (medido que o predicado por coluna erra 100% dos `count`/`count_distinct` sob INSERT/DELETE e perde views com `slices`/`search`). |
| **Critério de morte** | Se o Diretor exigir "gráfico vivo" no sentido literal do roadmap, **a F4 sai da milestone** em vez de ser implementada como está escrita: ela animaria o único gráfico que ninguém olha. |
| **O que NÃO faz** | Não põe dado vivo no público. Não cria endpoint anônimo de agregação. Não resolve o caso cross-workspace (view do tenant B sobre tabela `is_public` do tenant A — `main.py:3374`, decisão deliberada e testada `[medido: 2 passed]`), que **nenhum** dos canais por tenant entrega. |

---

## 4. O spike F1, passo a passo

### 4.0 — Ambiente e prova do instrumento (antes de acreditar em qualquer resultado)

1. **Provisionar projeto Supabase.** Não existe credencial neste ambiente `[medido]`. `DATABASE_URL` na conexão **direta (5432)**, nunca no pooler: `alembic upgrade head` e o `SET search_path TO public` por conexão (`database.py:50-56`) não sobrevivem à troca de sessão do pgbouncer.
2. `alembic upgrade head` → master + admin A + admin B pelo fluxo real (o PATCH de `app_metadata` mora em `main.py:261-278`) → `POST /tables/` criando `membros` em cada tenant.
3. **Token:** `/api/auth/login` devolve 410 quando o Supabase está configurado (`auth.py:350-356`) — o token sai de `signInWithPassword` dentro do script.
4. **Toda medição roda TRÊS sondas na mesma rodada:** **(P)** controle positivo = tabela em `public` sem RLS, com GRANT e dentro da publication; **(X)** a condição sob teste; **(N)** controle negativo = mesmo binding com token do tenant B.
5. **Canário:** 10 INSERTs sequenciais pela API real, marcador monotônico `seq=1..10`, 300 ms de intervalo, relidos por `GET` **e** por `psql` pra provar que os 10 commitaram.

> ### ⚠️ ANTI-FALSO-POSITIVO (regra dura da fase)
> **`SUBSCRIBED` entra no log como metadado e nunca como veredito. Nenhuma conclusão do spike pode citar status de subscribe.**
> Motivo medido: o eco de binding do join só compara `event/schema/table/filter` (`RealtimeChannel.ts:343-384`) — nada ali prova privilégio de leitura, que o WALRUS decide **evento a evento**. Sem Supabase, `subscribe()` **não levanta**: devolve `CHANNEL_ERROR` de forma **assíncrona** — try/catch em volta do subscribe não pega nada `[medido]`.
> **Instrumentos obrigatórios em toda sonda:** `createClient(..., {realtime:{logLevel:'info'}})` (vai como param pro servidor, `RealtimeClient.ts:844-846`); `channel.on('system', {}, log)`; logar `payload.errors` em todo callback (`RealtimeChannel.ts:1056-1064`); capturar `err.message` do `subscribe()`.
> **Leituras de resultado:** `P=10/10` e `X=10/10` = PASSA. `X<10` com `P=10/10` = falha real do nosso caso. **`P<10` = INSTRUMENTO QUEBRADO — nada da rodada vale**, conserte o harness. `N≥1` = vazamento, e vazamento interrompe o spike.
> **Duas armadilhas de máquina, medidas:** (i) `conftest.py:100-111` dropa **todo** schema `tenant_*` do banco por fixture autouse — uma suíte rodando em paralelo destrói a medição e o sintoma (`does not exist`) parece "a DDL não funcionou". Use banco dedicado. (ii) Sobraram roles de experimentos anteriores no cluster (`m10_probe`, `m10_semgrant`, `b10_norls`, `b10chk`) e **ACLs órfãs por OID reciclado**: uma role nova nasceu com `USAGE` em `tenant_777`/`tenant_888` sem ninguém conceder `[medido]`. Varra antes de criar role, ou um teste passa pelo motivo errado.

### 4.1 — A policy estendida é respeitada pelo WALRUS? (4 rodadas, não 1)

(a) sem GRANT + policy de hoje · (b) com GRANT + policy de hoje · (c) com GRANT + policy estendida · (d) = (c) com token do tenant B.

- **PASSA (nativo viável):** (c) 10/10, (d) 0/10, (a) e (b) 0/10, com P=10/10 em todas.
- **FALHA-A:** (b) entrega ≥1 → o WALRUS não avalia nossa policy (ou lê com BYPASSRLS) → **nativo reprovado na hora, sem discussão de custo**.
- **FALHA-B:** (c) 0/10 com P=10/10 → cruzar com 4.3 antes de concluir.
- **FALHA-C:** (d) ≥1 → vazamento entre inquilinos: **parar o spike**, registrar como incidente de desenho.
- Pré-condição já medida em PG puro: sem GRANT → `permission denied for schema tenant_777` mesmo com o GUC certo; **com a policy de hoje e GRANT completo, claims corretos entregam 0 linhas** `[medido]`. Ou seja o nativo entrega zero **sem** estender — o plano velho pressupunha a estendida como dada.
- Item que faltava: **quais schemas o PostgREST deste projeto expõe, e quem no time pode mudar isso pelo dashboard?** A policy estendida torna o claim **suficiente sem GUC**; se `tenant_N` entrar em "Exposed schemas" (toggle invisível ao alembic e ao CI), o tenant inteiro sai por REST, sem `authorize_table`, sem escopo de key, sem audit.

### 4.2 — Tabela criada em runtime entra na publication?

Três comandos com o role do nosso `DATABASE_URL`, registrando a mensagem literal de cada um: `ALTER PUBLICATION supabase_realtime ADD TABLE tenant_N.membros`; `... ADD TABLES IN SCHEMA tenant_N`; `SELECT pubname, pubowner::regrole, puballtables FROM pg_publication`; mais `SELECT current_user, usesuper FROM pg_user WHERE usename = current_user`. Depois, canário **duas vezes**: fora e dentro da publication.

- Já medido em PG 16.14: publication comum **não** absorve tabela nova; `FOR TABLES IN SCHEMA` absorve mas **exige superuser** (`must be superuser to add or set schemas`); `ADD TABLE` exige ser **dono** da publication `[medido]`.
- **Correção de rótulo (o cético inverteu isto, e ele tem razão):** `permission denied` é o resultado **seguro** — morte por operação. **O `PASSA` é o evento de segurança**: significa que o role do processo web é dono de um objeto **global do projeto** e que `POST /tables/`, um handler dirigido por entrada de usuário, ganha DDL permanente sobre ele. Hoje nenhum caminho de produção carrega privilégio desse tipo (`ensure_tenant_schema` só faz `CREATE SCHEMA`, `dynamic_schema.py:129`, `[cód. 14/08]`; zero GRANT fora de teste).
- **FALHA-B:** canário 10/10 mesmo **fora** da publication → o projeto tem `FOR ALL TABLES` e você está medindo outra coisa. Confira `puballtables` **antes** de qualquer conclusão.

### 4.3 — `tenant_N` é alcançável pelo `postgres_changes`?

Par controlado: mesma DDL, mesma policy, mesmo GRANT, uma cópia em `public` e outra em `tenant_777`, assinadas no **mesmo** cliente, canário na mesma rodada. PASSA = as duas 10/10. FALHA = `public` 10/10 e `tenant_777` 0/10 → adotar o nativo passaria a exigir mover tabela dinâmica pro `public`, o que colide com o desenho inteiro e com a migration `f3a80c5d1e97` (que só varre `^tenant_[0-9]+$`) — **ordem de grandeza diferente da que a decisão 1 pesa**. AMBAS 0/10 → a causa não é o schema; volte à 4.1.

### 4.4 — Canal privado e Realtime Authorization (o gate do híbrido)

Não está no plano velho e é **o item que decide a F2 e a granularidade do canal**. Abrir dois canais `private: true` com tokens de tenants diferentes e ver quem recebe `SUBSCRIBED`; inspecionar o schema `realtime` com service role (colunas de `realtime.messages`, existência de `realtime.topic()`, policies default). PASSA = tenant A entra no seu tópico e é **recusado** no do B, **com erro visível** (`CHANNEL_ERROR`, caminho existe em `RealtimeChannel.ts:330-338`). FALHA = recusa silenciosa, ou impossibilidade de escrever a policy sem consultar nosso catálogo.
**Restrição de desenho que já está medida:** a policy de canal tem que decidir por **comparação de string do tópico com claim**, nunca por join no nosso catálogo — `public._tables`, `users` e `_views` estão com RLS **ligado e zero policy**, `relacl = NULL` `[medido]`. Role `authenticated` lê zero linhas de `_tables`.

### 4.5 — Cotas e pós-pause

**O Diretor declara o alvo primeiro** (quantos editores simultâneos na mesma tabela o M10 promete, e quantas mensagens por edição) — é a única das perguntas do plano velho sem critério embutido, e sem alvo qualquer número "passa".
Sonda de concorrência: K clientes × 1 canal, K ∈ {1,10,50,100}, medindo (i) quantos chegam a SUBSCRIBED, (ii) quantos recebem o canário 10/10, (iii) latência p50/p95 do 1º evento. PASSA = alvo com folga ≥3× nas três. FALHA = teto abaixo do alvo **ou entrega parcial** (SUBSCRIBED em K, evento em menos que K — o falso positivo clássico, que só aparece porque a sonda mede entrega).
Sonda de pause: **agendar no dia 1** (leva dias de calendário). Depois do pause: um GET religa o projeto? o WS religa sozinho? a publication manteve as tabelas? o slot de replicação sobreviveu? Qualquer passo manual = o M10 nasce com um modo "realtime morto" que ninguém percebe.
Piso de demanda já medido no SDK instalado: `HEARTBEAT_INTERVAL: 25000` → ~1.152 heartbeats/dia por **aba** aberta; e o SDK multiplexa canais numa conexão (`disconnectOnEmptyChannelsAfterMs = 2 × heartbeat`) `[medido]` — logo "conexões simultâneas" conta **abas**, não canais.

### 4.6 — O token embute `app_metadata`? (3 momentos, não 1)

Decodificar o 2º segmento do JWT em: (1) logo após o provisionamento; (2) após `signOut` + `signIn`; (3) após `update_user_metadata` com o usuário já logado. PASSA = nos três há `app_metadata.tenant_id` numérico e `app_metadata.role`. **FALHA-B** (claim só aparece no momento 2) = o M10 herda bug de ativação: admin recém-criado não recebe evento nenhum até relogar — isso vira **requisito de produto** (forçar refresh de sessão pós-provisionamento), não nota de rodapé. Contexto: **nada no sistema lê esse claim hoje**, e o único lugar que diz ler está mentindo (`AuthContext.tsx:14`) `[medido]` — qualquer caminho baseado em claim estreia um contrato nunca exercido, com zero teste possível em dev (o token de dev não é JWT).

---

## 5. Riscos vivos

| Risco | O que ele derruba | Sinal de alerta |
|---|---|---|
| **Canal privado não é autorizável por tenant/grupo** | F1 (híbrido sobre Supabase) e **F2 inteira** | O spike 4.4 devolver recusa silenciosa, ou a policy de `realtime.messages` precisar consultar nosso catálogo (que é RLS-on/policy-zero, medido) |
| **Sinal sem `seq`/replay** | A credibilidade da milestone | `SUBSCRIBED → CHANNEL_ERROR → SUBSCRIBED` com a grade parada. Já medido: 6 emitidos, 3 entregues, status verde. **É o padrão do drenador verde sem drenar** |
| **Publish no teardown sem semáforo** | O processo web, num apagão do Supabase com escrita sustentada | Contagem de threads subindo com latência **normal** — medido: 201 threads e `limiter_borrowed=0`. Até a morte do container, todos os indicadores ficam verdes |
| **Queda do Realtime é invisível** | Confiança em qualquer número de operação | `/health` só faz `SELECT 1` (`main.py:183-193`) e o `SENTRY_DSN` segue pendente. Sem os 2 contadores (`publicados_ok`, `descartados`), "falha engolida em log" = zero superfície de detecção |
| **Refetch sem rate limit** | O pool de 15 conexões, numa mesa de 3+ pessoas | `main.py:723` só limita key; edição em lote de N células com M espectadores = N×M requests autenticados sem throttle. Alerta: `count(*)` de 9,2 ms virando 62,9 ms quando alguém está com busca ativa |
| **`HEALTH_URL` inerte** | A milestone inteira, pelo modo de falha de 2026-06-11 | `keep-alive.yml` verde com `exit 0`. Pendência de dois meses (`milestone_ops:69`, `CLAUDE.md:47`) |
| **`public.t{N}_*` sem RLS** | Não é do M10 — é **produção hoje** | `b1f6c4e9a2d7` documenta que `public.*` é exposto por PostgREST com `anon`, e o conserto de lá é lista fixa de 8 nomes que nunca conterá tabela criada em runtime (já mordeu uma vez: `e4b7a9c31f52:12-15`). **Sonda de 1 minuto:** `curl -H "apikey: $ANON" '.../rest/v1/t2_boa_tabela?select=*'`. Se responder, é incidente, não risco. Conserto estrutural = `ENABLE ROW LEVEL SECURITY` dentro do próprio `import_sql_script` |
| **Gate contra servidor falso envelhecendo** | A cobertura da F3 | O payload de join **já mudou** nesta versão do SDK (`presence: {enabled}` calculado dos bindings) — um mock escrito hoje pode deixar de casar num upgrade de patch |
| **F4 sem alvo** | O escopo da 1.0 | Se a decisão 3 sair "público congelado" **e** a troca de alvo for recusada, a F4 não tem onde acontecer e o M10 vira F1+F2+F3 |

---

## 6. O que ficou NÃO MEDIDO

**Só o Supabase real responde:**
1. Se policy em `realtime.messages` autoriza join por comparação de string do tópico com claim (não há cópia do WALRUS nem do schema `realtime` no repo — grep = zero).
2. Se o access token de fato embute `app_metadata`, e a partir de quando.
3. Se a negativa de policy chega como `CHANNEL_ERROR` (o caminho existe no SDK; **o servidor não foi medido**).
4. Latência e contrato do endpoint HTTP `/realtime/v1/api/broadcast` — que o SDK Python instalado **não implementa** (`_broadcast_endpoint_url` calculado e nunca usado).
5. Cotas do free tier: teto de conexões e mensagens; se heartbeat conta como mensagem faturada; se o medidor é por projeto ou por organização; **se broadcast fanout conta 1 mensagem ou N** (muda a conta por um fator igual ao tamanho da mesa); e se cota estourada usa o mesmo `CHANNEL_ERROR` — se usar, quota exaurida é indistinguível de rede caída pro nosso código.
6. Comportamento durante e depois do auto-pause; se tabela criada em runtime entra sozinha na publication; quem é o dono de `supabase_realtime`; se o role do `DATABASE_URL` é superuser.
7. Custo e lock do `REPLICA IDENTITY FULL` e do `AccessExclusiveLock` na publication (a forma do BUG-PG01).

**Só o banco de produção responde:**
8. Se existe API key ativa lendo `/api/{tabela}` hoje (decide se a mudança de ordem tem consumidor).
9. Se algum tenant tem tabela acima de 2.000 linhas (decide se o item 3 do F0 é conserto ativo ou preventiva).
10. Se algum tenant usa PK customizada (decide se o 422 é urgente ou higiene).
11. Quantos gráficos e quantas linhas por workspace (os 6,6-8,7 ms são de tabela sintética de 50k).
12. Se a família `public.t{N}_*` é alcançável por `anon` via PostgREST hoje.

**Só o Diretor responde (não tem resposta técnica):**
13. Se "mudança feita fora da API não aparece na tela" é aceitável. **Se não for, a única opção que satisfaz é o nativo — e aí a conversa passa a ser sobre GRANT e sobre um master que não recebe evento.**
14. Se "evento perdido em falha de rede, sem retry" é aceitável. Se não for, a resposta honesta é outbox, e o M10 quebra o próprio não-objetivo.
15. Se um gate contra servidor falso conta como "testado" ou como fachada. **Essa resposta define a barra da milestone inteira e nenhuma medição a substitui.**
16. Se o rebate do M8.5 de 12/07 está reaberto, e se "preview invalidado" honra ou fura o compromisso do roadmap.
17. Alvo de concorrência (quantos editores simultâneos) e valor mensal aceitável do plano pago.
18. Se SQLite continua engine suportado até a 1.0 — **essa resposta sozinha admite ou elimina a opção `xmin`**.
19. Se F0 sai como `0.9.5` agora ou entra como primeira fatia do M10.
20. Ordem canônica: PK crescente (criação) ou decrescente (mais recente primeiro) — mesmo Index Scan nos dois, escolha de produto.

**Latências e percepções não medidas:** roundtrip HTTP real em rede de produção (medi banco e porta local, não rede); custo de `_build_chart_artifacts` por invalidação (medi só a parte SQL, não o render de SVG); comportamento com >1 réplica (hoje é 1 processo, `Procfile` sem `--workers`).

---

## 7. Ordem sugerida e caminho crítico

### Dá pra fazer JÁ (sem spike, sem Supabase, sem decisão do Diretor)

1. **F0 inteira.** Cinco itens, todos com evidência de dano medido, todos independentes de transporte. A suíte já foi rodada com o `ORDER BY` aplicado: 422 passed, zero quebra.
2. **Higiene de payload:** pop do `tenant_id` no que for virar sinal (`_row_snapshot` hoje devolve `dict(linha._mapping)` cru).
3. **Correção documental do plano velho:** carimbar a seção 0 como histórico fechado no 0.9.1; apagar as linhas 272 e 317 dos "Fatos-âncora" (que contradizem a seção 1(a) do mesmo arquivo); trocar o motivo do risco `postgres_changes × RLS` (é GRANT, não GUC); tirar da tabela de decisões os dois custos que não existem mais; e corrigir o quarto docstring da família B12 (`AuthContext.tsx:14`).
4. **Ação de plataforma (Diretor, mas não depende de nada):** setar `HEALTH_URL`. Sem isso o M10 nasce sobre uma proteção anti-pause que só existe no papel.
5. **Sonda de 1 minuto** na família `public.t{N}_*` — fora do M10, mas se responder é incidente aberto e muda a prioridade de tudo.

### Caminho crítico

```
[HEALTH_URL] ──┐
               ├──> F1 spike (4.0 → 4.1/4.2/4.3 → 4.4 → 4.5/4.6) ──> DECISÃO 1 ──┬──> F2
[projeto Supabase]                                                                └──> F3 ──> F4?
F0 (paralelo, não bloqueia nada e desbloqueia o predicado da F4)
```

- **Bloqueado por Supabase real:** decisões 1 e 4; F1, F2, F3 inteiras.
- **Bloqueado pelo Diretor:** decisão 3 (F4 existe ou é cortada), decisão 5 (barra de teste da milestone), alvo de concorrência da 4.5, aceitação do custo (a) da decisão 1.
- **Sequência dentro do spike que não pode ser trocada:** a sonda de pause (4.5) é agendada no **dia 1**, porque leva dias de calendário; a sonda de concorrência vem **depois** dela, porque pode ela mesma disparar o limite que se quer medir.
- **A 1b não é bloqueante.** Está medida ponta a ponta e é escolha entre dois padrões que já moram no repo — ~10 linhas de dependency + 2 de flag + semáforo. Mantê-la como bloqueante do M10 atrasa a milestone por um item de 1 dia.

### Nota sobre o carimbo 1.0.0

`M10 fechado = 1.0.0` é âncora dura do versionamento (CLAUDE.md), **não** de escopo. Se a decisão 3 cortar a F4 e o spike derrubar o Supabase para o WebSocket próprio, a 1.0 sai com F1+F2+F3 e um não-objetivo a mais declarado. O que **não** pode acontecer é a 1.0 sair com a F3 verde no CI e muda em produção — é para isso que existem o `seq`, o refetch no reconnect e os dois contadores.