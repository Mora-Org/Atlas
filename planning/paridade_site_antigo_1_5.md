# 1.5 — paridade com o site antigo (budismopuc)

> Status: **aprovado, em execução** (20/10/2026, aval do Diretor). Fatia 1 pronta (PR);
> fatias 2 e 3 esperam as decisões abaixo. Pedido do orientador,
> trazido pelo Diretor: "tudo que o site antigo tem e o Atlas não". Site antigo:
> `budismopuc.pythonanywhere.com`; Atlas: `atlas-mora.vercel.app/budismopuc`.
>
> Levantamento em ultracode (20/10): 3 agentes de leitura (site antigo, dados, capacidades
> do Atlas), 1 sintetizador e 1 crítico de completude. Só GET/HEAD no antigo (50
> requisições em série) e em produção; nenhum login. As decisões que mudaram o plano
> estão marcadas com o achado do crítico.

## O que o levantamento achou

1. **Metade do que falta é DADO, não código.** O Atlas tem uma cópia congelada de 13–14/09/2025
   (todo `data_ultima_checagem` nessas datas). O antigo segue sendo editado: 57 fotos de
   perfil (personalidade 36, associação 12, produto 9) e ~60–90 de galeria (extrapolado de
   amostra), 7 registros novos (um de teste, id 133) e 7 apagados. Escola: o banco antigo já
   guarda o nome por extenso; só a nossa cópia ficou em sigla (127/127, 15 códigos).
   **A "tradução de sigla" é uma recarga de dado, não um dicionário.**
2. As fotos só existem no pythonanywhere (~35 MB, faixa 15–45). Se o antigo sair do ar antes
   da cópia, se perdem.
3. Defeitos do antigo que NÃO se copiam: Público-Alvo mostra "Misto"/"Étnico" como
   "Conversão" (detalhe, Excel e filtro comparam `'1'`); filtro de gênero sensível a caixa;
   "Fechamento até" sempre dá zero (0 templos e 0 associações têm data de fechamento);
   `innerHTML` sem escape; links quebrados.

## Fatias (cada uma um PR inteiro; a 3ª carimba `1.5.0`, CLAUDE.md:84)

### Fatia 1 — busca como a do antigo (sem dependência do orientador, exceto D9)

- **Filtro por coluna, explícito** (`ColumnSelection.filter` ∈ `texto | lista | data | nenhum`,
  padrão `texto` = comportamento de hoje). Sem heurística automática: ela mudaria o site de
  todo tenant no próximo republish e ficaria frágil com dado novo (crítico). `data` só em
  coluna `Date`/`DateTime`: fora disso, **422** (nunca rebaixar calado).
- **Faixa "Filtros"** acima da grade com tudo que não é caixa de texto da grade: o select de
  `lista` (opção "Todos" + valores distintos do que se VÊ — FK pelo nome — sem duplicar
  caixa/acento, ordem pelo texto normalizado) e o par **de/até** de `data`; mais o filtro de
  coluna "Só na ficha" (estado, raça, sede, como o antigo). O cabeçalho segue só com caixas
  de texto, como na 1.3 (crítico: um caso de layout a menos, select fora da coluna estreita).
- **Runtime**: `lista` por igualdade do texto normalizado; `de`/`até` comparando o ISO cru
  (`AAAA-MM-DD`); linha sem data sai enquanto o filtro de data estiver ativo. O SSR desenha
  selects e datas; o runtime nunca cria nem reescreve opção (B21).
- **Datas em dd/mm/aaaa** em grade, ficha e SSR (`DateTime` mostra só a data), fatiando o
  texto — sem `Intl`, pra o SSR e o runtime saírem iguais. **Excel leva a data em ISO**
  (ordena; o antigo exportava cru). D9 decide o 01/01: até lá, `01/01/1975` (igual ao antigo).
- **Ordem padrão** por tabela (`sort` ∈ `banco | titulo`): o antigo lista em ordem alfabética
  (crítico). Ordenado no backend, então SSR e runtime não duplicam regra.
- **Mensagem de lista vazia** ("Nenhum registro encontrado com esses filtros.").
- **Subtítulo da tabela**, curado na publicação (`subtitle`, opt-in). A `_tables.description`
  **não** serve: o import grava "Importado de <arquivo>" nela e nenhuma tela edita (revisão B1/SEG-1).
