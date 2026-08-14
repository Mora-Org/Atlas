# M10 — Real-time + Collaborative Editing

> # ⛔ ESTE DOCUMENTO É HISTÓRICO. Não execute a partir dele.
> **O plano vigente é [milestone_10_plano_execucao.md](milestone_10_plano_execucao.md)** (2026-08-14).
>
> Este arquivo foi escrito contra o código `0.9.0` e envelheceu em quatro versões
> (`0.9.1` → `0.9.4`, PRs #68–#72). Uma reauditoria de 13 agentes conferiu **72
> afirmações dele contra o código de hoje e derrubou 28** — 13 falsas, 15
> desatualizadas. As três que mais custam a quem ler daqui:
>
> 1. **A §0 é histórico, não pendência.** B10/B11/B12 estão fechados. Pior: o
>    conserto que ela prescreve (*"Fix: `NULLIF(...)::int` na policy"*) é
>    **insuficiente** — só o NULLIF, sem amarrar o ramo de master à sentinela
>    `'0'`, alarga um vazamento que já existia. Quem usar esta seção como
>    especificação **reintroduz o buraco**.
> 2. **Duas das quatro objeções que reprovaram o "terceiro caminho" caíram**
>    (§3): o `NULLIF` virou o idioma da casa, e a migration que "não existe" é a
>    `f3a80c5d1e97`. As outras duas endureceram.
> 3. **"O mecanismo pós-commit não existe" é falso** (§2): ele está em produção
>    desde o M8 em `delete_admin`. O que não existe é no regime `tenant_db`. E o
>    spike que o M9 deixou aberto foi medido: `BackgroundTasks` roda **antes** do
>    commit, e está dropado.
>
> O que este arquivo continua valendo: o registro de **o que a 1ª versão errou**
> (§8) e o enquadramento do problema. Mantido inteiro de propósito — o projeto
> trata registro apagado como pior que registro corrigido.

> **Status:** 🟡 DETALHADO fase-a-fase em 2026-08-07 e **revisado por ultracode** (11 agentes, 1,21M tokens) — a revisão refutou 5 afirmações centrais da 1ª versão. O draft original é de 12/06, de antes do M8. Decisões abertas revisadas abaixo; **nada codado.**
> Smells compartilhados do backend: inventariados no [plano do M-Ops](milestone_ops_observabilidade.md) (fonte única).

---

# Detalhamento fase-a-fase (2026-08-07, revisado por ultracode)

> **Procedência das medições — leia antes de citar qualquer número daqui.**
> Tudo marcado como "medido" foi medido em **PostgreSQL 16.14 local** (container
> `dynamic-cms-pg`), reproduzindo o DDL do Atlas. **Nada foi medido contra o
> Supabase.** Não existe medição de latência, de Realtime, de publication real
> nem de token real. Onde a resposta depende da plataforma, está escrito
> "precisa de Supabase real".
>
> A 1ª versão deste detalhamento (solo, mesmo dia) foi revisada por um painel
> adversarial de 11 agentes. **Cinco das afirmações centrais dela foram
> refutadas ou corrigidas** — incluindo a que ela apresentava como a descoberta
> principal. As correções estão incorporadas abaixo; a lista do que caiu está no
> fim, em "O que a 1ª versão errou".

## 0. Três bugs de PRODUTO achados na revisão (não são do M10)

Vieram de auditar o M10 e não têm nada a ver com realtime. Registrados aqui
porque foi aqui que apareceram; o conserto é independente desta milestone.

**B10 — `RESET ALL` deixa o GUC em string vazia, e a policy vira erro 500.**
Medido: numa conexão virgem `current_setting('app.tenant_id', true)` é `NULL` e
`NULL::int` não levanta nada. Mas depois de `set_config` + `RESET ALL`
(`main.py:666` e `:707`), o GUC volta como `''`, e `''::int` levanta **22P02**.
Ou seja: toda requisição que passa por `tenant_db`/`tenant_db_principal` devolve
a conexão ao pool com `app.tenant_id=''`, e a próxima query que toque tabela de
tenant **sem** setar o GUC não devolve "200 com zero linhas" — devolve **500**.
Isso contradiz literalmente o docstring de `main.py:677-679`, o CLAUDE.md e o
plano do M9. **Fix: `NULLIF(current_setting(...), '')::int` na policy.**

**B11 — o backfill de `app_metadata` do admin roda fora da compensação.**
`main.py:242-244` faz o PATCH do `tenant_id` **depois** do commit, fora do `try`
e fora do bloco de compensação de `:232-240`. Se falhar, o master recebe 500 mas
o admin já existe em `public.users`, em `auth.users` e com schema `tenant_N`
criado — e fica **sem `tenant_id` no `app_metadata`**, sem ninguém reverter.
Hoje é invisível (o backend nunca lê o claim). Vira falha permanente e
silenciosa de realtime pra um workspace inteiro no dia em que alguém ler.

**B12 — dois docstrings mentem.** (a) `models.py:259` diz que o audit "é a
fundação de eventos que os webhooks da F3 consomem" — o código da F3 desmente:
grep de `audit` em `webhooks.py`/`webhook_drain.py` retorna **zero**. (b) o
docstring de `test_rls_raw_bypass.py:7-8` diz que "o conftest cria a role
`app_user`" — não cria; a criação é manual, documentada só em
`milestone_3_rls_migration.md:150`. Em máquina sem a role, **o teste erra em vez
de provar**.

## 1. O que envelheceu no draft de junho

**(a) O DataViewer não carrega mais a tabela inteira no mount.** O M-Ops F3
paginou (`data/[table]/page.tsx:69-77`). As âncoras `:77-80` e `:178-197` do
draft estão desatualizadas (hoje `:69-77` e `:212-231`).

**(b) O substrato da F4 existe.** `_views` (`models.py:183`, `table_id` indexado
em `:194`), migration `f2c9e04b7a31`, e `POST/GET /api/views/me`
(`main.py:3348`, `:3395`) + `GET /api/views/me/{id}/data` (`:3439`).

**(c) A fronteira do público NÃO foi herdada — e a 1ª versão errou aqui.**
O M8.5 decidiu que **o gráfico dele** congela no público, e a mesma linha
(`milestone_8_5:175`) termina com *"Dado vivo fica pro M10."* Ele **delegou**,
não proibiu. "Logo a F4 é só admin" era inferência do redator, não decisão
batida. Continua sendo a decisão aberta nº 3.

## 2. O que o M9 mudou a favor — e o que ele NÃO mudou

**Mudou:** os pontos de emissão existem e são atômicos. `audit.record()` roda
dentro da transação nas mutações de linha **única** via `/api/{tabela}`
(`main.py:1892`, `:2027`, `:2077`), com ator polimórfico. E o M9 F3 provou o
padrão de **emissão atômica** — gravar o evento na mesma transação, sem HTTP
dentro dela.

**Não mudou, e a 1ª versão errou feio aqui:**

- **O broadcast NÃO seria "segundo consumidor de algo que já é gravado".**
  O precedente do próprio repo diz o contrário: o M9 F3 **é** o caso real de
  segundo consumidor e **não consumiu o audit**. Ele instrumentou os handlers
  com `emit_webhook` **ao lado** do audit (`main.py:1902`, `:2036`, `:2084`,
  `:2360`) e criou tabela própria com a linha **relida** do banco
  (`_row_snapshot`). O audit **nunca guarda valor de célula, por decisão**
  (`audit.py:26-30`) — e no `RECORD_DELETE` nem os nomes das colunas vão.
  Como sinal de invalidação o audit serve; como payload de "dado vivo", não.

- **O drain é inaproveitável.** Cron de 5 em 5 minutos
  (`webhook-drain.yml:37`), com o piso do backoff amarrado à cadência. Um evento
  gravado só sai na próxima passada — incompatível com "mudanças de um aparecem
  pro outro sem refresh". **Copiar `WebhookDelivery` é pior:** importa retry
  inútil pra UI (reentregar snapshot 40 min depois **sobrescreve a tela com dado
  velho**, pior que perder o evento), o contrato é *at-least-once com ordem
  best-effort* — que numa UI co-editada significa **célula voltando ao valor
  antigo na tela do outro**, exatamente o sintoma que a F3 existe pra matar — e
  a tabela **não tem poda**, num volume muito maior. Também **contradiz o
  não-objetivo declarado** de que "o M10 não cria infra de eventos persistidos".

- **Sobram ~30 linhas reusáveis, não "um padrão":** `build_payload`, o padrão de
  consultar alvos antes de montar payload, e `_row_snapshot`. Morrem a
  assinatura HMAC e todo o SSRF — o destino do broadcast é único e conhecido.

- **Publicar no ponto do emit está errado:** `tenant_db` só commita no
  **teardown** (`main.py:659`, `:700`), então publicar ali publica **antes do
  commit**. O lugar correto é pós-commit — e esse mecanismo **não existe**. O
  spike "BackgroundTasks ordem-vs-commit" ficou não resolvido no M9 porque "o
  cron já satisfaz"; **no M10 não há cron pra cobrir, então ele vira
  bloqueante.**

**Conclusão honesta:** o M9 barateou o que já era barato (o ponto de emissão) e
não tocou no que é caro (transporte + onde ele roda).

## 3. F1 — o spike, e o que ele NÃO precisa testar

**O critério de morte estava certo pelo motivo errado.** O `postgres_changes`
morre no **GRANT**, antes de a RLS ser avaliada: o WALRUS autoriza com
`has_column_privilege(role_do_token, tabela, coluna, 'SELECT')`, e o Atlas
**nunca concede nada** — `ensure_tenant_schema` só faz `CREATE SCHEMA`
(`dynamic_schema.py:80-82`), e o único `GRANT` do repo está num teste. Medido:
role sem USAGE recebe `permission denied for schema tenant_N`; a policy **nem é
alcançada**.

**E a falha é silenciosa.** O `.subscribe()` devolve `SUBSCRIBED` normalmente —
o que falha é a **entrega**, evento a evento, sem erro no cliente. **Um spike
que conclua "funcionou" porque o subscribe retornou SUBSCRIBED é falso
positivo.** Esse é o principal risco metodológico da F1.

**Adotar o nativo exige `GRANT USAGE ON SCHEMA` + `GRANT SELECT` acoplados ao
DDL — e isso transforma a policy na ÚNICA barreira entre tenants.** Hoje a
ausência de GRANT é uma segunda barreira. É degradação de defesa em
profundidade, não detalhe de setup.

### O "terceiro caminho" (policy + claim do JWT): tecnicamente válido, **reprovado por segurança**

A DDL foi **testada** em PG 16.14 e funciona: claims com
`app_metadata.tenant_id=777` → só as linhas do 777; tenant diferente → 0;
`app_metadata` ausente/escalar/array → 0 sem erro.

**Mas ela amplia o acesso, e é por isso que não deve entrar como escrita:**

1. **Bypassa a autorização de moderador.** O app restringe o mod às tabelas dos
   grupos permitidos (`main.py:633-638`, via `ModeratorPermission`), mas o
   `app_metadata.tenant_id` do mod **é o id do admin dono** (`main.py:407`).
   Medido: uma sessão apresentando só `request.jwt.claims` lê **todas** as
   linhas do tenant, ignorando grupo, escopo de API key (M9 F2) e qualquer regra
   do backend. Quem chegar na tabela portando o JWT — Data API/PostgREST — lê o
   tenant inteiro.
2. **Quebra o backend sem `NULLIF`.** Depois que alguém seta
   `request.jwt.claims` na conexão (o que o PostgREST faz por request), o fim da
   transação deixa o GUC em `''`, e uma query **legítima** do backend passa a
   dar `invalid input syntax for type json`. É a mesma família do B10.
3. **Não tem porta pro master.** Master não tem `tenant_id` no `app_metadata`
   (`auth.py:300-305`). Se o nativo vencer, o master — o primeiro a testar a
   feature — é o único que não recebe evento nenhum.
4. **Exige migration que não existe.** A policy nasce **por tabela**, dentro do
   `create_table`. Nenhuma migration executa `CREATE POLICY`. Estender exige
   varrer todas as tabelas de todos os `tenant_N` já existentes.

**Se ainda assim for adotado:** `NULLIF` nos dois ramos, `WITH CHECK` **não**
estendido (medido: `INSERT` só com claims já é recusado, e deve continuar), e o
ramo do JWT só depois de resolver o bypass de moderador.

### O que só o Supabase real responde
1. a policy estendida é respeitada pelo WALRUS via `request.jwt.claims`?
2. tabela criada em runtime entra na publication sozinha?
3. schema `tenant_N` (não-`public`) é alcançável?
4. cotas do free tier e comportamento pós-pause;
5. o access token de fato embute `app_metadata` (não verificado neste repo:
   nenhum código lê o claim).

### O DDL que eu temia é o inofensivo; o perigoso não estava no texto
- `ALTER PUBLICATION` tem **um** lugar pra morar, e o nome já está interpolado
  ali. **Mas** ele pega `AccessExclusiveLock` no objeto publication, que é **um
  só pro projeto inteiro** — logo, `POST /tables/` deixa de ser isolado por
  tenant e passa a **serializar contra o create de qualquer outro tenant**.
- `ADD TABLE` **não tem `IF NOT EXISTS`**: duplicata é erro duro, e o retry do
  create nem chega lá. Estado sujo silencioso — a tabela existe, aceita escrita,
  e simplesmente não emite evento.
- **`REPLICA IDENTITY FULL` é que tem a forma do BUG-PG01**, e o draft não o
  menciona. Se o spike concluir que é necessário, é aí que mora o risco de lock.

## 4. F2 — presence: o nome do canal não é a trava

**O SDK instalado nasce com `private: false`** (`RealtimeChannel.js:97-98`):
canal público **aceita qualquer nome de qualquer autenticado**. O nome é sempre
string do cliente e **nunca** passa pelo nosso backend — então esquema de nome
sem `private: true` é **ofuscação, não trava**. Pior: `tenant_id` é `users.id`
sequencial e o nome de tabela obedece `^[a-z][a-z0-9_]*$` — adivinhável.

**Vazamento concreto, medido:** `_tables.name` **não é único globalmente**. Um
canal `presence:membros` funde o workspace do Centro Budista (tenant 3) com o de
uma clínica (tenant 7), que também tem uma tabela `membros`.

**Consequência:** a premissa de que "presence não depende do resultado da F1" é
**falsa**. Em qualquer um dos 3 caminhos, presence só é autorizável via
**Realtime Authorization** (policy em `realtime.messages`) — que é justamente o
que a F1 decide.

## 5. F3 — a formulação da 1ª versão estava errada

**Não existe `ORDER BY` na listagem.** As quatro categorias que eu enumerei
("na janela / fora / entra / sai") pressupõem que pertencer à página N seja
função dos **valores** da linha. Não é — é função da ordem física devolvida pelo
banco. A enumeração só faz sentido **depois** de fixar `ORDER BY pk`, o que é
uma decisão nova que ninguém tomou.

**Dois defeitos de hoje que a F3 amplifica:**
- **`load()` não checa `res.ok`**: qualquer falha vira "Nenhum registro". Hoje é
  raro (só mount/busca/paginação); na F3 o load roda **a cada evento alheio**, e
  um 401 de token expirado **apaga a tabela na tela**.
- **`load()` não tem guarda de sequência**: ganha a última **resposta**, não o
  último pedido. O optimistic UI assume um "estado servidor conhecido" pra
  reconciliar — e ele não existe.

**O `commitEdit` manda a linha inteira** (`:221`) — confirmado. Dois editores em
células **diferentes** da mesma linha se sobrescrevem: não é LWW na célula, é
**LWW na LINHA**, e a célula do outro volta ao valor antigo sem aviso. **Isso é
corrigível hoje, sem realtime nenhum**, e é o item de maior valor por esforço da
milestone inteira.

## 6. F4 — o problema não é técnico, é de superfície

**O único consumidor de `/data` no repo é o Studio de publicação** — um lugar
onde ninguém fica parado olhando, e onde o gráfico vivo competiria com o SVG
congelado. "Gráfico salvo atualiza quando o dado muda" não tem hoje onde
acontecer.

**A descoberta view→tabela não precisa de backend novo**: um `Map<table_id,
view_id[]>` montado de um `GET /api/views/me`. Mas **atravessa workspaces** — a
view do tenant B pode depender de tabela pública do tenant A, e um canal por
tenant nunca entrega esse evento.

**E a otimização óbvia está morta:** "só re-executa se `changed_columns` tocar
`group_by`/`metric_column`" não funciona, porque o `commitEdit` manda a linha
inteira e o audit/webhook registram **todas** as colunas como mudadas. Toda
edição dispararia toda view.

## 7. Decisões — revisadas

| # | Decisão | Estado |
|---|---|---|
| **1** | Transporte | **Bloqueia tudo.** 3 opções, e o "terceiro caminho" está **reprovado por segurança** como escrito (bypassa moderador). Nativo exige GRANT, que degrada defesa em profundidade. Broadcast exige mecanismo pós-commit que **não existe**. |
| **1b** | **NOVA — pós-commit** | O spike "BackgroundTasks ordem-vs-commit", adiado no M9, **vira bloqueante**: sem ele o broadcast publica antes do commit. |
| **1c** | **NOVA — `ORDER BY`** | A F3 exige ordem estável. Ninguém decidiu isso. |
| **2** | Conflito na co-edição | Mais urgente do que parecia: o PUT manda a linha inteira. **Dá pra tratar hoje, sem realtime.** |
| **3** | Live charts no público | **Continua aberta** — o M8.5 delegou, não decidiu. |
| **4** | Cotas do free tier | Medição do spike. |
| **5** | Enhancement vs dependência dura | Sua. |
| **6** | Escopo do optimistic UI | Sua. A paginação empurra pra "só célula". |

## 8. O que a 1ª versão (solo) errou

Registrado porque o projeto trata "vender dedução como medição" como o pior erro:

1. **"O terceiro caminho preserva o nativo"** → funciona tecnicamente, mas
   **bypassa a autorização de moderador**. Reprovado por segurança.
2. **"Não quebra o backend, porque sem JWT o `current_setting` devolve NULL"** →
   **falso**. Devolve `''` depois do primeiro uso, e quebra. Levou ao B10.
3. **"O audit basta pra alimentar o broadcast / segundo consumidor"** → falso.
   O M9 F3, que é o precedente real, **não consumiu o audit**.
4. **"A outbox do M9 é reusável"** → o drain é cron de 5 min, e o contrato
   at-least-once fora de ordem é o oposto do que uma UI co-editada aguenta.
5. **"O M8.5 decidiu que a F4 é só admin"** → o M8.5 **delegou** a decisão.
6. **"Sem `app.tenant_id` a role vê 0 linhas"** → só em conexão virgem; e o ramo
   `app.is_master` deixa qualquer sessão ver tudo.

---

## O problema

O Atlas é multi-admin/moderator por workspace, mas a camada de dados é cega pra concorrência: o DataViewer carrega a tabela no mount e só refaz fetch das próprias ações (data/[table]/page.tsx:77-80), e o commitEdit manda PUT do registro INTEIRO (178-197) — duas pessoas na mesma linha se atropelam em silêncio, last-write-wins sem ninguém saber da outra. Não há sinal de presença: a única "subscription" do frontend inteiro é o onAuthStateChange pra rotação de token; grep por `.channel()`/`postgres_changes`/`broadcast` no repo retorna **zero**.

O M8.5 entrega gráficos deliberadamente estáticos (decisão 2026-06-12: "primeiro estático, realtime por cima depois") e a camada viva ficou prometida aqui. O substrato apontado (Supabase Realtime) nunca foi tocado, e nosso isolamento — schema-per-tenant com FORCE RLS e policy lendo GUC que **o backend seta por request** (dynamic_schema.py:103-146, tenant_context.py:47-65) — não foi desenhado pro modelo de autorização do Realtime, que não passa pelo nosso backend. Território com armadilhas, não problema resolvido.

## O que entrega

Dois admins no mesmo workspace se enxergam: presence mostra quem está online e em qual tabela; mudanças de um aparecem pro outro sem refresh; edições próprias aplicam na hora (optimistic UI com rollback honesto); e **os gráficos salvos do M8.5** ganham a camada viva — atualizam sozinhos quando o dado muda. Tudo como enhancement progressivo: sem Supabase (dev/pytest) ou com Realtime fora do ar, o Atlas funciona exatamente como hoje.

## Fases

| Fase | Entrega |
|---|---|
| **F1 — Spike: Realtime × schema-per-tenant + RLS** | Provar no Supabase real se postgres_changes funciona com tabelas dinâmicas em schemas tenant_N sob FORCE RLS com policy por GUC — ou se o caminho é broadcast emitido pelo nosso backend. Medir latência, pós-pause/reconexão, tabela criada em runtime. **Inclui autorização e naming de canais por tenant — presence incluso.** Critério de morte: se o nativo não conversa com nossa RLS, plano B sem teimosia (jurisprudência do spike M7). |
| **F2 — Presence** | Quem está online e vendo/editando qual tabela, no DataViewer e na lista. Primeiro valor visível e o mais barato: canais de presence não tocam o banco, então **não dependem da parte postgres_changes do spike — mas a autorização/escopo de canal sai da F1**. Visual editorial Mora, não badge genérico de SaaS. |
| **F3 — Dados vivos + optimistic UI** | DataViewer reage a mudanças alheias sem refresh; edições próprias otimistas com rollback. Nível de proteção de conflito conforme o rebate (aviso de presença na linha, lock suave, ou LWW informado). Degradação desenhada: sem canal, comportamento idêntico ao atual. |
| **F4 — Live charts** | A camada realtime sobre **os gráficos salvos do M8.5**, no escopo da decisão aberta (tendência: só admin; público continua snapshot). Gráfico atualiza quando o dado muda, sem rebuild manual. |

## Dependências

- **M3 (fechado)** — a fundação que o Realtime precisa atravessar.
- **M8.5 — com condição explícita:** a F4 só existe se o M8.5 entregar **gráfico persistido consultável no admin** (decisão aberta 4 de lá; recomendação do painel: persistir). Sem isso, não há substrato pra animar. A decisão sobre gráfico público também é de lá; o M10 consome o resultado.
- **M-Ops** — keep-alive/upgrade: o pause do free tier congela o projeto inteiro (Realtime incluso — comportamento documentado da plataforma, confirmar no spike). Paginação toca (invalidação sobre rota que faz fetchall escala mal) mas não bloqueia.

## Riscos

- **postgres_changes × nossa RLS:** a autorização do Realtime não passa pelo nosso backend, e a policy depende de GUC setado por request — o worker do Realtime não seta GUC. Pode reprovar o caminho nativo inteiro; por isso F1 é spike com critério de morte.
- Tabelas dinâmicas criadas em runtime podem exigir inclusão por-tabela na publication do Realtime — DDL extra acoplado ao create_table, mais um lugar onde nome de tabela entra em SQL (smell inventariado no M-Ops).
- Cotas de conexões/mensagens do free tier nunca medidas pro nosso uso.
- Dev/pytest rodam 100% sem Supabase (token fake, storage in-memory) — risco de testes de fachada se a degradação não for desenhada desde a F1.
- Reconexão pós-pause/redeploy: optimistic UI depois de desconexão longa é onde a UI mente — reconciliação honesta obrigatória.
- Escopo de canal: nome/payload mal escopado vaza presença e dados entre tenants — o equivalente da RLS na camada de canais é entrega da F1.

## Decisões abertas

1. **Transporte: postgres_changes direto do banco ou broadcast emitido pelo nosso backend após cada escrita? E o critério de morte do spike?** Nativo = o caminho "de fábrica", mas a autorização dele não conhece nossa RLS por GUC nem schemas tenant_N. Broadcast = autorização sob nosso controle e funciona pra qualquer escrita via API, mas perde mudanças feitas fora dela — **e, se vencer, nasce como segundo consumidor da trilha de eventos do M9 F1, nunca como instrumentação nova dos handlers.** O Diretor define o que é aceitável perder em cada caminho.
2. **Proteção de conflito na co-edição:** LWW + aviso de presença (barato, resolve 80% do susto), lock suave por linha (evita atropelo, cria "linha travada por quem saiu pro café"), ou merge por célula (muda o contrato do PUT, que hoje manda o registro inteiro)? CRDT está fora em qualquer cenário.
3. **Live charts: só dashboards internos do admin, ou também o público?** O princípio "snapshot, não live" rege o público e a decisão pertence ao rebate do M8.5 — aqui só confirmar a fronteira pra não decidir duas vezes. Se o público ficar snapshot, a F4 é só admin e fica bem menor.
4. **Free tier:** confirmar que a decisão keep-alive/upgrade do M-Ops **cobre as cotas de Realtime** (conexões/mensagens — já na mesa da decisão 2 de lá), ou registrar o que ficou diferido. Não é redecisão de orçamento.
5. **Realtime é enhancement progressivo ou dependência dura?** Enhancement = app idêntico sem canal, custo de manter dois caminhos pra sempre; dependência = Supabase local no fluxo de dev/teste. Tendência: enhancement, coerente com "funciona offline depois de carregar" do M7 — mas define a barra de teste, então é do Diretor.
6. **Optimistic UI: só edição de célula, ou create/delete também?** Célula é a maior fricção hoje; create/delete otimistas são mais arriscados (IDs provisórios, rollback visível). Publicação (Storage + ativação) provavelmente fora — dizer explicitamente.

## Fatos-âncora

- Zero realtime no código: nenhum `.channel()`/postgres_changes/broadcast em frontend/src nem backend; @supabase/supabase-js usado SÓ pra auth — o singleton getSupabase() (supabaseClient.ts:25-31) é o ponto de entrada natural pra channels.
- Única subscription: onAuthStateChange pra rotação de token (AuthContext.tsx:96-105). websockets no requirements é transitiva do uvicorn.
- DataViewer: fetch inteiro no mount (77-80), PUT do registro inteiro no commitEdit (178-197), create/delete só refazem fetch próprio (data/[table]/page.tsx).
- Isolamento: schemas tenant_N com ENABLE+FORCE RLS e policy por current_setting('app.tenant_id') (dynamic_schema.py:103-146); GUC setado POR REQUEST (tenant_context.py:47-65) — o Realtime não passa por esse caminho.
- Dev/pytest sem Supabase: token fake (auth.py:124-129), storage in-memory (publication_storage.py:61-62) — Realtime impossível nesses ambientes.
- Público é snapshot congelado: RSC com revalidate:30 ([workspace]/page.tsx:30-39) e renderToStaticMarkup no export — nada live pode vazar pra esse pipeline.
- Compromisso do roadmap: WebSocket via Supabase Realtime, presence, optimistic UI, live charts (roadmap.md:96-99).

## Não-objetivos

- Co-edição rica estilo Google Docs / CRDT — fora em qualquer cenário.
- Dado vivo no site público — princípio do M6 segue; o que o M8.5 decidir sobre gráfico público é fronteira de lá.
- Notificações persistidas (e-mail/push) e triggers externos — webhooks do M9.
- Trilha de quem mudou o quê — eventos do M10 são efêmeros (sinal de UI); **registro persistente é a trilha de auditoria do M9**. M10 não cria infra de eventos persistidos que o M9 herde por acidente.
- Realtime no Schema Visualizer / DDL — schema muda raramente, refetch resolve.
- Offline-first / fila de escrita offline — optimistic UI cobre latência, não desconexão prolongada.
