# M7 — Schema Visualizer ("painelzão ER") — Plano de Execução

> **Status:** 🟢 APROVADO — rebate concluído 2026-06-12, as 7 decisões fechadas (ver seção 5). Execução autorizada após o M6.5.
> **Doc de visão:** [milestone_7_schema_visualizer.md](milestone_7_schema_visualizer.md) (plano enxuto original — este documento o detalha; duas decisões abertas dele se resolveram por fato do código, ver Divergências).
> Síntese do painel: base = Proposta 3 (vencedora em 2 de 3 vereditos: risco/perf-first, casos degenerados como primeira classe, dedup do espelho FK) + resgates da P1 (arquitetura engine-agnóstica, semantic zoom, gate visual vs /admin/tables) e da P2 (drag persistido como válvula de escape, budget numérico de mount, workaround de export).

## 1. O problema

Em databases pequenos (<5 tabelas) o admin mentaliza as conexões; em databases reais (10–50 tabelas com FKs) isso é impossível — hoje ele abre tabela por tabela e anota de cabeça quem aponta pra quem. Os dados JÁ EXISTEM (`_relations` e `_columns.fk_table/fk_column` desde M2); falta só a tela. Pedido literal do Diretor: "um jeito da pessoa poder ver como as tabelas se conectam… um painelzão seria bom".

Fato-âncora central (verificado em `backend/main.py:596` + `backend/schemas.py:80-110` + `backend/models.py:83-96`): **`GET /tables/` sozinho, em 1 chamada autenticada e já workspace-scoped por `get_accessible_tables` (main.py:392), devolve nós (TableResponse com columns[]) e arestas (columns[].fk_table/fk_column) + meta {row_count, column_count, relation_count}**. A aresta FK mora literalmente na coluna.

Lacuna conhecida: relações puramente lógicas criadas via `POST /api/relations` (main.py:635) não têm fk_table na coluna e só aparecem via `GET /api/relations/table/{name}` (main.py:651) — endpoint per-table (N+1), só lado FROM, e que descarta relações com from/to_column_name NULL. Não existe listagem autenticada de todas as relações do workspace. → decisão aberta nº 1.

## 2. O que entrega

Rota `/admin/schema` read-only com:
- Cada tabela dinâmica como **nó editorial Mora**: Card + Eyebrow (nome em `var(--font-mono)`) + Hairline + linhas de coluna (altura `var(--row-height)` do TweaksContext) + Pill tone=accent pra PK + padrão "FK → {tabela}" do screens-2.jsx pra FKs, tipos em display itálico (TYPE_META do handoff como referência).
- Arestas FK→tabela em SVG herdando tokens (`var(--rule)` / hover-seleção `var(--accent)`) — 2 modos × 4 acentos funcionam de graça.
- Auto-layout topológico, pan/zoom/fit-view, busca, seleção com painel de detalhe lateral + atalhos "Ver dados" (`/admin/data/[table]`) e "Editar schema" (`/admin/tables/create`).
- Drag de nós com layout persistido em localStorage (válvula de escape do spaghetti).
- Export PNG (SVG condicional ao spike).
- Entrada na sidebar: push em `contentItems` (grupo "Conteúdo") em `frontend/src/app/admin/layout.tsx` (linhas ~47-56), logo após "Tabelas", com ícone novo `network` em ICON_PATHS (`frontend/src/components/ui/Icon.tsx` — hoje não existe ícone de grafo/rede).

## 3. Princípios invioláveis (do doc de visão, confirmados)

1. Reuso de dados — `GET /tables/` é a fonte v1 (emenda possível: PR2b, ver decisão 1).
2. Performance é critério de sucesso — suave até ~100 tabelas, MEDIDO, não assumido.
3. Read-only — edição continua em `/admin/tables/create`; nenhuma mutation pelo diagrama.
4. Identidade Mora editorial — gate mensurável: screenshots Playwright comparados lado a lado com `/admin/tables` ("não pode parecer BI genérico").
5. Funciona offline após carregar — sem polling/subscribe.
6. **Arquitetura engine-agnóstica**: `SchemaCanvas` é a ÚNICA peça que conhece a engine de render; page, builder do grafo, TableNode e painel de detalhe são idênticos nos dois mundos — o spike não bloqueia o desenho do resto.
7. TableNode fino sobre primitivos de `@/components/ui` — minimiza retrabalho quando o M7.5 (editorial pass) revisar o vocabulário visual.

## 4. Fases / PRs

### PR1 — `spike/m7-graph` — Spike comparativo de render (descartável; sobrevivem só relatório + fixtures)

