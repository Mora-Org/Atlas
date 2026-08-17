# 🛡️ Relatório de Cibersegurança (Red Team)

Este documento registra as vulnerabilidades encontradas ativamente durante as fases de testes de segurança, antes da execução plena de features, conforme definido no fluxo de arquitetura do Diretor. Serve de backlog e guia de implementação para os programadores (Claude e equipe).

---

## 📅 [29/03/2026] Milestone 2 - Fase 1: Importação SQL Avançada

### 🎯 Alvo: Endpoint de Importação Roteada (`POST /api/import/sql`)
Durante a fase de Red Teaming no parsing de arquivos `.sql`, testamos a mecânica atual que utilizava `sqlparse` e `re.sub()` (Expressões Regulares) para injetar o tenant (prefixo `t1_`) no nome da tabela.

### 🐛 Vulnerabilidade Crítica Encontrada: SQL Piggybacking & AST Injection
O uso de expressões regulares para sanitizar e prefixar nomes de tabelas é falho sob ataques ativos:
1. **Piggybacking de Drop:** O parser regex captura apenas a primeira ocorrência do NOME da tabela e reconstrói a query. Se o atacante enviar `CREATE TABLE users (id int); DROP TABLE master_users;`, a regex processa a primeira parte (substituindo `users` por `t2_users`), mas o SQLite acaba executando toda a string inteira, concretizando o `DROP` ou outras injeções de DDL na mesma chamada do `engine.execute`.
2. **Comment Bypass:** Manipulações como `CREATE TABLE vulneravel /* DROP TABLE admins; */ (id int)` também contornam as validações ingênuas de regex, causando estragos de privilégios e violação do Tenant Isolation.

### 🛠️ Plano Estrutural para o Programador (Claude)
Para garantir execução atômica e 100% isolada na Engine Virtual do CMS, a arquitetura de string match deve ser substituída por Parsing e Mutação de **AST (Abstract Syntax Tree)** usando a biblioteca `sqlglot`:
1. Instalar `sqlglot`.
2. Utilizar `sqlglot.parse(sql, read="sqlite")` para desmembrar a query em nós atômicos.
3. Isolar o nó de Tabela (`stmt.find(exp.Table)`), trocar programaticamente o `Identifier` (nome da tabela) pelo `physical_name` prefixado.
4. Renderizar a string limpa novamente com `stmt.sql()`, o que automaticamente varre qualquer "sujeira", múltiplos statements encadeados e piggybacking, pois a AST cospe a visualização pura daquele único Node válido.
5. **Atenção (Crash Notado na PoC):** A prova de conceito do Antigravity modificou o `main.py` mas causou aproximadamente 20 quebras no `pytest` (`test_import.py`, etc). **Sua missão como programador (Claude)** será finalizar a adaptação do AST no `main.py` consertando a quebra dos testes e lidando com os corner-cases do `sqlite` na exportação do `sqlglot`.

*(Antigravity - Planejador)*

---

## 📅 [15/06/2026] M-Ops — Observabilidade + Confiabilidade

> Oficialização do backlog de segurança levantado no M-Ops. A **fonte única** dos
> smells compartilhados do backend continua sendo
> [`milestone_ops_observabilidade.md`](./milestone_ops_observabilidade.md); esta
> seção consolida o lado de segurança com status e dono, pra parar de viver só em
> memória/followups fora do repo. Achados via auditoria de `backend/main.py` no M-Ops.

### ✅ Corrigidos no M-Ops (em `main`)

| Achado | Risco | Fix |
|---|---|---|
| **Ownership ausente em `/api/relations`** | Qualquer tenant criava/deletava relações de qualquer outro (cross-tenant). Achado do painel do M7. | `POST`/`DELETE` passam a checar ownership da relação contra as tabelas acessíveis do tenant. `c57b819`, +3 testes. |
| **Seed `testadmin` com senha hardcoded em prod** | `main.py` seedava `testadmin`/`TestAdmin123!` em produção se `SKIP_TEST_SEED` não estivesse setado no Railway — conta com credencial conhecida viva em prod. | Guard por `ENABLE_TEST_SEED`: não seeda em postgres sem opt-in explícito. `74dcf7b`, +4 testes. |
| **CORS `*` fixo no código** | Wildcard de origem hardcoded, sem como fechar em prod. | `CORS_ORIGINS` por env (default `["*"]` mantido em dev; prod fecha o wildcard setando a var). `74dcf7b`. |
| **Backend mudo (sem observabilidade)** | Prod caiu em 11/06 (Supabase auto-pause) e ninguém soube — `GET /` respondia 200 sem tocar o banco. | `/health` que toca o banco + logging estruturado + exception handler global + Sentry condicional (`SENTRY_DSN`). `a0ecf11`, `1be3999`. |

### ✅ Corrigido no M9 (em `main`)

