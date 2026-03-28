# 🗺️ Plano Atual e Estrutura do Projeto

Este documento define a direção, a metodologia e o plano de ação contínuo do projeto **Dynamic SQL Editor** (Dynamic CMS Template).

## 👥 A Equipe (Nossos Papéis)
Nossa equipe técnica atua de forma coordenada para garantir qualidade e velocidade no desenvolvimento:
- 🎬 **Diretor** (Você): Define a visão, os requisitos, prioriza tarefas e atua como o tomador de decisão final.
- 🧠 **Planejador** (Antigravity): Analisa o ecossistema do projeto (Next.js + FastAPI), desenha soluções arquiteturais, escreve os planos de implementação (`implementation_plan.md`), e mantém esta pasta `planning` organizada e rastreável.
- 💻 **Programador** (Claude): Executa o planejamento, escrevendo e refatorando o código fonte.
- 🔬 **Testador** (TestSprite): Prepara os ambientes, elabora cenários de testes automatizados e valida a robustez das entregas do Claude antes da aprovação do Diretor.

## 🎯 Situação Atual e Metodologia
O projeto é um Headless CMS Template Full-Stack com uma engine de DDL dinâmico orgânica. A nova metodologia visa profissionalizar o fluxo:
1. **Planejamento:** O Diretor faz um request (ou levanta bugs). Eu (Antigravity) planejo a execução detalhada (`implementation_plan.md`), aprovo com o diretor e atualizo o backlog aqui.
2. **Desenvolvimento:** O Programador (Claude) recebe as specs e coda exatamente o que foi arquitetado.
3. **Validação:** TestSprite entra em ação rodando testes (unitários/integração) validando a nova release.
4. **Deploy e Registro:** Sucesso registrado em `patch_notes.md` e `bugfixes.md`.

---

### ✅ MILESTONE 1 CONCLUÍDO: Estabilização Básica e CRUD Dinâmico
- Todos os endpoints CRUD 100% testados.
- Test engine `conftest.py` refatorado e confiável (`StaticPool`).
- Patch notes e Bugfixes atualizados retrospectivamente.

---

### 🚀 MILESTONE ATUAL: Milestone 2 - Relacionamentos, Importação SQL Avançada e Admin UI
**Objetivo do Diretor:** Aprimorar o painel administrativo (Admin V2), possibilitando ao usuário estruturar relatórios com chaves estrangeiras, melhorar as Views de gerência de usuários e lidar de forma robusta com imports via dumps SQL.

#### 1. Lista de Bugs a Corrigir 🐛
- **BUG-01 (Import SQL Desconectado)**: 
  - *Sintoma Exato*: O painel envia o dump `.sql` puro para injetar no backend. O backend roda o DDL físico (tabela é criada no disco), mas **NÃO** insere as referências obrigatórias nas tabelas internas do sistema (`_tables` e `_columns`). 
  - *Consequência*: O usuário não vê a tabela no dashboard e as APIs genéricas de CRUD retornam `404 Not Found`. O usuário precisava rodar o hack manual `force_fix_db.py` para forçar o reflection. 
  - *Solução*: O parse do SQL durante a importação deve interceptar os `CREATE TABLE` e ativamente registrar a tabela e as colunas via `db.add()` atreladas ao Inquilino, atomicamente junto com a instrução SQL.
- **BUG-02 (User State UI)**: Atualizações de perfil de moderação e listagem administrativa de perfis de usuário na interface (`admin/users/page.tsx`) precisando de refresh proativo no layout após ações em lote.

#### 2. Features Priorizadas 🌟
- **FEAT-01 (Foreign Keys & Relations API + UI)**
  - *Gap Arquitetural Fechado*: Inicialmente, vamos modificar a modelagem do DB incluindo os campos de ponteiro na tabela `DynamicRelation`.
  - **Requisito Back-End (A)**: Atualizar o modelo `DynamicRelation` para conter `from_column_name` e `to_column_name`. Criar novas rotas CRUD gerenciais em `/api/relations` (`POST`, `GET`, `DELETE`) para manter as configurações persistentes e garantir que a geração física adicione `ForeignKeyConstraint` no backend.
  - **Requisito UX Momento 1 (B)**: Criar Schema. No painel de construção visual de tabelas, o formulário de coluna terá um Toggle de `Relação Estrangeira`. Se ativado, abre campos para selecionar a Tabela Alvo e a Coluna Alvo, disparando POST para `/api/relations`.
  - **Requisito UX Momento 2 (C)**: Inserção de Dados. No `/admin/data/[table]`, se a configuração descrever que `parent_id` aponta para `t1_users`, o campo `<input>` normal é substituído por um `<select>`. O formulário fará um fetch passivo na API da tabela alvo para popular o select, mostrando Labels visuais mas submetendo IDs.
  - **Critérios de Aceite:** O relacionamento precisa funcionar end-to-end de forma estável, não pode permitir `DROP` numa tabela pai sem `CASCADE` se essa tabela for referenciada ativamente.

- **FEAT-02 (Gerenciador Avançado de Import SQL)**
  - **Descrição:** Melhorar a mecânica que converte raw `.sql` (dumps) em modelos da aplicação Dynamic Engine.
  - **Critérios de Aceite:**
    - Parse robusto com validação pré-importação (dry-run mode).
    - Reporte detalhado (Success/Fail por linha) retornado no frontend ao invés de aceitação silenciosa.

- **FEAT-03 (CRUD Completo de Records Dinâmicos)**
  - **Requisito**: Adicionar `PUT /api/{table_name}/{id}` e `DELETE /api/{table_name}/{id}` no `main.py`, com as mesmas guards de tenant e permissão dos endpoints existentes de `GET`/`POST`.
  - **Critério de Aceite**: Moderador consegue editar e deletar um record de uma tabela à qual tem permissão; não consegue em tabelas de outro tenant.
  - **TestSprite**: `test_dynamic_record_update()` e `test_dynamic_record_delete()` com assert de isolamento de tenant.

#### 3. Orientações para a Cobertura do TestSprite 🔬
O script de testes (`pytest`) precisará receber cobertura focada nos seguintes casos para dar o `Green Light` neste milestone:
- `test_sql_import_dry_run()`: Enviar um arquivo `.sql` mock e verificar se o retorno traz logs de planejamento sem alterar de fato as tabelas.
- `test_sql_import_destructive()`: Enviar scripts com `DROP` ou injeções simuladas para checar que o interceptor barra a transação para o inquilino isolado.
- `test_foreign_key_population()`: Requisitar dinamicamente a constraint de relações de uma tabela Mock e atestar que a API devolve o `lookup` correto para o Frontend popular dados.

---

### 📅 Milestones Futuros (Previsão / Opções para o Diretor)
- **Milestone 3 (Opção C - Otimização)**: Substituir dependências legadas e otimização forte do payload de exportação de dados (PDF/XLSX assíncrono).
