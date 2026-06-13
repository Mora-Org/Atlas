# M8.5 — Views, Gráficos & Impressos

> **Status:** 🟡 DRAFT pra rebate (ultracode 2026-06-12) — NÃO executar. Decisões abertas pendentes do Diretor.
> Smells compartilhados do backend: inventariados no [plano do M-Ops](milestone_ops_observabilidade.md) (fonte única).

## O problema

O Atlas só sabe mostrar dado de um jeito: tabela que vira texto. O renderer público reduz cada row a title/meta/rest via `String()`, o DataViewer baixa a tabela inteira e filtra no cliente, e **não existe uma agregação server-side em endpoint nenhum** — as únicas agregações do backend são contagens de rows (func.count em main.py:811 e 1265, mais um COUNT(*) raw em main.py:619). Quem quer responder "quantos X por categoria, comparando recorte A com recorte B" exporta planilha e faz fora. O pedido do Diretor é exatamente esse: usuários (inclusive visitantes do público) montarem gráficos comparativos — e hoje isso agregaria client-side sobre o dump completo de uma rota sem paginação, o que não escala e mente em tabela grande.

A segunda dor é a saída física: o dado publicado não vira material de divulgação nem citação. As ferramentas já estão pagas: **recharts 3.8.0, jspdf 4.2.1 e html2canvas 1.4.1 instaladas e usadas só em `frontend/src/components/widgets/` — código que nenhuma página importa**. M8.5 transforma arsenal ocioso em produto.

## O que entrega

O admin define views salvas (recorte + agrupamento persistidos no backend — hoje a única "view" é viewMode/density em localStorage), o backend agrega respeitando o RLS por tenant, um chart builder monta gráficos "filtro A vs filtro B" com estética Mora, o gráfico vai pro público sob a regra que o rebate decidir (congelado com o snapshot ou exceção viva), e dois impressos saem dos mesmos gráficos: **panfleto editorial** (números grandes, cores Mora) e **versão acadêmica** (sóbria, fontes citadas). Gate Playwright padrão em tudo.

## Fases

| Fase | Entrega |
|---|---|
| **F1 — Agregações server-side + views salvas** | Capacidade de agrupar/somar/contar que não existe, respeitando o GUC/RLS por tenant (mesmo trilho do resto). A rota pública é o template (filtro/search/sort/paginação prontos); a superfície exata (endpoint novo vs extensão da rota dinâmica) é decisão aberta. Nasce a view salva persistida — absorve formalmente o "Saved views/queries" do backlog. |
| **F2 — Chart builder: A vs B + embed no público** | UI pra gráfico comparando dois recortes sobre views/agregações da F1 (recharts, hoje só no widget órfão). Embed no público **estende o mecanismo de versionamento de snapshot que o M8 F3 introduz — não cria outro**. Esbarra na decisão snapshot vs live, que condiciona o desenho inteiro. (O preview do Studio com `tables={[]}` é resolvido pelo M8 F3, que bate nessa parede primeiro.) |
| **F3 — Impressos: panfleto + acadêmico** | Dois artefatos imprimíveis consumindo os gráficos. **O locus de geração sai da decisão aberta 5 (spike no início da fase)**; SE client-side, a lógica dos 4 exports do WidgetWrapper órfão é o template a reaproveitar (visual hardcoded fora do design system — reescrever). Jurisprudência M6 F5 integral: PDF congela dados → aviso de truncamento pré-geração + nota honesta no artefato + hardening como marco. |

## Dependências

- Sequência decidida 2026-06-12: M-Ops → M8 → M8.5. A **paginação do M-Ops é fundação direta da F1** (mesma rota/dados). M8 não bloqueia tecnicamente; a ordem é por UX conjunta mídia+gráficos — e a F2 estende o versionamento de snapshot do M8 F3.
- **Bloqueia M10:** os live charts são camada sobre os gráficos daqui — e a F4 do M10 precisa que **gráfico salvo persista como artefato consultável no admin** (ver decisão aberta 4; recomendação do painel: persistir).
- Libs pagas: recharts/jspdf/html2canvas. Plano fecha sem dependência nova; se surgir, jurisprudência de spike + budget do M7.
- M7 PR4 pausado é a primeira execução da volta — M8.5 não atropela nem duplica (export PNG/DDL do canvas é dele).

## Riscos

