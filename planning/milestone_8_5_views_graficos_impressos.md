# M8.5 — Views, Gráficos & Impressos

> **Status:** 🔵 F1 CODADA E VERDE nos dois engines (2026-07-16) — falta QA do TestSprite + PR. F2/F3 seguem 🟢 esqueleto (detalhar fase-a-fase).
>
> **Resultado da F1** — `backend/aggregation.py` (motor puro) + `_views` (model + migration `f2c9e04b7a31`) + 8 endpoints `/api/views/me/*` + 23 testes.
> - Cobertura: **215 passed / 7 skipped** em SQLite (era 192) e **212 passed / 1 failed / 7 skipped / 2 deselected** em Postgres.
> - O `1 failed` (`test_admin_cannot_forge_tenant_id`) é **pré-existente** — falha na `main` também. Teste PG-only que nunca rodou e assere contra o formato pré-paginação do M-Ops F3; a propriedade de segurança está intacta (devolveu `{'data': [], 'total': 0}`), o assert é que envelheceu.
> - Os `2 deselected` são o BUG-PG01. **Ordem obrigatória: o hotfix `0.7.1` entra na `main` ANTES do PR da F1** — sem ele a F1 não fecha suíte PG verde (pendura, não falha).
> - Decisão 3 verificada no roteador real: as 8 rotas registram sem sombreamento e `GET /api/views` cai na dinâmica — tabela de cliente chamada "views" continua acessível, sem reservar nome.
> - **Publish NÃO foi ligado** (é F2 pela tabela de fases, e a decisão aberta 8 — trava da fonte do gráfico — segue aberta; ligar antes seria construir o vazamento). O requisito de desenho está cumprido: o motor é puro, não commita, não depende do GUC.
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

## F1 — contrato de execução (batido 2026-07-16, não precisa de rebate)

Tudo abaixo saiu **medido**, não lido. O que é contra-intuitivo está marcado com o motivo.

**Motor**
1. **Módulo puro novo `backend/aggregation.py`** com `run_aggregation(db, table, spec)`, chamado pelo endpoint **e** por `_build_snapshot_payload` (`main.py:1967-2050`). É a única forma que funciona nos dois caminhos: o publish roda **sem** GUC de tenant (`get_db`, `main.py:2147`) e o endpoint **com** (`tenant_db`). Precedentes de módulo puro: `media_cleanup.py`, `import_infer.py`. **Descartado:** publish chamar o próprio endpoint por HTTP — conexão nova = sem GUC = ou barra tudo ou vaza entre tenants.
2. **Nunca commitar dentro do motor** — apagaria o GUC transaction-local (`main.py:514-537`). A F4 do M8 já pisou nisso e re-seta em `main.py:1927`.
3. **Escopo por identidade, não por RLS:** o motor recebe a tabela já filtrada por `owner_id` (o que `_build_snapshot_payload` já faz). Defesa em profundidade barata: re-setar o tenant no publish antes de agregar, mas **depois** de qualquer commit.

