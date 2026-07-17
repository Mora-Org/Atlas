from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Text, JSON
from sqlalchemy.orm import relationship
import datetime
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="moderator", nullable=False)  # 'master', 'admin', or 'moderator'
    parent_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # admin→master, mod→admin
    workspace_name = Column(String, nullable=True)   # editorial display name, e.g. "Centro Budista do Brasil"
    workspace_slug = Column(String, nullable=True, unique=True)  # URL-safe slug, e.g. "centrobudista"
    # M4: referência ao auth.users.id do Supabase. Nullable durante
    # cutover — backfilled pelo startup do backend via Admin API.
    supabase_uid = Column(String(36), unique=True, nullable=True, index=True)

    # Admin owns database groups
    owned_groups = relationship("DatabaseGroup", back_populates="admin", cascade="all, delete-orphan")
    # Moderator permissions
    permissions = relationship("ModeratorPermission", back_populates="moderator", cascade="all, delete-orphan",
                               foreign_keys="ModeratorPermission.moderator_id")
    # Tables owned by this admin
    owned_tables = relationship("DynamicTable", back_populates="owner", cascade="all, delete-orphan", foreign_keys="DynamicTable.owner_id")


class DatabaseGroup(Base):
    """Logical group of tables owned by an admin"""
    __tablename__ = "database_groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    admin_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    admin = relationship("User", back_populates="owned_groups")
    tables = relationship("DynamicTable", back_populates="group", cascade="all, delete-orphan")
    permissions = relationship("ModeratorPermission", back_populates="group", cascade="all, delete-orphan")


class ModeratorPermission(Base):
    """Links a moderator to a database group they can access"""
    __tablename__ = "moderator_permissions"

    id = Column(Integer, primary_key=True, index=True)
    moderator_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    database_group_id = Column(Integer, ForeignKey("database_groups.id"), nullable=False)

    moderator = relationship("User", back_populates="permissions", foreign_keys=[moderator_id])
    group = relationship("DatabaseGroup", back_populates="permissions")


class DynamicTable(Base):
    __tablename__ = "_tables"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    description = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    group_id = Column(Integer, ForeignKey("database_groups.id"), nullable=True)
    is_public = Column(Boolean, default=False)

    # Tenant metadata (M3 Fase 2):
    # tenant_id    = admin id explícito; vai pra RLS no Postgres.
    # schema_name  = "tenant_5" no Postgres; NULL no SQLite (fallback prefix).
    # physical_name = nome real no schema (ex.: "clientes" — sem prefixo legado t5_).
    tenant_id = Column(Integer, nullable=False, index=True)
    schema_name = Column(String, nullable=True)
    physical_name = Column(String, nullable=True)

    owner = relationship("User", back_populates="owned_tables", foreign_keys=[owner_id])
    group = relationship("DatabaseGroup", back_populates="tables")
    columns = relationship("DynamicColumn", back_populates="table", cascade="all, delete-orphan")
    from_relations = relationship("DynamicRelation", back_populates="from_table", cascade="all, delete-orphan", foreign_keys="DynamicRelation.from_table_id")
    to_relations = relationship("DynamicRelation", back_populates="to_table", cascade="all, delete-orphan", foreign_keys="DynamicRelation.to_table_id")
    # M8.5 F1: cascade ORM (não `ondelete`) — SQLite não enforce FK, então
    # `ondelete=CASCADE` seria no-op em dev e só funcionaria em prod. Isto dá
    # de graça a limpeza no delete de tabela (main.py:1016) e de admin (:285).
    views = relationship("DynamicView", back_populates="table", cascade="all, delete-orphan")


class DynamicColumn(Base):
    __tablename__ = "_columns"

    id = Column(Integer, primary_key=True, index=True)
    table_id = Column(Integer, ForeignKey("_tables.id"), nullable=False)
    name = Column(String, nullable=False)
    data_type = Column(String, nullable=False)
    is_nullable = Column(Boolean, default=True)
    is_unique = Column(Boolean, default=False)
    is_primary = Column(Boolean, default=False)
    fk_table = Column(String, nullable=True)   # logical name of referenced table
    fk_column = Column(String, nullable=True)  # referenced column (e.g. "id")

    table = relationship("DynamicTable", back_populates="columns")


class DynamicRelation(Base):
    __tablename__ = "_relations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    from_table_id = Column(Integer, ForeignKey("_tables.id"), nullable=False)
    to_table_id = Column(Integer, ForeignKey("_tables.id"), nullable=False)
    relation_type = Column(String, nullable=False)
    junction_table_name = Column(String, nullable=True)
    from_column_name = Column(String, nullable=True)
    to_column_name = Column(String, nullable=True)

    from_table = relationship("DynamicTable", back_populates="from_relations", foreign_keys=[from_table_id])
    to_table = relationship("DynamicTable", back_populates="to_relations", foreign_keys=[to_table_id])

class QRLoginSession(Base):
    """Temporary session for QR code login"""
    __tablename__ = "qr_login_sessions"

    session_id = Column(String, primary_key=True, index=True)
    authorized_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    is_authorized = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)

    user = relationship("User")