Por regra do projeto, NENHUMA lib de grafo entra sem spike. Critérios numéricos escritos ANTES de rodar.

- **Fixtures**: gerador a partir do shape real de TableResponse (`backend/schemas.py:102-110`) + datasets multi-workspace com FKs de `planning/design_archive/atlas-2026-04-30/project/data.jsx`. Escalas 10/30/60/100 tabelas, com sujeira proposital: tabelas órfãs, relação sem from/to_column_name, fk_table apontando pra tabela inexistente, duplicata FK física + DynamicRelation espelho (main.py:580-591).
- **Candidato A — custom híbrido**: nós HTML position:absolute + overlay SVG pras edges, pan/zoom via transform CSS (~150-200 linhas). Zero dep nova; framer-motion 12 e html2canvas 1.4.1 já instalados.
- **Candidato B — @xyflow/react** (~45-50kb gz) com nó React custom usando Card/Pill/Eyebrow + auto-layout via dagre OU elkjs (medir ambas; elkjs é centenas de kb → web worker ou descarte).
- Protótipo do **auto-layout topológico custom** (camadas por profundidade de FK, órfãs à margem) entra no próprio spike — serve aos dois candidatos.
- **Critérios de decisão**: (1) nó 100% Mora sem CSS base da lib vazando (screenshot lado a lado com /admin/tables); (2) pan/zoom sem jank a 30 e 100 nós (Playwright trace); (3) cruzamentos de edges no auto-layout da fixture de 30 tabelas — spaghetti = reprovado; (4) compat React 19.2.4 + Next 16.2.1 sem patch (ler `node_modules/next/dist/docs/` antes — frontend/AGENTS.md); (5) delta de bundle ≤ ~60kb gz total (lib + layout); (6) export PNG viável com viewport transformado — incluindo o workaround mapeado: render de cópia off-screen sem transform pro html2canvas; export não entra agora, mas o caminho não pode ficar impossível.
- **Entregável**: `planning/m7_spike_resultado.md` com tabela de números + screenshots Playwright (light/dark) dos 2 protótipos analisados + recomendação. **Diretor bate o martelo aqui.** Zero código de produto.

### PR2 — `feat/m7-pr1-schema-render` — Grafo de dados + render básico (80% do valor)

- **`frontend/src/lib/schemaGraph.ts`** (módulo puro, testável): TableResponse[] → {nodes, edges}. TOLERANTE a inconsistências desde o dia 1: fk_table ausente da resposta → edge pendente com tratamento conforme decisão 3 (nó fantasma anonimizado vs contador discreto); **dedup por (from_table, from_column, to_table)** — a FK física e o DynamicRelation espelho duplicam a mesma relação; relações sem column names entram sem âncora de coluna (se PR2b existir). Unit tests com as fixtures sujas do PR1 (+ workspace vazio, 1 tabela, ciclos, auto-referência).
- **`frontend/src/app/admin/schema/page.tsx`**: client component padrão admin (`useAuth()`, fetch Bearer, `NEXT_PUBLIC_API_URL`); estados loading/empty/error editoriais; empty state com CTA pra /admin/tables/create; estado "só órfãs".
- **`frontend/src/components/schema/{SchemaCanvas,TableNode,EdgeLayer,layout.ts}`**: engine do spike encapsulada SÓ no SchemaCanvas; TableNode conforme seção 2; canvas em `var(--bg-page)` + paper-texture; auto-layout + pan/zoom/fit-view.
- Sidebar (`admin/layout.tsx`) + ícone `network` em ICON_PATHS.
- **Roles**: admin = próprio workspace (get_accessible_tables); moderator = tabelas dos seus grupos, FK fora → conforme decisão 3; master = conforme decisão 2 (tendência: dropdown client-side por owner_id, campo já presente em TableResponse).
- **Gate**: unit tests do schemaGraph/layout; screenshots Playwright **light/dark × 4 acentos (matriz 2×4 completa)** analisados + comparação com /admin/tables; medição registrada no PR com fixture de 30 e 100 tabelas — **budget de aprovação: mount < 1.5s a 30 tabelas** + fluidez de pan a 100.

### PR2b — CONDICIONAL (backend, só com ok explícito do Diretor — decisão 1)

