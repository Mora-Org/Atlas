# 🐛 Bugfixes

Registro de correções de bugs realizadas pela equipe. 
Cada entrada deve conter a data, a descrição do bug e como foi resolvido.

## Histórico

### Bugs Conhecidos (Resolvidos no Milestone 1)
- **Problema**: `NameError` devido à falta da importação de `String` no `backend/main.py`. Quebra endpoints de busca da API pública.
  - **Status**: ✅ Resolvido (Adicional ao import, refatorado schema dinâmico).
- **Problema**: `login/page.tsx` quebrando no Next.js App Router por falta da diretiva `"use client"`.
  - **Status**: ✅ Resolvido.
- **Problema**: Operações CRUD das tabelas dinâmicas incompletas (Faltando endpoints/lógica para `PUT` e `DELETE`).
  - **Status**: ✅ Resolvido (Backend API e Frontend UI criados).
- **Problema**: Logs de falha reportando erros ao testar autenticação e acessos (QR Login incluído).
  - **Status**: ✅ Resolvido (Testes fixados com `StaticPool` em banco temporário, 30/30 Testes passando).

---

### Bugs Encontrados via TestSprite (Milestone 2 — 2026-03-26)

- **BUG-TS01 — `GET /tables/` retorna 500 com banco pré-existente**
  - **Causa**: `_safe_migrate` adicionava a coluna `owner_id` como `INTEGER` (nullable) mas não fazia UPDATE nos rows já existentes. `TableResponse.owner_id: int` (non-optional) causava falha de serialização Pydantic → FastAPI retornava 500.
  - **Arquivos afetados**: `backend/main.py` (`_safe_migrate`), `backend/schemas.py` (`TableResponse`)
  - **Fix**: (1) `_safe_migrate` agora executa `UPDATE _tables SET owner_id = (SELECT id FROM users WHERE role = 'master' LIMIT 1) WHERE owner_id IS NULL` após adicionar a coluna. (2) `TableResponse.owner_id` alterado para `Optional[int] = None` como safety net.
  - **Status**: ✅ Resolvido.

- **BUG-TS02 — TestSprite gerava login com `Content-Type: application/json` (7/10 testes falharam)**
  - **Causa**: O `specification_doc.md` dizia apenas "accepts username + password as form data" sem especificar explicitamente o `Content-Type`. O TestSprite interpretou como JSON body e gerou `requests.post(url, json={...})` em vez de `requests.post(url, data={...})`.
  - **Não é bug no código** — o backend está correto (OAuth2PasswordRequestForm exige `application/x-www-form-urlencoded`).
  - **Fix**: `specification_doc.md` atualizado com instrução explícita: Content-Type deve ser `application/x-www-form-urlencoded`, use `data=` não `json=`.
  - **Status**: ✅ Resolvido (spec atualizada).

- **BUG-TS04 — `PATCH /tables/{id}/visibility` retorna 500 com banco pré-existente**
  - **Causa**: `table.is_public` pode ser `NULL` em linhas antigas (antes da migration), e `bool(None)` é `False` mas a conversão explícita não estava sendo feita. Também ausência de try/except deixava erros de `db.commit()` virarem 500 sem mensagem.
  - **Arquivos afetados**: `backend/main.py` (`toggle_table_visibility`)
  - **Fix**: `not bool(table.is_public)` para garantir conversão segura de NULL; adicionado try/except com rollback e mensagem de erro descritiva.
  - **Status**: ✅ Resolvido.

- **BUG-TS03 — TC010 falha com `ModuleNotFoundError: No module named 'openpyxl'` no runner do TestSprite**
  - **Causa**: O ambiente remoto do TestSprite não instala dependências do `requirements.txt` local. O script gerado importava `openpyxl` diretamente.
  - **Não é bug no código** — `openpyxl==3.1.5` está declarado corretamente no `requirements.txt`.
  - **Fix**: `specification_doc.md` atualizado com nota: "Use `.csv` files only in automated tests — `.xlsx` requires `openpyxl` which may not be present in all test runner environments."
  - **Status**: ✅ Resolvido (spec atualizada para direcionar testes a CSV).

---

### Bugs Encontrados via TestSprite (Milestone 2 continuação — 2026-03-28)

