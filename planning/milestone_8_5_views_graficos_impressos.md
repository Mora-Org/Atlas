# M8.5 — Views, Gráficos & Impressos

> **Status:** 🟢 esqueleto batido 2026-07-12 (rebate ultracode pós-M8). 4 forks estruturais fechados com o Diretor; decisões de detalhe seguem fase-a-fase. **Ainda não executar** — falta detalhar F1 no rebate.
> Fecha `0.8.0` (régua: fase intermediária não bumpa; o +0.1 sai no PR de fechamento — precedente M8→0.7.0).
> Smells compartilhados do backend: inventariados no [plano do M-Ops](milestone_ops_observabilidade.md) (fonte única).

## O problema

O Atlas só sabe mostrar dado de um jeito: tabela que vira texto. O renderer público reduz cada row a title/meta/rest, o DataViewer baixa a tabela paginada e não existe **agregação server-side em endpoint nenhum** — as únicas agregações do backend são contagens (`func.count` como `total` da paginação, `main.py:1431` autenticada / `main.py:1309` pública) e o `func.sum` da quota de mídia da F5 (`main.py:1090`). Zero `GROUP BY` no código (grep confirma). Quem quer responder "quantos X por categoria, comparando recorte A com recorte B" exporta planilha e faz fora.

A segunda dor é a saída física: o dado publicado não vira material de divulgação nem citação. As ferramentas já estão pagas: **recharts 3.8.0, jspdf 4.2.1 e html2canvas 1.4.1 instaladas e usadas só em `frontend/src/components/widgets/`** — código morto que nenhuma página importa. M8.5 transforma arsenal ocioso em produto.

## O que entrega

O admin define views salvas (recorte + agrupamento persistidos no backend — hoje a única "view" é viewMode/density em localStorage), o backend agrega respeitando o RLS por tenant, um chart builder monta gráficos "filtro A vs filtro B" com estética Mora, o gráfico vai pro público sob a regra que o rebate decidir (congelado com o snapshot ou exceção viva), e dois impressos saem dos mesmos gráficos: **panfleto editorial** (números grandes, cores Mora) e **versão acadêmica** (sóbria, fontes citadas). Gate Playwright padrão em tudo.

## Fases

| Fase | Entrega |
|---|---|
| **F1 — Agregações server-side + views salvas** | Capacidade de agrupar/somar/contar que não existe, sobre o GUC/RLS por tenant (mesmo trilho do resto — qualquer commit no meio apaga o GUC transaction-local; re-setar como a F4 fez). A rota é o template (filtro/search/sort/paginação prontos). Nasce a **view salva persistida como artefato de workspace consultável** (decisão 4) — absorve formalmente o "Saved views/queries" do backlog (roadmap.md:146). **Perf é entrega, não pressuposto:** tabela dinâmica só tem índice na PK `id` (dynamic_schema.py:80), zero índice em coluna de usuário ou `tenant_id`, sem `statement_timeout`, pool 5+10 (database.py:21) — agregar é seq scan; a fase decide teto de linhas / índice / cap de cardinalidade. |
| **F2 — Chart builder: A vs B + embed no público** | UI de gráfico comparando dois recortes sobre as views/agregações da F1 (recharts no Studio/admin, que é client). **Embed público CONGELA no snapshot** (decisão 1): o agregado é computado no publish sobre o dado completo (decisão 2) e o gráfico entra como **SVG pré-rasterizado** no blob — o público/export **não** dependem do recharts em runtime (parede do render server-safe, ver Riscos). Estende o versionamento de snapshot do M8 F3, não cria outro. |
| **F3 — Impressos: panfleto + acadêmico** | Dois artefatos imprimíveis consumindo os gráficos. **Mecanismo sai de spike no início da fase** (raster html2canvas+jspdf vs `@media print`+`window.print` vs server HTML→PDF); nenhum tem precedente limpo (zero `@media print` no front hoje, html2canvas já custou 2 workarounds no M7). Jurisprudência M6 F5 integral: PDF congela dados → aviso de truncamento + nota honesta no artefato + hardening como marco. |

## Dependências

