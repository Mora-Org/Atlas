# 📝 Patch Notes

Registro de mudanças, novas funcionalidades e atualizações do sistema.

## Histórico

### **[26/03/2026] - Versão 1.0.0 (Base Release)**
Esta é a consolidação de todos os commits e desenvolvimentos anteriores ao estabelecimento da equipe.

- ✨ **Dynamic Table Engine**: Implementado sistema que traduz modelos do UI diretamente para DDL (SQLAlchemy) e cria tabelas físicas atreladas ao tenant.
- ✨ **Autenticação & QR Login**: Autenticação stateless via JWT. Implementado também login via escaneamento de QR Code (mobile-to-web).
- ✨ **Dashboard Dinâmico**: Widgets interativos (drag-and-drop) capazes de renderizar gráficos a partir das tabelas públicas. Suporte a exportação (PDF, XLSX).
- ✨ **Sistema de Theming Reativo**: 4 modos de brilho (Light, Dark, Dusk, Dawn) e 6 cores primárias utilizando variáveis CSS injetadas dinamicamente.
- ✨ **Multi-Tenancy Orgânico**: Isolamento de tabelas através de prefixos (`t<admin_id>_tabela`), com suporte a usuários Master, Admin e Moderadores.
- ✨ **Importação de Dados**: Rotas de parse para arquivos `.csv`, `.xlsx` e dumps de SQL (`.sql` contendo apenas `CREATE` e `INSERT`).

### **[26/03/2026] - Versão 1.1.0 (Milestone 1 - Estabilização e CRUD)**
Fechamento do primeiro pacote de manutenções e completude da arquitetura DDL gerada organicamente.

- 🐛 **Correção de Frontend App Router**: Adicionado `use client` nas páginas dependentes de state (`login/page.tsx`).
- 🐛 **Hotfix na API Pública**: Inclusão de conversão nativa (`String` via sqlalchemy) nas buscas globais e filtros.
- 🐛 **Resiliência do Test Engine**: Aplicação de `StaticPool` para o banco de dados em memória do `pytest`, garantindo isolamento confiável nas suítes de teste.
- ✨ **CRUD Data Engine Completo**: Os super-poderes dinâmicos agora contam com verbos `PUT` e `DELETE`.
  - **Backend**: Rotas encapsuladas para update seguro de registros.
  - **Frontend**: Data Tables em `/admin/data/[table]` expandidas com ações embutidas e modals transacionais (Editar e Excluir).
- 🧪 **Teste Automatizado de Auth Mobile**: Construção do fluxo 100% coberto pelo TestSprite garantindo segurança na validação de Tokens do QR Login.

### **[23/04/2026] - Versão 1.2.0 (Milestone 2 - Relações, Import SQL Avançado e Admin V2)**
Fechamento do pacote de relacionamentos entre tabelas dinâmicas, parser robusto de dumps SQL e completude do CRUD genérico. Gate para abrir o Milestone 3 (migração RLS/Supabase).

- 🐛 **BUG-01 fechado — Import SQL Desconectado**: O parser agora intercepta `CREATE TABLE`/`INSERT` via `sqlglot`, reescreve o nome físico com o prefixo do tenant e registra `_tables` + `_columns` em commit atômico ([main.py:859-930](../backend/main.py#L859)). Fim do hack `force_fix_db.py` — tabela importada aparece imediatamente no dashboard.
- 🐛 **BUG-02 fechado — User State UI**: Handlers de `createMod`, `deleteMod` e `resetPassword` em [users/page.tsx](../frontend/src/app/admin/users/page.tsx) chamam `fetchMods()` após cada ação bem-sucedida. Lista atualiza sem refresh manual.
- ✨ **FEAT-01 — Foreign Keys & Relations API + UI**
  - **Modelo**: `DynamicRelation` ganhou `from_column_name` / `to_column_name` ([models.py:81](../backend/models.py#L81)).
  - **API**: CRUD em `/api/relations` (POST), `/api/relations/table/{name}` (GET lookup p/ frontend) e `/api/relations/{id}` (DELETE). Endpoint público `/public/relations/`.
  - **DDL físico**: `create_physical_table` aceita `foreign_keys` e gera `ForeignKeyConstraint` real no backend. Cada FK declarada em `fk_table` / `fk_column` vira um `DynamicRelation` registrado ([main.py:441-452](../backend/main.py#L441)).
  - **UI**: toggle de "Relação Estrangeira" em `/admin/tables/create`; inputs em `/admin/data/[table]` convertidos em `<select>` quando a coluna aponta para outra tabela.
- ✨ **FEAT-02 — Gerenciador Avançado de Import SQL**
  - `/api/import/sql/dry-run` retorna `{summary, statements}` com status `ok`/`blocked`/`conflict` por instrução, sem tocar no banco ([main.py:821-856](../backend/main.py#L821)).
  - `/api/import/sql` retorna `{created_tables, inserted_rows, errors}` em vez de aceitar silenciosamente.
  - Statements que não sejam `CREATE TABLE`/`INSERT` (ex.: `DROP`, `ALTER`, `DELETE`) são explicitamente bloqueados.
- ✨ **FEAT-03 — CRUD Completo de Records Dinâmicos**: `PUT /api/{table_name}/{id}` e `DELETE /api/{table_name}/{id}` com guards por tenant via `get_accessible_tables` ([main.py:694-753](../backend/main.py#L694)).
- 🧪 **Nova cobertura TestSprite**:
  - `test_sql_import_dry_run`, `test_sql_import_destructive` em [tests/test_import.py](../backend/tests/test_import.py).
  - `test_foreign_key_population`, `test_relations_delete` em [tests/test_relations.py](../backend/tests/test_relations.py).
  - `test_dynamic_record_update`, `test_dynamic_record_delete` e dois testes de isolamento cross-tenant em [tests/test_dynamic_records.py](../backend/tests/test_dynamic_records.py).
- 🔧 **Hardening da suíte de testes**:
  - `backend/pytest.ini` fixa `testpaths = tests` para que `pytest -q` ignore arquivos scratch (`*.txt`) na raiz de `backend/` (esses serão removidos na Fase 0.3 do M3).
  - `startup_event` respeita `SKIP_TEST_SEED=1` (setado pelo conftest) para não poluir o DB de teste com `testadmin` pré-seedado de fluxos E2E de frontend.
  - `tests/test_qr.py` refatorado para usar as fixtures `client` / `db_session` do conftest em vez de um `TestClient` global.