**Semântica**
4. **Somável/agrupável sai do tipo FÍSICO refletido** (`_load_physical_table`, `main.py:567`) via `col.type.python_type` — nunca do rótulo `_columns.data_type`, nunca do nome da classe (medido: pelo nome classifica **zero**). Motivo: tabela importada por SQL grava rótulo 'INTEGER'/'VARCHAR' (`main.py:1671`), e whitelist por rótulo daria zero colunas somáveis **justo nas tabelas grandes que motivam a feature**. O rótulo serve **só** pra excluir mídia (o tipo físico não enxerga imagem/arquivo). As duas fontes erram em direções opostas e por isso se cobrem.
5. **Excluir do agrupamento:** `tenant_id`, colunas de mídia e a PK `id`. `tenant_id` só existe em tabela nascida do motor de criação (`dynamic_schema.py:117` PG **com** / `:162` SQLite **sem**) — **âncora corrigida: o `:95` que a linha 68 deste plano cita NÃO prova isso**. E nem toda tabela de PG tem: importada por SQL usa DDL crua (`main.py:1644-1645`) e não tem. A forma física **não é uniforme nem dentro do mesmo banco** — teste que cubra só tabela criada à mão não pega.
6. **Ordenação com "nulos por último" explícito + desempate determinístico.** Medido nos dois bancos com o mesmo dado: `ORDER BY soma DESC LIMIT 1` devolve `('b',5)` no SQLite e `('a',NULL)` no Postgres — em produção **o grupo SEM DADO ganha a barra nº 1** e empurra o dado real pra fora. Não é branch por banco: é cláusula explícita, neutra, nos dois.
7. **Nulo vira grupo próprio** rotulado `(sem valor)` — nunca zero; "zero" e "sem dado" são coisas diferentes e o gráfico não pode fundir. Média sempre acompanhada do **n** (denominador), pra ser auditável.
8. **A resposta sempre devolve contagem-de-preenchidos + soma por grupo**, mesmo quando o gráfico pediu só média — é isso que torna o "resto" derivável sem 2ª consulta (decisão 9).
9. **Prova de honestidade no payload:** campo `source_row_count` (quantas linhas o agregado cobriu), comparável com o `total_rows` do snapshot (`main.py:2007-2018`). Se bater, o gráfico pode **afirmar** que foi computado sobre o dado completo (decisão 2 do Diretor); se divergir, avisa. Sem isso, "computei sobre o dado completo" é palavra, não prova.
10. **Prova de tipo ANTES do banco:** somar/mediar coluna não-numérica devolve **400 na porta**, nos dois bancos. Medido: `SUM` sobre texto devolve `[('a',12),('b',0.0)]` — **verde e mentiroso** — no SQLite, e 500 no Postgres. Barrar na porta mata os dois, inclusive no caminho de import por SQL (que hoje não tem cobertura em PG nenhuma).
11. **"A vs B" = 1 request com N recortes nomeados (teto 4)**, não 2 requests. Motivo: 1 request = 1 transação = 1 ponto no tempo; com 2 o dado muda no meio e o gráfico compara maçã com laranja sem avisar. Cada recorte reusa os 7 operadores de filtro que já existem (`main.py:1406`) — sem inventar linguagem de filtro.

**Persistência**
12. **Migration no molde do `e4b7a9c31f52` (M8), NÃO do `c5dad43f9889`.** Diferença que muda o código: o `c5dad43f9889` aborta a migration inteira se a tabela já existe — copiar isso **pularia o `ENABLE ROW LEVEL SECURITY`** num banco novo e a tabela nasceria exposta. Molde certo: guard só em volta da criação, RLS **fora** do guard (idempotente). Foi exatamente o que aconteceu com `_publication_versions` (nasceu sem RLS, só corrigido no M8 F1). **O CI não pega** — medido: zero ocorrências de alembic em `backend/tests/`, o conftest roda `create_all` direto (`conftest.py:117`). Só code review protege. **Model espelho em `models.py` é obrigatório** (senão a tabela não nasce em banco novo e os testes não a veem).
13. **Ligação com a tabela:** FK pra `_tables` **sem** `ondelete` + `relationship(cascade='all, delete-orphan')` — medido: é o **único** desenho que limpa nos dois bancos (SQLite não enforce FK, não há `PRAGMA foreign_keys` em lugar nenhum do backend → `ondelete=CASCADE` é no-op em dev e só funciona em prod). Ganha de graça a limpeza no delete de tabela (`main.py:1016`) e de admin (`main.py:285`), sem uma linha nova. **Ligar por NOME está descartado:** não existe rename, então reciclar nome = drop+create, e a view velha se re-attacharia a uma tabela nova com dado diferente — "números que mentem" de novo. Vale 1 teste de regressão (apagou tabela → 0 views).
14. **Escopo/dono:** `owner_id` (FK pra users, cascade, indexado) + filtro de aplicação — molde de `_assets` e `_publication_versions`. **Sem `tenant_id` físico e sem policy:** nenhuma system table tem policy hoje, e isso é de propósito (`b1f6c4e9a2d7:14-17`). Config da view é **opaca em SQL, filtrada em Python** — medido: `json` vs `jsonb` diverge por história (prod incremental = `jsonb`; DB fresh e test-DB = `json`, porque `models.py` declara `Column(JSON)` e a migration `c5dad43f9889:40` emite `JSONB`). Usar `@>`/GIN funcionaria em prod e quebraria em ambiente novo, e o teste passaria/falharia pelo motivo errado.
15. **Master não usa view (403)**, molde exato de `_media_tenant_or_403` (`main.py:1030`).