- Sequência decidida 2026-06-12: M-Ops → M8 (✅ fechado 2026-07-10, 0.7.0) → M8.5. A paginação do M-Ops é fundação direta da F1; a F2 estende o versionamento de snapshot do M8 F3 (copy-at-publish + preview real já mergeados no PR #38).
- **Bloqueia M10:** os live charts (F4 do M10) são camada sobre os gráficos daqui — e só existem se **gráfico salvo persistir como artefato consultável no admin** (ver decisão aberta 4; recomendação do painel: persistir).
- Libs pagas: recharts/jspdf/html2canvas/jszip/xlsx. Plano fecha sem dependência nova; se surgir (ex.: server HTML→PDF headless), jurisprudência de spike + budget do M7.
- M8 empurrou pro M8.5: sistema de blocos / galeria / promoção de imagem a hero (decisão F3 do Diretor 2026-07-08) — decidir se entra aqui ou fica no backlog (decisão aberta 7).

## Riscos

- **recharts NÃO renderiza fora do browser (verificado empírico):** `renderToStaticMarkup(<BarChart width=600 height=300>…)` produz 127 chars — `<div>` vazia. O tamanho só chega ao store interno via `useEffect`; `ResponsiveContainer` é browser-only. Consequência dura: no **export estático** (ZIP sem `<script>` por contrato) e no **RSC público** (HTML pré-hidratação), um chart recharts sai vazio. Qualquer desenho da F2/F3 que assuma "SVG do recharts no HTML servido" está quebrado na raiz — precisa de SVG dimensão-fixa pré-renderizado no publish (como a F3 fez com mídia) ou aceitar chart só-pós-hidratação (perde no-JS/SEO/export). É a parede que molda F2 **e** F3.
- **Números que mentem:** snapshot trunca em 2000 rows com `total_rows` real. Gráfico agregado sobre rows truncadas exibe total errado com cara de verdade — versão visual do "o ZIP congela mentiras" do M6 F5. Decisão aberta 2 resolve (computar no publish sobre o dado completo).
- **Perf de agregação no free tier:** sem índice + sem `statement_timeout`, `GROUP BY/SUM` roda seq scan sobre o universo filtrado inteiro (sem o cap 500 das leituras); se o chart público for LIVE, roda a cada cache-miss (`revalidate:30`). Precisa de estratégia de índice (DDL nova + migração das tabelas existentes?), teto de linhas, ou materializar-no-publish.
- **Vazamento por curadoria (novo):** `_build_snapshot_payload` resolve tabelas só por `table_selection` + `owner_id` — **não** checa `is_public`. Um gráfico "salário médio por depto" sobre uma tabela privada, publicado junto de outra tabela, vazaria o agregado + rótulos de categoria pro público sem passar pela trava de seleção. O M6 nunca validou "fonte de conteúdo publicado" porque só ia tabela inteira; o gráfico abre caminho novo — decisão aberta 8.
- **Cardinalidade sem teto (novo):** agrupar por coluna de texto livre pode gerar milhares de grupos → gráfico ilegível + blob/ZIP gigante (os caps da F5 são de mídia, não de pontos de dado). Precisa de top-N + semântica de "resto".
- **Divergência SQLite-dev × Postgres-prod (novo):** `tenant_id` físico existe em PG e não em SQLite (`dynamic_schema.py:95`) — `GROUP BY` genérico exclui em um só banco; colunas importadas por SQL vêm tipadas `VARCHAR`/`INTEGER` fora da whitelist (`main.py:1671`); ordenação de NULL difere. Um chart verde no gate SQLite pode mentir número/ordem em prod — a F1 pede teste que rode em Postgres real (padrão `test_rls_raw_bypass`).
- **A11y + locale (novo):** `PublicSite` tem zero `aria/role`, zero `@media print`/`prefers-reduced-motion` no front inteiro (grep=0), e o tema do snapshot é **um** accent (6 tokens) — paleta multi-série derivada de 1 accent colide pra daltônicos (há skill `dataviz` no ambiente sobre isso). Números agregados saem sem formatação pt-BR (`toLocaleString` só existe em página admin client). Gráfico sem tabela-alternativa/aria é ilegível a leitor de tela e some sem JS.
- **Impressão:** html2canvas 1.4.1 é lib sem manutenção (2022) e já exigiu 2 workarounds no M7 (CSS var em atributo SVG resolve pra `none`; viewport transformado). jspdf 4.2.1 só faz SVG como **raster** (via canvg); `svg2pdf` não instalado → PDF vetorial de texto selecionável exige outro caminho. Precedente woff2 = o Diretor não aceita tipografia infiel.
- **Arco:** se o rebate decidir "builder ad-hoc sem persistência", a F4 do M10 perde o substrato (decisão aberta 4).

## Decisões fechadas no rebate (2026-07-12)

| # | Decisão | Escolha do Diretor |
|---|---|---|
| 1 | **Gráfico no público: congela ou vivo?** | **Congela com o snapshot.** Mantém o princípio "snapshot, não live" do M6, o gráfico entra no export ZIP de graça e a coerência versão↔dados. Dado vivo fica pro M10. Consequência de render: mesmo congelado o embed exige SVG pré-rasterizado no publish (recharts não renderiza server-side). |
| 2 | **Congelado: agregar sobre o dado completo ou as 2000 rows?** | **Computar no publish sobre o dado COMPLETO.** Número verdadeiro; o agregado vira segundo tipo de conteúdo no snapshot. Artefato que mente sem aviso é inaceitável desde o M6 F5. |
| 4 | **View salva: artefato persistido ou config efêmera?** | **Artefato de workspace persistido e consultável.** Vira insumo formal do chart e substrato dos live charts do M10 (F4). A F2 constrói sobre a F1. |

## Decisões abertas (detalhe fase-a-fase)

3. **Superfície da agregação na F1:** endpoint próprio `/api/views`/`/api/{table}/aggregate` (isola o GROUP BY; exige registrar antes do bloco dinâmico em `main.py:1348` + reservar o nome "views" na trava, precedente "assets") ou extensão da rota dinâmica (reusa guards/RLS, engorda rota recém-paginada)? — rebater no detalhamento da F1.
5. **Locus dos impressos: client-side (libs prontas, raster) ou server-side (PDF vetorial, sem precedente no backend)?** Spike no início da F3 decide por evidência; a barra de qualidade é do Diretor.
6. **Impressos conversam com o export ZIP/backlog de pacotes ou são fluxo separado?** `backlog_export_pacotes.md` segue sem dona; itens 2-3 exigem rediscussão de fit antes de qualquer absorção.
7. **Blocos/galeria/hero (empurrado do M8) entra no M8.5 ou fica no backlog?** Molda o schema de layout do público (hoje só list/grid/essay).
8. **Trava da fonte do gráfico no publish (novo):** um chart só pode consumir tabela na `table_selection`? só `is_public`? ou qualquer tabela do owner (e assume-se o vazamento)? Decide antes da F2 (o "congela" da decisão 1 não fecha isso — o agregado de tabela privada ainda vazaria pro público).
9. **Cardinalidade (novo):** top-N + "resto" com que teto? Onde barra (query, builder, render)? — detalhar na F1.

## Fatos-âncora (reverificados 2026-07-12)

- Zero `GROUP BY`/agregação de dado; `func.count` só como `total` (auth `main.py:1431`, pública `main.py:1309`); único `func.sum` = quota F5 (`main.py:1090`).
- Filtro existente: `filter_col`/`filter_val`/`filter_op` (7 ops: eq/contains/gt/lt/gte/lte/neq) + `search` (ILIKE cast String) + sort/order + limit cap 500 — auth `main.py:1379`, pública `main.py:1281`. **Comparação segue o tipo físico da coluna** (Integer/Float são numéricos — o "lexicográfico" foi refutado); o front não consome `filter_op`/`sort` em lugar nenhum (grep=0).
- **recharts é dead code** (só `widgets/BarChartWidget.tsx`, importado por ninguém); entrou no commit inicial do template, milestone nenhuma. Não renderiza server-side (verificado empírico) — `node_modules/recharts/es6/container/RootSurface.js`.
- Snapshot `schema_version:1` = JSON único por versão (`publication_storage.py`); `_build_snapshot_payload` `main.py:1967-2050`, theme em `:2048`; MAX_ROWS_PER_TABLE=2000 com `total_rows` real. Copy-at-publish `_freeze_snapshot_media` `main.py:2053/2178`.
- `PublicSite.tsx` sem `'use client'`, 3 contextos; precedente `MediaCell` puro theme-driven em `:257` (não reusa `MediaPreview`). Preview `POST /api/publications/me/preview` `main.py:2205` devolve `theme_config={}` (tema é client-side no Studio).
- Tabela dinâmica só indexa PK `id` (`dynamic_schema.py:80`); sem `statement_timeout`; pool 5+10 (`database.py:21`). `Date`/`Text` caem em fallback String (`dynamic_schema.py:23`) — só Integer/Float numéricos p/ SUM/AVG. `tenant_id` físico só em PG (`:95`).
- Rota literal nova de 1 seg sob `/api` declarada depois de `main.py:1348` é engolida pela dinâmica; trava de reservados = `RESERVED_TABLE_NAMES=("assets",)` em `main.py:1027` (o CLAUDE.md que diz "sem validação" está desatualizado).
- Export: `/api/export/[versionId]/route.ts` `maxDuration=60`, sem `vercel.json`; ZIP materializado em RAM; caps `MEDIA_MAX_FILES=300`/`MEDIA_MAX_TOTAL_BYTES=120MB`. jspdf 4.2.1 só rasteriza SVG (canvg); `svg2pdf` não instalado. Zero `@media print` no front.
- Nenhum campo de proveniência de dado existe (`DynamicTable` só tem `description`) — "fontes citadas" do acadêmico não tem de onde puxar.
- Tema do público/export = `ThemeColors` do snapshot, 6 tokens, **um** accent — sem paleta multi-série no schema atual.

## Não-objetivos

- Gráficos realtime/live — M10 (decisão 2026-06-12; estático primeiro).
- Mídia/upload/column types — M8. M8.5 só consome dado tabular.
- Paginação como entrega — M-Ops; a F1 nasce em cima.
- Export PNG/SQL DDL do canvas — M7.
- Pacotes de export do backlog — sem dona; itens 2-3 exigem rediscussão de fit.
- Dashboard livre com grid arrastável — fora (react-grid-layout com @types incompatíveis).
- Computed/formula columns — backlog.
