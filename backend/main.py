from fastapi import FastAPI, Depends, HTTPException, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import Table, MetaData, insert, select, update, delete, text, String, func
from typing import List
import io

import models, schemas
import supabase_admin
from database import engine, get_db, is_postgres
from dynamic_schema import create_physical_table
from tenant_context import (
    resolve_tenant_id,
    set_tenant_for_session,
    tenant_table_prefix,
)
from auth import (
    auth_router, create_master_account,
    get_current_active_user, get_current_admin, get_current_master,
    get_password_hash
)

app = FastAPI(title="Dynamic CMS API")

@app.on_event("startup")
def startup_event():
    # Schema é gerenciado por Alembic — `alembic upgrade head` antes do deploy.
    # `Base.metadata.create_all` continua sendo usado pelo conftest dos testes
    # (in-memory SQLite isolado por teste), mas não roda no runtime do app.
    # Seed master account
    db_seed = next(get_db())
    try:
        create_master_account(db_seed)
        # Clean up old master account if it exists
        _old_master = db_seed.query(models.User).filter(models.User.username == "monochaco").first()
        if _old_master:
            db_seed.delete(_old_master)
            db_seed.commit()
        # Seed test admin account for automated frontend tests.
        # Skipped when SKIP_TEST_SEED=1 (set by backend pytest conftest) so that
        # the backend test suite can create its own `testadmin` without collision.
        import os as _os
        if not _os.environ.get("SKIP_TEST_SEED"):
            _test_admin = db_seed.query(models.User).filter(models.User.username == "testadmin").first()
            if not _test_admin:
                _master = db_seed.query(models.User).filter(models.User.role == "master").first()
                _new_admin = models.User(
                    username="testadmin",
                    password_hash=get_password_hash("TestAdmin123!"),
                    role="admin",
                    parent_id=_master.id if _master else None,
                )
                db_seed.add(_new_admin)
                db_seed.commit()
    finally:
        db_seed.close()

# Setup CORS for Next.js
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# Auth Routes
# ==========================================
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])

@app.get("/")
def read_root():
    return {"message": "Welcome to Dynamic CMS API"}

@app.get("/api/auth/me")
def get_current_user_info(current_user: models.User = Depends(get_current_active_user)):
    """Return current authenticated user with workspace fields (with fallback defaults)."""
    from auth import _user_dict
    return _user_dict(current_user)

# ==========================================
# Master-Only: Admin Management
# ==========================================

@app.post("/api/admins", response_model=schemas.UserResponse)
def create_admin(user_data: schemas.UserCreate, db: Session = Depends(get_db), master: models.User = Depends(get_current_master)):
    if db.query(models.User).filter(models.User.username == user_data.username).first():
        raise HTTPException(status_code=400, detail="Username already exists")

    # M4: provisiona em auth.users via Admin API primeiro, depois grava
    # em public.users. Em dev/SQLite (Supabase não configurado) pula —
    # supabase_uid fica NULL.
    sup_uid = None
    if supabase_admin.is_configured():
        try:
            sup_uid = supabase_admin.provision_user(
                username=user_data.username,
                password=user_data.password,
                role="admin",
            )
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Supabase Auth error: {exc}")

    new_admin = models.User(
        username=user_data.username,
        password_hash=get_password_hash(user_data.password),
        role="admin",
        parent_id=master.id,
        supabase_uid=sup_uid,
    )
    db.add(new_admin)
    try:
        db.commit()
        db.refresh(new_admin)
    except Exception:
        db.rollback()
        # Compensação: limpa o user no Supabase pra não ficar órfão.
        if sup_uid:
            supabase_admin.delete_user(sup_uid)
        raise

    # M4: backfill do app_metadata.tenant_id (precisa do id local recém criado).
    if sup_uid:
        supabase_admin.update_user_metadata(sup_uid, role="admin", tenant_id=new_admin.id)

    # M3 Fase 3: provisiona o schema tenant_N em Postgres (no-op em SQLite).
    from dynamic_schema import ensure_tenant_schema
    ensure_tenant_schema(new_admin.id)

    return new_admin

@app.get("/api/admins", response_model=List[schemas.UserResponse])
def list_admins(db: Session = Depends(get_db), master: models.User = Depends(get_current_master)):
    return db.query(models.User).filter(models.User.role == "admin").all()

_RESERVED_SLUGS = {
    "api", "admin", "auth", "login", "master", "public", "static",
    "assets", "explore", "dashboard", "workspace", "atlas", "mora",
}

