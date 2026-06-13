# M10 — Real-time + Collaborative Editing

> **Status:** 🟡 DRAFT pra rebate (ultracode 2026-06-12) — NÃO executar. Decisões abertas pendentes do Diretor.
> Smells compartilhados do backend: inventariados no [plano do M-Ops](milestone_ops_observabilidade.md) (fonte única).

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