**Performance**
16. **Nenhum índice novo** (ver dívidas). O dique é **`SET LOCAL statement_timeout`** na transação da agregação (PG; no-op em SQLite) — encaixa no trilho que já existe (`tenant_db` = 1 transação com `RESET ALL` no fim). **Guardar com `count(*)` prévio foi refutado:** o guarda custa uma varredura inteira (85ms a 250k) pra proteger algo que custa ~10x isso — paga pedágio até quando não precisa. O timeout corta sem custo quando a query é rápida. Falta só o **valor** (bloqueio de plataforma).

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

## Decisões fechadas no detalhamento da F1 (2026-07-16)

> Rebate ultracode: 5 frentes (superfície HTTP, schema, perf/índices, semântica, testes), cada uma com cético + crítico de completude — 11 agentes, 1,08M tokens, 423 tool calls. Todas as recomendações aceitas pelo Diretor.

| # | Decisão | Escolha do Diretor |
|---|---|---|
| 3 ✅ | **Superfície da agregação** (fechava a decisão aberta 3) | **`/api/views/me/*`**, espelhando `/api/publications/me/*`. Medido em probe com o stack **pinado do repo** (starlette 1.0.0 / fastapi 0.135.2): CRUD completo funciona registrado DEPOIS do bloco dinâmico — zero reordenação, zero nome reservado, tabela homônima do cliente continua acessível. Precedente vivo: `GET /api/publications/me/versions` (`main.py:2108`) vive 760 linhas depois do bloco dinâmico e funciona. Ganha `/preview` de graça (agregado ad-hoc espelhando `POST /api/publications/me/preview`, `main.py:2205`) — o chart builder da F2 desenha com o MESMO motor do publish, sem risco de divergir. **Descartado:** `/api/views` literal (a trava `RESERVED_TABLE_NAMES` é furada — import por SQL cria tabela sem passar por ela, `main.py:1619→1644`) e esticar a rota dinâmica (o publish não fala HTTP; a receita do gráfico existiria em 2 formas + tradutor = admin diverge do publicado). |
| 10 | **Operações da v1** (congela no snapshot na F2) | **Contar + contar distintos + somar + média.** Cobre barra/pizza/linha. **Menor/maior valor ficam FORA de propósito** — medido nos dois bancos: `MAX` sobre coluna booleana passa em dev (devolve 1) e dá **500 em produção**; `MIN`/`MAX` sobre texto dá eixo alfabético inútil. O gate roda SQLite, então os dois só apareceriam pro usuário. O que fica de fora (`data da última venda`, `maior pedido`) é tabela-resumo, não gráfico — entra depois só somando item na lista, sem quebrar contrato congelado. |
| 9 ✅ | **Cardinalidade** (fechava a decisão aberta 9) | **Top 20 + teto duro 50 + grupo "resto" + aviso DENTRO do dado** (cortou sim/não, nº total de categorias, % no resto). O caso degenerado se denuncia sozinho ("99,96% está no resto") em vez de mentir. Verificado: o "resto" é derivável sem 2ª consulta inclusive pra **média** (a frente dizia que exigiria 2ª passada; a medição refutou — derivado 246,7799849133 = real), **desde que o denominador seja a contagem de valores PREENCHIDOS, não de linhas** (denominador errado = média erra na 2ª casa, em silêncio). **Trava:** o aviso tem que entrar no CONTRATO DO SNAPSHOT já na F1 — senão o público e o PDF mentem calados, cenário que a F3 não pode produzir. Nota: cortar **não** protege performance (o banco agrupa tudo e só depois corta); perf é outro dique. |
| 11 | **Schema da view salva** | **Híbrido:** campo próprio pra tabela, coluna de agrupamento, operação e coluna da métrica; pacote JSON validado pra filtros, ordenação e o que a F2 inventar. Trava 3 coisas: (1) bloqueio de "apagar coluna usada por gráfico" igual ao das relações (`main.py:940-949`); (2) o publish varre views por campo indexado sem abrir o pacote; (3) a F2 cresce sem migration em produção. Custo aceito: duas fontes de verdade — disciplina de review pro mesmo filtro não morar nos dois lugares. |
| 12 | **Moderador** | **View é do workspace inteiro**, molde da Media Library (`main.py:1030`, decisão do Diretor de 2026-07-05). Gap aceito conscientemente: mod do grupo A pode criar view sobre tabela do grupo B e ver agregado + rótulos de categoria — primeira porta a furar o `ModeratorPermission` (`main.py:504-507`). Racional: o publish já fura pior (mod publica o workspace inteiro sem checagem de grupo, `main.py:2116/2144`); fechar só na view a deixaria mais estrita que o publish. **Coerência fica como dívida registrada**, não como escopo da F1. |
| 13 | **Gate da F1** | **pytest + TestSprite; o gate Playwright nasce na F2.** A linha 15 deste plano ("Gate Playwright padrão em tudo") **não** se aplica à F1: ela é backend puro, não há tela pra dirigir — o gate viraria mock testando mock. Precedente real do M8: a F1 era backend-only/pytest e o `validate-media.mjs` só nasceu na F5. A F2 **estende** o gate em vez de criar do zero. Registrado aqui pra não parecer que a fase pulou o padrão. |

