# 1.4.0 — Ficha do registro, relacionamentos e nomes de tela

> Status: **executado → `1.4.0`** (2026-10-20). Pedido do Diretor depois de comparar
> o Atlas publicado (`/budismopuc`) com o site antigo (`budismopuc.pythonanywhere.com`).
> Decisão dele: a entrega ao orientador espera esta versão; "a ficha é a parte mais
> importante". Aval: "loopar até a 1.4". Depende da `1.3.2` (PR #84): a ficha roda no
> `PUBLIC_SITE_RUNTIME`, que até a 1.3.2 morria na hidratação.
>
> Plano auditado em ultracode (8 agentes: 4 auditores por frente + 4 céticos), 53
> achados; as decisões que mudaram o plano estão marcadas com o id do achado.

## O pedido, nas palavras do Diretor

- Ver **fichas e relacionamentos**, "mesmo os que não foram selecionados pra ficar lá em cima".
- Selecionar **quais campos ficam lá em cima**.
- Selecionar **quais campos não ficam em cima mas mostram os relacionamentos**.
- Poder **escolher o nome dos campos na tela**, diferente do nome interno.

## O que o site antigo faz e o Atlas não (medido em 20/10)

| Site antigo | Atlas 1.3.2 | 1.4.0 |
|---|---|---|
| "Ver Detalhes": campos rotulados, texto longo em bloco | nada abre | **ficha** em painel lateral, endereço `#templo/1` |
| Relacionados por nome (personalidades com função, associações) | junção mostra ids | seções de relacionados, com nome e link pra ficha do outro |
| Rótulos ("País", "Escola / Tradição") | nome interno | rótulo por coluna e por tabela |
| Grade com poucas colunas, resto só no detalhe | toda coluna na grade | colocação por coluna: listagem, só ficha, oculta |

As 18 relações many-to-one do paidosett já estão em `_relations` desde a `1.2.0`.

## Modelo

**Por tabela publicada** (item da `table_selection`, campos ADITIVOS):
- `role`: `"aba"` (default) ou `"ficha"` (não vira aba; alimenta fichas e relacionados).
- `label`: nome de tela da tabela. Vazio = nome interno.
- `title_column`: coluna que nomeia o registro. Nunca coluna oculta nem de mídia (SEG-3).
- `columns`: `[{name, label, placement}]`, `placement` ∈ `grade | ficha | oculta`. Coluna **fora da lista** vale `grade` com rótulo = nome (S6) — coluna nova nunca some calada.

Mora na versão de publicação (JSON da `table_selection`): sem migration, congela com o
snapshot, e o Studio já recarrega a versão ativa (`LOAD_DRAFT`). **Declarar os campos no
`TableSelectionItem`** (`role` e `placement` como Literal, `label` com teto) — sem isso o
Pydantic descarta tudo calado (S2/ESQ-1).

Tirar a tabela da seleção apaga a configuração dela; recarregar a página volta à versão publicada (S10).

## Snapshot (`_build_snapshot_payload`)

Por tabela, além do que já vai: `role`, `label`, `key_column`, `title_column` resolvidos; cada coluna com `label` e `placement`. Raiz: `relations`. `schema_version` continua `1` (chaves aditivas).

- **`key_column`** (BE-03): PK física quando ela tem UMA coluna (o builder já reflete a tabela); senão `id` se existir nas linhas; senão a 1ª coluna por `DynamicColumn.id` (o `cols_meta` passa a ter `ORDER BY id`). Serve só pro endereço `#t/k`.
- **`title_column`**: o configurado, se não for oculto/mídia; senão a 1ª coluna que começa com `nome`/`titulo`/`title`/`name`; senão a 1ª coluna `String`/`Text` que não é chave nem FK; senão a chave. FK = `from_column` das relações **emitidas**, nunca `_columns.fk_table` (BE-11).
- **`relations`**: `[{from, from_column, to, to_column}]`, só entre tabelas que **entraram no payload sem erro** (mapa id→nome do próprio loop; nunca `table_ids` crus nem `is_public` — SEG-2/BE-14). Tipo normalizado (`-`→`_`): `many_to_one`/`one_to_one` como estão; `one_to_many` com as pontas invertidas; `many_to_many` fica fora (BE-01/F3). `to_column` NULL (`REFERENCES t` sem coluna) vira a `key_column` do alvo; `from_column` NULL fica fora (BE-04). Deduplicado.
- **`oculta`** some de `columns` e das linhas, **exceto** `key_column` e pontas das relações emitidas: essas ficam nas linhas (fora de `columns`), porque sem elas não há ligação (BE-02/SEG-5). Oculta é curadoria do site publicado, **não controle de acesso**: não vale pra gráficos (agregado de view escolhida pelo admin) nem pra `/public/api/{tabela}` de tabela `is_public` — quem fecha a API é a visibilidade da tabela (BE-05/F11/SEG-1).
- Guarda do publish (S8/BE-14): exige ao menos uma tabela `aba` OU um gráfico (400).