| Achado | Risco | Fix |
|---|---|---|
| **B7 — `revoke_permission` sem checagem de dono** (2026-08-04) | Cross-tenant: admin de qualquer tenant revogava permissão de moderador de outro, sabendo só `group_id` e `mod_id`. Não vaza dado — **derruba acesso alheio**. Mesma classe do gap de `/api/relations` fechado no M-Ops; os irmãos `grant_permission`/`delete_database_group` já checavam. | Grupo resolvido e checado **antes** da busca da permissão (a ordem importa: depois, o 404 ainda contaria se a permissão existe). Master preservado. 4 testes com 2 tenants reais + prova A/B. `0.8.2`. |
| **Achado por instrumentação, não por varredura** | — | O audit da M9 F1 obriga cada mutação a responder "de quem é esse dado?" pra saber em qual trilha gravar — e essa pergunta **é** o teste de ownership. Vale como método: instrumentar handler sem dono resolvível é sinal de gap de autorização. |

## 📅 [14/08/2026] Auditoria do banco de produção — o achado da 1.0

> **Medido no Supabase de produção** (projeto `deokbodyzegakcjtjpdd`, PG 17.6),
> não deduzido. Todas as consultas foram `SELECT`; nenhuma escrita foi executada.

### 🔴 A RLS do M3 está desligada em produção — `1.0.1`

A aplicação conecta pelo Supavisor como **`postgres`**, e esse role passa por
cima da RLS por **duas rotas independentes**:

| rota | evidência |
|---|---|
| atributo | `rolbypassrls = true` em `pg_roles` |
| posse | dono das **15** tabelas de `public`, e `relforcerowsecurity = false` em todas |

O `FORCE ROW LEVEL SECURITY` **não cobre isso**: `FORCE` faz a policy valer para
a *dona* da tabela; `BYPASSRLS` é atributo de role e ignora RLS de qualquer jeito.
O `milestone_3:673` justifica o `FORCE` dizendo que "o pooler frequentemente
conecta como superuser" — está certo no espírito e errado no mecanismo (`postgres`
tem `rolsuper = false`; o bypass vem do atributo).

**Consequência:** o que separa tenants hoje é o backend setar o GUC a cada
request. Isso é código, não banco — e era exatamente a premissa que o M3 existiu
pra derrubar ("o backend deixa de ser o único guardião").

**Risco hoje: zero.** Produção tem **0 schemas `tenant_N`**, `_tables` = 0 e
`users` = 1 linha. A janela fecha quando o primeiro workspace criar uma tabela.

