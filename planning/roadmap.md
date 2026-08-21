# 🗺️ Roadmap Atlas — Visão de Longo Prazo

> **Última atualização:** 2026-07-10
> **Mantido por:** Diretor + Claude (Programador)
> **Convenção:** ✅ done · 🔵 in progress · 📋 planejado · 🧊 congelado · 💭 ideia

Este documento é o mapa estratégico de tudo que está construído, em construção, ou planejado para o Atlas. Para cada milestone existe (ou existirá) um plano técnico detalhado em `planning/milestone_N_*.md`.

---

## Onde estamos hoje

| Milestone | Status | Resumo |
|---|---|---|
| **M1** Estabilização + CRUD básico | ✅ done | CRUD dinâmico testado, conftest refatorado, patch notes 1.0.x |
| **M2** Foreign Keys + SQL Import + Admin UI | ✅ done | FKs funcionais, dry-run de SQL, CRUD completo, 38 testes verdes |
| **M5** Atlas Redesign / Mora Editorial | ✅ done | Tokens + 15 telas + Tweaks Panel + polish editorial |
| **M3** RLS / Supabase-Native | ✅ done | Em prod: atlas-mora.vercel.app + Railway + Supabase. RLS schema-per-tenant end-to-end. |
| **M4** Auth Unification | ✅ done | Em prod (2026-05-17). Supabase Auth ES256, JWKS validator no backend, `@supabase/supabase-js` no frontend. |
| **M6** Publish & Export | ✅ done | Fechado 2026-06-11 (PR #28). Publicação versionada + Theme Studio + curadoria + histórico/rollback + export ZIP standalone. Pacotes extras → [backlog_export_pacotes.md](./backlog_export_pacotes.md). |
| **M6.5** Public Dashboard Editorial | ✅ done | Home editorial do admin (capa do workspace). |
| **M7** Schema Visualizer | ✅ done | `/admin/schema` ER read-only + export PNG/DDL. Gate Playwright verde 2026-06-15. |
| **M-Ops** Observabilidade | ✅ done (código) | Sentry + CI + paginação + `security.md`. Falta só ação de plataforma do Diretor. |
| **M8** Media Library + Uploads | ✅ done | Fechado 2026-07-10 (PR #40) → **versão 0.7.0**. Colunas de mídia + `_assets` + público/ZIP + import cria-tabela + hardening. Gate verde 2026-07-09. |
| **M8.5** Views, Gráficos & Impressos | ✅ done | Fechado 2026-08-04 (PR #58) → **versão 0.8.0**. Agregação server-side + gráfico congelado no publish + impressos `@media print` + proveniência citável. |
| **M9** Webhooks + API Keys + Audit Log | ✅ done | Fechado 2026-08-07 → **versão 0.9.0**. Trilha de auditoria, API keys com escopo (só-leitura), webhooks com outbox durável, fronteira do nome de tabela. |
| **Correções 12–14/08** | ✅ done | `0.9.1` a `0.9.6`: 14 bugs (todos com A/B), CI em dois engines + migrations em banco virgem, gate de `tsc`, fontes self-hosted, co-edição consertada, proveniência no público. |
| **🏁 1.0.0** | ✅ **2026-08-14** | Fecha o arco M1–M9. Ver [patch_notes](./patch_notes.md). |

---

## Versionamento do produto (Diretor, 2026-07-05)

Régua oficial `MAJOR.MINOR.PATCH` — detalhe operacional pros PRs no [CLAUDE.md](../CLAUDE.md#versionamento-regra-pros-prs--diretor-2026-07-05):

- **Feature shipada = +0.1** (milestone fechada ou feature standalone) · **bugfix = +0.01** (3º número; depois do `.9` segue `.10`, `.11`…) · **2.0** só pra feature que mude completamente o jeito de trabalhar.
- **Âncoras do arco:** `0.6.0` → M8 = `0.7.0` → M8.5 = `0.8.0` → M9 = `0.9.0` → **`1.0.0` fecha o arco M1–M9** → `1.0.1` → `1.0.2` → QoL de import = `1.1` → **FK no import = `1.2`** → M10 = `1.3` → M11 = `1.4` → M12 = `1.5`.

> ### 🔁 Âncora revista pelo Diretor em 2026-08-20
>
> O teste de usuário da 1.0 (import da base `paidosett`) rendeu uma leva de
> QoL barata e de valor imediato: **UI de relação pra tabelas existentes**
> (o `POST /api/relations` existe desde o M2 — falta só a tela) e **apagar
> todas as tabelas** (loop sequencial no `DELETE /tables/{id}` com confirmação
> forte). Pela régua são feature, então: **QoL de import sai antes do fim do
> M10 como `1.1`**, e o M10 passa a `1.2` (M11 `1.3`, M12 `1.4`).
> Fora da QoL, de propósito: **FK no import SQL** — mexe na fronteira
> anti-exfiltração do B13 e fica pro pacote grande de relações, junto da
> inferência automática pós-import.
> A troca da role do banco, que a nota de 14/08 chamava de `1.0.1`, continua
> reservada e vira o **próximo patch** (a `1.0.1` saiu antes, com as correções
> de UI do import).

- **Compromisso da 1.0:** lista de patch notes visível no site (ver backlog).
- Numeração antiga do [patch_notes](./patch_notes.md) (1.0.0–1.3.0+, era M1–M5) é legado de changelog interno — não renumerar.

> ### 🔁 Âncora revista pelo Diretor em 2026-08-14
>
> A regra anterior dizia **"M10 fecha a `1.0.0`"** e o CLAUDE.md a chamava de
> âncora dura. **Ela foi trocada**, e o motivo está registrado aqui porque
> mudar âncora dura sem registro é como âncora nenhuma:
>
> **O que a 1.0 é**: o arco M1–M9 fechado, mais a semana de correções de
> 12–14/08 (14 bugs, todos com A/B provado — falharam **antes** do fix, não só
> passaram depois), CI rodando dois engines de banco, migrations verificadas em
> banco virgem, fontes servidas do repositório e co-edição consertada.
>
> **Por que não esperar o M10**: ele é spike + três features (transporte,
> presence, dados vivos). A reauditoria de 14/08 mostrou que a decisão de
> transporte depende de medição contra o Supabase real que ainda não existe.
> Amarrar a 1.0 a isso adia o lançamento por semanas e não torna o que já está
> pronto melhor. Uma 1.0 com realtime meia-boca é pior que uma 1.0 sem realtime.
>
> **O que ficou de fora e está registrado**: o M10 vira `1.1`; a troca da role
> de banco (ver abaixo) vira `1.0.1`. Nenhum dos dois é surpresa — os dois têm
> plano escrito.

---

## Próximos 6 meses

**Princípio do Diretor (2026-05-04):** *base sólida antes de features visíveis*. M3 destrava deploy real + M8/M10 — vai primeiro.

**Reordenação (2026-05-15):** Diretor pediu pra empilhar M4 logo depois de M3, antes de M6/M7. Justificativa: deixar toda a infra (RLS + Auth unificado) madura antes de feature visível, pra M6 (publish) e M7 (visualizer) nascerem já em Supabase Auth — sem migration debt depois.

### 🟢 Faixa 1 — Ordem definida

#### 1️⃣ **M3** — RLS / Supabase-Native — **EM FECHAMENTO**
- **Por quê:** sair do SQLite com prefixo `t{id}_` pra Postgres com schema-per-tenant + RLS. Pré-requisito pra deploy real.
- **Estado:** Fases 0-4 mergeadas (PRs #7-#11). Fase 5 removida. Fase 6 dispensada (sem dados reais). Fase 7 (pytest RLS) em PR aberto. Falta Fase 8 (deploy).
- **Plano:** [milestone_3_rls_migration.md](./milestone_3_rls_migration.md)

#### 2️⃣ **M4** — Auth Unification (Supabase Auth)
- **Por quê:** trocar JWT custom HS256 pelo Supabase Auth — OAuth, magic links, password reset sem manter código. RLS pode usar `auth.uid()` nativo, frontend pode falar direto com Supabase quando fizer sentido.
- **Bloqueio antes de codar:** 3 questões em aberto no plano (convite de moderador, hierarquia de role via custom claims, seeding do master no CI/CD). Gemini precisa replanejar antes.
- **Plano:** [backlog_m4_auth_unification.md](./backlog_m4_auth_unification.md)
- **Risco:** médio-alto.

#### 3️⃣ **M6** — Publish & Export — ✅ FECHADO 2026-06-11
- Snapshot versionado + Theme Studio + curadoria + histórico/rollback (PR #27) + export estático (PR #28).
- **Planos:** [milestone_6_publish_export.md](./milestone_6_publish_export.md) · [milestone_6_fase5_export_plano.md](./milestone_6_fase5_export_plano.md)
- Pacotes multi-formato do handoff → [backlog_export_pacotes.md](./backlog_export_pacotes.md).

#### 4️⃣ **M6.5** — Public Dashboard Editorial (admin home redesign)
- **Por quê:** o admin entra no workspace e cai numa home "magazine cover-style mural" (Claude Design handoff 2026-05-18) — capa editorial do estado do workspace antes de mergulhar nas tabelas. Depende de M6 fechar (porque a home expõe métricas de publicação).
- **Insumo:** `screens-4.jsx` no handoff `Atlas-handoff.zip` (não rastreado).
- **Escopo provável:** 1 PR — só visual, sem novo backend.
- **Risco:** baixo.
- **Plano:** ainda não escrito; criar `milestone_6_5_public_dashboard.md` quando vier o momento.

#### 5️⃣ **M7** — Schema Visualizer (painelzão ER) — ✅ GATE VERDE 2026-06-15
- **Por quê:** feature autocontida, vem depois da base.
- **Escopo real:** 4 PRs (spike #32 + render #33 + relations #34 + interação #35 + export/polish, tudo mergeado em `main` — `0dc7f7b`) — não as "5 fases ~1-2 semanas" da estimativa original.
- **Estado:** `/admin/schema` read-only com render ER, interação e export PNG + SQL DDL (PG/SQLite). **Gate Playwright (`validate-schema.mjs`) verde em 2026-06-15** — 24 checks (login, matriz 2×4, seleção/painel/fantasma, busca, drag persistido, export PNG + SQL nos 2 dialetos, semantic zoom, pan 230fps@100 nós, estado vazio, zero erros de console). Rodou com SQLite/test-auth local (o gate usa route-mocks + login testadmin — não depende de Supabase). Export PNG inspecionado: arestas visíveis (sem a regressão html2canvas). 2 fixes de test-infra no próprio gate (assertion do semantic zoom ancorava no wrapper errado; `GATE_BASE` por env pra porta alternativa).
- **Planos:** [milestone_7_schema_visualizer.md](./milestone_7_schema_visualizer.md) · [milestone_7_visualizer_plano.md](./milestone_7_visualizer_plano.md)
- **Risco:** baixo.

#### 6️⃣ **M7.5** — Componentização & Polish Fino (Shell/Schema/Import) — 🧊 CONGELADO 2026-06-13
- **Reavaliado (ultracode 2026-06-13):** a premissa original ("M5 fez o macro; M7.5 fecha as telas que ficaram com o look antigo") estava **factualmente errada** — auditando `screens-1/2/3.jsx` contra o código, as 3 telas (`layout.tsx`, `tables/create`, `import/sql`+`import/data`) **já estão em Mora pleno**. Não há look antigo.
- **O que sobrou de real:** 1 PR frontend-puro — extrair primitivos pendentes (`Toggle`, `ScreenHeader`, caixa-métrica) + cosmética fina de shell (avatar, badge de role, copy `v.1`→`v.4`). Meia tarde a 1 dia, baixo risco.
- **Decisões de produto resolvidas (defaults conservadores):** topbar = fantasma (não construir); workspace switcher = descartado (sem backend); FK-as-type = rejeitado (regressão); SQL split-pane = rejeitado (mantém wizard).
- **Movido pro M8:** import de planilha com mapeamento + criar-tabela-da-planilha (pede endpoint novo — vira rider do M8).
- **Por que congelado:** não vale status de milestone; descongela como PR de baixo risco (candidato a paralelo) quando houver janela.
- **Plano:** [milestone_7_5_componentizacao.md](./milestone_7_5_componentizacao.md).

### 🟡 Faixa 2 — Médio prazo (depois de Faixa 1)

> **Ordem do arco confirmada (Diretor, 2026-06-13):** M-Ops → **M8 → M8.5 → M9 → M10 → M11** (M8.5 e M9 são pontes: M10 precisa do 8.5, M11 do 9). Supabase no free tier + keep-alive por ora (upgrade quando houver orçamento); rotação de segredos pós-M10.

#### **M-Ops** — Observabilidade + Confiabilidade (proposta Claude, aceita na conversa 2026-06-12)
- **Por quê:** prod caiu em 2026-06-11 (Supabase free tier auto-pause) e ninguém soube até esbarrar. Não há error tracking, alerta de downtime, CI, nem paginação na rota dinâmica (`GET /api/{table_name}` baixa a tabela inteira).
- **Escopo:** Sentry (ou similar) + uptime alert, keep-alive ou upgrade do Supabase, paginação da rota dinâmica, CI rodando pytest+build em PR, rotação de segredos (Postgres, TestSprite key), fix ownership de `/api/relations` (achado do painel M7).
- **Posição:** antes ou junto do M8 — uploads multiplicam a superfície de falha.

#### **M8** — Media Library + File Uploads — ✅ **FECHADO 2026-07-10 → versão 0.7.0**
- **Por quê:** colunas tipo `image`, `file`, `attachment` não existiam — admin que queria foto colocava URL externa. Milestone que transformou os sites públicos de "tabela bonita" em "site de verdade".
- **Decisões fechadas no rebate (Diretor):** (1) **mutação de schema no M8**; (2) **Supabase Storage**; (3) **URLs públicas + mídia embutida no ZIP**; (4) **Media Library central** (`_assets` + refcount); (5) tipos **image/file/attachment**; (6) **rider de import de planilha**. Nas fases: copy-at-publish (F3), is_public mantido público+opaco, quota 250MB block-at-limit (F5).
- **F0 ✅** (2026-06-15, `8f182d9`): add/drop coluna + delete tabela + read-before-delete nos hooks. **F1 ✅** (PR #36 `f3fce34`): whitelist `data_type` + `_assets` + bucket + endpoints `/api/assets/*` + refcount. **F2 ✅** (PR #37): editor de schema no front + MediaField (upload + picker) no DataViewer. **F3 ✅** (PR #38 `dfcc92e`): mídia nos 3 contextos do público + copy-at-publish + ZIP embutindo mídia + preview do Studio real (PR4b do M6 quitado). **F4 ✅** (PR #39 `44d3793`): import CSV/XLSX que CRIA tabela (dry-run → preview editável → commit). **F5 ✅** (PR #40): sniffing de conteúdo (415) + quota 250MB (413) + GC de cópias órfãs + caps do ZIP pinados + **gate Playwright `validate-media.mjs` verde 2026-07-09**.
- **Pendências herdadas (dono: backlog/M8.5+):** RLS de `storage.objects` (bucket público+opaco por decisão), thumbnails/otimização de imagem, pub-copies fora da conta de quota.
- **Plano:** [milestone_8_media_library.md](./milestone_8_media_library.md).

#### **M8.5** — Views, Gráficos & Impressos — ✅ **FECHADO 2026-08-04 → versão 0.8.0**
- **Por quê:** pedido do Diretor — usuários (inclusive públicos) montarem gráficos comparando filtro A vs filtro B sobre os dados. Não existia nem agregação server-side. `recharts`/`jspdf`/`html2canvas` já estavam nas deps do frontend (dead code).
- **Fases:** (1) agregações server-side + views salvas (absorve o item "Saved views/queries" do backlog); (2) chart builder (filtro A vs B, embed no site público); (3) **exports impressos** — panfleto editorial (gráficos, números grandes, cores Mora) + versão acadêmica (sóbria, fontes citadas), consumindo os gráficos das fases anteriores.
- **F1 ✅** (PR #42): `aggregation.py` + `_views` + `/api/views/me/*` + 23 testes. **F2 ✅** (PRs #46 F2.1, #47 F2.2a, #48 F2.2b, #50 gate, #52 fix de tema): `chart_svg.py` (SVG puro no publish), `ChartsTab` no Studio, `<ChartSection>` no público com tabela-alternativa a11y, embed no ZIP, **gate `validate-charts.mjs` verde 2026-07-21**. **F3 ✅** (PRs #54 proveniência, #55 acadêmico, #57 panfleto + este PR de fechamento): `source` do backend à UI do admin, dois impressos via `@media print`, links no rodapé público, **gate `validate-print.mjs` verde 2026-08-04**.
- **Decisão aberta que foi fechada:** gráfico no público **congela com o snapshot** (2026-07-12) — mantém o "snapshot, não live" do M6; dado vivo fica no M10.
- **Dependências:** M8 não bloqueava tecnicamente, mas a UX conjunta (mídia + gráficos) justificou a ordem. **Destrava o M10** (live charts são camada sobre a view salva persistida).
- **Plano:** [milestone_8_5_views_graficos_impressos.md](./milestone_8_5_views_graficos_impressos.md).

#### **M9** — Webhooks + API Keys + Audit Log
- **Por quê:** integração com sistemas externos (Zapier, n8n, scripts). Audit log pra compliance/debugging ("quem mudou o quê quando").
- **Escopo:** 
  - Tabela `_webhooks` com triggers (on_create/update/delete por tabela)
  - Tabela `_api_keys` com scopes (read/write por tabela)
  - Tabela `_audit_log` com tudo gravado
- **Dependências:** M3 (RLS facilita audit).

### 🔵 Faixa 3 — Longo prazo (1+ ano)

#### **1.0.1** — A role do banco (achado em 2026-08-14, medido em produção)

> **Não é milestone, é conserto — e é o mais sério que o projeto tem em aberto.**
>
> Medido no Supabase de produção: a aplicação conecta como `postgres`, que tem
> `rolbypassrls = true` **e** é dona de todas as 15 tabelas de sistema. São duas
> rotas de bypass. **Toda a RLS que o M3 construiu está desligada em produção** —
> o que separa tenants hoje é o backend setar o GUC, que é código, não banco.
>
> O `FORCE ROW LEVEL SECURITY` não cobre isso: `FORCE` faz a policy valer para a
> *dona* da tabela; `BYPASSRLS` é atributo de role e ignora RLS de qualquer jeito.
>
> **Risco hoje: zero** — produção tem 0 schemas `tenant_N` e 1 linha em `users`.
> A janela fecha no dia em que o primeiro workspace criar uma tabela.
>
> **Tamanho medido** (suíte rodada contra role `NOSUPERUSER NOBYPASSRLS`): 422 de
> 430 testes passam. Quebram dois, de naturezas opostas — um teste obsoleto
> (premissa invalidada pelo fix do B10) e uma feature real (agregação sobre
> tabela pública de outro workspace, decisão #8 do M8.5), que tem conserto com
> precedente no próprio repo (`public_tenant_db` seta o GUC do dono, não do leitor).
>
> **Cuidado que o teste local escondeu:** lá o alembic rodou como a role nova, que
> virou dona e por isso passou. Em produção o dono é `postgres` — trocar só o
> `DATABASE_URL` derrubaria a aplicação no primeiro request. O runbook precisa de
> transferência de posse, e ela vem antes do corte.
>
> **Item irmão, menor e independente:** `anon` e `authenticated` têm DML total
> (inclusive `TRUNCATE`) nas 15 tabelas de sistema. Não é brecha ativa — RLS sem
> policy nega — mas é camada única, e o Atlas nunca usa o PostgREST. Um `REVOKE`
> de três linhas transforma uma camada em duas.

#### **M10** — Real-time + Collaborative Editing — 🏁 **versão 1.1**
- **Por quê:** múltiplos admins editando a mesma tabela ao mesmo tempo. Vê quem está vendo, evita conflict. **Inclui a camada realtime dos gráficos do M8.5** (gráficos vivos que atualizam sozinhos — decisão 2026-06-12: primeiro gráficos estáticos/snapshot, realtime por cima depois).
- **Escopo:** WebSocket subscription via Supabase Realtime, presence indicators, optimistic UI, live charts.
- **Dependências:** M3 obrigatório (Supabase Realtime) + M8.5 (pros gráficos vivos).

#### **M11** — Atlas MCP: "traga sua IA" (INVERTIDO com a IA embutida em 2026-06-12) — 🏁 **versão 1.2**
- **Por quê:** expor um servidor MCP pro usuário plugar a IA que preferir (Claude, etc.) e conversar com o próprio workspace ("quantos clientes não compram há 30 dias?"). Mais barato que IA embutida (a inteligência e o custo de LLM são do usuário; nós só expomos ferramentas sobre endpoints existentes) e **ensina o M12**: o uso real do MCP revela quais helpers valem embutir.
- **Escopo:** servidor MCP com tools (listar tabelas, consultar com filtros, inserir/editar com guards), autenticado via API keys do M9, ações registradas no audit log.
- **Dependências:** M9 obrigatório (API keys + audit).

#### **M12** — AI Helpers embutidos (LLM-powered) — 🏁 **versão 1.3**
- **Por quê:** pro usuário leigo sem cliente de IA: "Crie uma tabela de clientes com email único" → schema gerado; pergunta em português → query. Calibrado pelo uso observado do MCP (M11).
- **Escopo:** integração com Claude API, prompt engineering pra schema synthesis e NL→SQL, validation layer.
- **Dependências:** M11 (aprendizado de uso) + dataset com schemas reais.

#### 🧊 **Mobile Companion App** (congelado 2026-06-12 — era o M12)
- **Motivo:** QR auth sem uso real ainda; o slot de M12 foi pro arco de IA. Descongela se a demanda aparecer.

---

## Backlog de ideias (sem ordem)

Coisas que podem virar milestones se ganharem tração:

| Ideia | Justificativa |
|---|---|
| **Página de patch notes no site** | **Compromisso da 1.0** (régua de versionamento, Diretor 2026-07-05) — changelog público consumindo `patch_notes.md` |
| **Computed/Formula columns** | Coluna `total = preco * quantidade` calculada server-side |
| **Editor de schema de tabela existente** | `/admin/tables/[id]/edit` não existe (só `create`); achado do rebate M7.5 (2026-06-13) |
| ~~**Saved views / queries**~~ | Absorvido pelo M8.5 Fase 1 (2026-06-12) |
| **Bulk operations** | Editar/deletar 100 rows de uma vez via checkbox |
| **i18n da interface** | Inglês/espanhol além de PT-BR |
| **Marketplace de templates** | Galeria de schemas prontos (ecommerce, CRM, blog, etc.) |
| **Snapshot/Backup** | Botão "exportar tudo deste tenant" → ZIP com SQL + JSON |
| **Search global cross-table** | Busca única que olha todas as tabelas (precisa de Postgres FTS) |
| **Validation rules customizadas** | Regex/range/lookup constraints além das do SQL |
| **Soft-delete + recovery** | "Lixeira" com restore antes de purge definitivo |
| **Slack/Discord/Email integrations** | Notificações nativas em mudanças importantes |

---

## Princípios de priorização

Quando decidir o próximo milestone, em ordem:

1. **Bloqueio técnico** — o que está travando deploy real ou fluxo crítico? (Hoje: M3.)
2. **Pedido explícito do Diretor** — features que vieram da visão do produto. (Hoje: M6, M7.)
3. **Risco operacional** — backup, audit, security são divida que cresce. (M9.)
4. **Diferenciação competitiva** — o que outros CMS dinâmicos não fazem? (M11 IA.)
5. **Quality of life** — coisas que somam mas não bloqueiam. (Backlog.)

**Regra de ouro:** uma milestone por vez no foco principal. Pode haver paralelo (como M5 rodou paralelo a M3 docs), mas só se for área completamente diferente.

---

## Como este doc evolui

- **Após cada milestone fechar:** mover de "🔵 in progress" pra "✅ done", adicionar link pro patch_notes.
- **Quando uma ideia virar milestone:** mover do backlog pra Faixa 2/3, criar `milestone_N_*.md`.
- **Trimestral:** revisar prioridades com Diretor — pode reordenar tudo.
- **Não delete histórico** — milestones canceladas viram 🧊 com motivo, não somem.


## 🔁 Âncora revista pelo Diretor em 2026-08-21 (FK no import = `1.2`, M10 = `1.3`)

O Diretor pediu FK no import "de um jeito prático" e deu a régua junto: **"o mais
importante é o que fica no ar, no Postgres"**. Ela derrubou o argumento com que a
feature tinha sido recusada no dia anterior (*"em SQLite a constraint seria
decorativa"*) — raciocínio a partir do engine de desenvolvimento, que é
exatamente o erro que produziu BUG-PG01 e BUG-PG02.

Entregue como `1.2`: a FK vira **relação declarada**, sem constraint física e sem
tocar a fronteira do B13. M10 passa a `1.3`.

**Medir em Postgres cobrou o preço de não ter medido antes:** o import por SQL
estava **morto em produção** desde sempre (B18 — `VARCHAR(n)` → `TEXT(n)`, que o
PG recusa), escondido por um skip `SQLite-only`. Fica a regra: **caminho que roda
em produção não tem skip de engine** — se o teste não roda onde o código roda, o
verde não vale.

**Dívida ordenada, e a ordem importa:** o B17 (import nasce fora do
schema-per-tenant) tem que ser fechado **antes** do conserto da role de banco.
Consertar a role primeiro liga a RLS só para as tabelas de `tenant_N` e deixa as
importadas de fora — com a aparência de trabalho concluído.

**Fora de escopo, declarado:** FK física de verdade (oráculo de existência + DoS
por dependência entre tenants) — vai com a inferência automática de relações.