## Site público (PublicSite + runtime; o mesmo texto no site e no ZIP)

- **Adaptadores** (BE-06/F1/S5): `[workspace]/page.tsx` e `exportStatic.tsx` trocam o mapeamento campo a campo por `{...t, table_id: idx}` e passam `relations`. Sem isso tudo morre calado no adaptador (o defeito de classe do B21).
- Abas só pras `aba`, com o rótulo. **Toda tabela publicada embute um** `<script type="application/json" data-atlas-data>`; as `ficha` e as de layout não-tabela num contêiner oculto. Mais um `<script data-atlas-relations>`. O runtime parseia cada JSON uma vez num registro (F6).
- **Grade** (layout tabela): só colunas `grade`, cabeçalho com rótulo; FK mostra o título do registro apontado (resolvido pelo `to_column` da própria relação, chave comparada como texto) e é link; a coluna-título é link pra ficha. Filtro casa com o que se vê. Alvo ausente (fora do recorte) = valor cru, sem link (BE-08/F12).
- **SSR = runtime** (F7): `lib/fichaIndice.ts` (puro) dá o texto exibido e o `href` no SSR; o runtime reimplementa as mesmas ~15 linhas; um teste prova a igualdade com o texto esperado fixado.
- **Excel**: colunas `grade` + `ficha`, cabeçalho com rótulo, FK como nome. Nome do arquivo continua o interno.
- **Ficha**: painel lateral montado em `document.body`, fora do que o React reconcilia (F14). Eyebrow = rótulo da tabela; título = `title_column`; campos `grade` + `ficha` rotulados (vazio não aparece; texto longo em bloco; FK de saída vai pra Relacionados, não pra lista de campos). Fecha no ×, no Esc e no fundo; foco vai pro painel e volta pra origem.
- **Relacionados**: FK de saída ("Rótulo da coluna: Nome", link). Entrada vinda de **junção** (tabela J com ≥2 FKs, uma pra cá): uma seção por outra FK de J, título = rótulo do alvo, itens = nome (link) + colunas visíveis de J que não são FK, como detalhe ("Fundador da Ordem"). Entrada de tabela comum (1 FK pra cá): seção com o rótulo dela, itens = título da linha. Vazias somem. Tabela envolvida truncada → "lista parcial" (BE-08). **Limite declarado** (F2): entidade com 2+ FKs aparece como junção na ficha do alvo.
- **Endereço** (F4/F9): `'#' + tabId + '/' + encodeURIComponent(String(chave))`. Abrir ficha = mudar o hash (empilha); trocar aba = `replaceState` (como hoje). Fechar: `history.back()` se a ficha foi aberta nesta visita; senão `replaceState('#tabela')`. `#t/k` inexistente abre só a aba. Voltar do navegador fecha.
- **Segurança** (SEG-4): todo texto por `textContent`; `href` montado do registro em memória, nunca do hash; hash só como chave de lookup em `Map`, decode dentro de `try`, nada de seletor concatenado, nada ecoado no DOM; mídia na ficha sai como texto (como a grade do runtime já faz).
- **Reentrada** (F8): `iniciar()` desmonta listeners globais da instância anterior (`window.__atlas`).
- Layouts `list`/`grid`/`essay`: título do item usa `title_column` e vira link; meta/resto só colunas `grade` (F10/S9).

## Studio

