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

    group = relationship("DatabaseGroup", back_populates="tables")
    columns = relationship("DynamicColumn", back_populates="table", cascade="all, delete-orphan")


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

    from_table = relationship("DynamicTable", foreign_keys=[from_table_id])
    to_table = relationship("DynamicTable", foreign_keys=[to_table_id])

class QRLoginSession(Base):
    """Temporary session for QR code login"""
    __tablename__ = "qr_login_sessions"

    session_id = Column(String, primary_key=True, index=True)
    authorized_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    is_authorized = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)

    user = relationship("User")


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
    description = Column(Text, nullable=True)
    storage_path = Column(Text, nullable=False)
    theme_config = Column(JSON, default=dict, nullable=False)
    table_selection = Column(JSON, default=list, nullable=False)

    owner = relationship("User", foreign_keys=[owner_id])
    author = relationship("User", foreign_keys=[created_by])