- **recharts × export estático:** PublicSite renderiza via renderToStaticMarkup e o ResponsiveContainer depende de medição client-side — gráfico no público/export exige dimensões fixas ou SVG pré-renderizado. Risco de quebrar o pipeline de export do M6 se a F2 não for desenhada pros 3 contextos.
- **Números que mentem:** snapshot trunca em 2000 rows. Gráfico agregado sobre rows truncadas exibe total errado com cara de verdade — versão visual do "o ZIP congela mentiras" do M6 F5. Decisão aberta 2 resolve.
- **F1 sobre fundação em movimento:** se o M-Ops mexer na rota dinâmica em paralelo, a superfície de agregação nasce desalinhada — coordenar.
- **Fidelidade de impressão:** html2canvas rasteriza — tipografia Mora pode degradar no PDF; o precedente woff2 mostra que o Diretor não aceita tipografia infiel. Pode forçar o spike da decisão 5 pro lado server.
- xlsx 0.18.5 com CVEs conhecidas se os exports tabulares dependerem dela — verificação já incluída na F2 do M-Ops.

## Decisões abertas

1. **Gráfico no público: congela com o snapshot ou exceção de dado vivo?** (a decisão registrada no roadmap.md:83.) O princípio do M6 é "snapshot, não live" — congelar mantém coerência versão↔dados e o export ZIP de graça; vivo dá frescor mas quebra o princípio, exige agregação pública sem auth e antecipa o M10 por baixo dos panos. Condiciona a F2 inteira.
2. **Se congela: agregados computados na publicação sobre o dado completo, ou derivados das 2000 rows truncadas do snapshot?** Computar na publicação = número verdadeiro + segundo tipo de conteúdo no snapshot; derivar = zero mudança no pipeline, mas gráfico mente em tabela grande — e artefato que mente sem aviso é inaceitável desde o M6 F5.
3. **Superfície da agregação na F1:** endpoint próprio (isola o GROUP BY, mais superfície pra manter) ou extensão da rota dinâmica (reusa guards/RLS, mas engorda rota que o M-Ops acabou de paginar)? E quem coordena a fronteira com o M-Ops.
4. **View salva: do usuário ou do workspace? Moderador vê/cria? E ela é o insumo formal do chart builder (gráfico = view + encoding)?** A relação view→gráfico define se a F2 constrói sobre a F1 ou se são irmãs. **Atenção de arco:** a F4 do M10 (live charts) só existe se o gráfico persistir como artefato consultável no admin — se o rebate decidir "builder ad-hoc sem persistência", o M10 perde o substrato. Recomendação do painel: persistir.
5. **Locus dos impressos: client-side (libs prontas, lógica provada no widget órfão) ou server-side (PDF vetorial de qualidade, mas o backend não tem nada disso)?** Spike curto no início da F3 decide por evidência; o critério de qualidade aceitável é do Diretor.
6. **Os impressos conversam com o export ZIP/backlog de pacotes, ou são fluxo separado?** O backlog_export_pacotes.md segue sem dona e os itens 2-3 exigem rediscussão de fit antes de qualquer absorção — decidir aqui evita crescer por arrasto.

## Fatos-âncora

- Únicas agregações do backend: contagens (func.count main.py:811, 1265; COUNT(*) raw main.py:619). Rota autenticada sem paginação; pública com template completo (ver M-Ops).
- recharts/jspdf/html2canvas usadas SÓ em código órfão: BarChartWidget.tsx:3, WidgetWrapper.tsx:4-6 — nenhuma página importa `widgets/`. WidgetWrapper já implementa JPEG/PDF/XLSX/CSV (18-59) com visual hardcoded (bg `#171717`).
- Única persistência de visualização: viewMode/density em localStorage (data/[table]/page.tsx:48-58). Nenhuma view no backend.
- Snapshot schema_version:1 = columns+rows (frontend/src/app/[workspace]/page.tsx:6-22); truncamento 2000 com total_rows real registrado (publication_storage.py:44; main.py:1257-1268).
- PublicSite puro, 3 contextos, renderToStaticMarkup no export (frontend/src/components/publish/PublicSite.tsx:1-5; exportStatic.tsx:123,134).
- RLS por GUC é o trilho obrigatório das agregações (tenant_context.py:47-65; main.py:410-460).
- Gates visuais consolidados como template: validate-schema/cover/export-browsers.mjs (matriz 2×4, budgets, console=fail).

## Não-objetivos

- Gráficos realtime/live — M10 (decisão 2026-06-12; estático primeiro).
- Mídia/upload/column types — M8. M8.5 só consome dado tabular.
- Paginação como entrega — M-Ops; a F1 nasce em cima, não implementa.
- Export PNG/SQL DDL do canvas — M7 PR4, pausado e primeiro da fila.
- Pacotes de export do backlog — sem dona; itens 2-3 exigem rediscussão de fit ("headless CMS, não gerador de codebase").
- Dashboard livre com grid arrastável — fora do escopo comprometido (react-grid-layout instalada com @types v1 incompatíveis — verificação pendente SE um dia entrar).
- Computed/formula columns — backlog.
