# 🧬 Milestone 7 — Schema Visualizer

> **Status:** ✅ Implementado — PR1–PR4 código-completo (fecha após o gate Playwright; ver [milestone_7_visualizer_plano.md](milestone_7_visualizer_plano.md))
> **Vem depois de:** M5 fechado, M3 fechado, M6 fechado
> **Tamanho relativo:** pequeno (menor de Faixa 1)

Documento de **alinhamento de visão**. Decisões técnicas (qual lib, layout exato, quais interações) são tomadas na implementação.

---

## O problema

Em databases pequenos (< 5 tabelas), você consegue mentalizar como elas se conectam. Em databases reais (10, 20, 50 tabelas com FKs), isso vira impossível. O admin precisa abrir tabela por tabela, olhar a aba de relações, anotar de cabeça quem aponta pra quem.

Hoje o sistema **tem** os dados pra desenhar isso (`_relations` desde M2), só falta uma tela que renderize.

Pedido literal do Diretor: *"o projetar já está ok eu só adicionaria um jeito da pessoa poder ver como as tabelas se conectam e afins, sabe um painelzão seria bom"*.

---

## O que essa milestone entrega

Uma rota `/admin/schema` (ou nome similar) que mostra:

- Cada tabela como um **bloco visual** com suas colunas e marcadores de chave (PK / FK).
- **Linhas** ligando colunas FK à tabela referenciada.
- **Layout automático** inicial — o admin não precisa arrumar nada pra ver algo razoável.
- **Interação básica**: clicar numa tabela mostra detalhes + atalhos pra "Ver dados" e "Editar schema".
- **Export visual** — PNG ou SVG pra colar em apresentação / documentação.

Estética coerente com o resto do Atlas (Mora editorial, não "SaaS técnico genérico").

---

## Princípios invioláveis

1. **Reuso de dados.** Não cria endpoint novo. `GET /tables/` já retorna colunas e relações.
2. **Performance é critério de sucesso.** Tem que renderizar suave até ~100 tabelas. Acima disso é caso degenerado.
3. **Read-only por default.** Edição de schema continua em `/admin/tables/create`. Click no diagrama leva pra lá; não edita inline.
4. **Visual editorial.** Não copia a estética genérica de ferramentas de ERD. Usa primitivos Mora (Card, Eyebrow, Hairline, Pill, tokens).
5. **Funciona offline depois de carregar.** É só renderização — não precisa de polling nem subscribe.

---

## Fases (alto nível)

| # | Marco | Por que precisa |
|---|---|---|
| 1 | Decidir lib + spike | Diagramas interativos não se faz à mão. Validar a escolha antes de gastar dias. |
| 2 | Render básico funcionando | Já entrega 80% do valor: ver as conexões |
| 3 | Interação + export | O outro 20%: aprofundar e levar pra fora |

Polish editorial pode ser uma sub-fase ou diluído em todas as fases — decidir na hora.

---

## Decisões em aberto (perguntar ao Diretor antes da Fase 1)

- **Tabelas de sistema (`_tables`, `_columns`, `users`) aparecem no diagrama?** Tendência: não por padrão, com toggle pra mostrar.
- **Layout salvo onde?** Por usuário (cada admin organiza do seu jeito) ou por workspace (time inteiro vê o mesmo)? Tendência: por usuário no localStorage; "salvar como layout do workspace" fica pra futuro.
- **Cardinality nas linhas (1:1, 1:N, N:N)?** Tecnicamente correto, mas pode poluir. Tendência: começar sem, adicionar se sentir falta.
- **Filtro / busca?** Em databases grandes, search é essencial. Em pequenos é overkill. Tendência: incluir mesmo assim, é barato.
- **Tabelas órfãs (sem FK pra nem de ninguém)?** Mostrar isoladas no canvas ou ter uma seção separada? Tendência: isoladas no canvas, mas verificar se fica feio.

---

## Riscos

- **Lib escolhida pode ser exagerada** (resolve N coisas que a gente não precisa) ou **insuficiente** (precisamos custom node editorial e ela não permite). Por isso a Fase 1 é spike.
- **Auto-layout em databases grandes vira spaghetti.** Algoritmos de auto-layout pra grafos têm limites. Plano B: força bruta + drag manual + persist.
- **Performance em 100+ tabelas.** Pode precisar de virtualização ou carregamento lazy. Mensurar antes de assumir que tá OK.

---

## Critério de sucesso (alto nível)

1. Admin abre `/admin/schema`, vê todas as tabelas e como se conectam, sem precisar configurar nada.
2. Em workspace com 20+ tabelas, ainda é navegável (zoom, pan, search).
3. Click numa tabela leva pra ações rápidas (ver dados, editar schema).
4. Layout que o admin reorganizou continua igual quando ele volta na tela.
5. Botão de export funciona — gera arquivo de imagem usável.

Não-objetivos:
- Edição de schema dentro do diagrama (inline rename, drag pra criar FK, etc.)
- Multi-workspace na mesma view (admin só vê o seu)
- Versionamento do schema ("snapshot do schema em X data")
- AI suggestions ("você esqueceu de criar essa FK óbvia")

---

## Dependências

- **Bloqueia:** nada.
- **Bloqueado por:** ideal ter M5 (primitivos UI maduros) + M3 (schema final, evita refatorar a tela quando RLS chegar). M6 não bloqueia diretamente, mas faz sentido vir depois.
- **Sinergia com:** M11 (futuramente IA pode sugerir FKs faltando vendo o diagrama).