## Decisões abertas (detalhe fase-a-fase)
5. **Locus dos impressos: client-side (libs prontas, raster) ou server-side (PDF vetorial, sem precedente no backend)?** Spike no início da F3 decide por evidência; a barra de qualidade é do Diretor.
6. **Impressos conversam com o export ZIP/backlog de pacotes ou são fluxo separado?** `backlog_export_pacotes.md` segue sem dona; itens 2-3 exigem rediscussão de fit antes de qualquer absorção.
7. **Blocos/galeria/hero (empurrado do M8) entra no M8.5 ou fica no backlog?** Molda o schema de layout do público (hoje só list/grid/essay).
8. **Trava da fonte do gráfico no publish (novo):** um chart só pode consumir tabela na `table_selection`? só `is_public`? ou qualquer tabela do owner (e assume-se o vazamento)? Decide antes da F2 (o "congela" da decisão 1 não fecha isso — o agregado de tabela privada ainda vazaria pro público). **Achado do detalhamento da F1:** a trava tem que ficar no CHAMADOR do publish, não no core de agregação — o mesmo core chamado pelo endpoint resolve por `get_accessible_tables` (correto p/ admin), mas no publish herda o filtro de `_build_snapshot_payload`, que só checa `owner_id` e **não** checa `is_public` nem `table_selection` (`main.py:1983-1987`).

## Correção ao detalhamento — achada CODANDO (2026-07-16, aguarda o Diretor)