@app.patch("/api/admins/me/workspace")
def update_workspace(
    body: schemas.WorkspaceUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Admin updates their own workspace editorial name and slug."""
    if current_user.role == "master":
        raise HTTPException(status_code=403, detail="Master account does not have a workspace")
    if body.workspace_slug in _RESERVED_SLUGS:
        raise HTTPException(status_code=400, detail=f"Slug '{body.workspace_slug}' is reserved")
    conflict = db.query(models.User).filter(
        models.User.workspace_slug == body.workspace_slug,
        models.User.id != current_user.id,
    ).first()
    if conflict:
        raise HTTPException(status_code=409, detail="Slug already taken")
    current_user.workspace_name = body.workspace_name.strip()
    current_user.workspace_slug = body.workspace_slug
    db.commit()
    db.refresh(current_user)
    from auth import _user_dict
    return _user_dict(current_user)

@app.delete("/api/admins/{admin_id}")
def delete_admin(admin_id: int, db: Session = Depends(get_db), master: models.User = Depends(get_current_master)):
    admin = db.query(models.User).filter(models.User.id == admin_id, models.User.role == "admin").first()
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    sup_uid = admin.supabase_uid
    owner_id = admin.id

    # 1. Delete dependent moderators and their Supabase auth records
    mods = db.query(models.User).filter(models.User.parent_id == admin.id).all()
    mod_uids = []
    for mod in mods:
        if mod.supabase_uid:
            mod_uids.append(mod.supabase_uid)
        db.delete(mod)

    # 2. Drop the tenant schema to prevent zombie schemas
    if is_postgres():
        from tenant_context import tenant_schema_name
        schema = tenant_schema_name(admin.id)
        db.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))

    db.delete(admin)
    db.commit()

    # Cleanups externos vão *depois* do commit local — se falharem, o banco
    # já está consistente. Nunca propagam 500.

    # 3. Snapshots no Storage (cascade do Postgres só limpa
    #    `_publication_versions`, não os blobs do bucket).
    publication_storage.delete_owner_snapshots(owner_id)

    # 4. Supabase Auth. Falha aqui = órfão em auth.users, recuperável via
    #    janitor; reportado no body em vez de quebrar o cliente.
    orphans = []
    if supabase_admin.is_configured():
        for uid in ([sup_uid] if sup_uid else []) + mod_uids:
            try:
                supabase_admin.delete_user(uid)
            except Exception as exc:
                orphans.append({"uid": uid, "error": str(exc)})

    resp = {"message": "Admin deleted"}
    if orphans:
        resp["supabase_auth_orphans"] = orphans
    return resp

@app.get("/api/all-users", response_model=List[schemas.UserResponse])
def list_all_users(db: Session = Depends(get_db), master: models.User = Depends(get_current_master)):
    """Master can see all users"""
    return db.query(models.User).filter(models.User.role != "master").all()

# ==========================================
# Admin: Moderator Management
# ==========================================

@app.post("/api/moderators", response_model=schemas.UserResponse)
def create_moderator(user_data: schemas.UserCreate, db: Session = Depends(get_db), admin: models.User = Depends(get_current_admin)):
    if admin.role == "master":
        raise HTTPException(status_code=403, detail="Use /api/admins to create admins. Moderators are created by admins.")
    if db.query(models.User).filter(models.User.username == user_data.username).first():
        raise HTTPException(status_code=400, detail="Username already exists")

    # M4: provisiona em auth.users com tenant_id = admin.id (mod herda
    # tenant do admin pai). app_metadata vai direto pro JWT.
    sup_uid = None
    if supabase_admin.is_configured():
        try:
            sup_uid = supabase_admin.provision_user(
                username=user_data.username,
                password=user_data.password,
                role="moderator",
                tenant_id=admin.id,
            )
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Supabase Auth error: {exc}")

    new_mod = models.User(
        username=user_data.username,
        password_hash=get_password_hash(user_data.password),
        role="moderator",
        parent_id=admin.id,
        supabase_uid=sup_uid,
    )
    db.add(new_mod)
    try:
        db.commit()
        db.refresh(new_mod)
    except Exception:
        db.rollback()
        if sup_uid:
            supabase_admin.delete_user(sup_uid)
        raise
    return new_mod

@app.get("/api/moderators", response_model=List[schemas.UserResponse])
def list_moderators(db: Session = Depends(get_db), admin: models.User = Depends(get_current_admin)):
    if admin.role == "master":
        return db.query(models.User).filter(models.User.role == "moderator").all()
    return db.query(models.User).filter(models.User.parent_id == admin.id, models.User.role == "moderator").all()

@app.delete("/api/moderators/{mod_id}")
def delete_moderator(mod_id: int, db: Session = Depends(get_db), admin: models.User = Depends(get_current_admin)):
    mod = db.query(models.User).filter(models.User.id == mod_id, models.User.role == "moderator").first()
    if not mod:
        raise HTTPException(status_code=404, detail="Moderator not found")
    if admin.role != "master" and mod.parent_id != admin.id:
        raise HTTPException(status_code=403, detail="Not your moderator")
    sup_uid = mod.supabase_uid
    db.delete(mod)
    db.commit()
    if sup_uid and supabase_admin.is_configured():
        supabase_admin.delete_user(sup_uid)
    return {"message": "Moderator deleted"}

@app.post("/api/moderators/{mod_id}/reset-password")
def reset_moderator_password(mod_id: int, body: schemas.PasswordReset, db: Session = Depends(get_db), admin: models.User = Depends(get_current_admin)):
    mod = db.query(models.User).filter(models.User.id == mod_id, models.User.role == "moderator").first()
    if not mod:
        raise HTTPException(status_code=404, detail="Moderator not found")
    if admin.role != "master" and mod.parent_id != admin.id:
        raise HTTPException(status_code=403, detail="Not your moderator")
    mod.password_hash = get_password_hash(body.new_password)
    db.commit()
    return {"message": "Password reset successfully"}

# ==========================================
# Admin: Database Group Management
# ==========================================

@app.post("/api/database-groups", response_model=schemas.DatabaseGroupResponse)
def create_database_group(group: schemas.DatabaseGroupCreate, db: Session = Depends(get_db), admin: models.User = Depends(get_current_admin)):
    if admin.role == "master":
        raise HTTPException(status_code=403, detail="Master cannot own database groups. Create an admin first.")
    new_group = models.DatabaseGroup(
        name=group.name,
        description=group.description,
        admin_id=admin.id
    )
    db.add(new_group)
    db.commit()
    db.refresh(new_group)
    return new_group

@app.get("/api/database-groups", response_model=List[schemas.DatabaseGroupResponse])
def list_database_groups(db: Session = Depends(get_db), user: models.User = Depends(get_current_active_user)):
    if user.role == "master":
        return db.query(models.DatabaseGroup).all()
    elif user.role == "admin":
        return db.query(models.DatabaseGroup).filter(models.DatabaseGroup.admin_id == user.id).all()
    else:
        # Moderator: only groups they have permission to
        perm_groups = db.query(models.ModeratorPermission.database_group_id).filter(
            models.ModeratorPermission.moderator_id == user.id
        ).subquery()
        return db.query(models.DatabaseGroup).filter(models.DatabaseGroup.id.in_(perm_groups)).all()

@app.delete("/api/database-groups/{group_id}")
def delete_database_group(group_id: int, db: Session = Depends(get_db), admin: models.User = Depends(get_current_admin)):
    group = db.query(models.DatabaseGroup).filter(models.DatabaseGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if admin.role != "master" and group.admin_id != admin.id:
        raise HTTPException(status_code=403, detail="Not your group")
    db.delete(group)
    db.commit()
    return {"message": "Database group deleted"}

# ==========================================
# Admin: Permission Management
# ==========================================

@app.post("/api/database-groups/{group_id}/permissions", response_model=schemas.PermissionResponse)
def grant_permission(group_id: int, perm: schemas.PermissionCreate, db: Session = Depends(get_db), admin: models.User = Depends(get_current_admin)):
    group = db.query(models.DatabaseGroup).filter(models.DatabaseGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if admin.role != "master" and group.admin_id != admin.id:
        raise HTTPException(status_code=403, detail="Not your group")
    
    # Verify the moderator exists and belongs to this admin
    mod = db.query(models.User).filter(models.User.id == perm.moderator_id, models.User.role == "moderator").first()
    if not mod:
        raise HTTPException(status_code=404, detail="Moderator not found")
    if admin.role != "master" and mod.parent_id != admin.id:
        raise HTTPException(status_code=403, detail="Not your moderator")
    
    # Check if already exists
    existing = db.query(models.ModeratorPermission).filter(
        models.ModeratorPermission.moderator_id == perm.moderator_id,
        models.ModeratorPermission.database_group_id == group_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Permission already exists")
    
    new_perm = models.ModeratorPermission(moderator_id=perm.moderator_id, database_group_id=group_id)
    db.add(new_perm)
    db.commit()
    db.refresh(new_perm)
    return new_perm

@app.delete("/api/database-groups/{group_id}/permissions/{mod_id}")
def revoke_permission(group_id: int, mod_id: int, db: Session = Depends(get_db), admin: models.User = Depends(get_current_admin)):
    perm = db.query(models.ModeratorPermission).filter(
        models.ModeratorPermission.database_group_id == group_id,
        models.ModeratorPermission.moderator_id == mod_id
    ).first()
    if not perm:
        raise HTTPException(status_code=404, detail="Permission not found")
    db.delete(perm)
    db.commit()
    return {"message": "Permission revoked"}

# ==========================================
# Helper: get accessible owner_id for tenant prefix
# ==========================================

# DEPRECATED: shim durante a migração M3. Remover na Fase 8.
def get_tenant_prefix(user: models.User, db: Session = None) -> str:
    """Prefixo legado para nomes físicos de tabelas dinâmicas no SQLite."""
    tid = resolve_tenant_id(user)
    if tid is None:
        return "master_"  # master sem contexto fixo
    return tenant_table_prefix(tid)

def get_accessible_tables(user: models.User, db: Session):
    """Get tables accessible to the current user based on role and permissions."""
    if user.role == "master":
        return db.query(models.DynamicTable).all()
    elif user.role == "admin":
        return db.query(models.DynamicTable).filter(models.DynamicTable.owner_id == user.id).all()
    else:
        # Moderator: only tables in permitted groups
        perm_groups = db.query(models.ModeratorPermission.database_group_id).filter(
            models.ModeratorPermission.moderator_id == user.id
        ).subquery()
        return db.query(models.DynamicTable).filter(models.DynamicTable.group_id.in_(perm_groups)).all()


# ==========================================
# Tenant-aware DB dependencies (M3 Fase 4)
# ==========================================

def tenant_db(
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Session com `app.tenant_id` setado em Postgres (no-op em SQLite).

    Faz commit/rollback do request inteiro e libera o GUC com RESET ALL
    antes de devolver a conexão ao pool. Endpoints que usam essa
    dependency NÃO devem chamar `db.commit()` — a dependency cuida.
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
        if db.bind is not None and db.bind.dialect.name == "postgresql":
            try:
                db.execute(text("RESET ALL"))
            except Exception:
                pass


def public_tenant_db(table_name: str, db: Session = Depends(get_db)):
    """Resolve a tabela pública pelo nome lógico e seta `app.tenant_id`.

    Sempre usa o `tenant_id` da própria linha de `_tables` — nunca master,
    nunca confia em quem chamou (endpoint público, sem auth).
    """
    db_table = db.query(models.DynamicTable).filter(
        models.DynamicTable.name == table_name,
        models.DynamicTable.is_public == True,
    ).first()
    if not db_table:
        raise HTTPException(status_code=404, detail="Table not found or not public")
    try:
        set_tenant_for_session(db, db_table.tenant_id)
        yield db, db_table
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        if db.bind is not None and db.bind.dialect.name == "postgresql":
            try:
                db.execute(text("RESET ALL"))
            except Exception:
                pass


def _load_physical_table(db_table: models.DynamicTable) -> Table:
    """Reflete a tabela física do tenant a partir do metadata de `_tables`.

    Postgres → schema-qualified (`tenant_N.clientes`).
    SQLite   → prefixo legado (`t{tenant_id}_clientes`). Reconstruído a
    partir de `tenant_id + name` por ser determinístico; ignora
    `physical_name` (que para linhas legadas pode estar sem prefixo).
    """
    meta = MetaData()
    if is_postgres():
        schema = db_table.schema_name
        physical = db_table.physical_name or db_table.name
        return Table(physical, meta, autoload_with=engine, schema=schema)
    physical = f"t{db_table.tenant_id}_{db_table.name}"
    return Table(physical, meta, autoload_with=engine)


# ==========================================
# Table Management
# ==========================================

@app.post("/tables/", response_model=schemas.TableResponse)
def create_table(table: schemas.TableCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    # Moderators and admins can create tables
    if current_user.role == "master":
        raise HTTPException(status_code=403, detail="Master cannot create tables directly. Use an admin account.")
    
    # Determine owner (admin or mod's parent admin)
    if current_user.role == "admin":
        owner_id = current_user.id
    else:
        owner_id = current_user.parent_id
    
    # Validate group access if group_id is provided
    if table.group_id:
        group = db.query(models.DatabaseGroup).filter(models.DatabaseGroup.id == table.group_id).first()
        if not group:
            raise HTTPException(status_code=404, detail="Database group not found")
        if current_user.role == "admin" and group.admin_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not your group")
        if current_user.role == "moderator":
            has_perm = db.query(models.ModeratorPermission).filter(
                models.ModeratorPermission.moderator_id == current_user.id,
                models.ModeratorPermission.database_group_id == table.group_id
            ).first()
            if not has_perm:
                raise HTTPException(status_code=403, detail="No permission for this group")
    
    # 1. Register in meta table
    db_table = models.DynamicTable(
        name=table.name,
        description=table.description,
        owner_id=owner_id,
        group_id=table.group_id,
        is_public=table.is_public,
        tenant_id=owner_id,           # tenant = admin dono (master pode setar owner_id de qualquer admin)
        physical_name=table.name,     # mesmo valor durante a transição; sanitização em Fase 3
    )
    db.add(db_table)
    db.commit()
    db.refresh(db_table)

    # 2. Register columns + collect FK specs
    cols_data_for_ddl = []
    fk_specs = []  # [{from_col, to_table (LOGICAL), to_col, to_table_id}]

    for col in table.columns:
        db_col = models.DynamicColumn(
            table_id=db_table.id,
            name=col.name,
            data_type=col.data_type,
            is_nullable=col.is_nullable,
            is_unique=col.is_unique,
            is_primary=col.is_primary,
            fk_table=col.fk_table if col.fk_table else None,
            fk_column=col.fk_column if col.fk_column else None,
        )
        db.add(db_col)
        cols_data_for_ddl.append({
            'name': col.name,
            'data_type': col.data_type,
            'is_nullable': col.is_nullable,
            'is_unique': col.is_unique,
            'is_primary': col.is_primary
        })
        if col.fk_table and col.fk_column:
            ref_table = db.query(models.DynamicTable).filter(
                models.DynamicTable.name == col.fk_table,
                models.DynamicTable.owner_id == owner_id
            ).first()
            if ref_table:
                fk_specs.append({
                    'from_col': col.name,
                    'to_table': col.fk_table,        # nome LÓGICO; dynamic_schema resolve por engine.
                    'to_col': col.fk_column,
                    'to_table_id': ref_table.id,
                })
    db.commit()

    # 3. Create physical table (with FK constraints if any)
    physical_fks = [
        {'from_col': f['from_col'], 'to_table': f['to_table'], 'to_col': f['to_col']}
        for f in fk_specs
    ]
    success, msg, schema_name, physical_name = create_physical_table(
        table.name, cols_data_for_ddl, tenant_id=owner_id, foreign_keys=physical_fks or None,
    )
    if not success:
        db.delete(db_table)
        db.commit()
        raise HTTPException(status_code=400, detail=msg)

    db_table.schema_name = schema_name
    db_table.physical_name = physical_name
    db.commit()
    db.refresh(db_table)

    # 4. Register DynamicRelation records for each FK
    for fk in fk_specs:
        rel = models.DynamicRelation(
            name=f"{table.name}_{fk['from_col']}_fk",
            from_table_id=db_table.id,
            to_table_id=fk['to_table_id'],
            relation_type="many_to_one",
            from_column_name=fk['from_col'],
            to_column_name=fk['to_col'],
        )
        db.add(rel)
    db.commit()

    db.refresh(db_table)
    return db_table

@app.get("/tables/", response_model=List[schemas.TableResponse])
def get_tables(
    db: Session = Depends(tenant_db),
    current_user: models.User = Depends(get_current_active_user),
):
    tables = get_accessible_tables(current_user, db)
    result = []
    for t in tables:
        column_count = db.query(models.DynamicColumn).filter(models.DynamicColumn.table_id == t.id).count()
        relation_count = db.query(models.DynamicRelation).filter(models.DynamicRelation.from_table_id == t.id).count()
        # row_count usa nome físico correto (schema-qualified em PG, prefixo em SQLite).
        # Em savepoint pra não abortar a transação se a tabela física não existir
        # (ex.: registro órfão em `_tables` após crash).
        if is_postgres():
            schema = t.schema_name or "public"
            physical = t.physical_name or t.name
            qualified = f'"{schema}"."{physical}"'
        else:
            physical = f"t{t.tenant_id}_{t.name}"
            qualified = f'"{physical}"'
        row_count = 0
        try:
            with db.begin_nested():
                row_count = db.execute(text(f"SELECT COUNT(*) FROM {qualified}")).scalar() or 0
        except Exception:
            row_count = 0
        resp = schemas.TableResponse.model_validate(t)
        resp.meta = schemas.TableMeta(
            row_count=row_count,
            column_count=column_count,
            relation_count=relation_count,
        )
        result.append(resp)
    return result

# ==========================================
# Relations API (FEAT-01)
# ==========================================

@app.post("/api/relations", response_model=schemas.RelationResponse)
def create_relation(rel: schemas.RelationCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_admin)):
    """Create a logical relation record (physical FK already created at table creation time)."""
    # Ownership (M-Ops F3 / achado do painel M7): ambos os lados precisam ser
    # tabelas acessíveis ao usuário (admin = as suas; master = todas). Sem isto,
    # qualquer admin criava relação referenciando tabela de outro tenant.
    accessible_ids = {t.id for t in get_accessible_tables(current_user, db)}
    if rel.from_table_id not in accessible_ids or rel.to_table_id not in accessible_ids:
        raise HTTPException(status_code=403, detail="Relation must reference tables you own")
    new_rel = models.DynamicRelation(
        name=rel.name,
        from_table_id=rel.from_table_id,
        to_table_id=rel.to_table_id,
        relation_type=rel.relation_type,
        from_column_name=rel.from_column_name,
        to_column_name=rel.to_column_name,
    )
    db.add(new_rel)
    db.commit()
    db.refresh(new_rel)
    return new_rel

@app.get("/api/relations/", response_model=List[schemas.WorkspaceRelationInfo])
def get_workspace_relations(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """M7 PR2b: TODAS as relações do workspace numa chamada (Schema Visualizer).

    Workspace-scoped via get_accessible_tables nos DOIS lados da relação —
    deliberadamente NÃO herda o comportamento do per-table, que devolve o
    to_table sem checar acesso. Moderator só vê relações entre tabelas dos
    seus grupos; o que fica de fora aparece no visualizer como contagem
    discreta (derivada das FKs de coluna), não como dado vazado.

    Relações com column names NULL entram (o per-table as descarta).
    """
    accessible = {t.id: t for t in get_accessible_tables(current_user, db)}
    if not accessible:
        return []
    rels = db.query(models.DynamicRelation).filter(
        models.DynamicRelation.from_table_id.in_(accessible.keys()),
        models.DynamicRelation.to_table_id.in_(accessible.keys()),
    ).all()
    return [
        schemas.WorkspaceRelationInfo(
            id=r.id,
            name=r.name,
            from_table=accessible[r.from_table_id].name,
            from_column_name=r.from_column_name,
            to_table=accessible[r.to_table_id].name,
            to_column_name=r.to_column_name,
            relation_type=r.relation_type,
        )
        for r in rels
    ]

@app.get("/api/relations/table/{table_name}", response_model=List[schemas.RelationInfo])
def get_relations_for_table(table_name: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    """Return FK relations where the given table is the 'from' side."""
    accessible = get_accessible_tables(current_user, db)
    db_table = next((t for t in accessible if t.name == table_name), None)
    if not db_table:
        raise HTTPException(status_code=404, detail="Table not found or no access")
    relations = db.query(models.DynamicRelation).filter(
        models.DynamicRelation.from_table_id == db_table.id
    ).all()
    result = []
    for r in relations:
        to_table = db.query(models.DynamicTable).filter(models.DynamicTable.id == r.to_table_id).first()
        if to_table and r.from_column_name and r.to_column_name:
            result.append(schemas.RelationInfo(
                id=r.id,
                name=r.name,
                from_table=db_table.name,
                from_column_name=r.from_column_name,
                to_table=to_table.name,
                to_column_name=r.to_column_name,
                relation_type=r.relation_type,
            ))
    return result

@app.delete("/api/relations/{relation_id}")
def delete_relation(relation_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_admin)):
    rel = db.query(models.DynamicRelation).filter(models.DynamicRelation.id == relation_id).first()
    if not rel:
        raise HTTPException(status_code=404, detail="Relation not found")
    # Ownership: só remove relação cujo lado FROM é tabela acessível. 404 (não
    # 403) pra não revelar a existência de relação de outro tenant.
    accessible_ids = {t.id for t in get_accessible_tables(current_user, db)}
    if rel.from_table_id not in accessible_ids:
        raise HTTPException(status_code=404, detail="Relation not found")
    db.delete(rel)
    db.commit()
    return {"message": "Relation deleted"}

@app.patch("/tables/{table_id}/visibility")
def toggle_table_visibility(table_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_admin)):
    table = db.query(models.DynamicTable).filter(models.DynamicTable.id == table_id).first()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    if current_user.role != "master" and table.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your table")
    try:
        table.is_public = not bool(table.is_public)
        db.commit()
        db.refresh(table)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update visibility: {str(e)}")
    return {"is_public": table.is_public}

# ==========================================
# Public Tables (No Auth)
# ==========================================

@app.get("/public/tables/")
def get_public_tables(db: Session = Depends(get_db)):
    tables = db.query(models.DynamicTable).filter(models.DynamicTable.is_public == True).all()
    result = []
    for t in tables:
        cols = db.query(models.DynamicColumn).filter(models.DynamicColumn.table_id == t.id).all()
        result.append({
            "id": t.id,
            "name": t.name,
            "description": t.description,
            "columns": [{"name": c.name, "data_type": c.data_type, "is_primary": c.is_primary} for c in cols]
        })
    return result

@app.get("/public/api/{table_name}/columns")
def get_public_table_columns(table_name: str, db: Session = Depends(get_db)):
    db_table = db.query(models.DynamicTable).filter(
        models.DynamicTable.name == table_name,
        models.DynamicTable.is_public == True
    ).first()
    if not db_table:
        raise HTTPException(status_code=404, detail="Table not found or not public")
    cols = db.query(models.DynamicColumn).filter(models.DynamicColumn.table_id == db_table.id).all()
    return [{"name": c.name, "data_type": c.data_type, "is_nullable": c.is_nullable, "is_unique": c.is_unique, "is_primary": c.is_primary} for c in cols]

@app.get("/public/api/{table_name}")
def get_public_records(
    filter_col: str = None, filter_val: str = None, filter_op: str = "eq",
    sort: str = None, order: str = "asc",
    search: str = None,
    limit: int = 100, offset: int = 0,
    tenant_ctx: tuple = Depends(public_tenant_db),
):
    db, db_table = tenant_ctx

    try:
        table = _load_physical_table(db_table)
    except Exception:
        raise HTTPException(status_code=404, detail="Physical table not found")
    
    stmt = select(table)
    
    # Apply column filter
    if filter_col and filter_val and filter_col in [c.name for c in table.columns]:
        col = table.c[filter_col]
        if filter_op == "eq":
            stmt = stmt.where(col == filter_val)
        elif filter_op == "contains":
            stmt = stmt.where(col.cast(String).ilike(f"%{filter_val}%"))
        elif filter_op == "gt":
            stmt = stmt.where(col > filter_val)
        elif filter_op == "lt":
            stmt = stmt.where(col < filter_val)
        elif filter_op == "gte":
            stmt = stmt.where(col >= filter_val)
        elif filter_op == "lte":
            stmt = stmt.where(col <= filter_val)
        elif filter_op == "neq":
            stmt = stmt.where(col != filter_val)
    
    # Apply search across all string columns
    if search:
        from sqlalchemy import or_, cast
        search_conditions = []
        for col in table.columns:
            search_conditions.append(cast(col, String).ilike(f"%{search}%"))
        if search_conditions:
            stmt = stmt.where(or_(*search_conditions))
    
    # Count total before pagination
    from sqlalchemy import func
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = db.execute(count_stmt).scalar()
    
    # Apply sorting
    if sort and sort in [c.name for c in table.columns]:
        sort_col = table.c[sort]
        stmt = stmt.order_by(sort_col.desc() if order == "desc" else sort_col.asc())
    
    # Apply pagination
    stmt = stmt.limit(min(limit, 500)).offset(offset)
    
    result = db.execute(stmt)
    records = [dict(row._mapping) for row in result.fetchall()]
    return {"data": records, "total": total, "limit": limit, "offset": offset}

@app.get("/public/relations/")
def get_public_relations(db: Session = Depends(get_db)):
    """Return all relations where both tables are public"""
    public_ids = [t.id for t in db.query(models.DynamicTable).filter(models.DynamicTable.is_public == True).all()]
    relations = db.query(models.DynamicRelation).filter(
        models.DynamicRelation.from_table_id.in_(public_ids),
        models.DynamicRelation.to_table_id.in_(public_ids)
    ).all()
    result = []
    for r in relations:
        from_t = db.query(models.DynamicTable).filter(models.DynamicTable.id == r.from_table_id).first()
        to_t = db.query(models.DynamicTable).filter(models.DynamicTable.id == r.to_table_id).first()
        result.append({
            "id": r.id, "name": r.name,
            "from_table": from_t.name if from_t else None,
            "to_table": to_t.name if to_t else None,
            "relation_type": r.relation_type
        })
    return result

# ==========================================
# Dynamic Data CRUD (Authenticated)
# ==========================================

@app.post("/api/{table_name}")
async def create_record(
    table_name: str,
    request: Request,
    db: Session = Depends(tenant_db),
    current_user: models.User = Depends(get_current_active_user),
):
    accessible = get_accessible_tables(current_user, db)
    db_table = next((t for t in accessible if t.name == table_name), None)
    if not db_table:
        raise HTTPException(status_code=404, detail="Table not found or no access")

    try:
        table = _load_physical_table(db_table)
    except Exception:
        raise HTTPException(status_code=404, detail="Physical table not found")

    data = await request.json()
    # Em Postgres, RLS força tenant_id via WITH CHECK. Sobrescrevemos no
    # backend pra impedir cliente malicioso de tentar forjar outro tenant.
    if is_postgres() and "tenant_id" in table.columns:
        data["tenant_id"] = db_table.tenant_id

    stmt = insert(table).values(**data)
    result = db.execute(stmt)
    return {"message": "Record inserted", "id": result.inserted_primary_key[0]}

@app.get("/api/{table_name}")
def get_records(
    table_name: str,
    db: Session = Depends(tenant_db),
    current_user: models.User = Depends(get_current_active_user),
):
    accessible = get_accessible_tables(current_user, db)
    db_table = next((t for t in accessible if t.name == table_name), None)
    if not db_table:
        raise HTTPException(status_code=404, detail="Table not found or no access")

    try:
        table = _load_physical_table(db_table)
    except Exception:
        raise HTTPException(status_code=404, detail=f"Physical table {table_name} not found")

    stmt = select(table)
    result = db.execute(stmt)
    return [dict(row._mapping) for row in result.fetchall()]

@app.put("/api/{table_name}/{record_id}")
async def update_record(
    table_name: str,
    record_id: int,
    request: Request,
    db: Session = Depends(tenant_db),
    current_user: models.User = Depends(get_current_active_user),
):
    accessible = get_accessible_tables(current_user, db)
    db_table = next((t for t in accessible if t.name == table_name), None)
    if not db_table:
        raise HTTPException(status_code=404, detail="Table not found or no access")

    try:
        table = _load_physical_table(db_table)
    except Exception:
        raise HTTPException(status_code=404, detail=f"Physical table {table_name} not found")

    pk_col = next((c for c in table.primary_key.columns), None)
    if pk_col is None:
        if 'id' in table.columns:
            pk_col = table.columns['id']
        else:
            raise HTTPException(status_code=400, detail="No primary key found for this table")

    data = await request.json()
    # Não deixar cliente alterar tenant_id via UPDATE.
    if is_postgres() and "tenant_id" in data:
        data.pop("tenant_id", None)

    stmt = update(table).where(pk_col == record_id).values(**data)
    result = db.execute(stmt)
    if result.rowcount == 0:
         raise HTTPException(status_code=404, detail="Record not found")
    return {"message": "Record updated"}

@app.delete("/api/{table_name}/{record_id}")
def delete_record(
    table_name: str,
    record_id: int,
    db: Session = Depends(tenant_db),
    current_user: models.User = Depends(get_current_active_user),
):
    accessible = get_accessible_tables(current_user, db)
    db_table = next((t for t in accessible if t.name == table_name), None)
    if not db_table:
        raise HTTPException(status_code=404, detail="Table not found or no access")

    try:
        table = _load_physical_table(db_table)
    except Exception:
        raise HTTPException(status_code=404, detail=f"Physical table {table_name} not found")

    pk_col = next((c for c in table.primary_key.columns), None)
    if pk_col is None:
        if 'id' in table.columns:
            pk_col = table.columns['id']
        else:
            raise HTTPException(status_code=400, detail="No primary key found for this table")

    stmt = delete(table).where(pk_col == record_id)
    result = db.execute(stmt)
    if result.rowcount == 0:
         raise HTTPException(status_code=404, detail="Record not found")
    return {"message": "Record deleted"}

# ==========================================
# SQL Script Import (Admin only)
# ==========================================
import sqlglot
from sqlglot import exp

from sqlalchemy import inspect as _inspect

def _parse_sql_statements(sql_text: str, prefix: str):
    """Parse SQL text into a list of safe statement info dicts for execution."""
    results = []
    try:
        parsed_stmts = sqlglot.parse(sql_text, read="sqlite")
    except Exception as e:
        results.append({"type": "UNKNOWN", "status": "blocked", "message": f"Syntax error: {e}"})
        return results

    for stmt in parsed_stmts:
        if stmt is None:
            continue
        try:
            if isinstance(stmt, exp.Create):
                stmt_type = "CREATE"
                if stmt.args.get("kind") != "TABLE":
                    results.append({"type": stmt_type, "status": "blocked", "message": "Only CREATE TABLE is allowed."})
                    continue
                table_node = stmt.find(exp.Table)
                if not table_node or not table_node.name:
                    results.append({"type": stmt_type, "status": "blocked", "message": "No table name found."})
                    continue

                table_name = table_node.name
                physical_name = f"{prefix}{table_name}"
                # Safely mutate AST
                table_node.set("this", exp.Identifier(this=physical_name, quoted=False))
                safe_sql = stmt.sql(dialect="sqlite")

                results.append({"type": stmt_type, "status": "ok", "table_name": table_name, "physical_name": physical_name, "statement": safe_sql})

            elif isinstance(stmt, exp.Insert):
                stmt_type = "INSERT"
                table_node = stmt.find(exp.Table)
                if not table_node or not table_node.name:
                    results.append({"type": stmt_type, "status": "blocked", "message": "No table name found in INSERT."})
                    continue

                table_name = table_node.name
                physical_name = f"{prefix}{table_name}"
                # Safely mutate AST
                table_node.set("this", exp.Identifier(this=physical_name, quoted=False))
                safe_sql = stmt.sql(dialect="sqlite")

                results.append({"type": stmt_type, "status": "ok", "table_name": table_name, "physical_name": physical_name, "statement": safe_sql})

            else:
                results.append({"type": stmt.__class__.__name__.upper(), "status": "blocked", "message": "Statement not allowed. Only CREATE TABLE and INSERT are supported."})
        except Exception as e:
            results.append({"type": "UNKNOWN", "status": "blocked", "message": str(e)})

    return results


@app.post("/api/import/sql/dry-run")
async def dry_run_sql_import(file: UploadFile = File(...), current_admin: models.User = Depends(get_current_admin)):
    """Parse and validate a .sql file without executing anything. Returns a preview report."""
    if current_admin.role == "master":
        raise HTTPException(status_code=403, detail="Use an admin account for imports")

    content = await file.read()
    sql_text = content.decode("utf-8")
    prefix = get_tenant_prefix(current_admin)
    parsed = _parse_sql_statements(sql_text, prefix)

    inspector = _inspect(engine)
    existing_tables = inspector.get_table_names()

    report = []
    for item in parsed:
        entry = {"type": item["type"], "status": item["status"],
                 "message": item.get("message", ""),
                 "table_name": item.get("table_name", "")}
        if item["status"] == "ok" and item["type"] == "CREATE":
            if item["physical_name"] in existing_tables:
                entry["status"] = "conflict"
                entry["message"] = f"Table '{item['physical_name']}' already exists."
            else:
                entry["message"] = f"Will create table '{item['table_name']}' as '{item['physical_name']}'."
        elif item["status"] == "ok" and item["type"] == "INSERT":
            entry["message"] = f"Will insert into '{item['table_name']}'."
        report.append(entry)

    summary = {
        "total": len(report),
        "ok": sum(1 for r in report if r["status"] == "ok"),
        "blocked": sum(1 for r in report if r["status"] == "blocked"),
        "conflicts": sum(1 for r in report if r["status"] == "conflict"),
    }
    return {"summary": summary, "statements": report}


@app.post("/api/import/sql")
async def import_sql_script(file: UploadFile = File(...), db: Session = Depends(get_db), current_admin: models.User = Depends(get_current_admin)):
    if current_admin.role == "master":
        raise HTTPException(status_code=403, detail="Use an admin account for imports")

    content = await file.read()
    sql_text = content.decode("utf-8")
    prefix = get_tenant_prefix(current_admin)
    parsed = _parse_sql_statements(sql_text, prefix)

    created_tables = []
    inserted_rows = 0
    errors = []

    for item in parsed:
        if item["status"] != "ok":
            errors.append(item.get("message", f"Blocked: {item['type']}"))
            continue

        if item["type"] == "CREATE":
            table_name = item["table_name"]
            physical_name = item["physical_name"]
            prefixed_stmt = item["statement"]
            try:
                # Execute DDL
                with engine.begin() as conn:
                    conn.execute(text(prefixed_stmt))

                # Introspect columns from the newly created physical table
                inspector = _inspect(engine)
                cols_info = inspector.get_columns(physical_name)

                # Register _tables + _columns atomically in one commit
                # NB: import SQL ainda usa o caminho legado (prefixo no public). A
                # migração pra schema-per-tenant aqui fica pra um PR futuro porque
                # exige reescrita do parser/`_parse_sql_statements` pra injetar
                # schema + coluna tenant_id na DDL crua importada.
                db_table = models.DynamicTable(
                    name=table_name,
                    description=f"Imported from: {file.filename}",
                    owner_id=current_admin.id,
                    is_public=False,
                    tenant_id=current_admin.id,
                    physical_name=physical_name,  # nome real no DB (legado: com prefixo)
                )
                db.add(db_table)
                db.flush()  # get db_table.id without committing yet

                for col_info in cols_info:
                    db_col = models.DynamicColumn(
                        table_id=db_table.id,
                        name=col_info["name"],
                        data_type=type(col_info["type"]).__name__,
                        is_nullable=col_info.get("nullable", True),
                        is_unique=False,
                        is_primary=col_info.get("primary_key", False)
                    )
                    db.add(db_col)

                db.commit()  # single atomic commit for both _tables and _columns
                created_tables.append(table_name)

            except Exception as e:
                db.rollback()
                errors.append(f"CREATE error for {table_name}: {str(e)}")

        elif item["type"] == "INSERT":
            table_name = item["table_name"]
            physical_name = item["physical_name"]
            prefixed_stmt = item["statement"]
            try:
                with engine.begin() as conn:
                    conn.execute(text(prefixed_stmt))
                inserted_rows += 1
            except Exception as e:
                errors.append(f"INSERT error for {table_name}: {str(e)}")

    return {"created_tables": created_tables, "inserted_rows": inserted_rows, "errors": errors}

# ==========================================
# CSV / XLSX Data Import (Moderator + Admin)
# ==========================================
import pandas as pd

@app.post("/api/import/data/{table_name}")
async def import_data_file(
    table_name: str,
    file: UploadFile = File(...),
    db: Session = Depends(tenant_db),
    current_user: models.User = Depends(get_current_active_user),
):
    if current_user.role == "master":
        raise HTTPException(status_code=403, detail="Use an admin or moderator account for data imports")

    accessible = get_accessible_tables(current_user, db)
    db_table = next((t for t in accessible if t.name == table_name), None)
    if not db_table:
        raise HTTPException(status_code=404, detail="Table not found or no access")

    try:
        table = _load_physical_table(db_table)
    except Exception:
        raise HTTPException(status_code=404, detail=f"Table {table_name} not found")
    
    content = await file.read()
    filename = file.filename.lower()
    
    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif filename.endswith(".xlsx") or filename.endswith(".xls"):
            df = pd.read_excel(io.BytesIO(content))
        else:
            raise HTTPException(status_code=400, detail="Only .csv and .xlsx/.xls files are supported")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error reading file: {str(e)}")
    
    valid_columns = [col.name for col in table.columns]
    matching_columns = [col for col in df.columns if col in valid_columns]
    if not matching_columns:
        raise HTTPException(status_code=400, detail=f"No matching columns found. Expected: {valid_columns}")
    
    df_filtered = df[matching_columns]
    df_filtered = df_filtered.where(pd.notnull(df_filtered), None)
    records = df_filtered.to_dict(orient="records")
    
    inserted = 0
    errors = []
    for record in records:
        try:
            clean_record = {k: v for k, v in record.items() if v is not None}
            if clean_record:
                # Defesa contra forge: força tenant_id na linha de import (PG).
                if is_postgres() and "tenant_id" in table.columns:
                    clean_record["tenant_id"] = db_table.tenant_id
                stmt = insert(table).values(**clean_record)
                with db.begin_nested():
                    db.execute(stmt)
                inserted += 1
        except Exception as e:
            errors.append(str(e))

    # commit cuidado pela dependency tenant_db
    return {"inserted_rows": inserted, "total_rows": len(records), "matched_columns": matching_columns, "errors": errors[:10]}


# ==========================================
# Publications (M6 Fase 1)
# ==========================================
import publication_storage  # noqa: E402


def _build_snapshot_payload(
    owner: models.User,
    version_number: int,
    description: str | None,
    theme_config: dict,
    table_selection: list[schemas.TableSelectionItem],
    db: Session,
) -> dict:
    """Coleta os dados das tabelas curadas e monta o blob do snapshot.

    Trunca em `MAX_ROWS_PER_TABLE` por tabela (decisão Diretor 2026-05-17).
    """
    from datetime import datetime as _dt

    tables_payload: list[dict] = []
    for item in table_selection:
        db_table = (
            db.query(models.DynamicTable)
            .filter(models.DynamicTable.id == item.table_id, models.DynamicTable.owner_id == owner.id)
            .first()
        )
        if not db_table:
            # Curadoria refere tabela inexistente / de outro tenant — pula
            # com aviso. Frontend deve revalidar selection antes de publicar.
            continue

        try:
            phys = _load_physical_table(db_table)
        except Exception:
            tables_payload.append({
                "name": db_table.name,
                "layout": item.layout,
                "columns": [],
                "rows": [],
                "truncated": False,
                "total_rows": 0,
                "error": "physical_table_not_found",
            })
            continue

        limit = publication_storage.MAX_ROWS_PER_TABLE
        rows_result = db.execute(select(phys).limit(limit + 1)).fetchall()
        truncated = len(rows_result) > limit
        rows = [dict(r._mapping) for r in rows_result[:limit]]

        # Quando trunca, `total_rows` precisa ser a contagem REAL — o
        # snapshot (e o export que o congela) não pode mentir o tamanho.
        total_rows = (
            db.execute(select(func.count()).select_from(phys)).scalar_one()
            if truncated
            else len(rows)
        )

        # `tenant_id` é detalhe interno do RLS — não exponho no snapshot público.
        for r in rows:
            r.pop("tenant_id", None)

        cols_meta = (
            db.query(models.DynamicColumn)
            .filter(models.DynamicColumn.table_id == db_table.id)
            .all()
        )

        tables_payload.append({
            "name": db_table.name,
            "layout": item.layout,
            "columns": [{"name": c.name, "data_type": c.data_type} for c in cols_meta],
            "rows": rows,
            "truncated": truncated,
            "total_rows": total_rows,
        })

    return {
        "schema_version": 1,
        "owner": {
            "workspace_slug": owner.workspace_slug,
            "workspace_name": owner.workspace_name,
        },
        "version_number": version_number,
        "created_at": _dt.utcnow().isoformat(),
        "description": description,
        "theme": theme_config,
        "tables": tables_payload,
    }


def _dt_now_utc():
    from datetime import datetime as _dt
    return _dt.utcnow()


def _serialize_pub_version(v: models.PublicationVersion) -> dict:
    return {
        "id": v.id,
        "owner_id": v.owner_id,
        "version_number": v.version_number,
        "created_at": v.created_at,
        "created_by": v.created_by,
        "is_active": v.is_active,
        "activated_at": v.activated_at,
        "description": v.description,
        "theme_config": v.theme_config or {},
        "table_selection": v.table_selection or [],
    }


@app.get("/api/publications/me/versions", response_model=List[schemas.PublicationVersionResponse])
def list_my_publication_versions(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Lista versões do workspace do user (admin ou mod herda parent)."""
    if current_user.role == "master":
        raise HTTPException(status_code=403, detail="Master não tem workspace próprio")
    owner_id = current_user.id if current_user.role == "admin" else current_user.parent_id
    versions = (
        db.query(models.PublicationVersion)
        .filter(models.PublicationVersion.owner_id == owner_id)
        .order_by(models.PublicationVersion.version_number.desc())
        .all()
    )
    return [_serialize_pub_version(v) for v in versions]


@app.get("/api/publications/me/active", response_model=schemas.PublicationVersionResponse)
def get_my_active_publication(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    if current_user.role == "master":
        raise HTTPException(status_code=403, detail="Master não tem workspace próprio")
    owner_id = current_user.id if current_user.role == "admin" else current_user.parent_id
    active = (
        db.query(models.PublicationVersion)
        .filter(models.PublicationVersion.owner_id == owner_id, models.PublicationVersion.is_active == True)
        .first()
    )
    if not active:
        raise HTTPException(status_code=404, detail="Nenhuma versão ativa")
    return _serialize_pub_version(active)


@app.post("/api/publications/me/versions", response_model=schemas.PublicationVersionResponse)
def create_publication_version(
    body: schemas.PublicationVersionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Cria nova versão. NÃO ativa automaticamente — admin precisa
    chamar /activate explicitamente (princípio: snapshot != publish)."""
    if current_user.role == "master":
        raise HTTPException(status_code=403, detail="Master não tem workspace próprio")
    owner_id = current_user.id if current_user.role == "admin" else current_user.parent_id
    owner = db.query(models.User).filter(models.User.id == owner_id).first()
    if not owner:
        raise HTTPException(status_code=404, detail="Owner não encontrado")

    last = (
        db.query(models.PublicationVersion)
        .filter(models.PublicationVersion.owner_id == owner_id)
        .order_by(models.PublicationVersion.version_number.desc())
        .first()
    )
    next_number = (last.version_number + 1) if last else 1

    storage_path = publication_storage.snapshot_path(owner_id, next_number)
    payload = _build_snapshot_payload(
        owner=owner,
        version_number=next_number,
        description=body.description,
        theme_config=body.theme_config,
        table_selection=body.table_selection,
        db=db,
    )
    publication_storage.upload(storage_path, payload)

    new_version = models.PublicationVersion(
        owner_id=owner_id,
        version_number=next_number,
        created_by=current_user.id,
        is_active=False,
        description=body.description,
        storage_path=storage_path,
        theme_config=body.theme_config,
        table_selection=[item.model_dump() for item in body.table_selection],
    )
    db.add(new_version)
    try:
        db.commit()
        db.refresh(new_version)
    except Exception:
        db.rollback()
        publication_storage.delete(storage_path)
        raise

    return _serialize_pub_version(new_version)


@app.post("/api/publications/me/versions/{version_id}/activate", response_model=schemas.PublicationVersionResponse)
def activate_publication_version(
    version_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    if current_user.role == "master":
        raise HTTPException(status_code=403, detail="Master não tem workspace próprio")
    owner_id = current_user.id if current_user.role == "admin" else current_user.parent_id

    target = (
        db.query(models.PublicationVersion)
        .filter(
            models.PublicationVersion.id == version_id,
            models.PublicationVersion.owner_id == owner_id,
        )
        .first()
    )
    if not target:
        raise HTTPException(status_code=404, detail="Versão não encontrada")

    # Desativa a ativa atual (se houver) ANTES de ativar a nova — o
    # UNIQUE INDEX parcial bloqueia 2 ativas por owner simultaneamente.
    db.query(models.PublicationVersion).filter(
        models.PublicationVersion.owner_id == owner_id,
        models.PublicationVersion.is_active == True,
        models.PublicationVersion.id != target.id,
    ).update({models.PublicationVersion.is_active: False}, synchronize_session=False)

    target.is_active = True
    target.activated_at = _dt_now_utc()
    db.commit()
    db.refresh(target)
    return _serialize_pub_version(target)


@app.delete("/api/publications/me/versions/{version_id}")
def delete_publication_version(
    version_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    if current_user.role == "master":
        raise HTTPException(status_code=403, detail="Master não tem workspace próprio")
    owner_id = current_user.id if current_user.role == "admin" else current_user.parent_id

    target = (
        db.query(models.PublicationVersion)
        .filter(
            models.PublicationVersion.id == version_id,
            models.PublicationVersion.owner_id == owner_id,
        )
        .first()
    )
    if not target:
        raise HTTPException(status_code=404, detail="Versão não encontrada")
    if target.is_active:
        raise HTTPException(status_code=400, detail="Não pode deletar a versão ativa. Ative outra antes.")

    storage_path = target.storage_path
    db.delete(target)
    db.commit()
    publication_storage.delete(storage_path)
    return {"message": "Versão deletada"}


@app.get("/api/publications/me/versions/{version_id}/snapshot")
def get_my_version_snapshot(
    version_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Blob do snapshot de uma versão ESPECÍFICA do workspace (M6 Fase 5).

    Base do export estático: a rota pública só serve a versão ativa;
    o export por card do histórico precisa de qualquer versão — com os
    mesmos guards dos demais /api/publications/me/*.
    """
    if current_user.role == "master":
        raise HTTPException(status_code=403, detail="Master não tem workspace próprio")
    owner_id = current_user.id if current_user.role == "admin" else current_user.parent_id

    target = (
        db.query(models.PublicationVersion)
        .filter(
            models.PublicationVersion.id == version_id,
            models.PublicationVersion.owner_id == owner_id,
        )
        .first()
    )
    if not target:
        raise HTTPException(status_code=404, detail="Versão não encontrada")

    payload = publication_storage.download(target.storage_path)
    if payload is None:
        raise HTTPException(status_code=502, detail="Snapshot blob não encontrado no storage")
    return payload


# ---------- endpoint público (sem auth) ----------

@app.get("/public/{slug}/snapshot")
def get_public_snapshot(slug: str, db: Session = Depends(get_db)):
    """Devolve o blob JSON da versão ativa do workspace `slug`.

    Endpoint público — não autentica. Serve o site público estático.
    """
    owner = (
        db.query(models.User)
        .filter(models.User.workspace_slug == slug)
        .first()
    )
    if not owner:
        raise HTTPException(status_code=404, detail="Workspace não encontrado")

    active = (
        db.query(models.PublicationVersion)
        .filter(
            models.PublicationVersion.owner_id == owner.id,
            models.PublicationVersion.is_active == True,
        )
        .first()
    )
    if not active:
        raise HTTPException(status_code=404, detail="Workspace ainda não publicou")

    payload = publication_storage.download(active.storage_path)
    if payload is None:
        # Estado órfão: row aponta pra blob inexistente. 502 sinaliza
        # problema do backend, não do cliente.
        raise HTTPException(status_code=502, detail="Snapshot blob não encontrado no storage")
    return payload

