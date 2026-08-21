# Site público navegável — `1.3.0`

**Pedido do Diretor (21/08/2026),** depois de comparar o Atlas com o site atual dele
(`budismopuc.pythonanywhere.com`, que tem uma aba por tabela): o site publicado
precisa de **abas de navegação, filtro por qualquer coluna e export pra Excel do
que foi filtrado**. Retrato congelado continua ok. PDFs e Power BI ficam de fora
de propósito — "as pessoas que montem depois".

## Decisões já fechadas com o Diretor

1. **Abas:** "Início" (capa + gráficos) + uma aba por tabela. É o formato do site atual dele.
2. **O ZIP também leva JS.** O contrato "script-free" do M6 **cai** nesta versão — decisão explícita dele, ciente de que dobra o trabalho. O ZIP passa a ter as mesmas abas, filtro e export.
3. **Teto de linhas sobe** de 2.000 e a visualização passa a **paginar**; o export leva o dado completo do snapshot, não só a página visível.

## Desenho

**Uma implementação, não duas.** A interatividade é escrita **uma vez em JS puro**
(sem React) e usada nos dois contextos. Motivo: o `PublicSite` precisa continuar
renderizável em 3 contextos (Studio, RSC público e `renderToStaticMarkup` do
export) — se a interatividade virasse componente `'use client'`, o export
quebraria. Com JS puro atacado por cima do mesmo HTML, o markup continua idêntico
nos três lugares e o comportamento é o mesmo no site e no ZIP.

- **Abas:** `Início` + uma por tabela. Sem JS (ou antes do script carregar) a
  página degrada pro empilhado de hoje — ninguém fica sem o dado.
- **Filtro:** uma caixa por coluna no cabeçalho da tabela, casando por texto
  (case-insensitive, sem acento). Combina entre colunas com E.
- **Excel:** SheetJS (`xlsx`, **já é dependência**; `xlsx.mini` = 245 KB e escreve
  `.xlsx` de verdade — medido). No site hospedado entra por import dinâmico, então
  só pesa quando alguém clica. No ZIP vai embutido.
- **Paginação:** a aba mostra N linhas por página; o export ignora a paginação e
  leva tudo que está no snapshot (respeitando o filtro ativo).

## Teto de linhas — medido, não chutado

Com o acervo real do Diretor, o snapshot custa **~491 bytes por linha** (JSON
repete a chave em cada linha):

| teto por tabela | peso por tabela |
|---|---|
| 2.000 (hoje) | 0,9 MB |
| **10.000 (proposto)** | 4,7 MB |
| 25.000 | 11,7 MB |
| 50.000 | 23,4 MB |

**Fechado com o Diretor: 10.000 por tabela** (5× o de hoje), com seletor de
**25 / 50 / 100** linhas por página na visualização (default 25). O **xlsx sempre
leva todas as linhas que casam com o filtro**, nunca só a página visível.

**Passar de 10.000 dispara aviso, não corte calado.** Palavras do Diretor: acima
desse volume "vale mais a pena a pessoa ter uma base própria ou falar comigo pra
ter uma informação desse nível". O Atlas publica acervo; não substitui banco de
produção. O aviso aparece no Studio (antes de publicar) e o payload carrega
`truncated` + `total_rows`, que já existiam e nunca mentiram o tamanho. O snapshot é um blob único com TODAS as tabelas — o RSC busca ele
inteiro a cada revalidação e o ZIP o carrega junto, então o teto por tabela não é
o único limite que importa: 17 tabelas cheias no teto novo dariam ~80 MB. Por isso
entra também um **orçamento total de snapshot**, que para de acrescentar linhas
quando estoura e **declara no relatório** o que ficou de fora (o `truncated` e o
`total_rows` já existem no payload e nunca mentiram o tamanho — isso se mantém).

## Verificação planejada

- Teste do runtime de JS puro: abas trocam, filtro casa por coluna e combina, export respeita filtro.
- **XSS:** o dado do tenant passa a ser embutido como JSON num `<script type="application/json">`. Escapar `</script>` é obrigatório — hoje o React escapa tudo por nós, e essa proteção some quando o markup é montado à mão. Teste com nome de tabela e valor de célula contendo `</script>` e `<img onerror>`.
- Gate do M7 e os testes de export/publicação seguem verdes.
- Prova com o acervo real: publicar o paidosett e navegar as 17 abas, filtrar `templo` por `estado`, exportar e abrir no Excel.