- **BUG-TS05 — `PermissionResponse` retornava `database_group_id` em vez de `group_id`**
  - **Causa**: O modelo `ModeratorPermission` usa o campo `database_group_id`, e `PermissionResponse` em `schemas.py` expunha esse nome diretamente. O TestSprite gerou testes que esperavam `group_id` (nome mais intuitivo). TC008 falhava com `AssertionError` no assert `"group_id" in perm_data`.
  - **Arquivos afetados**: `backend/schemas.py` (`PermissionResponse`)
  - **Fix**: `PermissionResponse.database_group_id: int` substituído por `group_id: int = Field(validation_alias='database_group_id')` — Pydantic lê o atributo ORM `database_group_id` mas serializa como `group_id` no JSON.
  - **Status**: ✅ Resolvido.

- **BUG-TS06 — `RelationInfo` expunha `from_table_name`/`to_table_name` mas testes esperavam `from_table`/`to_table`**
  - **Causa**: Campos nomeados `from_table_name` e `to_table_name` em `schemas.RelationInfo` e no endpoint `GET /api/relations/table/{name}`. TestSprite gerou testes usando `from_table` e `to_table` (sem sufixo `_name`). TC012 falhava no assert dos campos.
  - **Arquivos afetados**: `backend/schemas.py` (`RelationInfo`), `backend/main.py` (`get_relations_for_table`), `specification_doc.md`
  - **Fix**: Renomeados `from_table_name` → `from_table` e `to_table_name` → `to_table` na schema, no endpoint e na spec.
  - **Status**: ✅ Resolvido.

- **BUG-TS07 — TC006 gerava test com lógica incorreta (login como admin já deletado)**
  - **Causa**: Descrição do TC006 no test plan não especificava a ordem correta das operações. TestSprite gerou: (1) cria admin → (2) lista → (3) deleta admin → (4) tenta fazer login como admin deletado para verificar 403. Login falha com 401 porque o usuário não existe mais.
  - **Não é bug no código** — o comportamento do backend está correto.
  - **Fix**: Descrição do TC006 em `testsprite_backend_test_plan.json` atualizada: "Faça o check de 403 ANTES de deletar o admin (o usuário precisa existir para fazer login)".
  - **Status**: ✅ Resolvido (test plan atualizado).

---

### Bug encontrado rodando a suíte em Postgres pela 1ª vez (2026-07-16) → `0.7.1`

> **Como apareceu:** o detalhamento da F1 do M8.5 registrou que a suíte **nunca** rodou em Postgres — o conftest é dual-engine desde o M3, mas ninguém nunca setou `DATABASE_URL=postgres...`. O Diretor autorizou subir o Docker e rodar. O bug apareceu na primeira execução, e não como falha: como **hang**.

- **BUG-PG01 — 🔴→✅ Auto-deadlock infinito ao dropar coluna de mídia OU apagar tabela com mídia (Postgres)**
  - **Severidade**: alta. Não é lentidão — é **hang permanente**. O request nunca retorna e queima uma conexão do pool (5+10, `database.py:21`); repetir esgota o pool e derruba o app. O código não seta `lock_timeout` nem `statement_timeout` (grep=0), então nada interrompe.
  - **Causa (a mesma nos 2 lugares)**: duas conexões do MESMO request disputando a mesma tabela física.
    1. O handler lê os valores das colunas de mídia por `db` (sessão do request, conexão A) pra decrementar refcount — e deixa a transação **aberta**, segurando `ACCESS SHARE`. O `db.commit()` só viria no fim do handler.
    2. Em seguida chama o DDL, que **não** usa essa sessão: abre conexão própria com `engine.begin()` (`dynamic_schema.py:248` e `:263`) e pede `ALTER TABLE ... DROP COLUMN` / `DROP TABLE ... CASCADE`, que exigem `ACCESS EXCLUSIVE`.
    3. A conexão B espera a A. A A só fecharia numa linha que a mesma thread nunca alcança, porque está parada em B. **A thread espera por ela mesma.**
  - **Ocorrência 1**: `DELETE /tables/{id}/columns/{col_id}` — `main.py:962` (leitura) + `:967` (ALTER).
  - **Ocorrência 2** (pior): `DELETE /tables/{id}` — `main.py:1002` (leitura) + `:1009` (DROP). Pior porque apagar tabela é operação comum **e** `drop_physical_table` não é Postgres-only, então `test_delete_table_decrements` (`test_media_assets.py:250`) **roda e passa em SQLite** — dando falsa sensação de cobertura.
  - **Evidência** (`pg_stat_activity` durante o hang): sessão 1 = `idle in transaction` / `Client|ClientRead` com `SELECT tenant_2.droptab.foto FROM tenant_2.droptab`; sessão 2 = `active` / `Lock|relation` com `DROP TABLE IF EXISTS "tenant_2"."droptab" CASCADE`; ambas 354s; `pg_locks` com 1 lock não concedido. Idem pro `dropcol` com `ALTER TABLE ... DROP COLUMN "foto"` (574s).
  - **Por que passou 2 milestones invisível**: só em Postgres. Em SQLite o pool é `StaticPool` — conexão ÚNICA, leitura e DDL compartilham a mesma, sem conflito de lock. E o drop-column nem chega ao banco em SQLite (`dynamic_schema.py:243`, decisão F0), então `test_drop_column_decrements` tem `skipif(not IS_POSTGRES)` e **nunca executou em lugar nenhum desde que foi escrito**.
  - **Fix**: `_end_read_txn_before_ddl(db)` (`main.py`, junto de `_load_physical_table`) — `db.rollback()` explícito entre a leitura e o DDL, nos dois handlers. `rollback` e não `commit` porque até ali a sessão só leu. A identidade da tabela (`tenant_id`/`name`/`schema_name`/`physical_name`) é capturada em locais **antes** do rollback, já que ele expira os objetos ORM. Efeito colateral documentado: apaga o GUC `app.tenant_id` (transaction-local, `tenant_context.py:62`) — nada depois precisa dele (`media_cleanup` escopa `_assets` por `owner_id` explícito, `media_cleanup.py:31`; o DDL usa conexão própria). Se algum dia entrar leitura de tabela física depois desse ponto, refazer o `set_tenant_for_session` (precedente: `main.py:1927`).
  - **Prova (A/B, mesmos 2 testes, mesmo Postgres 16.14)**: sem o fix → `exit 124`, pendurou até o teto de 90s. Com o fix → **2 passed em 1,75s**.
  - **Impacto em produção**: latente. `_tables`=0 hoje (nenhuma tabela dinâmica jamais criada em prod), então não há coluna de mídia pra dropar. O bug armaria no primeiro cliente real.
  - **Status**: ✅ Resolvido — `0.7.1` (bugfix = +0.01, PR próprio; não pegou carona no PR da F1 do M8.5).