- **Preview respeita o layout de cada tabela** (S1, era bloqueador): sai o seletor de layout do preview (e a prop `previewLayout`); fica o de viewport. O preview recebe `relations` (S5), então mostra rótulos e FK como nome igual ao site — só não abre ficha (não roda runtime).
- **Debounce de 400 ms** no preview (BE-09/S3): sem ele, cada tecla num rótulo refaz o snapshot inteiro.
- Aba Conteúdo, por tabela: **Aba / Só nas fichas**, **nome na tela**, **nome do registro** (sem opção oculta), e seção recolhível **Campos**: por coluna, rótulo e select **Na listagem / Só na ficha / Oculta**. Layout "Grade" passa a se chamar **"Cartões"** (S9) pra não colidir com "Na listagem". Dicas: "Só nas fichas: não vira aba, mas o dado é publicado inteiro" (PRIV-1); "coluna de ligação oculta some da tela, mas continua no código da página" (SEG-5).
- Presets `editorial` e `acadêmico` passam a ter `default_table_layout: 'tabela'` (S4). Moderno e monástico mantêm cartões/ensaio, que são a identidade deles.
- Vazio (botão não arma) = nenhuma tabela `aba` e nenhum gráfico (S8).
- De passagem (S12): `state.charts` nas dependências do `publishChanges` — editar só gráficos publicava os antigos.

## Impressos

Pulam tabelas `role: ficha` (BE-07/F5/PRIV-1): o panfleto não conta junção como coleção nem soma as linhas dela. Coluna oculta já não chega. Rótulo e ficha nos impressos ficam fora.

## Prova

Falha antes, passa depois:
- **pytest** (rota HTTP, padrão do repo): ida e volta POST `/versions` → GET `/me/active` preserva `role`/`label`/`columns`; 422 pra `role`/`placement` inválidos; `relations` só entre tabelas do payload; admin A com `table_id` de B no preview recebe `relations == []` e nenhum nome de B; `one-to-many` sai invertida, `many-to-many` fora; `to_column` NULL vira a PK do alvo; oculta some de colunas e linhas; chave oculta fica nas linhas; título configurado oculto cai na heurística e o valor não aparece no JSON; coluna fora da lista sai em `grade`; só tabelas `ficha` sem gráfico → 400.
- **vitest, arnês novo** (`// @vitest-environment jsdom`, `renderToStaticMarkup(<PublicSite/>)` no `document.body` + `new Function(PUBLIC_SITE_RUNTIME)()`): FK vira nome na grade (SSR e runtime, texto fixado), no filtro e no Excel; ficha abre por clique e por hash, mostra rotulado, esconde vazio, monta junção com detalhe e tabela-filha; × e Esc fecham; hash malformado/hostil (`#templo/%E0%A4%A`, `#"]<img onerror>/1`, `#__proto__/1`) não lança nem cria elemento; XSS de célula sai como texto; ZIP (`buildStandaloneHtml`) abre ficha.
- **gate:public estendido**: aba + junção `ficha` + alvo; clicar abre ficha; relacionado navega; Voltar fecha; link direto abre; × em link direto não sai do site; bytes do HTML registrados; hidratação e console limpos.

Guardas que já passam (regressão): config antiga sai com `columns`/`rows`/`layout` iguais aos de hoje, só com as chaves novas acrescentadas e valores-padrão; os 16 testes atuais do runtime seguem verdes.

## Produção (budismopuc)

Reconfigurar: abas `templo`, `personalidade`, `associacao`, `produto` em layout tabela; `ficha`: `personalidade_templo`, `personalidade_associacao`, `personalidade_produto`, `templo_associacao` (S11); rótulos do site antigo; ids ocultos. Conferir no ar: a ficha do Templo Zu Lai lista as personalidades com função e as associações.

Ordem do deploy (BE-10): backend antes do frontend — frontend novo com backend velho descarta a configuração calado.

## Fora, declarado

Tradução de sigla, filtro de data e de lista, imagens/carrossel, página de BI, PDFs do site antigo, ficha nos impressos e no preview, aviso de junção não publicada (S11), confirmação ao remover tabela configurada (S10), unificar os tipos `SnapshotPayload` duplicados, select de FK do `/admin/data` (BE-17b, PR à parte).