class Asset(Base):
    """M8 F1: Media Library central do workspace.

    Um asset = um blob no bucket de mídia + metadados aqui. A célula da
    tabela dinâmica guarda a URL pública (string); a resolução URL→asset é
    por `path` (opaco: `{owner_id}/{uuid}{ext}`, imutável, nunca upsert).
    `refcount` conta referências de células — mantido por expressão SQL nos
    hooks do CRUD/DDL (media_cleanup.py). Blob órfão (refcount=0) só sai
    via GC explícito (idade mínima), DELETE do asset ou delete_admin.
    """
    __tablename__ = "_assets"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # Autoria (admin ou moderador — a biblioteca é do workspace inteiro).
    uploaded_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    path = Column(String, unique=True, nullable=False, index=True)
    mime = Column(String, nullable=False)
    size_bytes = Column(Integer, nullable=False)
    original_name = Column(String, nullable=False)
    refcount = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    owner = relationship("User", foreign_keys=[owner_id])


class DynamicView(Base):
    """M8.5 F1: view salva — recorte + agregação persistidos como artefato de
    workspace consultável (decisão 4 do Diretor, 2026-07-12). É o insumo do
    chart builder da F2 e o substrato dos live charts do M10 F4.

    Schema HÍBRIDO (decisão 11, 2026-07-16): o que o backend precisa PROCURAR
    mora em coluna própria — o publish varre as views de uma tabela por campo
    indexado sem abrir o pacote, e o guard de "essa coluna está em uso por um
    gráfico" filtra por `group_by`/`metric_column` como já se faz pras relações
    (main.py:940-949). O resto (filtros, ordenação, e o que a F2 inventar) mora
    em `config`, que cresce sem migration em produção.

    `config` é OPACA em SQL — filtrada em Python, nunca com `@>`/GIN. O tipo
    físico divergiu por história do banco: prod (incremental) tem `jsonb`, mas
    DB fresh e o test-DB têm `json`, porque este model declara `JSON` e o
    `create_all` emite `JSON` enquanto a migration c5dad43f9889:40 emite
    `JSONB`. Operador de jsonb funcionaria em prod e quebraria em ambiente
    novo — e o teste passaria/falharia pelo motivo errado.
    """
    __tablename__ = "_views"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # Autoria (admin ou moderador — a view é do workspace inteiro, molde da
    # Media Library; decisão 12).
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    # FK SEM `ondelete`: a limpeza é pelo cascade ORM em DynamicTable.views —
    # único desenho que limpa nos DOIS bancos (medido). Ligar por NOME está
    # descartado: não existe rename, então reciclar um nome seria drop+create e
    # a view velha se re-attacharia a uma tabela nova com dado diferente.
    table_id = Column(Integer, ForeignKey("_tables.id"), nullable=False, index=True)
    name = Column(String, nullable=False)

    # --- Campos próprios: o backend procura por estes ---
    # Coluna de agrupamento (o eixo das categorias).
    group_by = Column(String, nullable=False)
    # count | count_distinct | sum | avg — decisão 10. `min`/`max` ficam FORA
    # de propósito: MAX em booleana passa em dev (=1) e dá 500 em prod, e
    # MIN/MAX em texto dá eixo alfabético. Validado na porta pelo schema.
    operation = Column(String, nullable=False)
    # NULL quando operation='count' (contar não precisa de coluna-métrica).
    metric_column = Column(String, nullable=True)

    # --- Pacote flexível: a F2 cresce aqui sem tocar no banco ---
    config = Column(JSON, default=dict, nullable=False)

    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow,
                        onupdate=datetime.datetime.utcnow, nullable=False)

    table = relationship("DynamicTable", back_populates="views")
    owner = relationship("User", foreign_keys=[owner_id])
    author = relationship("User", foreign_keys=[created_by])


class PublicationVersion(Base):
    """M6 Fase 1: snapshot imutável publicado de um workspace.

    - Metadados ficam aqui (tema, seleção de tabelas, layouts).
    - Os dados (rows das tabelas curadas) ficam em Supabase Storage no
      caminho `storage_path` como JSON único. Esse split mantém a DB
      enxuta e permite servir o site público sem hit no backend.
    - Apenas uma `is_active=True` por owner (UNIQUE INDEX parcial na
      migration).
    """
    __tablename__ = "_publication_versions"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)  # 1, 2, 3… por owner
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    is_active = Column(Boolean, default=False, nullable=False)
    # Quando esta versão foi ATIVADA pela última vez (publish ou rollback).
    # created_at diz quando o snapshot nasceu; sem este campo a data da
    # "edição vigente" mente após um rollback (M6.5 PR3).
    activated_at = Column(DateTime, nullable=True)
    description = Column(Text, nullable=True)
    storage_path = Column(Text, nullable=False)
    theme_config = Column(JSON, default=dict, nullable=False)
    table_selection = Column(JSON, default=list, nullable=False)

    owner = relationship("User", foreign_keys=[owner_id])
    author = relationship("User", foreign_keys=[created_by])