`GET /api/relations/` agregado workspace-scoped em `backend/main.py`: todas as DynamicRelation do tenant numa chamada, retornando `RelationInfo` já existente (`schemas.py:129-137`), filtrado por `get_accessible_tables` pra NÃO herdar o leak do per-table (to_table sem checagem de acesso). Inclui testes de isolamento por role (admin não vê relação de outro tenant; moderator só relações entre tabelas dos seus grupos). Nota honesta do veredito: não é "query de 1 linha" — o filtro por role tem custo. NÃO mexe nos smells de POST/DELETE /api/relations (follow-up fora do M7). Não bloqueia o PR2: v1 só com FKs físicas é aceitável (são as arestas reais de integridade).

### PR3 — `feat/m7-pr2-interacao` — Seleção, painel, busca, drag persistido

- Click no nó → seleção `var(--accent-soft)` + borda `var(--accent)` (padrão screens-2.jsx); highlight das edges/vizinhos, fade do resto (`var(--rule-faint)`).
- **Painel de detalhe lateral** (borderLeft 3px `var(--accent)` sobre bg-secondary, padrão do handoff): colunas completas com badges, meta de TableResponse, Buttons "Ver dados" → `/admin/data/[table]` e "Editar schema" → `/admin/tables/create`.
- Busca/filtro por nome de tabela: dim dos não-matches + centrar no match (decisão 5, tendência sim).
- **Drag de nós + persistência** em localStorage (chave `mora-schema-layout:{workspace}`, padrão mora-theme/mora-accent) + botão "reorganizar" (reaplica auto-layout).
- Deep-link `?focus={table}` SÓ se Diretor aprovar agora (decisão 4; tendência: follow-up pós-M7.5).
- **Gate**: testes de seleção/persistência/busca; screenshots dos estados (selecionado, buscado, painel aberto) analisados; robustez: nó fantasma/pendente clicável não pode quebrar o painel.

### PR4 — `feat/m7-pr3-export-polish` — Export + polish + hardening final

(Vereditos sugeriram split; mitigação adotada: números de perf já são gate do PR2, então aqui é re-validação, não descoberta. Split em PR4a/PR4b é trivial se o Diretor preferir.)
- **Export PNG** do canvas com tema atual aplicado (raster precisa das cores COMPUTADAS das CSS vars — validar 1 export por modo); html2canvas com workaround off-screen do spike, ou helper da lib se validado. **SVG só se o spike provou barato** (foreignObject é infiel em vários consumidores); senão PNG-only.
- Polish editorial: moldura Folio/Eyebrow/SectionNum como nas demais telas admin, animação de entrada/fit com framer-motion, microcopy, hover lift do Card interactive.
- **Hardening medido**: fixture de 100 tabelas, números no PR; escada de degradação graciosa: (1º) desligar animações/sombras acima de N nós, (2º) **semantic zoom — colapsar colunas dos nós em zoom-out**, (3º) virtualização/culling SÓ se a medição provar necessidade.
- **Gate final da milestone**: suite Playwright cobrindo os critérios de sucesso; matriz 2×4 de screenshots; export validado por modo; rodada TestSprite (via MCP, direto pelo Claude); atualizar `planning/milestone_7_schema_visualizer.md` (status), `CLAUDE.md` (Estado Atual) e **`planning/roadmap.md`** (corrigir divergência "5 fases ~1-2 semanas" → 4 PRs reais).

## 5. Decisões fechadas pelo Diretor (rebate 2026-06-12)

1. **Fonte das arestas: PR2b APROVADO — FKs físicas E relações lógicas, distintas visualmente.** O Diretor pediu pesquisa de melhores práticas; conclusão: as ferramentas de referência (DBeaver com "virtual keys", SqlDBM com "virtual relationships", DreamFactory) tratam relações lógicas/virtuais como cidadãs de primeira classe nos diagramas ER — elas existem exatamente porque schemas reais muitas vezes não têm constraint física (warehouses, SQLite sem ALTER ADD CONSTRAINT — nosso caso). Convenção visual padrão adotada: **linha sólida = FK física, linha tracejada = relação lógica**. Esconder as lógicas faria o visualizer mentir sobre relações que o próprio produto deixou o usuário declarar via `POST /api/relations`.
2. **Master: dropdown de workspace** (client-side por owner_id).
3. **Moderator: contador discreto** ("N relações fora das suas permissões"); **sidebar visível pra todos os roles**, cada um vendo conforme suas permissões (backend já isola via get_accessible_tables).
4. **Deep-link `?focus={table}`: pós-M7.5.**
5. **Busca no MVP: confirmada.**
6. **Export: PNG garantido; SVG condicional ao spike. ADIÇÃO do Diretor: export do schema como SQL (DDL) em dialetos que façam sentido** — gerar `CREATE TABLE`s a partir do schema lógico (`_tables`/`_columns`/`_relations`), dialetos PostgreSQL e SQLite (os que o produto vive; MySQL avaliar no PR4). Entra no PR4 com escopo validado na hora; sinergia com [backlog_export_pacotes.md](backlog_export_pacotes.md) item 3.
7. **Validação: matriz completa confirmada** (light/dark × 4 acentos em todo PR). Órfãs: isoladas no canto (tendência), screenshot do PR2 confirma.

