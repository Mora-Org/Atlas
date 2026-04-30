# 🗺️ Plano Atual e Estrutura do Projeto

Este documento define a direção, a metodologia e o plano de ação contínuo do projeto **Dynamic SQL Editor** (Dynamic CMS Template).

## 👥 A Equipe e a Metodologia (Spec-Driven Development)
Nossa equipe técnica atua de forma coordenada utilizando o **GitHub Spec Kit** para garantir alinhamento total (Spec-Driven Development - SDD). Toda arquitetura nasce de uma especificação clara antes do código.

- 🎬 **Diretor** (Você): Define a visão e aciona a criação/edição de especificações usando comandos como `/speckit.specify`. 
- 🧠 **Planejador** (Antigravity): Expande as especificações em planos técnicos executáveis usando `/speckit.plan` e quebra em tarefas com `/speckit.tasks`. Atualiza o backlog aqui em `planning/`.
- 💻 **Programador** (Claude): Executa os planos estritamente baseados na "Constituição" (`.speckit/constitution.md`) usando `/speckit.implement`.
- 🔬 **Testador** (TestSprite): Valida a robustez das entregas do Claude antes da aprovação do Diretor.

## 🎯 Fluxo de Trabalho (Workflow Spec Kit)
O fluxo diário segue o ciclo SDD:
1. **Specify:** O Diretor faz um request. Eu crio um spec em `.speckit/specs/` detalhando o comportamento esperado.
2. **Plan & Task:** Transformo o spec em um plano técnico em `.speckit/plans/` e gero uma lista de tarefas em `.speckit/tasks/`.
3. **Execute:** O Programador (Claude) lê o backlog guiado pela Constituição (`.speckit/constitution.md`) e coda.
4. **Validação:** TestSprite roda testes validando a nova release. Sucesso é registrado no histórico de patch notes.

---

### ✅ MILESTONE 1 CONCLUÍDO: Estabilização Básica e CRUD Dinâmico
- Todos os endpoints CRUD 100% testados.
- Test engine `conftest.py` refatorado e confiável (`StaticPool`).
- Patch notes e Bugfixes atualizados retrospectivamente.

---

### ✅ MILESTONE 2 CONCLUÍDO (código): Relacionamentos, Importação SQL Avançada e Admin UI

> **Status:** código pronto e auditado em [patch_notes.md v1.2.0](./patch_notes.md). **Pendente:** run verde do TestSprite/pytest na máquina do Diretor — ver "Validação final" abaixo.

#### 1. Lista de Bugs a Corrigir 🐛
- ✅ **BUG-01 (Import SQL Desconectado)** — corrigido em [main.py:859-930](../backend/main.py#L859). Parser `sqlglot` intercepta `CREATE TABLE`/`INSERT`, aplica prefixo do tenant ao nome físico, e registra `_tables` + `_columns` em commit atômico. `force_fix_db.py` não é mais necessário (marcado para remoção na Fase 0.3 do M3).
- ✅ **BUG-02 (User State UI)** — corrigido em [users/page.tsx](../frontend/src/app/admin/users/page.tsx). `fetchMods()` é chamado após cada ação (create/delete/reset) para refresh proativo.

#### 2. Features Priorizadas 🌟
- ✅ **FEAT-01 (Foreign Keys & Relations API + UI)**
  - Modelo `DynamicRelation` com `from_column_name`/`to_column_name` em [models.py:81](../backend/models.py#L81).
  - CRUD `/api/relations`, `/api/relations/table/{name}`, `/api/relations/{id}` em [main.py:465-513](../backend/main.py#L465). `ForeignKeyConstraint` físico gerado em [dynamic_schema.py](../backend/dynamic_schema.py).
  - UI com toggle de Relação Estrangeira em [tables/create/page.tsx](../frontend/src/app/admin/tables/create/page.tsx); inputs viram `<select>` quando coluna tem FK em [data/[table]/page.tsx](../frontend/src/app/admin/data/[table]/page.tsx).

- ✅ **FEAT-02 (Gerenciador Avançado de Import SQL)**
  - `/api/import/sql/dry-run` retorna `{summary, statements}` com status por instrução em [main.py:821-856](../backend/main.py#L821).
  - `/api/import/sql` retorna `{created_tables, inserted_rows, errors}`.
  - `DROP`, `ALTER`, `DELETE` e outros statements não permitidos são bloqueados explicitamente.

- ✅ **FEAT-03 (CRUD Completo de Records Dinâmicos)**
  - `PUT /api/{table_name}/{id}` em [main.py:694](../backend/main.py#L694) e `DELETE /api/{table_name}/{id}` em [main.py:725](../backend/main.py#L725), ambos guardados por `get_accessible_tables` (isolamento de tenant).

#### 3. Cobertura TestSprite adicionada 🔬
- ✅ `test_sql_import_dry_run`, `test_sql_import_destructive` em [test_import.py](../backend/tests/test_import.py).
- ✅ `test_foreign_key_population`, `test_relations_delete` em [test_relations.py](../backend/tests/test_relations.py).
- ✅ `test_dynamic_record_update`, `test_dynamic_record_delete` + 2 testes de isolamento cross-tenant em [test_dynamic_records.py](../backend/tests/test_dynamic_records.py).
- 🔧 Suite infra corrigida: `pytest.ini` fixa `testpaths=tests`; `SKIP_TEST_SEED=1` no conftest evita colisão com seed do startup; `test_qr.py` refatorado para usar fixtures do conftest.

#### 4. Validação final (a rodar na máquina do Diretor) ⚠️
Durante a execução da M2 pela IA programadora (Claude), o `pytest` travou repetidamente no ambiente sandbox/lentidão de Windows (venv Python da Windows Store). A **primeira rodada** completa observada: `29 passed / 1 failed / 1 error` em `test_qr.py` — o `1 failed + 1 error` já foi endereçado pela reescrita de `test_qr.py`, mas o rerun na máquina do Claude não completou. Diretor, por favor rodar:

```powershell
cd backend
venv\Scripts\python.exe -m pytest -q
```

Resultado esperado: **38 passed, 0 failed, 0 errors**. Se algum teste falhar, colar o output que o Claude ajusta. Após verde, remover esta seção "Validação final" e seguir para a Fase 0 do Milestone 3.

---

### 🚀 Próximos Milestones

#### Milestone 3 — Migração RLS / Supabase-Native (backend)
Ver [milestone_3_rls_migration.md](./milestone_3_rls_migration.md). **Não abrir a Fase 0 do M3 sem** o pytest M2 verde acima.

#### Milestone 5 — Atlas Redesign / Mora Editorial Identity (frontend, paralelo)
Ver [milestone_5_atlas_redesign.md](./milestone_5_atlas_redesign.md). Migra todo o frontend pra identidade editorial Mora (paleta Parchment/Midnight × 4 acentos, Fraunces + IBM Plex, 13 telas redesenhadas em 3 fases). **Frontend-only**, não bloqueia M3/M4. Spec/Plan/Tasks em [.speckit/](../.speckit/specs/M5_atlas_redesign.md).

> M4 (auth unification) está congelado — ver [backlog_m4_auth_unification.md](./backlog_m4_auth_unification.md).