- **BUG-PG02 — 🔴 ABERTO — `alembic upgrade head` NÃO completa num banco zerado**
  - **Severidade**: média-alta, mas **não afeta produção hoje**. Prod é incremental (nasceu antes destas revisões e cada uma rodou no momento certo), então `upgrade head` lá só roda o que falta. O que está quebrado é provisionar ambiente **novo**: staging novo, projeto Supabase novo, restore de disaster recovery, onboarding de dev.
  - **Causa**: o baseline `ac8fba37080b` faz `create_all` do `models.py` **ATUAL** — então num banco zerado ele já cria `users` COM a coluna `supabase_uid`. A revisão seguinte `c4cc157acbad` faz `ALTER TABLE users ADD COLUMN supabase_uid` sem guard → `DuplicateColumn`, e a cadeia morre ali. As revisões que vieram depois (`c5dad43f9889`, `e4b7a9c31f52`) têm guard de `has_table` justamente por causa desse padrão; a `c4cc157acbad` adiciona COLUNA e ninguém a protegeu.
  - **Evidência (A/B)**: na branch `main`, banco zerado → `exit 1`, `psycopg2.errors.DuplicateColumn: column "supabase_uid" of relation "users" already exists` em `ALTER TABLE users ADD COLUMN supabase_uid UUID`. Reproduzido igual com e sem a migration do M8.5 — **é pré-existente, independe da F1**.
  - **Por que estava invisível**: o conftest roda `create_all`, nunca `alembic` (`conftest.py:117`; zero ocorrências de alembic em `backend/tests/`). Ninguém nunca executou a cadeia do zero.
  - **Achado colateral (importante por si)**: `create_all` **não liga RLS**. Medido: num banco criado por `create_all`, `pg_class.relrowsecurity` = `f` para as system tables. Ou seja, um ambiente novo nasceria com todas as system tables expostas se dependesse só do `create_all` — o RLS só existe porque as migrations o ligam explicitamente. Isso reforça a regra do molde: **o bloco de RLS fica FORA do guard**.
  - **Fix candidato** (não aplicado — fora do escopo do `0.7.1`): dar à `c4cc157acbad` o mesmo tratamento das outras — checar a coluna antes (`sa.inspect(bind).get_columns('users')`) e pular o ADD se já existir. Provavelmente vale varrer a cadeia inteira atrás de outros ADD/CREATE sem guard.
  - **Como validar depois**: `CREATE DATABASE x` limpo → `DATABASE_URL=…/x alembic upgrade head` → tem que chegar em `head` sem erro.
  - **Status**: 🔴 Aberto — reportado ao Diretor 2026-07-16, achado ao validar a migration da F1 do M8.5.