## 6. Riscos

- **Auto-layout spaghetti com 30+ tabelas/FKs cruzadas** (maior risco de produto): critério 3 do spike reprova; válvula de escape mantida em escopo (drag + persist + "reorganizar", PR3).
- **Lib com cara de BI genérico / CSS base vazando**: critério 1 do spike + screenshots comparados com /admin/tables em todo PR.
- **Compat React 19.2.4 / Next 16.2.1**: libs de grafo atrasam suporte; validado no spike antes de qualquer commit de produto.
- **Bundle**: budget ≤ ~60kb gz como critério de reprovação; dynamic import da rota; elkjs só em worker ou fora.
- **Export com viewport transformado**: html2canvas pode cortar/distorcer — workaround off-screen testado no spike, não descoberto no PR4.
- **Dados sujos quebrando o builder**: relações com column names NULL, fk_table pra tabela deletada, duplicata espelho — schemaGraph tolerante + fixture suja testada desde o PR2.
- **Perf acima de 100 tabelas**: caso degenerado declarado; medir, degradar graciosamente, não prometer.
- **Sobreposição com M7.5**: TableNode fino sobre primitivos minimiza retrabalho; deep-link adiado por padrão.

## 7. Estados difíceis (primeira classe desde o PR2, não polish)

Workspace vazio (CTA editorial) · só tabelas órfãs · 1 tabela · FK pra tabela deletada/renomeada · relação lógica sem column names · duplicata FK física + espelho · moderator com visão parcial (aresta pendente) · master multi-tenant · auto-referência e ciclos de FK · nó fantasma clicável.

## 8. Critério de sucesso (gates do Diretor, padrão pós-M6.5)

- Abrir /admin/schema e ver tudo sem configurar; navegável com 20+ tabelas (zoom/pan/busca); click → ações rápidas; layout reorganizado sobrevive reload; export gera imagem usável com o tema atual.
- **Todo PR fecha com**: testes (unit + Playwright) + screenshots Playwright ANALISADOS (matriz light/dark × 4 acentos; comparação lado a lado com /admin/tables) + números de velocidade/robustez registrados no PR (mount < 1.5s a 30 tabelas; fluidez a 100; bundle delta).
- TestSprite no fechamento da milestone.

## 9. Não-objetivos

- **Escrita no canvas** (drag pra criar FK, rename inline): além de violar o princípio read-only, o backend torna o gesto uma mentira — FKs físicas só nascem em `create_physical_table` (dynamic_schema.py:47); POST /api/relations cria só registro lógico SEM constraint e SEM ownership check; SQLite não tem ALTER ADD CONSTRAINT (exigiria table rebuild). Pré-requisitos registrados como doc de milestone futura + pendência de segurança em project_bugs.
- **Tabelas de sistema no diagrama**: a decisão aberta do doc de visão se resolve por fato — não são DynamicTable, não vêm em GET /tables/; toggle exigiria endpoint de introspecção. Fora.
- **Cardinality nas arestas**: backend só grava relation_type='many_to_one' e junction_table_name nunca é preenchido — seria ruído uniforme. Fora.
- Multi-workspace na mesma view como feature (caso master é filtro, não comparação) · versionamento/snapshot do schema · AI suggestions de FKs (sinergia M11) · realtime/polling · layout compartilhado server-side · introspecção física (o diagrama mostra o schema LÓGICO; documentar no painel de detalhe) · corrigir os smells de ownership de POST/DELETE /api/relations (follow-up de segurança, fora do M7).

## 10. Arquivos-âncora

`backend/main.py` (392, 580-591, 596, 635, 651) · `backend/models.py` (83-112) · `backend/schemas.py` (80-137) · `backend/dynamic_schema.py` (47, 120) · `frontend/src/app/admin/layout.tsx` (contentItems ~47-56) · `frontend/src/components/ui/Icon.tsx` (ICON_PATHS) · novos: `frontend/src/app/admin/schema/page.tsx`, `frontend/src/lib/schemaGraph.ts`, `frontend/src/components/schema/*` · `planning/milestone_7_schema_visualizer.md`, `planning/roadmap.md`, `planning/design_archive/atlas-2026-04-30/project/{screens-2,data}.jsx`.