- **Ordem das colunas** da config (setas no Studio), só quando a config lista todas as colunas
  (config parcial de API não faz coluna pular pra frente).
- **Filtro de data exige ISO** nos valores (422 com contagem e exemplo): o rótulo `Date` não
  garante (revisão B2/A1).
- **Excel** com o nome de tela no arquivo (`Templos.xlsx`).
- **Studio**: select **Filtro** por coluna (Data só aparece em coluna de data) e **Ordenar por**
  por tabela.

### Fatia 2 — imagens (depende de D4 pra ter o que mostrar)

Miniatura na grade, foto no topo da ficha, galeria (tabela `imagem_*` que aponta pro registro),
título da aba do navegador com o nome do registro, e `urlDeMidia` reaproveitando
`MANAGED_MEDIA_MARKERS` (`exportStatic.tsx`) — só mídia gerenciada vira `<img>`; URL externa
vira texto (sem pixel de terceiro; crítico). Coluna de mídia fora do Excel e dos impressos.
A cópia das imagens do antigo pra mídia do Atlas é script, com o ok do orientador (D4).

### Fatia 3 — parte institucional (depende de D5–D8, D10)

Rodapé editável no Studio, "acervo em números" na Início (opcional, desligado por padrão),
gráficos nativos no lugar do Power BI, aba Documentos (tabela com coluna de arquivo), rótulo
da tabela na citação, citação do acervo inteiro. Trocar a frase morta do ChartsTab ("Crie uma
na tela de dados…", tela que não existe).

### Fora de código: recarga dos dados (D1, D2, D3)

Script com diff aprovado pelo Diretor antes de gravar: congelar o antigo, recarregar (escola por
extenso, edições, registros novos/apagados), regras de limpeza (D2). Cuidado medido pelo
crítico: data em RFC 1123 na listagem do antigo e ISO nas relações; 502 do pythonanywhere
acordando (retry); sequência de id do Postgres depois de INSERT com id explícito.

## Decisões (status em 20/10)

| # | Decisão | Recomendação | Status |
|---|---|---|---|
| D1 | Fonte da verdade: congelar o antigo, recarregar uma vez, editar só no Atlas | sim | pendente (orientador) |
| D2 | Lixo na recarga (teste 133 fora, vazio não apaga, duplicata entra uma vez, resto em lista) | sim | pendente |
| D3 | Nome da escola: o do banco antigo ("Bön", "Nichiren-shu") | o do banco | pendente |
| D4 | Direito de republicar as fotos (pessoas vivas; o ZIP espalha) | perguntar antes de copiar | pendente (orientador) |
| D5 | Power BI → gráficos nativos + link pro painel antigo | sim | pendente |
| D6 | PDFs: pedir versões novas (markdown cru, e-mail de exemplo, URL que sai do ar) | sim | pendente (orientador) |
| D7 | Rodapé: "© 2025 BD Budismo" no lugar de um CC BY-SA que ninguém concedeu | sim | pendente |
| D8 | Nome do site: "Banco de Dados sobre Budismo na América Latina" | sim | pendente |
| D9 | Data em 01/01 vira "só o ano"? | sim ("1975") | pendente — até lá, dd/mm/aaaa como o antigo |
| D10 | Logos PUC/CNPq em texto | texto | pendente |
| D11 | Raça é dado sensível (LGPD, pessoas vivas): filtro e Excel como no antigo? | perguntar | pendente (orientador) |
| D12 | Tabela `usuario` (tem `senha`) privada já | sim | pendente (escrita em produção) |

## Prova (por fatia; falha antes, passa depois)

Fatia 1: pytest (ida e volta de `filter`/`sort`, 422 de `data` em texto e de valor inválido,
ordem por título com acento, `description` no snapshot); vitest no arnês da 1.4 (opções do select
deduplicadas e com FK pelo nome, filtro de lista e de/até, linha sem data, lista vazia, data em
dd/mm/aaaa igual no SSR e no runtime, Excel com ISO e nome de tela, ZIP com a faixa funcionando
offline); `gate:public` estendido num build de produção. Guardas: os 16 testes do runtime da 1.3,
os 20 da ficha, `exportStatic`, `gate:print`.
