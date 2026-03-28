# Implementation Plan: Milestone 2 - Relacionamentos, Importação Otimizada e CRUD

Este plano técnico detalha as alterações no código necessárias para executar o Milestone 2 do Dynamic SQL Editor, cumprindo os critérios definidos no `plano_atual.md`.

## User Review Required
> [!IMPORTANT]
> O Director precisa aprovar este plano técnico de desenvolvimento antes da equipe de programação (Claude/Antigravity) injetar o código. Verifique se a infraestrutura desenhada na Camada de Dados atende às regras de negócio.

## Proposed Changes

### 1. Database & Metadata Layer (Backend)
Será necessário modificar a estrutura da engine para suportar relacionamentos dinâmicos e garantir atomicidade.

#### [MODIFY] backend/models.py
- Adicionar os campos `from_column_name` (String) e `to_column_name` (String) ao modelo `DynamicRelation`. Isso garantirá que saibamos exatamente qual coluna da tabela filha mapeia para qual coluna da tabela referenciada.

#### [MODIFY] backend/dynamic_schema.py
- **FEAT-01 (Engine DDL de Relações)**: Injetar `ForeignKeyConstraint` aos objetos Tabela do SQLAlchemy gerados em tempo de execução. 
- *Decisão de Negócio (Limitação do SQLite)*: As Chaves Estrangeiras Físicas só serão definidas estruturalmente durante a **CRIAÇÃO** de novas tabelas. Não será suportada a adição de relações via "ALTER TABLE" em tabelas preexistentes, pois o SQLite dev inviabilizaria essa alteração. Toda a submissão de FK deve ocorrer concatenada no payload de `POST /api/tables`.

#### [MODIFY] backend/main.py
- **BUG-01 Fix**: Na rota `POST /api/import/sql`, fazer parsing seguro (regex/SQLGlot) bloqueando instruções `DROP`. Ao processar `CREATE TABLE`, injetar os dados extraídos não só via DDL (execução raw), mas também criando loops para popular ativamente `models.DynamicTable` e `models.DynamicColumn` no mesmo commit, para que elas apareçam formalmente como tabelas gerenciadas pelo CMS.
- **FEAT-03 (Dynamic CRUD - PUT/DELETE)**:
  - Adicionar a rota `@app.put("/api/{table_name}/{record_id}")`: Vai mapear a tabela do schema, construir o objeto transacional do SQLAlchemy para a atualização, rodar as dependências `check_table_access_by_name`, extrair via Query Params ou JSON Payload e efetivar o Update no DB físico.
  - Adicionar a rota `@app.delete("/api/{table_name}/{record_id}")`: Validar ownership, construir engine execution com `DELETE FROM {table} WHERE id = {record_id}`.
- **FEAT-01 (Relations API)**:
  - O controller principal receberá o roteamento de Relações (`POST /api/relations`, `GET /api/relations`) servindo como endpoint restrito a administradores.

---

### 2. Painel de Usuários (Frontend)

O painel necessita melhorias de estado após execuções.

#### [MODIFY] frontend/src/app/admin/users/page.tsx
- **BUG-02 Fix**: Adicionar chamadas `router.refresh()` do Next.js App Router (ou forçar trigger manual na variável de state via `useEffect`/setState) nas funções de callback de deleção ou troca de perfis na UI, resolvendo os delays visuais ao alterar níveis de permissão.

---

### 3. Engine Base Visual do Front (Admin V2)

Integrar os seletores dinâmicos da "Frontend App" com a "Backend API" que listamos acima.

#### [MODIFY] frontend/src/app/admin/tables/create/page.tsx
- **FEAT-01 (Momento 1)**: Expandir a interface de "Adicionar Coluna" da criação da tabela. Incluir o Toggle `É Chave Estrangeira?`. Ao habilitar, realizar um GET em `/api/tables` para renderizar duas dropdowns no modal: `<Select Tabela Alvo>` e `<Select Coluna Alvo>`. A payload final irá transacionar o Schema de forma limpa.

#### [MODIFY] frontend/src/app/admin/data/[table]/page.tsx
- **FEAT-01 (Momento 2)**: Na montagem do DataViewer (quando há botão "New Record" ou "Edit"), inspecionar no `initialData` da tabela as constraints `relations`. Caso aquele campo seja submisso a alguma FK, em vez do `<input>`, injetar um componente que efetiva um fetch no `GET /api/{referenced_table}` e popular um Dropdown com ID + Valor (exemplo: `id` e a primeira coluna de texto, para user-friendly interface).

#### [MODIFY] frontend/src/app/admin/import/sql/page.tsx
- **FEAT-02**: Criar UX dividida em Steps. (1) Dry-run call para api, (2) Mostrar no Frontend a lista de Queries Extraídas com badge de `Success/Fail/Warnings`. (3) Botão final "Commit Import".

---

## Verification Plan
Estes testes serão criados dentro de `/backend/tests/` pelo **TestSprite** e atestados rodando `run_tests.ps1`.

### Automated Tests
1. **`test_dynamic_record_update()`**: Cadastrar usuário -> Cadastrar tabela -> Cadastrar record -> Testar `PUT` com dados válidos (200 OK) -> Alterar tenant -> falhar (403/404).
2. **`test_dynamic_record_delete()`**: Injetar record num banco em memória e processar a rota `DELETE`. Atestar exclusão completa no fetch primário.
3. **`test_sql_import_dry_run()`**: Fazer POST num arquivo `mock.sql` estruturado, interceptando o body de resposta para relatórios limpos sem alterar banco físico de dados.
4. **`test_foreign_key_population()`**: Avaliar restrições da API `POST /api/relations` e a inserção DDL gerada.

### Manual Verification
O **Diretor** deve clonar esse build e:
1. Ir para a aba Builder. Criar a "Tabela Cargos". Depois "Tabela Pessoas" setando `cargo_id` = FK de Cargos.
2. Adicionar um Cargo e testar Inserir Pessoas. O campo do Cargo deve aparecer em Dropdown.
3. Subir um `legacy_app.sql`. Validar que o painel de Dry-Run acende e aponta erros na sintaxe (`DROP DATABASE`), enquanto aprova `CREATE` válidos.
