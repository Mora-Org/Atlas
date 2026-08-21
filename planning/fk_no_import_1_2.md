# FK no import SQL — `1.2.0`

**Pedido do Diretor (21/08/2026):** "não tem como fazer o Import SQL com FK de um
jeito prático?" — depois de a 1.1 exigir declarar as ligações uma a uma no editor.
E a régua que ele deu junto: **"o mais importante é o que fica no ar, no Postgres"**.

Essa segunda frase mudou o trabalho mais do que a primeira. Ela derrubou o
argumento com que eu tinha recusado a feature no dia anterior ("em SQLite a
constraint seria decorativa") e mandou medir no engine que vale.

## O desenho: a FK vira relação DECLARADA, não constraint física

No import de `.sql`, ao parsear um `CREATE TABLE`:

1. **extrair** as cláusulas `FOREIGN KEY` / `REFERENCES` da árvore;
2. **removê-las** do DDL antes de executar — a tabela física nasce sem
   constraint, exatamente como sempre nasceu;
3. depois que todas as tabelas do arquivo existirem, cada FK vira uma linha
   `DynamicRelation` — a mesma que o `POST /api/relations` grava quando o admin
   declara clicando na 1.1.

Nenhum DDL que mencione duas tabelas chega a rodar. Nenhum `SELECT` roda. O
guard do B13 **não é afrouxado em uma linha** — a remoção reduz a árvore *antes*
da checagem de forma, então a allowlist continua valendo palavra por palavra.

### Por que não a FK física (o "Tier 2")

Auditado com 11 agentes, incluindo 5 atacantes adversariais. A FK física exigiria
reescrever o nome referenciado com o prefixo do tenant, provar que o alvo é do
mesmo dono, ordenar os `CREATE`s topologicamente — e enfrentar dois problemas
reais: FK entre tenants vira **oráculo de existência**, e trava o `DROP` do
vizinho (DoS por dependência). O que se ganharia é integridade referencial de
verdade. Fica registrado como pacote próprio, junto da inferência automática de
relações; não como carona deste PR.

## O que os atacantes acharam (e o que virou código)

Cinco ataques, nenhum leu uma linha de outro tenant. O teto do que acharam é
**nome e disponibilidade**. Dois viraram requisito:

- **A origem tem que ser resolvida por ID, nunca por nome.** `_tables.name` não
  é único entre tenants (`models.py`, `index=True` sem `unique`). O desenho que
  eu tinha descrito ao Diretor gateava só o lado do *alvo*; com o lado de origem
  resolvido por nome, um `.sql` com tabela homônima plantava relação **saindo da
  tabela da vítima** — que então não conseguia mais dropar a própria coluna, e
  não enxergava o motivo (a lista de relações filtra os dois lados e devolve
  vazio pra ela). Hoje o `from_table_id` é o id da `DynamicTable` que o import
  acabou de inserir: a origem é minha por construção.
- **Teto de FKs por statement.** `_relations` não tem unique constraint: um
  `CREATE` com 50 mil cláusulas repetidas viraria 50 mil linhas, e `GET /tables/`
  conta relação por tabela — o inchaço degrada a leitura **de todos os tenants**.
  Teto de 64 por statement, mais dedupe dentro do arquivo e contra o que já
  existe (reimportar não duplica).

E uma armadilha de implementação que os atacantes mediram funcionando: se a
remoção rodar **depois** do `find(exp.Table)`, o `set()` do prefixo muta a árvore
velha e a tabela nasce **sem prefixo**, com o catálogo apontando pra um nome
físico que não existe. A ordem das linhas é parte do fix, e tem teste próprio.

## O que a régua do Postgres revelou (o que este PR fecha além do pedido)

Medir em Postgres, em vez de raciocinar a partir do SQLite, achou três coisas —
duas delas defeitos de produção que estavam no ar:

- **B18 — o import por SQL estava MORTO em produção.** A leitura é em dialeto
  sqlite (é a árvore que a allowlist inspeciona), mas a escrita saía em sqlite
  também: `VARCHAR(100)` virava `TEXT(100)`, e o Postgres responde *"type
  modifier is not allowed for type text"*. Como todo dump de ferramenta declara
  tamanho, qualquer import real morria. **Ninguém viu porque os testes de import
  eram SQLite-only.** Fix: a escrita sai no dialeto do banco que vai executar.
- **Vazamento de tabela entre testes em PG.** O conftest limpava as `t{id}_*` só
  em SQLite; em Postgres elas sobreviviam de um teste pro outro. Era isso que
  tornava o teste de import inviável em PG — e, portanto, o que sustentava o
  skip que escondia o B18.
- **B17 — a tabela importada nasce fora do modelo de isolamento** (registrado,
  não consertado aqui; ver bugfixes).

**O skip `SQLite-only` do import foi removido.** O import por SQL passa a ser
exercido nos dois engines.

## Verificação

- A/B do arquivo novo: **12 falham** sem o fix, **15 passam** com ele.
- A/B do B18 em Postgres: falha antes, passa depois.
- Suíte completa: **451 passed / 5 skipped** em PG (era 416/10) e **442/14** em SQLite.
- Prova com o dado real (dump do paidosett, 18 FKs), nos dois engines:
  dry-run prevê 18 relações → commit cria 17 tabelas, 18 relações, **0 erros**,
  **0 constraints físicas**, e `/api/templo` devolve as 127 linhas.