**`count_distinct` não é somável, e o detalhamento errou nisso.** A decisão 9 afirma que "só 'menor/maior' seria não-derivável — e a decisão 2 já os deixa fora", e com base nessa premissa `count_distinct` entrou na decisão 10. Está errado: somar os distintos-por-grupo das categorias cortadas conta em dobro qualquer entidade que apareça em mais de um grupo, então a barra do "resto" sairia **inflada, com cara de verdade** — o "números que mentem" do M6 F5. O resto é exato para `count`, `sum` e `avg` (medido: derivado == real), e **não** para `count_distinct`.

Implementado provisoriamente na versão honesta: resto de `count_distinct` sai com `value: null`, `exact: false` e `inexact_reason`, mais o aviso de quantas categorias foram fundidas — a UI mostra o aviso e não desenha barra. **Fork pro Diretor:** (a) manter assim; (b) 2ª consulta só nesse caso (`COUNT(DISTINCT metric) WHERE group_by NOT IN (top-N)`) — exata, custa um scan extra só quando cortou E é distinct; (c) tirar `count_distinct` da v1. Nenhuma trava o resto do código.

## Dívidas registradas no detalhamento da F1 (não são escopo da F1)

- **Coerência de grupo mod × publish:** decisão 12 aceita o gap; a incoerência real é o publish não checar grupo (`main.py:2116/2144`). Fechar num M futuro.
- **Índice de agregação:** NENHUM na F1 — as frentes se cruzaram e **nenhuma mediu em Postgres real**. Perf mediu regressão de 30% com índice em `tenant_id` (500k linhas: 787ms → 1025ms, porque **nada no repo roda ANALYZE** e o planner escolhe o índice inútil) e 3x pior com índice simples na coluna de agrupamento; a outra frente aponta que `dynamic_schema.py:228-229` já cria índice em coluna de usuário e mediu 4-6x de ganho. Escolher agora é chutar — vira follow-up **com medição, depois que o job Postgres existir**.
- **Rótulos de tipo mentirosos** (`_columns.data_type` grava 'INTEGER'/'VARCHAR' no import por SQL, `main.py:1671`): custo de migração é **ZERO agora** — prod tem `_tables`=0, `_columns`=0, zero schemas `tenant_*`, nunca existiu tabela dinâmica lá. A F1 não precisa (lê tipo físico), mas nunca vai ser mais barato consertar.
- **Regra de sombreamento mal documentada:** a regra real é "mesmo método + mesma aridade + registro anterior", **não** "depois da linha 1348". Qualquer rota nova de 2 segmentos com PUT/DELETE sob `/api` é engolida por `/api/{table_name}/{record_id}` (`main.py:1444/1486`) — medido. Precisa virar comentário no código junto do `RESERVED_TABLE_NAMES`.

## Bloqueios de plataforma (ação do Diretor, não de código)

- **`rolbypassrls` em prod — ALERTA:** o publish/preview leem tabela física de tenant com `app.tenant_id` **NÃO** setado (`main.py:2147` e `:2208` usam `get_db`, não `tenant_db`). Só funciona se a role da aplicação bypassa o RLS. Checar: `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;` Se `false`, **o publish já devolve 0 linhas hoje** e o agregado nasceria zerado com cara de verdade. Se `true` (esperado no Supabase), o RLS é defesa contra conexão crua e o plano precisa parar de tratar "reusa RLS de graça" como vantagem.
- **`statement_timeout` de prod desconhecido:** o app não seta nenhum (grep=0) — a resposta está no Supabase (Settings → Database). Até confirmar, o código assume o pior e seta o seu. Sem timeout, agregação pesada segura conexão do pool 5+10 indefinidamente.
- *(As duas leituras de produção foram barradas pelo classificador de permissão nas tentativas do detalhamento; não foram contornadas.)*
- **Suíte em Postgres nunca rodou** (conftest usa `create_all`, não alembic; zero ocorrências de alembic em `backend/tests/`). Antes de prometer "pronto": subir Docker e rodar com `DATABASE_URL` de PG (~15 min). Bônus: acorda 5 testes de RLS parados desde o M3 — justo o RLS que a F1 usa.

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
