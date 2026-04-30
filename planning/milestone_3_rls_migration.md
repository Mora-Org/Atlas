# 🏗️ Milestone 3 — Migração RLS / Supabase-Native

> **Status:** 📋 Proposta — aguardando aprovação do Diretor
> **Predecessora obrigatória:** Milestone 2 (Foreign Keys, SQL Import robusto, CRUD completo) precisa estar estável antes de iniciar. Ver `planning/plano_atual.md`.
> **Alvo de entrega:** 4–6 semanas de trabalho focado (estimativa p/ estagiário em tempo integral com revisões do Claude).
> **Objetivo do Diretor:** Sair do modelo "SQLite com prefixo por tenant" para uma arquitetura nativa Postgres/Supabase, de forma que o backend deixe de ser o único guardião de segurança e que um deploy Vercel + Supabase + Railway vire um caminho real, não uma gambiarra.

---

## 🎯 Por Que Estamos Fazendo Isso

Hoje, em [backend/database.py:6](../backend/database.py#L6), o banco padrão é um único arquivo SQLite. Todas as tabelas de todos os tenants vivem juntas, diferenciadas por prefixo (`t1_clientes`, `t2_clientes`, ...). Isso está implementado em:

- [backend/main.py:322-330](../backend/main.py#L322-L330) — `get_tenant_prefix()` monta o prefixo a partir do ID do admin.
- [backend/main.py:651-753](../backend/main.py#L651-L753) — CRUD dinâmico concatena prefixo no nome físico (`physical_name = f"{prefix}{table_name}"`).
- [backend/dynamic_schema.py:17-68](../backend/dynamic_schema.py#L17-L68) — DDL físico idem: o nome da tabela já **é** o isolamento de tenant.

**Problemas concretos:**
1. Se o backend tiver um bug em `get_accessible_tables()`, um moderador/admin pode enxergar tabelas de outro tenant. Não há camada de defesa em profundidade.
2. Nenhuma integração natural com Supabase Auth, Realtime, Storage policies, etc.
3. Migração para produção real (Postgres) exige refatoração — não é "só trocar `DATABASE_URL`".
4. Export de um tenant isolado é frágil: depende de scan por prefixo em um banco compartilhado.

**O que esta migração entrega:**
- Cada admin fica fisicamente isolado em um **schema Postgres próprio** (`tenant_5`, `tenant_7`, ...).
- Todas as tabelas dinâmicas ganham uma coluna `tenant_id` com **Row Level Security (RLS)** como cinto-e-suspensório.
- Backend continua funcionando com JWT próprio (HS256) **ou** passa a aceitar JWT do Supabase Auth (opção futura, Fase 5).
- Deploy para Supabase (Postgres gerenciado + RLS) + Vercel (frontend) + Railway (FastAPI) vira receita documentada.
- Export de tenant vira `pg_dump --schema=tenant_5` — um comando.

---

## 📐 A Arquitetura Alvo (Diagrama Textual)

### Estado atual
```
dynamic_template.db (SQLite, um arquivo)
├── users
├── database_groups
├── moderator_permissions
├── _tables
├── _columns
├── _relations
├── qr_login_sessions
├── t1_clientes    ← admin 1
├── t1_produtos    ← admin 1
├── t2_clientes    ← admin 2  (SCHEMA DIFERENTE do t1_clientes!)
└── t2_estoque     ← admin 2
```

### Estado alvo (Postgres / Supabase)
```
Postgres Database
├── schema: public             (metadados do sistema)
│   ├── users
│   ├── database_groups
│   ├── moderator_permissions
│   ├── _tables                 (name, tenant_id, schema_name, ...)
│   ├── _columns
│   ├── _relations
│   └── qr_login_sessions
│
├── schema: tenant_1            (dados do admin 1)
│   ├── clientes   [tenant_id=1, RLS: tenant_id = current_setting('app.tenant_id')::int]
│   └── produtos   [tenant_id=1, RLS idem]
│
├── schema: tenant_2            (dados do admin 2 — clientes pode ter colunas TOTALMENTE diferentes)
│   ├── clientes   [tenant_id=2, RLS idem]
│   └── estoque    [tenant_id=2, RLS idem]
│
└── schema: tenant_N …
```

**Justificativa de ter schema + coluna `tenant_id` juntos:**
- Schema separado evita colisões de nome entre tenants e permite `pg_dump --schema=tenant_X` para export.
- `tenant_id` + RLS é a camada de defesa em profundidade — mesmo que o backend mande uma query crua errada, o Postgres bloqueia.
- `current_setting('app.tenant_id')` é setado por `SET LOCAL` no início de cada request autenticada.

---

## 🧭 Visão de Fases (Overview)

| Fase | Entrega | Duração estimada |
|------|---------|------------------|
| **Fase 0** | Pré-requisitos: Milestone 2 fechado, ambiente Postgres local, Alembic inicializado | 2–3 dias |
| **Fase 1** | Infraestrutura: Alembic + configuração dual-engine (SQLite dev / Postgres prod) | 3–4 dias |
| **Fase 2** | Novos metadados: campos `tenant_id` e `schema_name` em `_tables`; helpers de tenant context | 2–3 dias |
| **Fase 3** | Refactor DDL: `dynamic_schema.py` passa a criar schemas e tabelas com `tenant_id` + RLS | 4–5 dias |
| **Fase 4** | Refactor CRUD: `main.py` usa `SET LOCAL app.tenant_id` e schema qualificado | 4–5 dias |
| **Fase 5 (opcional)** | Supabase Auth: aceitar JWT do Supabase além do nosso | 3–4 dias |
| **Fase 6** | Script de migração de dados do SQLite legado para Postgres | 2–3 dias |
| **Fase 7** | Bateria completa TestSprite + smoke test em staging | 5–7 dias |
| **Fase 8** | Deploy: docs de Vercel + Supabase + Railway, `.env.example`, rollback plan | 2 dias |

**Total:** ~27–37 dias úteis. Não é um projeto de fim de semana. O buffer extra na Fase 7 existe para absorver o ruído de *edge-cases* das Fases 4 (CRUD) e 6 (Migração) e caçar bugs de borda sem prejudicar o prazo de deploy.

---

## 📜 Regras de Ouro Para Quem Vai Executar (Leia Antes De Tocar Em Qualquer Arquivo)

1. **Nunca commite sem rodar `pytest -q` passando.** A suite está em [backend/tests/](../backend/tests/).
2. **Nunca remova o suporte a SQLite.** O ambiente de dev local precisa continuar rodando em SQLite para velocidade. As novas features devem ter um caminho `if engine.dialect.name == "sqlite": <comportamento antigo> else: <comportamento Postgres>` até a Fase 8.
3. **Todo passo tem um "DoD" (Definition of Done) verificável.** Se você não consegue rodar o comando que prova que passou, ainda não passou.
4. **Não mexa no frontend até a Fase 4 estar verde.** O frontend usa nomes lógicos (`/api/clientes`), não físicos (`/api/t1_clientes`). Se o backend mantém a API pública igual, o frontend não precisa mudar.
5. **Backup antes de rodar a migração de dados (Fase 6).** Copia o arquivo [backend/dynamic_template.db](../backend/dynamic_template.db) para `backend/dynamic_template.db.bak-YYYYMMDD` antes de qualquer coisa.
6. **Peça revisão do Claude ao final de cada Fase** antes de abrir a próxima. Cada fase tem pontos sutis.

---

# FASE 0 — Pré-Requisitos

## 0.1 Confirmar Milestone 2 fechado

Antes de abrir qualquer task desta milestone:

- [ ] Todos os itens de `planning/plano_atual.md` na seção "Milestone 2" devem estar ✅.
- [ ] `patch_notes.md` deve ter a entrada da v1.2.x (M2).
- [ ] `pytest -q` em `backend/` deve passar 100%.
- [ ] Se algum dos acima falhar, **pare e volte para Milestone 2**. Misturar os dois vai criar um enrosco irrecuperável.

**DoD:** Captura de tela do `pytest -q` verde commitada em `planning/logs/m3_start_green.txt`.

## 0.2 Instalar Postgres local

Para desenvolvimento realista, o estagiário precisa de um Postgres local (não só SQLite).

**Opção recomendada (Windows, simples):** Docker Desktop + imagem oficial.

```powershell
# Requer Docker Desktop instalado
docker run --name dynamic-cms-pg -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=dynamic_cms -p 5432:5432 -d postgres:16
```

**Validar que está de pé:**
```powershell
docker exec -it dynamic-cms-pg psql -U postgres -d dynamic_cms -c "SELECT version();"
```

**Saída esperada:** Linha começando com `PostgreSQL 16.x`.

**Criar a base de testes (Fase 7 usará):**
No mesmo container, crie a base de testes vazia:
```powershell
docker exec -it dynamic-cms-pg psql -U postgres -c "CREATE DATABASE dynamic_cms_test;"
```

**Criar role não-super para o teste de bypass RLS (Fase 7.1 item 3):**
O `test_rls_raw_sql_bypass_attempt` precisa conectar como um usuário **sem** privilégios de super — caso contrário o `FORCE ROW LEVEL SECURITY` não faz efeito. Criar uma só vez:
```powershell
docker exec -it dynamic-cms-pg psql -U postgres -c "CREATE ROLE app_user LOGIN PASSWORD 'app_user_pass' NOSUPERUSER;"
docker exec -it dynamic-cms-pg psql -U postgres -d dynamic_cms_test -c "GRANT USAGE ON SCHEMA public TO app_user; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;"
# O GRANT nos schemas tenant_N será feito pelo conftest.py após cada CREATE SCHEMA em testes.
```

**Criar um arquivo `backend/.env.development` (NÃO commitar — adicionar ao `.gitignore` se já não estiver):**
```
DATABASE_URL=postgresql+psycopg2://postgres:devpass@localhost:5432/dynamic_cms
SECRET_KEY=dev-only-change-me
```

**Atualizar dependências:**
O código agora precisará se conectar ao Postgres. Adicionar `psycopg[binary]>=3.1` (ou `psycopg2-binary`) ao `backend/requirements.txt`. Usar os binários pré-compilados evita erros chatos de build no Windows.

**DoD:**
- [ ] Container rodando (`docker ps` mostra `dynamic-cms-pg`).
- [ ] `psql` retorna versão.
- [ ] `.env.development` existe, está no `.gitignore`.
- [ ] `psycopg[binary]` adicionado ao `requirements.txt` e instalado.

## 0.3 Limpar lixo do backend antes de começar

Remover os arquivos de debug/hack antes de refatorar — eles vão atrapalhar a navegação e confundir durante a migração:

**Arquivos a deletar** (confirmar com `git rm` após abrir PR de limpeza):
- `backend/debug_db.py`
- `backend/debug_output.txt`
- `backend/debug_output_2.txt`
- `backend/force_fix_db.py`
- `backend/fix_output.txt`
- `backend/fix_output_2.txt`
- `backend/hack_out.txt`
- `backend/hack_test.py`
- `backend/test_api.py` *(se não for test formal)*
- `backend/test_errors.txt`
- `backend/test_errors_ascii.txt`
- `backend/test_out.txt`
- `backend/test_out_new.txt`
- `backend/test_sqlglot.py` *(se for scratch — se estiver em uso real, mover para `backend/tests/`)*
- `backend/tests_out.txt`

**Antes de deletar:** `git log --all -- backend/<nome>` para garantir que não tem nada importante; se houver, mover para `planning/logs/`.

**DoD:**
- [ ] Raiz de `backend/` tem só: `main.py`, `auth.py`, `models.py`, `schemas.py`, `database.py`, `dynamic_schema.py`, `requirements.txt`, `tests/`, `venv/` (ignorado), `dynamic_template.db` (ignorado).
- [ ] Commit único: `chore(backend): remove debug/hack scratch files before M3 refactor`.

---

# FASE 1 — Infraestrutura: Alembic + Dual-Engine

## 1.1 Inicializar Alembic

O `alembic` já está em [backend/requirements.txt](../backend/requirements.txt) mas nunca foi inicializado. Hoje o schema é criado via `Base.metadata.create_all()` na função `startup_event` de `backend/main.py`. Vamos substituir isso por migrações versionadas.

**Comandos (rodar dentro de `backend/` com venv ativo):**
```bash
alembic init migrations
```

Isso cria `backend/migrations/` e `backend/alembic.ini`.

**Editar `backend/alembic.ini`:**
- Trocar a linha `sqlalchemy.url = driver://user:pass@localhost/dbname` por uma leitura dinâmica de env. Deixar vazia (`sqlalchemy.url =`) e setar via env.py.

**Editar `backend/migrations/env.py`:**
```python
# No topo, importar:
import os, sys
sys.path.append(os.path.dirname(os.path.dirname(__file__)))  # backend/ no path

from database import Base, DATABASE_URL
import models  # garante que Base.metadata enxerga todas as tabelas

# Substituir o target_metadata:
target_metadata = Base.metadata

# Na função run_migrations_online / run_migrations_offline,
# substituir a leitura de url para:
def get_url():
    return os.environ.get("DATABASE_URL", "sqlite:///./dynamic_template.db")

# Usar get_url() onde antes era config.get_main_option("sqlalchemy.url")
```

**Gerar a primeira migração (baseline do schema atual):**
```bash
# Com o DB SQLite atual ainda existindo:
alembic revision --autogenerate -m "baseline_pre_rls"
```

**Revisar o arquivo gerado em `backend/migrations/versions/<hash>_baseline_pre_rls.py`:**
- O autogenerate pode detectar divergências com o DB atual (ex.: colunas que `_safe_migrate` criou manualmente). Limpar manualmente para que a migração reflita exatamente o estado de `models.py`.
- **Não deixe operações destrutivas** (`op.drop_table`) que possam apagar dados do usuário.

**Marcar o banco atual como já migrado:**
```bash
alembic stamp head
```

**Remover `_safe_migrate` e `Base.metadata.create_all()` do startup:**
- Remover a função `_safe_migrate` inteira de `main.py` (se ainda existir).
- Na função `startup_event` de `main.py`, remover `Base.metadata.create_all(bind=engine)`. Migrações agora rodam via CLI antes do deploy, não no startup.
- **Atenção:** As policies RLS (FORCE ROW LEVEL SECURITY) não são versionadas pelo Alembic. Elas são criadas e aplicadas dinamicamente em runtime por `create_physical_table`. O Alembic só cuidará dos metadados globais (`users`, `_tables`, etc.).

**Adicionar ao README** (seção "Como Rodar Localmente"):
```markdown
### Rodar migrações
cd backend
alembic upgrade head
```

**DoD:**
- [ ] `backend/migrations/` existe com 1 revisão de baseline.
- [ ] `alembic current` em SQLite mostra o hash da baseline.
- [ ] Startup não chama mais `create_all`.
- [ ] `pytest -q` ainda passa (os testes usam `StaticPool` em memória — precisam rodar `Base.metadata.create_all` dentro de `conftest.py`, isso fica; só o startup muda).
- [ ] Commit: `feat(backend): initialize alembic with baseline migration`.

## 1.2 Dual-engine guardrail

`database.py` precisa aceitar tanto SQLite (dev) quanto Postgres (prod) sem gambiarras espalhadas.

**Editar [backend/database.py](../backend/database.py):**

```python
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./dynamic_template.db")

def _engine_kwargs(url: str) -> dict:
    if url.startswith("sqlite"):
        return {"connect_args": {"check_same_thread": False}}
    # Postgres: pool_pre_ping evita conexões mortas; pool_size conservador
    return {"pool_pre_ping": True, "pool_size": 5, "max_overflow": 10}

engine = create_engine(DATABASE_URL, **_engine_kwargs(DATABASE_URL))

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def is_postgres() -> bool:
    return engine.dialect.name == "postgresql"
```

**DoD:**
- [ ] `python -c "from database import is_postgres; print(is_postgres())"` retorna `False` no SQLite, `True` quando `DATABASE_URL` aponta pro Postgres local.
- [ ] `pytest -q` ainda passa.
- [ ] Commit: `refactor(db): extract engine kwargs + is_postgres helper`.

## 1.3 Smoke test: subir o app com Postgres

```bash
# Em um terminal:
$env:DATABASE_URL="postgresql+psycopg2://postgres:devpass@localhost:5432/dynamic_cms"
alembic upgrade head
python -m uvicorn main:app --reload --port 8000
```

Abrir `http://localhost:8000/` — deve retornar a mensagem de root sem erro.

**Login master:** tentar `POST /api/auth/login` com as credenciais master (ex: `puczaras / Zup Paras`).
- Se falhar na primeira vez, **reinicie o uvicorn**. A função `create_master_account()` em `auth.py` deve rodar no `startup_event` e injetar o master corretamente na nova base vazia do Postgres.

**DoD:**
- [ ] Backend sobe limpo com `DATABASE_URL` apontando pro Postgres.
- [ ] Login master funciona.
- [ ] Criar um admin via `POST /api/admins` funciona e aparece em `SELECT * FROM users;` no psql.
- [ ] Nenhuma tabela dinâmica foi criada ainda (isso é Fase 3).
- [ ] Commit: `chore(backend): verify postgres smoke test`.

---

# FASE 2 — Metadados + Tenant Context

Esta fase **não muda comportamento visível**. Só prepara os campos de metadata e helpers que as Fases 3 e 4 vão usar.

*(Nota de Design: As tabelas de metadados como `_tables`, `_columns` e `users` continuarão no schema `public` e **NÃO** receberão policies RLS. O isolamento de metadados continuará sendo feito em código (ex: `get_accessible_tables`). Isso é intencional para evitar que a complexidade de RLS em tabelas globais quebre rotas públicas ou fluxos de inicialização do backend.)*

## 2.1 Adicionar `tenant_id` e `schema_name` em `_tables`

**Editar [backend/models.py](../backend/models.py), classe `DynamicTable`:**

```python
class DynamicTable(Base):
    __tablename__ = "_tables"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    description = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    group_id = Column(Integer, ForeignKey("database_groups.id"), nullable=True)
    is_public = Column(Boolean, default=False)

    # NOVO:
    tenant_id = Column(Integer, nullable=False, index=True)   # = owner_id (admin), mas explícito
    schema_name = Column(String, nullable=True)                # e.g. "tenant_5"; NULL para SQLite dev
    physical_name = Column(String, nullable=True)              # nome da tabela SEM prefixo (ex.: "clientes")

    group = relationship("DatabaseGroup", back_populates="tables")
    columns = relationship("DynamicColumn", back_populates="table", cascade="all, delete-orphan")
```

**Por que três campos novos e não só `tenant_id`:**
- `tenant_id`: o valor que vai pra coluna nas tabelas dinâmicas e pra RLS.
- `schema_name`: o schema Postgres onde a tabela física vive. Em SQLite fica NULL (fallback para prefixo antigo).
- `physical_name`: o nome real da tabela dentro do schema (`clientes`, não `t5_clientes`). Mantemos separado de `name` por garantia — em alguns casos pode haver sanitização (ex.: nome com espaço → snake_case).

## 2.2 Gerar migração Alembic

```bash
alembic revision --autogenerate -m "add_tenant_fields_to_tables"
```

**Editar o arquivo gerado** para fazer backfill dos dados existentes:

```python
def upgrade() -> None:
    op.add_column('_tables', sa.Column('tenant_id', sa.Integer(), nullable=True))
    op.add_column('_tables', sa.Column('schema_name', sa.String(), nullable=True))
    op.add_column('_tables', sa.Column('physical_name', sa.String(), nullable=True))

    # Backfill: tenant_id = owner_id, physical_name = name
    op.execute("UPDATE _tables SET tenant_id = owner_id WHERE tenant_id IS NULL")
    op.execute("UPDATE _tables SET physical_name = name WHERE physical_name IS NULL")

    # Só depois, tornar tenant_id NOT NULL
    op.alter_column('_tables', 'tenant_id', nullable=False)
    op.create_index('ix__tables_tenant_id', '_tables', ['tenant_id'])

def downgrade() -> None:
    op.drop_index('ix__tables_tenant_id', table_name='_tables')
    op.drop_column('_tables', 'physical_name')
    op.drop_column('_tables', 'schema_name')
    op.drop_column('_tables', 'tenant_id')
```

**Rodar:** `alembic upgrade head` em AMBOS os ambientes (SQLite e Postgres).

## 2.3 Helper de tenant context

Criar `backend/tenant_context.py`:

```python
"""
Tenant context helpers.

Centraliza a lógica de qual tenant_id se aplica ao request corrente.
Qualquer código novo que precise saber "de quem é este request?" deve
usar estas funções — NUNCA inline `user.id` ou `user.parent_id`.
"""
from sqlalchemy.orm import Session
from sqlalchemy import text
import models


def resolve_tenant_id(user: models.User) -> int | None:
    """Retorna o tenant_id (= admin id) aplicável a este user.

    - master: None (master acessa qualquer tenant, escolha explícita caso-a-caso)
    - admin: o próprio id
    - moderator: parent_id (o admin dono)
    """
    if user.role == "master":
        return None
    if user.role == "admin":
        return user.id
    if user.role == "moderator" and user.parent_id is None:
        raise Exception("Moderador órfão detectado. Acesso negado para evitar vazamento de master.")
    return user.parent_id  # moderator


def tenant_schema_name(tenant_id: int) -> str:
    """Nome do schema Postgres para um tenant."""
    return f"tenant_{tenant_id}"


def tenant_table_prefix(tenant_id: int) -> str:
    """Prefixo legado para SQLite (fallback). Remover quando Fase 8 zerar SQLite em prod."""
    return f"t{tenant_id}_"


def set_tenant_for_session(db: Session, tenant_id: int | None) -> None:
    """Em Postgres, seta `app.tenant_id` na sessão corrente para RLS.

    Em SQLite vira no-op. Chamar no início de toda request autenticada
    que vá tocar em dados dinâmicos.
    """
    if db.bind.dialect.name != "postgresql":
        return
    if tenant_id is None:
        # Master sem tenant escolhido: usar valor sentinela que RLS reconhece como "bypass"
        db.execute(text("SELECT set_config('app.tenant_id', '0', true)"))
        db.execute(text("SELECT set_config('app.is_master', 'true', true)"))
    else:
        db.execute(text("SELECT set_config('app.tenant_id', :tid, true)"), {"tid": str(tenant_id)})
        db.execute(text("SELECT set_config('app.is_master', 'false', true)"))
```

**Substituir `get_tenant_prefix` em [backend/main.py:322-330](../backend/main.py#L322-L330)** por um import de `tenant_context`:

```python
from tenant_context import resolve_tenant_id, tenant_schema_name, tenant_table_prefix, set_tenant_for_session
from database import is_postgres

# DEPRECATED: mantido como shim durante a migração. Remover na Fase 8.
def get_tenant_prefix(user, db=None):
    tid = resolve_tenant_id(user)
    if tid is None:
        return "master_"
    return tenant_table_prefix(tid)
```

Todas as chamadas existentes a `get_tenant_prefix()` continuam funcionando igual durante a Fase 2.

**DoD:**
- [ ] `_tables` tem as 3 colunas novas, todas preenchidas para linhas existentes.
- [ ] `tenant_context.py` existe, tem docstrings, passa `python -c "import tenant_context"`.
- [ ] `grep -r "f\"t{.*\.id}_\"" backend/` devolve 0 resultados — todo prefixo está via helper.
- [ ] `pytest -q` passa.
- [ ] Commit: `feat(backend): add tenant_id/schema_name metadata + tenant_context helpers`.

---

# FASE 3 — Refactor DDL: Schema-per-Tenant + RLS

Agora começa a parte sensível. Cada passo tem um teste de fumaça próprio.

## 3.1 Criar schema do tenant no primeiro uso

Em Postgres, precisamos garantir que `CREATE SCHEMA tenant_X` tenha rodado **antes** de criar qualquer tabela dentro dele.

**Adicionar em `backend/dynamic_schema.py`:**

```python
from sqlalchemy import text
from database import engine, is_postgres

def ensure_tenant_schema(tenant_id: int) -> str:
    """Garante que o schema tenant_N existe. Retorna o nome do schema.

    Em SQLite vira no-op (retorna None).
    """
    if not is_postgres():
        return None

    schema = f"tenant_{tenant_id}"
    with engine.begin() as conn:
        conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
    return schema
```

**Chamar em [backend/main.py create_admin](../backend/main.py#L150)** — quando um master cria um admin, já provisionar o schema:

```python
@app.post("/api/admins", response_model=schemas.UserResponse)
def create_admin(user_data, db, master):
    # ... código existente que cria o User ...
    db.commit()
    db.refresh(new_admin)

    # NOVO: provisionar schema do tenant
    ensure_tenant_schema(new_admin.id)

    return new_admin
```

## 3.2 Refatorar `create_physical_table`

Substituir [backend/dynamic_schema.py:17-68](../backend/dynamic_schema.py#L17-L68) por:

```python
def create_physical_table(
    table_name: str,
    columns_data: list,
    tenant_id: int,
    foreign_keys: list = None,
):
    """
    Cria a tabela física para um tenant.

    - Postgres: CREATE TABLE tenant_X.clientes (...) + coluna tenant_id + RLS policy
    - SQLite (dev): CREATE TABLE tX_clientes (...) — comportamento legado

    Parâmetros:
        table_name: nome LÓGICO, sem prefixo (ex.: "clientes")
        columns_data: [{'name', 'data_type', 'is_primary', 'is_nullable', 'is_unique'}, ...]
        tenant_id: admin id dono dessa tabela
        foreign_keys: [{'from_col', 'to_table' (LÓGICO), 'to_col'}, ...]

    Retorna: (success: bool, message: str, schema_name: str | None, physical_name: str)
    """
    if is_postgres():
        return _create_physical_table_pg(table_name, columns_data, tenant_id, foreign_keys)
    else:
        return _create_physical_table_sqlite(table_name, columns_data, tenant_id, foreign_keys)


def _create_physical_table_pg(table_name, columns_data, tenant_id, foreign_keys):
    schema = ensure_tenant_schema(tenant_id)
    full_name = f'"{schema}"."{table_name}"'

    metadata = MetaData()
    metadata.reflect(bind=engine, schema=schema)
    if f"{schema}.{table_name}" in metadata.tables:
        return False, "Table already exists.", schema, table_name

    columns = []
    has_primary = any(col.get('is_primary') for col in columns_data)
    if not has_primary:
        columns.append(Column('id', Integer, primary_key=True, index=True, autoincrement=True))

    for col_data in columns_data:
        if not has_primary and col_data['name'].lower() == 'id':
            continue
        col_type = get_sqlalchemy_type(col_data['data_type'])
        columns.append(Column(
            col_data['name'], col_type,
            primary_key=col_data.get('is_primary', False),
            nullable=col_data.get('is_nullable', True),
            unique=col_data.get('is_unique', False),
        ))

    # SEMPRE adicionar tenant_id
    columns.append(Column('tenant_id', Integer, nullable=False, default=tenant_id, server_default=str(tenant_id)))

    constraints = []
    if foreign_keys:
        for fk in foreign_keys:
            # FK agora aponta para tabela no MESMO schema
            constraints.append(ForeignKeyConstraint(
                [fk['from_col']],
                [f'{schema}.{fk["to_table"]}.{fk["to_col"]}'],
            ))

    new_table = Table(table_name, metadata, *columns, *constraints, schema=schema)
    
    # Executar DDL e Policies na mesma transação para evitar "relation does not exist"
    with engine.begin() as conn:
        new_table.create(conn)
        # Habilitar RLS e criar policy
        conn.execute(text(f'ALTER TABLE {full_name} ENABLE ROW LEVEL SECURITY'))
        conn.execute(text(f'ALTER TABLE {full_name} FORCE ROW LEVEL SECURITY'))
        conn.execute(text(f'''
            CREATE POLICY tenant_isolation ON {full_name}
            USING (
                tenant_id = current_setting('app.tenant_id', true)::int
                OR current_setting('app.is_master', true) = 'true'
            )
            WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::int)
        '''))
        # CHECK constraint: tenant_id dessa tabela SÓ pode ser o esperado
        conn.execute(text(f'''
            ALTER TABLE {full_name}
            ADD CONSTRAINT tenant_id_matches CHECK (tenant_id = {tenant_id})
        '''))

    return True, f"Table {schema}.{table_name} created successfully.", schema, table_name


def _create_physical_table_sqlite(table_name, columns_data, tenant_id, foreign_keys):
    # COMPORTAMENTO LEGADO — extraído para função.
    prefix = f"t{tenant_id}_"
    physical_name = f"{prefix}{table_name}"

    metadata = MetaData()
    metadata.reflect(bind=engine)
    if physical_name in metadata.tables:
        return False, "Table already exists.", None, physical_name

    columns = []
    has_primary = any(col.get('is_primary') for col in columns_data)
    if not has_primary:
        columns.append(Column('id', Integer, primary_key=True, index=True, autoincrement=True))

    for col_data in columns_data:
        if not has_primary and col_data['name'].lower() == 'id':
            continue

        col_type = get_sqlalchemy_type(col_data['data_type'])
        columns.append(
            Column(
                col_data['name'],
                col_type,
                primary_key=col_data.get('is_primary', False),
                nullable=col_data.get('is_nullable', True),
                unique=col_data.get('is_unique', False)
            )
        )

    constraints = []
    if foreign_keys:
        for fk in foreign_keys:
            constraints.append(
                ForeignKeyConstraint(
                    [fk['from_col']],
                    [f"{fk['to_table']}.{fk['to_col']}"]
                )
            )

    new_table = Table(physical_name, metadata, *columns, *constraints)
    new_table.create(engine)

    return True, f"Table {physical_name} created successfully.", None, physical_name
```

**Pontos críticos desta função:**
1. **`FORCE ROW LEVEL SECURITY`** — obriga o RLS a se aplicar até pro owner da tabela. Sem isso, se o backend conectar como super-usuário, ignora RLS silenciosamente.
2. **Policy dupla:** `USING` (leitura) e `WITH CHECK` (escrita). Ambas necessárias.
3. **`is_master = 'true'` bypass:** permite master fazer operações cross-tenant (ex.: listar todas as tabelas de todos admins). Mas é o backend que decide setar essa flag.
4. **`CHECK constraint tenant_id_matches`:** redundante com RLS, mas garante que mesmo um `SET LOCAL app.tenant_id = '999'` errado não escreva lixo.

*(Decisão de Design consolidada: A duplicidade entre RLS `WITH CHECK` e a constraint `CHECK` não é excesso. O `FORCE ROW LEVEL SECURITY` é vital pois o pooler do Supabase frequentemente conecta como superuser, e sem o FORCE o superuser ignora RLS. A `CHECK constraint` funciona como defesa em profundidade caso algum bulk insert futuro desabilite o RLS.)*

## 3.3 Ajustar `create_table` em `main.py`

Editar [backend/main.py:349-451](../backend/main.py#L349-L451), seção onde cria a tabela física:

```python
# Antes:
# prefix = get_tenant_prefix(current_user)
# physical_name = f"{prefix}{table.name}"
# success, msg = create_physical_table(physical_name, cols_data_for_ddl, foreign_keys=...)

# Depois:
tenant_id = resolve_tenant_id(current_user)
if tenant_id is None:
    # Master não possui tabelas e, por padrão, as rotas CRUD normais não o suportam.
    # Se precisar que o Master leia dados via /api/{table_name}, ele deve passar
    # de qual tenant quer ler (ex: header especial) e você injetaria aqui.
    # Por ora, bloquear o Master em operações CRUD é o caminho mais seguro.
    raise HTTPException(status_code=400, detail="Master cannot own/modify tables directly here; use admin account")

# FK specs agora usam nomes LÓGICOS (sem prefixo)
# IMPORTANTE: Garanta que o payload `fk_specs` ou o local onde as FKs são salvas
# já não está acoplando o nome físico (com tX_). Audite o frontend/backend onde a FK
# é criada para garantir que ela passe apenas o nome lógico.
# (Se a migração copiar `_relations` com `to_table` legado, normalize tirando os prefixos na Fase 6).
physical_fks = [{'from_col': f['from_col'], 'to_table': f['to_table_name'], 'to_col': f['to_col']} for f in fk_specs]

success, msg, schema_name, physical_name = create_physical_table(
    table.name, cols_data_for_ddl, tenant_id=tenant_id, foreign_keys=physical_fks or None
)
if not success:
    db.delete(db_table)
    db.commit()
    raise HTTPException(status_code=400, detail=msg)

# Atualizar DynamicTable com os campos novos
db_table.tenant_id = tenant_id
db_table.schema_name = schema_name       # None em SQLite
db_table.physical_name = physical_name
db.commit()
db.refresh(db_table)
```

**DoD desta fase:**
- [ ] Com `DATABASE_URL=postgres…`, criar um admin via API. `psql`: `SELECT schema_name FROM information_schema.schemata` mostra `tenant_<id>` novo.
- [ ] Criar uma tabela `clientes` com 2 colunas via `POST /tables/`. `psql`: `\dt tenant_<id>.*` mostra a tabela.
- [ ] `SELECT tenant_id, count(*) FROM tenant_<id>.clientes` retorna linha com tenant correto depois de um INSERT.
- [ ] Tentativa de `SELECT * FROM tenant_<id>.clientes` sem setar `app.tenant_id` na sessão retorna **0 linhas** (prova que RLS está ativo).
- [ ] Em SQLite local, tudo continua funcionando com prefixo — a suite `pytest -q` passa igual.
- [ ] Commit: `feat(schema): create tenant schemas + RLS policies for dynamic tables`.

---

# FASE 4 — Refactor CRUD Dinâmico

Agora os endpoints em [backend/main.py:651-753](../backend/main.py#L651-L753) precisam usar o schema + setar o tenant context.

## 4.1 Middleware de tenant context

Adicionar em `main.py`, perto dos outros middlewares:

```python
from fastapi import Request
from tenant_context import resolve_tenant_id, set_tenant_for_session
from sqlalchemy import text

# Não podemos usar middleware direto porque precisa do `db` e do `current_user`.
# Em vez disso, criar um dependency que TODO endpoint de dados dinâmicos usa:

def tenant_db(
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    DB session com app.tenant_id setado.
    O SQLAlchemy (>= 2.0) já inicia transação com a primeira query (autocommit=False).
    Para garantir a segurança, dependência cuida do commit/rollback.
    Os endpoints NÃO devem chamar db.commit() manualmente.
    """
    tid = resolve_tenant_id(current_user)
    try:
        set_tenant_for_session(db, tid)
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        # RESET ALL antes de devolver pro pool — evita vazar app.tenant_id
        # entre requests que reusam conexão.
        if db.bind.dialect.name == "postgresql":
            try:
                db.execute(text("RESET ALL"))
            except Exception:
                pass
```

**(Defesa Arquitetural Crítica):** 
1. Ao usar o Supabase, você DEVE usar o **Session Pooler (porta 5432)**, nunca o Transaction Pooler (6543), pois o modo transação quebra a configuração da sessão (`SET LOCAL` / `set_config(..., true)`) entre diferentes queries do mesmo request.
2. Como `tenant_db` confia no autobegin do SQLAlchemy 2.0 e faz `db.commit()` / `db.rollback()` no final do `yield`, os endpoints CRUD dinâmicos **deixam de ter `db.commit()`** dentro deles. Endpoints não-dinâmicos (criação de admin, grupo, etc.) continuam usando `get_db` normal e chamando `db.commit()` como antes.

## 4.2 Refatorar cada endpoint CRUD

Para **CADA** endpoint entre linhas 651 e 753, o padrão é:

**Antes:**
```python
@app.post("/api/{table_name}")
async def create_record(table_name, request, db=Depends(get_db), current_user=Depends(get_current_active_user)):
    accessible = get_accessible_tables(current_user, db)
    db_table = next((t for t in accessible if t.name == table_name), None)
    if not db_table:
        raise HTTPException(404, "Table not found or no access")
    prefix = f"t{db_table.owner_id}_"
    physical_name = f"{prefix}{table_name}"
    meta = MetaData()
    try:
        table = Table(physical_name, meta, autoload_with=engine)
    except Exception:
        raise HTTPException(404, "Physical table not found")
    data = await request.json()
    stmt = insert(table).values(**data)
    result = db.execute(stmt)
    db.commit()
    return {"message": "Record inserted", "id": result.inserted_primary_key[0]}
```

**Depois:**
```python
@app.post("/api/{table_name}")
async def create_record(
    table_name: str,
    request: Request,
    db: Session = Depends(tenant_db),  # <-- agora usa tenant_db (que commita sozinho)
    current_user: models.User = Depends(get_current_active_user),
):
    accessible = get_accessible_tables(current_user, db)
    db_table = next((t for t in accessible if t.name == table_name), None)
    if not db_table:
        raise HTTPException(404, "Table not found or no access")

    meta = MetaData()
    try:
        if is_postgres():
            table = Table(db_table.physical_name, meta, autoload_with=engine, schema=db_table.schema_name)
        else:
            # Fallback SQLite
            physical = f"t{db_table.tenant_id}_{db_table.physical_name or db_table.name}"
            table = Table(physical, meta, autoload_with=engine)
    except Exception:
        raise HTTPException(404, "Physical table not found")

    data = await request.json()
    # IMPORTANTE: forçar tenant_id no payload (Postgres). Nunca confiar no cliente.
    if is_postgres():
        data['tenant_id'] = db_table.tenant_id

    stmt = insert(table).values(**data)
    result = db.execute(stmt)
    # db.commit() <--- REMOVIDO! O tenant_db já faz o commit.
    return {"message": "Record inserted", "id": result.inserted_primary_key[0]}
```

**Atualização em schemas.py (Pydantic):**
A tabela `_tables` (modelo `DynamicTable`) ganhou colunas `tenant_id`, `schema_name` e `physical_name`. Se o seu Pydantic `TableResponse` estiver expondo essas colunas sem querer (ex: modo `from_attributes` ou herança não controlada), o frontend receberá dados físicos vazando informação de backend.
**Regra:** Não adicione esses novos campos no Pydantic de resposta da API (ou exclua-os explicitamente). O frontend deve continuar lidando apenas com o nome lógico.

**Repetir o mesmo padrão para:**
- `GET /api/{table_name}`
- `PUT /api/{table_name}/{record_id}`
- `DELETE /api/{table_name}/{record_id}`

### 4.2.1 Lidando com Endpoints Públicos (`/public/api/...`)

Os endpoints públicos (como `GET /public/api/{table_name}`) **NÃO** usam autenticação, então a `tenant_db` normal falhará.
O fluxo de segurança aqui é:
1. Validar na tabela `_tables` (que fica no schema `public`) se a tabela existe e está como `is_public=true`.
2. Essa busca te diz de quem é a tabela (`tenant_id`).
3. Setar a sessão e consumir a tabela.

Para evitar copy-paste de código de transação, crie um helper focado:

```python
def public_tenant_db(table_name: str, db: Session = Depends(get_db)):
    """Busca a tabela e retorna a sessão transacionada no tenant se for pública."""
    db_table = db.query(models.DynamicTable).filter(
        models.DynamicTable.name == table_name,
        models.DynamicTable.is_public == True
    ).first()
    
    if not db_table:
        raise HTTPException(404, "Table not found or not public")

    # Mesma lógica de tenant_db: confiar no autobegin do SQLAlchemy 2.0
    try:
        set_tenant_for_session(db, db_table.tenant_id)
        yield db, db_table
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        if db.bind.dialect.name == "postgresql":
            try:
                db.execute(text("RESET ALL"))
            except Exception:
                pass
```
*Assim o endpoint `GET /public/api/{table_name}` usa `(db, db_table) = Depends(public_tenant_db)` com extrema segurança.*
*ATENÇÃO: `public_tenant_db` NUNCA pode setar `is_master=true`. O fluxo de `resolve_tenant_id` não entra aqui — sempre usa o `db_table.tenant_id` resolvido pela própria query de `_tables`.*

**Pontos delicados:**
- **Write paths:** sempre injetar `tenant_id` no payload no backend, mesmo que o cliente mande. Remover chave do cliente se veio.
- **Filtros de data:** `SELECT * FROM tenant_5.clientes` em Postgres JÁ vai ser filtrado pelo RLS; não precisa adicionar `WHERE tenant_id = X` manualmente. Mas adicionar não custa e vira cinto-e-suspensório.

## 4.3 Refatorar SQL Import

Em [backend/main.py:763+](../backend/main.py#L763), o parser de SQL precisa entender que:
- Em Postgres, os `CREATE TABLE` gerados pelo import devem criar tabelas **no schema do tenant**, com coluna `tenant_id` + RLS.
- Em SQLite, continua com prefixo.

Isso é complexo — sugestão: após parsear o dump com `sqlglot`, **não executar o SQL cru**. Em vez disso, converter cada `CREATE TABLE` em uma chamada a `create_physical_table()` (que já faz a coisa certa). Os `INSERT` viram chamadas a `insert(table).values(**row, tenant_id=X)`.

Isso casa com BUG-01 do Milestone 2 — e é justamente por isso que **M2 precisa estar fechado antes**.

**DoD Fase 4:**
- [ ] Todos os endpoints `/api/{table_name}*` funcionam em Postgres com RLS ativo.
- [ ] Teste manual: admin A cria `clientes`, insere 3 records. Admin B não enxerga nenhum via `GET /api/clientes` (retorna 404 porque sua tabela `clientes` é outra, ou array vazio se ele também criou uma).
- [ ] Teste manual direto em `psql` como super-usuário: `SELECT * FROM tenant_A.clientes` sem setar `app.tenant_id` retorna vazio (RLS funcionando).
- [ ] Endpoints públicos continuam funcionando para tabelas marcadas `is_public=true`.
- [ ] `pytest -q` passa em SQLite E em Postgres (rodar a suite com ambos os `DATABASE_URL`).
- [ ] Frontend não precisou ser tocado (confirmar abrindo o admin e o dashboard público).
- [ ] Commit: `feat(crud): route dynamic CRUD through tenant schema + RLS context`.

---

# FASE 5 — Supabase Auth (Removido)

Decisão técnica: Não vamos unir RLS com Supabase Auth agora. Fazer migração massiva de dados e trocar toda a infra de JWT de uma vez é o caminho mais rápido para quebrar tudo.
O backend manterá seu JWT atual (HS256) e proverá segurança pro RLS via `tenant_db`.
A integração Auth foi movida para o [Milestone 4 (planning/backlog_m4_auth_unification.md)](backlog_m4_auth_unification.md).

---

# FASE 6 — Migração de Dados do SQLite Legado

Se existir um `backend/dynamic_template.db` em produção com dados reais que precisam ir para Postgres, este é o momento. Se for instalação limpa, pular.

## 6.1 Script `backend/migrate_sqlite_to_postgres.py`

```python
"""
Migra dados do SQLite legado (com prefixo tX_) para Postgres (schema tenant_X + RLS).

Uso:
    python migrate_sqlite_to_postgres.py \
        --sqlite-path ./dynamic_template.db \
        --postgres-url postgresql+psycopg2://...

Fluxo:
    1. Backup do SQLite.
    2. Abre AMBAS as conexões.
    3. Migra tabelas de sistema (users, groups, permissions, _tables, _columns, _relations, qr_login_sessions).
    4. Para cada linha em _tables:
       a. ensure_tenant_schema(tenant_id)
       b. Lê schema da tabela física tX_name no SQLite
       c. Recria em Postgres via create_physical_table (aplica RLS automaticamente)
       d. Copia dados em batches, injetando tenant_id
    5. Verifica contagens.
"""
import argparse, shutil, datetime, sys
from sqlalchemy import create_engine, MetaData, Table, text, inspect

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--sqlite-path', required=True)
    parser.add_argument('--postgres-url', required=True)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    # 1. Backup
    ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    backup = f'{args.sqlite_path}.bak-{ts}'
    shutil.copyfile(args.sqlite_path, backup)
    print(f"[OK] Backup: {backup}")

    src = create_engine(f'sqlite:///{args.sqlite_path}')
    dst = create_engine(args.postgres_url)

    # 2. Tabelas de sistema (copy direto, schemas iguais)
    SYSTEM_TABLES = ['users', 'database_groups', 'moderator_permissions',
                     '_tables', '_columns', '_relations', 'qr_login_sessions']
    for t in SYSTEM_TABLES:
        print(f"[SYS] Migrando {t}...")
        with src.begin() as src_conn, dst.begin() as dst_conn:
            if inspect(src).has_table(t):
                records = src_conn.execute(text(f"SELECT * FROM {t}")).fetchall()
                if records:
                    insert_data = [dict(rec._mapping) for rec in records]
                    
                    meta_dst = MetaData()
                    meta_dst.reflect(bind=dst)
                    target_table = meta_dst.tables[t]
                    
                    dst_conn.execute(target_table.insert(), insert_data)
                
                # Validação rápida de contagem
                c_src = src_conn.execute(text(f"SELECT count(*) FROM {t}")).scalar()
                c_dst = dst_conn.execute(text(f"SELECT count(*) FROM {t}")).scalar()
                if c_src != c_dst:
                    raise Exception(f"ERRO CONTAGEM SYS {t}: {c_src} != {c_dst}")

    # 3. Tabelas dinâmicas
    # A ordem importa: _tables e _columns precisam estar migradas antes de iniciar este loop.
    # IMPORTANTE: Antes de chegar aqui, aponte a engine padrão do backend para `dst` para
    # que `create_physical_table` (que usa `from database import engine`) opere no Postgres.
    # Recomendado: setar DATABASE_URL no ambiente ANTES de rodar o script e importar.
    import os
    os.environ["DATABASE_URL"] = args.postgres_url
    from dynamic_schema import create_physical_table
    from tenant_context import set_tenant_for_session
    from database import SessionLocal

    with src.begin() as src_conn:
        tables_meta = src_conn.execute(text(
            "SELECT tenant_id, name, physical_name FROM _tables"
        )).fetchall()

    for row in tables_meta:
        tenant_id, logical_name, legacy_phys_name = row
        old_table_name = legacy_phys_name or f"t{tenant_id}_{logical_name}"
        print(f"[TBL] Migrando {old_table_name} → tenant_{tenant_id}.{logical_name}")

        # a. Ler estrutura do _columns do DESTINO (já migrado no passo 2)
        with dst.begin() as dst_conn:
            table_id = dst_conn.execute(
                text("SELECT id FROM _tables WHERE name = :n AND tenant_id = :t"),
                {"n": logical_name, "t": tenant_id},
            ).scalar()
            cols = dst_conn.execute(
                text("SELECT name, data_type, is_primary, is_nullable, is_unique "
                     "FROM _columns WHERE table_id = :tid"),
                {"tid": table_id},
            ).fetchall()
        cols_data = [dict(c._mapping) for c in cols]

        # b. Recria a tabela física em Postgres (cria schema se não existir, aplica RLS)
        # FKs: normalizar `to_table` se vier prefixado (ex: "t5_clientes" → "clientes")
        #      ler de _relations e passar para create_physical_table se precisar.
        ok, msg, schema, phys = create_physical_table(
            logical_name, cols_data, tenant_id=tenant_id, foreign_keys=None
        )
        if not ok and "already exists" not in msg:
            raise Exception(f"Falha ao criar {logical_name}: {msg}")

        # c. Copia os dados via SQLAlchemy Session (precisa de SET LOCAL app.tenant_id)
        if not inspect(src).has_table(old_table_name):
            print(f"  [SKIP] {old_table_name} não existe no SQLite")
            continue

        with src.begin() as src_conn:
            records = src_conn.execute(text(f'SELECT * FROM "{old_table_name}"')).fetchall()

        if not records:
            print(f"  [OK] {old_table_name}: 0 registros")
            continue

        insert_data = []
        for rec in records:
            rec_dict = dict(rec._mapping)
            rec_dict["tenant_id"] = tenant_id
            insert_data.append(rec_dict)

        # Session com tenant context — necessário porque FORCE RLS + WITH CHECK bloqueia
        # escrita direta. Setar o tenant para o próprio tenant_id desta tabela.
        session = SessionLocal()
        try:
            set_tenant_for_session(session, tenant_id)
            meta_dst = MetaData(schema=f"tenant_{tenant_id}")
            meta_dst.reflect(bind=session.bind, schema=f"tenant_{tenant_id}")
            target_table = meta_dst.tables[f"tenant_{tenant_id}.{logical_name}"]
            session.execute(target_table.insert(), insert_data)
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

        # d. Validar a contagem
        with src.begin() as src_conn, dst.begin() as dst_conn:
            # Para contar no destino, setar tenant também:
            dst_conn.execute(text("SELECT set_config('app.tenant_id', :t, true)"),
                             {"t": str(tenant_id)})
            count_src = src_conn.execute(text(f'SELECT count(*) FROM "{old_table_name}"')).scalar()
            count_dst = dst_conn.execute(
                text(f'SELECT count(*) FROM "tenant_{tenant_id}"."{logical_name}"')
            ).scalar()
        if count_src != count_dst:
            raise Exception(f"ERRO DE CONTAGEM em {logical_name}: src={count_src}, dst={count_dst}")
        print(f"  [OK] {count_src} registros migrados")

    print("[DONE]")

if __name__ == '__main__':
    main()
```
*Nice-to-have:* Adicionar a flag `--only-tenant <id>` no argparse para testes granulares e rollback parcial.

**Checklist de execução:**
1. Backup manual do SQLite (já feito pelo script, mas reforçar).
2. Dry-run: `python migrate_sqlite_to_postgres.py --sqlite-path … --postgres-url … --dry-run`
3. Revisar o plano de migração (script imprime contagens antes de executar).
4. Execução real.
5. Validação:
   - `SELECT count(*) FROM users;` igual em ambos.
   - Para cada `(tenant_id, name)` em `_tables`, `SELECT count(*) FROM tenant_X.name` no Postgres = `SELECT count(*) FROM tX_name` no SQLite.
   - Login master funciona no Postgres.

## 6.2 Rollback plan

Se algo der errado em produção:
1. Parar o backend.
2. Restaurar `DATABASE_URL=sqlite:///./dynamic_template.db.bak-YYYYMMDD`.
3. Subir backend antigo (tag anterior ao deploy de M3).
4. Comunicar.

**DoD:**
- [ ] Script `migrate_sqlite_to_postgres.py` existe, tem `--dry-run`, cria backup.
- [ ] Documentado em `planning/migration_runbook.md` com passo-a-passo do dia D.
- [ ] Testado em uma cópia do banco de dev.
- [ ] Commit: `feat(migration): sqlite→postgres data migration script`.

---

# FASE 7 — Testes

## 7.1 Cobertura alvo TestSprite

**Novos testes a escrever:**

1. **`test_rls_isolation_admin_to_admin()`**
   - Cria admin A, cria tabela `clientes` no schema dele, insere 3 records.
   - Cria admin B, faz login dele.
   - `GET /api/clientes` como admin B: deve retornar 404 (a tabela de A não está acessível a B).
   - `GET /public/api/clientes` se `is_public=false`: 404.
   - Se `is_public=true`: retorna os records de A (permitido via public).

2. **`test_rls_isolation_moderator()`**
   - Admin A cria moderador M com acesso ao grupo G.
   - Admin A cria tabela `secreta` fora do grupo G.
   - Moderador M: `GET /api/secreta` → 404. `POST /api/secreta` → 404.

3. **`test_rls_raw_sql_bypass_attempt()`** (Postgres-only)
   - Cria um role não-super (ex: `app_user`) durante o setup de testes.
   - Abre conexão direta via psycopg2 logado como `app_user`.
   - Seta `app.tenant_id = '999'`.
   - Tenta `SELECT * FROM tenant_1.clientes` → retorna 0 linhas.
   - Tenta `INSERT INTO tenant_1.clientes (…) VALUES (…)` → deve ser bloqueado pela policy `WITH CHECK` ou pela CHECK constraint `tenant_id_matches`.

4. **`test_schema_creation_on_admin_create()`**
   - Master cria admin novo.
   - Checar que schema `tenant_<id>` existe em `information_schema.schemata`.

5. **`test_migration_script_roundtrip()`**
   - Cria SQLite fixture com 2 admins, 4 tabelas dinâmicas, dados.
   - Roda `migrate_sqlite_to_postgres.py` apontando pra um Postgres de teste.
   - Valida contagens, schemas, RLS.

6. **`test_crud_still_works_sqlite()`**
   - Bateria completa existente — deve continuar verde com SQLite.

## 7.2 Setup do conftest.py (Dual-Engine)

O pytest precisa funcionar independentemente da engine que está rodando. O `conftest.py` precisa ser atualizado:

1. **Como detectar SQLite ou Postgres:** O conftest deve ler `os.environ.get("DATABASE_URL")`. Se contiver `postgres`, conecta no Postgres local.
2. **Setup do DB no Postgres:**
   - O banco `dynamic_cms_test` precisa ser criado **antes** do pytest rodar (o estagiário criará com um `CREATE DATABASE`).
   - O pytest rodará `Base.metadata.create_all()` normalmente para provisionar as tabelas base (`users`, `_tables`, etc.).
3. **Teardown das tabelas dinâmicas (Schemas Postgres):**
   No Postgres, cada teste criará schemas (`tenant_X`). O `Base.metadata.drop_all()` no final de cada teste ou session **não dropa schemas dinâmicos**. 
   Adicione um teardown explícito em `conftest.py`:
   ```python
   if is_postgres():
       with engine.begin() as conn:
           # Dropa schemas tenant_* em cascata
           schemas = conn.execute(text("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%'")).fetchall()
           for (schema_name,) in schemas:
               conn.execute(text(f'DROP SCHEMA "{schema_name}" CASCADE'))
   ```

## 7.3 Comando TestSprite

O Diretor vai rodar:
```bash
cd backend
# Postgres (certifique-se de que o DB dynamic_cms_test existe no docker):
$env:DATABASE_URL="postgresql+psycopg2://postgres:devpass@localhost:5432/dynamic_cms_test"
alembic upgrade head
pytest -q -m "not slow"
# SQLite:
$env:DATABASE_URL="sqlite:///./test.db"
pytest -q -m "not slow"
```

## 7.4 Smoke manual checklist

Depois do pytest verde, um humano (Diretor ou estagiário) precisa bater o seguinte no frontend rodando contra Postgres:

- [ ] Login master → funciona.
- [ ] Criar admin → funciona, schema `tenant_N` aparece.
- [ ] Login como admin → funciona.
- [ ] Criar grupo de dados → funciona.
- [ ] Criar tabela `clientes` com 3 colunas → aparece em `tenant_N.clientes` com RLS.
- [ ] Inserir, listar, editar, deletar record → funciona.
- [ ] Tornar tabela pública → `GET /public/api/clientes` devolve dados.
- [ ] Dashboard público renderiza widget da tabela.
- [ ] Criar FK entre `pedidos` e `clientes` (FEAT-01 do M2) → continua funcionando.
- [ ] Import SQL de um `.sql` → continua funcionando.
- [ ] QR login → continua funcionando.
- [ ] Trocar tema (4 modos × 6 cores) → sem regressão.

**Smoke Crítico Adicional: Isolamento na UI**
Sem esses checks, podemos passar nos testes mas ter a UI vazando info (ex: cache de SWR/React Query preso na aba após logout).
- [ ] **Isolamento cross-admin na UI:** Logado como Admin A, criar tabela `teste_isolation` com 1 record. Fazer logout. Logar como Admin B na mesma aba. Confirmar: (a) `teste_isolation` NÃO aparece na lista; (b) tentar `GET /api/teste_isolation` retorna 404; (c) se Admin B criar a sua `teste_isolation`, só vê os próprios records.
- [ ] **Moderador com grupo restrito:** Admin A cria G1 com tabela `publica`, G2 com `restrita`. Moderador M (só G1) faz login: só vê `publica`.

**DoD:**
- [ ] Todos os testes novos passam em Postgres.
- [ ] Todos os testes antigos passam em SQLite e Postgres.
- [ ] Smoke manual 100% checado.
- [ ] Commit: `test(rls): isolation + migration coverage`.

---

# FASE 8 — Deploy: Vercel + Supabase + Railway

## 8.1 Supabase

1. Criar projeto em supabase.com.
2. Copiar `DATABASE_URL` (Settings → Database → Connection string → URI).
3. Rodar `alembic upgrade head` apontando pra esse URL.
4. Rodar script de migração de dados (se aplicável).
5. Testar RLS via SQL Editor do Supabase.

## 8.2 Railway (Backend)

1. Novo projeto → "Deploy from GitHub repo".
2. Env vars:
   - `DATABASE_URL` = URL do Supabase (pooler, connection string para app). **AVISO CRÍTICO: USE A PORTA 5432 (Session Pooler). O TRANSACTION POOLER (6543) QUEBRA O `SET LOCAL` E VAZA RLS ENTRE REQUESTS.**
   - `SECRET_KEY` = token forte gerado (`openssl rand -hex 32`).
3. Start command: `alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port $PORT`.
4. Custom domain: `api.dynamicsql.app` (ou equivalente).

## 8.3 Vercel (Frontend)

1. Novo projeto → import do repo, root = `frontend/`.
2. Env vars:
   - `NEXT_PUBLIC_API_URL` = URL do Railway.
3. Deploy. Custom domain.

## 8.4 Docs finais

Criar `DEPLOY.md` na raiz com:
- Diagrama de deploy.
- Passo-a-passo reproduzível.
- Como rodar `pg_dump --schema=tenant_X` para exportar um tenant.
- Rollback (voltar pra SQLite local, tag anterior, etc).

**DoD:**
- [ ] API pública em Railway respondendo.
- [ ] Frontend público em Vercel carregando.
- [ ] Login master em produção funciona.
- [ ] `DEPLOY.md` completo.
- [ ] Patch note `v2.0.0` lançado em `planning/patch_notes.md`.

---

# 🧾 Resumo de Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| RLS bloqueia queries legítimas (false negative) | Média | Alta | `tenant_db` dependency em TODOS os endpoints de dados; testes `test_rls_*`. |
| Migração de dados corrompe ou duplica | Baixa | Catastrófica | Backup obrigatório, `--dry-run` default, validação de contagens. |
| Queries lentas em Postgres (N+1 com schema qualified names) | Média | Média | `pool_pre_ping`, `EXPLAIN` nos queries críticos antes do deploy. |
| Frontend quebra por mudança em campo retornado | Baixa | Média | `TableResponse` não muda schema. `physical_name` só no backend. |
| Import SQL legado não casa com novo pipeline | Alta | Alta | Por isso M2 precisa estar fechado antes. |
| Supabase pooler connection limits | Média | Média | Usar connection pool do Supabase; `pool_size=5` no SQLAlchemy. |
| Master bypass (`is_master=true`) vaza para endpoints errados | Média | Alta | Auditoria: `grep -r "is_master" backend/` antes do deploy; endpoints públicos NUNCA setam master. |

---

# ✅ Checklist Final de Aprovação

Antes do Diretor dar `merge final`:

- [ ] Todas as 8 fases com DoD marcado.
- [ ] `pytest -q` verde em SQLite **e** em Postgres.
- [ ] Smoke manual completo em staging.
- [ ] `DEPLOY.md` na raiz.
- [ ] `patch_notes.md` atualizado com `v2.0.0 (Milestone 3 — RLS Migration)`.
- [ ] Branch squash-merged para `main` com um único commit grande OU série de commits por fase (escolha do Diretor).
- [ ] Tag `v2.0.0` em git.
- [ ] Post-mortem em `planning/logs/m3_postmortem.md` — o que deu certo, o que foi surpresa, quanto tempo realmente levou.

---

# 📚 Glossário Para Estagiário

- **RLS (Row Level Security):** feature do Postgres onde o banco filtra linhas automaticamente baseado em uma "policy". O backend não precisa `WHERE tenant_id=X` — o Postgres adiciona isso sozinho a cada query.
- **Schema (Postgres):** namespace de tabelas dentro de um database. `tenant_5.clientes` é uma tabela `clientes` no schema `tenant_5`. Diferente de `schema` no sentido "estrutura/colunas".
- **`SET LOCAL`:** comando do Postgres que seta uma variável de sessão válida só até o fim da transação. Usamos `SET LOCAL app.tenant_id` para informar ao RLS quem é o tenant corrente.
- **`current_setting('x', true)`:** lê a variável `x`; o `true` faz retornar NULL em vez de erro se não existir.
- **`FORCE ROW LEVEL SECURITY`:** força RLS mesmo para o dono da tabela. Sem isso, o backend (conectado como super) ignora RLS. Obrigatório na nossa arquitetura.
- **Alembic:** ferramenta de migrações para SQLAlchemy. Versiona o schema do banco em arquivos Python dentro de `migrations/versions/`.
- **`WITH CHECK` em policy:** garante que o valor que ESTÁ SENDO ESCRITO bate com a policy (evita UPDATE trocar `tenant_id`).

---

# 🔗 Referências

- Postgres RLS docs: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- Supabase RLS guide: https://supabase.com/docs/guides/database/postgres/row-level-security
- Alembic tutorial: https://alembic.sqlalchemy.org/en/latest/tutorial.html
- SQLAlchemy multi-tenant patterns: https://docs.sqlalchemy.org/en/20/orm/session_transaction.html#joining-a-session-into-an-external-transaction-such-as-for-test-suites

---

*Documento mantido em `planning/milestone_3_rls_migration.md`. Atualize conforme a execução avança; marque DoDs concluídos.*
