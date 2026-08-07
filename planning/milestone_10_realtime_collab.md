# M10 — Real-time + Collaborative Editing

> **Status:** 🟡 DETALHADO fase-a-fase em 2026-08-07 (solo, medido contra o código de hoje — **não** foi ultracode). O draft original é de 12/06, de antes do M8. Decisões abertas revisadas abaixo; **nada codado.**
> Smells compartilhados do backend: inventariados no [plano do M-Ops](milestone_ops_observabilidade.md) (fonte única).

---

# Detalhamento fase-a-fase (2026-08-07)

## O que envelheceu no draft de junho — 3 correções antes de decidir qualquer coisa

**1. A premissa central da decisão 1 estava incompleta, e isso abre um terceiro caminho.**
O draft afirma que o caminho nativo (`postgres_changes`) é inviável porque "a autorização do Realtime não passa pelo nosso backend e a policy depende de GUC setado por request". A primeira metade é verdade. A segunda esconde um fato que já existe no repo:

- a policy é `tenant_id = current_setting('app.tenant_id', true)::int OR current_setting('app.is_master', true) = 'true'` (`dynamic_schema.py:171-176`);
- **o JWT do Supabase já carrega `tenant_id`** — o M4 provisiona `app_metadata = {role, tenant_id}` (`supabase_admin.py:84-93`), e o próprio docstring do módulo diz "acessível em `auth.jwt() -> 'app_metadata'`".

Ou seja: existe um **terceiro caminho** que o draft não nomeia — **estender a policy** com um segundo `OR` lendo o claim do JWT. Portável, sem depender do schema `auth` do Supabase (que não existe no PG local), usando a forma crua que o `auth.jwt()` embrulha:

```sql
OR tenant_id = (current_setting('request.jwt.claims', true)::json
                -> 'app_metadata' ->> 'tenant_id')::int
```

O backend continua funcionando igual: sem JWT na sessão, `current_setting` devolve NULL, o ramo não casa, e o ramo do GUC decide como sempre. **Isso transforma a decisão 1 de binária em ternária** — e o terceiro caminho preserva o nativo sem abrir mão do isolamento.

**2. "O DataViewer carrega a tabela no mount" não é mais verdade.**
O M-Ops F3 paginou: `load(offset, search)` manda `limit/offset` (`data/[table]/page.tsx:69-77`). Muda a F3 de verdade — invalidação sobre lista **paginada** é outro problema: uma linha alheia que muda pode estar fora da página atual, e "aplicar o evento na lista" vira "decidir se este evento pertence a esta janela". As âncoras `:77-80` e `:178-197` do draft estão desatualizadas (hoje `:69-77` e `:212-231`).

**3. As duas dependências do draft já foram satisfeitas.**
A F4 exigia "gráfico persistido consultável no admin" — o M8.5 F1 entregou (`_views` + `/api/views/me/*`). E a fronteira do público foi decidida: **congela com o snapshot**. Então a F4 é **só admin**, e menor do que o draft supunha.

## O que o M9 mudou a favor — e o draft não sabia

O draft diz que, se o broadcast vencer, ele nasce "como segundo consumidor da trilha de eventos do M9 F1". Isso era promessa em junho. **Hoje existe e está medido:**

- `audit.record()` já roda **dentro da transação** de toda mutação de linha, com ator polimórfico (`user` ou `key`);
- a F3 do M9 já provou o padrão de **outbox atômica** — entrega gravada na mesma transação, drenada fora dela, com claim em duas fases pra não segurar conexão do pool.

Consequência prática: **o caminho do broadcast ficou muito mais barato do que era em junho.** Não é instrumentar handler nenhum — é um segundo consumidor de algo que já é gravado. O que falta é o transporte (publicar no canal) e a decisão de onde ele roda.

## F1 — Spike: qual transporte

**Pergunta que o spike responde**, agora que o terceiro caminho existe: o `postgres_changes` funciona com a policy estendida pelo claim do JWT, em tabela de schema `tenant_N` criada em runtime?

**O que já está medido e NÃO precisa de spike** (evita gastar Supabase pra descobrir o sabido):
- sem `app.tenant_id`, role sem bypass vê **0 linhas** — asserido em `test_rls_raw_bypass.py:97`. É exatamente a situação do worker do Realtime hoje: ele não seta nosso GUC. **O nativo, do jeito que a policy está, entrega nada** (ou, se a role dele bypassar RLS, entrega **tudo pra todos** — que é vazamento cross-tenant, não bug de UX). Esse é o critério de morte, e ele já está provado sem Supabase.
- o JWT carrega `tenant_id` (`supabase_admin.py:84-93`).
- `@supabase/supabase-js ^2.105.4` no front, com `getSupabase()` singleton pronto pra `.channel()`.