**Tamanho medido**, com a suíte rodada contra uma role `NOSUPERUSER NOBYPASSRLS`:
**422 de 430 testes passam**. Quebram dois, de naturezas opostas — um teste
obsoleto (a premissa dele foi invalidada pelo fix do B10) e uma feature real
(agregação sobre tabela pública de outro workspace, decisão #8 do M8.5), que tem
conserto com precedente no repo (`public_tenant_db` seta o GUC do **dono**, não
do leitor).

⚠️ **Armadilha que o teste local escondeu:** lá o `alembic` rodou como a role
nova, que virou **dona** — e dona é isenta quando `FORCE` está desligado. Em
produção o dono é `postgres`. Trocar só o `DATABASE_URL` derrubaria a aplicação
no primeiro request. O runbook precisa de transferência de posse **antes** do
corte.

### 🟠 `anon` e `authenticated` têm DML total nas 15 tabelas de sistema

```
users, _api_keys, _audit_log, …  |  anon          | DELETE,INSERT,SELECT,TRUNCATE,UPDATE,…
                                 |  authenticated | idem
```

E `anon` é a chave **pública** — vai no bundle de todo visitante do site.

**Não é brecha ativa:** com `policies = 0`, a RLS nega `SELECT`/`DELETE` via
PostgREST — verificado com a própria anon key (devolve `[]`). E `TRUNCATE`, que
a RLS **não** filtra, não é exposto por HTTP pelo PostgREST.

**Mas é camada única.** No dia em que alguém criar uma policy em qualquer dessas
tabelas por um motivo legítimo, o `anon` herda o grant inteiro que já está lá.

**Conserto de três linhas, sem impacto** — o Atlas nunca usa o PostgREST (o
`supabase-js` só faz auth; Storage vive no schema `storage`):

```sql
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
-- rollback: GRANT ALL ON ALL TABLES/SEQUENCES IN SCHEMA public TO anon, authenticated;
```

### ✅ O que a auditoria descartou

- **Tabelas legadas `t{N}_` soltas em `public`**: nenhuma. (No banco local havia
  uma — resíduo de teste, não incidente.)
- **Tabelas de sistema legíveis pela anon key**: não. RLS sem policy nega.
- **`pg_cron` / `pg_net` rodando algo do Atlas**: não estão instalados.
- **Produção atrasada em migration**: não — está em `f3a80c5d1e97`, a do PR #68.

---

### ⏳ Risco aceito conscientemente — rotação adiada

| Segredo | Exposição | Decisão |
|---|---|---|
| **Senha do Postgres (Supabase)** | Exposta em chat (registro de 2026-05-17). | Rotação adiada (Diretor, 2026-06-13). Segue exposta — risco aceito. **A referência original dizia "pós-M10"; com o M10 virando `1.1`, o gatilho passa a ser o kickoff da `1.0.1`** (a troca de role mexe em credencial de banco de qualquer jeito — é a mesma janela). |
| **Key do TestSprite** | No histórico do git (`testsprite_tests/tmp/config.json`). | Idem. |
| **`service_role` do Supabase** | Colada em `backend/.env` (gitignorado) em 14/08 e, por consequência, presente no transcript local daquela sessão. | Não vazou pro repositório (verificado). Rotacionar exige atualizar o Railway no mesmo movimento — juntar com a `1.0.1`. |

> ⚠️ Enquanto não rotacionado, qualquer pessoa com acesso ao histórico do chat/git
> tem essas credenciais. A coordenação da rotação exige ação do Diretor nos
> dashboards (sem config declarativa no repo).

### 🔓 Backlog aberto — com dono, fora do escopo do M-Ops

| Achado | Risco | Dono / quando |
|---|---|---|
| ~~**f-string SQL no nome da tabela**~~ | ⚠️ **ESTE ITEM EXAGERAVA — corrigido em 2026-08-07.** Ver "Retificação" abaixo. | — |
| ~~**Sem trava de palavras reservadas em `POST /tables/`**~~ | ✅ **RESOLVIDO na M9 F4.** | — |
| **CORS `*` + credentials** | Com `CORS_ORIGINS` ainda em `*` por default e `allow_credentials=True`, a combinação é permissiva. Mitigado em prod ao setar `CORS_ORIGINS` real. | Endurecer o default quando o front tiver origem fixa conhecida em prod. |

### 📅 [07/08/2026] M9 F4 — fronteira: o nome da tabela

#### Retificação: NÃO havia injeção de SQL pelo nome da tabela

Este documento afirmava que a interpolação por f-string em `dynamic_schema.py`
era "superfície de injeção". **Medido com sonda, é falso** — e registrar isso
importa, porque uma milestone inteira poderia ter sido gasta consertando o que
já estava protegido:

- o **CREATE** monta a tabela via `Table(...)` do SQLAlchemy, que escapa o
  identificador. O payload `x" (id int); DROP TABLE users; --` virou o **nome**
  de uma tabela, não comando;
- os **ALTER/DROP** passam por `_quote_ident` (`dynamic_schema.py:220`), que
  rejeita aspa dupla e NUL levantando `ValueError`;
- prova direta: com a tabela hostil criada, `users` continuou existindo.

**O risco real era outro, e o documento não o via.** Como `TableBase.name` não
tinha validação nenhuma, a tabela com aspa no nome **nascia indeletável**: o
`_quote_ident` levantava `ValueError` não tratado no DELETE → **500 pra sempre**.
Tabela zumbi, ocupando nome e aparecendo na listagem. Não é vazamento — é dado
que não se consegue mais remover, o que é ruim por outro motivo.

Lição de método: "tem f-string em SQL" é indício, não veredito. O que decide é
o que a string contém quando chega lá, e isso se mede.

#### ✅ Corrigido nesta fase

| Achado | Risco | Fix |
|---|---|---|
| **`POST /tables/` aceitava qualquer nome** | Medido: vazio, 200 caracteres, unicode, espaço, hífen, começando com dígito e com aspas — **todos 200**. As duas portas discordavam: o import de planilha sanitizava (`^[a-z][a-z0-9_]*$`), o endpoint não validava nada. | Régua única em `schemas.validate_table_name` aplicada nas 3 portas (endpoint, import de planilha, import por SQL). Cap de 63 = limite de identificador do Postgres. |
| **Trava de reservados incompleta e furada (B5)** | Só cobria `assets`, e o **import por SQL criava `DynamicTable` sem passar por trava nenhuma** — bastava um `.sql` pra contornar. Tabela homônima de rota literal fica inacessível. | Lista **computada das rotas do app montado** (`_compute_reserved_table_names`), não escrita à mão: rota nova entra sozinha. Aplicada também no import por SQL, com erro por-statement (o import é parcial por desenho). |
| **`CORS_ORIGINS` vazio em produção** | `*` com `allow_credentials=True`. | **Aviso alto no startup**, não fechamento automático: fechar por conta própria derrubaria um frontend que hoje depende do default — quebrar o site pra corrigir configuração é pior que a configuração errada. |

**Precisão que evitou exagero:** só literal de **1 segmento** sombreia. `views`,
`keys`, `webhooks` e `publications` têm rota de 2+ segmentos e **não** conflitam
(o probe do M8.5 F1 já tinha medido isso pro "views"). Reservá-los proibiria
nome legítimo à toa — tem teste garantindo que continuam permitidos.

### Não-objetivos (continuam fora)

- Audit log, API keys, webhooks, rate limiting → fundação de eventos é o **M9**.
- Redesign da rota dinâmica (prefixo `/api/data/`) → backlog de armadilhas.

*(Claude — Programador)*