**O que só o Supabase real responde** (o spike de verdade, e é curto):
1. a policy estendida é aceita e o Realtime a respeita usando `request.jwt.claims`?
2. tabela criada em **runtime** entra na publication `supabase_realtime` sozinha, ou exige `ALTER PUBLICATION ... ADD TABLE` acoplado ao `create_table`? (se exigir, é mais um lugar onde nome de tabela entra em SQL — smell já inventariado);
3. schema `tenant_N` (não-`public`) é alcançável pelo Realtime;
4. cotas do free tier e comportamento pós-pause.

**Critério de morte, afiado:** se (1) falhar, o nativo morre e o broadcast vence — e vence **barato**, porque o M9 já grava o evento. Se (2) exigir DDL por tabela, o nativo passa a custar acoplamento no `create_table`, e aí o broadcast provavelmente vence mesmo passando em (1).

## F2 — Presence

Não toca o banco e **não depende do resultado de (1)** — mas depende do **naming e da autorização de canal**, que saem da F1 em qualquer caminho.

O ponto de atenção real: o canal precisa ser escopado por tenant (`ws:tenant:{id}:table:{nome}`) e a autorização não pode confiar em nome escolhido pelo cliente. Com Supabase Realtime Authorization, isso é policy em `realtime.messages`; com broadcast nosso, é o backend que decide quem entra. **É o equivalente da RLS na camada de canais** — e é onde presence vaza entre tenants se for feito por convenção em vez de por trava.

## F3 — Dados vivos + optimistic UI

**Reescrita pela paginação.** O evento que chega precisa ser classificado antes de virar UI:
- linha **na janela atual** → aplica;
- linha **fora da janela** → só mexe no `total` (senão a contagem mente);
- linha que **entra/sai** da janela por causa de `search`/ordenação → o caso chato, e o honesto é recarregar a página em vez de fingir que sabe.

**O `commitEdit` manda o registro INTEIRO** (`:221`, `payload = {...record, [col]: v}`) — confirmado, o draft acertou aqui. Isso é o que torna a decisão 2 (proteção de conflito) real: dois editores em células **diferentes** da mesma linha se sobrescrevem, porque cada PUT reenvia a linha toda a partir do snapshot local de quem editou. Não é "última escrita ganha na célula": é **última escrita ganha na LINHA**, e a célula do outro volta ao valor antigo sem aviso.

Isso é medível hoje, sem realtime, e vale um teste antes da fase.

## F4 — Live charts (só admin)

Menor do que o draft supunha, porque a fronteira do público já foi decidida (snapshot). O substrato existe: `_views` + `/api/views/me/{id}/data` já roda a agregação server-side.

A forma barata: quando chega evento de mudança numa tabela que é **fonte de uma view salva**, o front re-executa `/data` daquela view. Não precisa de agregação incremental — o motor já é rápido e o `statement_timeout` já está no lugar. A ligação view→tabela é campo indexado (`_views.table_id`), então achar "quais views dependem desta tabela" é consulta trivial.

## Ordem que eu proponho, e por quê

**F1 → F2 → F3 → F4**, mas com a F1 encurtada: metade do spike original já está respondida por teste que existe. O que sobra é uma sessão contra o Supabase real, não uma fase.

Se a decisão 1 cair pro **broadcast**, a F1 encolhe ainda mais e vira "escolher onde o publish acontece" — porque o evento já é gravado pelo M9.

## As 6 decisões, revisadas

| # | Decisão | O que mudou desde junho |
|---|---|---|
| **1** | Transporte | **Agora são 3 opções, não 2.** O terceiro caminho (policy + claim do JWT) preserva o nativo. E o broadcast ficou barato porque o M9 já grava o evento. **É a única que trava a primeira linha de código.** |
| **2** | Conflito na co-edição | Fica mais urgente do que parecia: o PUT manda a **linha inteira**, então o atropelo apaga célula que o outro acabou de escrever. |
| **3** | Live charts no público | **Já respondida** pelo M8.5: público é snapshot. F4 é só admin. |
| **4** | Cotas do free tier | Continua aberta, mas é medição do spike, não decisão de projeto. |
| **5** | Enhancement vs dependência dura | Continua sua. Tendência do draft (enhancement) segue coerente: dev e pytest rodam 100% sem Supabase. |
| **6** | Escopo do optimistic UI | Continua sua. A paginação empurra pra "só célula" — create/delete otimistas em lista paginada mexem em `total` e ordenação. |

**Só a 1 bloqueia.** As outras cinco podem ser batidas fase-a-fase, como foi no M9.

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
