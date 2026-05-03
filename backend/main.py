from fastapi import FastAPI, Depends, HTTPException, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import Table, MetaData, insert, select, update, delete, text, String
from typing import List
import io

import models, schemas
from database import engine, Base, get_db
from dynamic_schema import create_physical_table
from auth import (
    auth_router, create_master_account,
    get_current_active_user, get_current_admin, get_current_master,
    get_password_hash
)

# Migration: add missing columns to existing databases
from sqlalchemy import inspect, text as _text

def _safe_migrate(db_engine):
    """Add missing columns/tables for existing databases migrating to 3-tier schema"""
    inspector = inspect(db_engine)
    with db_engine.connect() as conn:
        # --- users table ---
        if "users" in inspector.get_table_names():
            existing_cols = [c["name"] for c in inspector.get_columns("users")]
            if "parent_id" not in existing_cols:
                try:
                    conn.execute(_text("ALTER TABLE users ADD COLUMN parent_id INTEGER"))
                    conn.commit()
                except Exception:
                    conn.rollback()
            if "role" not in existing_cols:
                try:
                    conn.execute(_text("ALTER TABLE users ADD COLUMN role VARCHAR DEFAULT 'admin'"))
                    conn.commit()
                except Exception:
                    conn.rollback()

        # --- _tables table ---
        if "_tables" in inspector.get_table_names():
            existing_cols = [c["name"] for c in inspector.get_columns("_tables")]
            for col_name, col_def in [
                ("group_id", "INTEGER"),
                ("is_public", "BOOLEAN DEFAULT FALSE"),
                ("owner_id", "INTEGER"),
            ]:
                if col_name not in existing_cols:
                    try:
                        conn.execute(_text(f"ALTER TABLE _tables ADD COLUMN {col_name} {col_def}"))
                        conn.commit()
                    except Exception:
                        conn.rollback()

        # --- _columns table: add fk_table, fk_column ---
        if "_columns" in inspector.get_table_names():
            existing_cols = [c["name"] for c in inspector.get_columns("_columns")]
            for col_name, col_def in [
                ("fk_table", "VARCHAR"),
                ("fk_column", "VARCHAR"),
            ]:
                if col_name not in existing_cols:
                    try:
                        conn.execute(_text(f"ALTER TABLE _columns ADD COLUMN {col_name} {col_def}"))
                        conn.commit()
                    except Exception:
                        conn.rollback()

        # --- _tables: backfill owner_id for pre-migration rows ---
        if "_tables" in inspector.get_table_names():
            try:
                conn.execute(_text(
                    "UPDATE _tables SET owner_id = "
                    "(SELECT id FROM users WHERE role = 'master' LIMIT 1) "
                    "WHERE owner_id IS NULL"
                ))
                conn.commit()
            except Exception:
                conn.rollback()

        # --- _relations table ---
        if "_relations" in inspector.get_table_names():
            existing_cols = [c["name"] for c in inspector.get_columns("_relations")]
            for col_name, col_def in [
                ("from_column_name", "VARCHAR"),
                ("to_column_name", "VARCHAR"),
            ]:
                if col_name not in existing_cols:
                    try:
                        conn.execute(_text(f"ALTER TABLE _relations ADD COLUMN {col_name} {col_def}"))
                        conn.commit()
                    except Exception:
                        conn.rollback()

        # --- users: workspace editorial fields ---
        if "users" in inspector.get_table_names():
            existing_cols = [c["name"] for c in inspector.get_columns("users")]
            for col_name, col_def in [
                ("workspace_name", "VARCHAR"),
                ("workspace_slug", "VARCHAR"),
            ]:
                if col_name not in existing_cols:
                    try:
                        conn.execute(_text(f"ALTER TABLE users ADD COLUMN {col_name} {col_def}"))
                        conn.commit()
                    except Exception:
                        conn.rollback()

app = FastAPI(title="Dynamic CMS API")

@app.on_event("startup")
def startup_event():
    # Ensure tables exist
    Base.metadata.create_all(bind=engine)
    # Run migrations
    _safe_migrate(engine)
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
    new_admin = models.User(
        username=user_data.username,
        password_hash=get_password_hash(user_data.password),
        role="admin",
        parent_id=master.id
    )
    db.add(new_admin)
    db.commit()
    db.refresh(new_admin)
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
    db.delete(admin)
    db.commit()
    return {"message": "Admin deleted"}

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
    new_mod = models.User(
        username=user_data.username,
        password_hash=get_password_hash(user_data.password),
        role="moderator",
        parent_id=admin.id
    )
    db.add(new_mod)
    db.commit()
    db.refresh(new_mod)
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
    db.delete(mod)
    db.commit()
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

def get_tenant_prefix(user: models.User, db: Session = None) -> str:
    """Get the tenant prefix for physical table names based on the admin owner."""
    if user.role == "master":
        return "master_"
    elif user.role == "admin":
        return f"t{user.id}_"
    else:
        # Moderator uses their parent admin's prefix
        return f"t{user.parent_id}_"

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
        is_public=table.is_public
    )
    db.add(db_table)
    db.commit()
    db.refresh(db_table)

    # 2. Register columns + collect FK specs
    cols_data_for_ddl = []
    fk_specs = []  # [{from_col, to_table (physical), to_col, to_table_name (logical), to_table_id}]
    prefix = get_tenant_prefix(current_user)

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
        # Collect FK if defined
        if col.fk_table and col.fk_column:
            ref_table = db.query(models.DynamicTable).filter(
                models.DynamicTable.name == col.fk_table,
                models.DynamicTable.owner_id == owner_id
            ).first()
            if ref_table:
                fk_specs.append({
                    'from_col': col.name,
                    'to_table': f"{prefix}{col.fk_table}",
                    'to_col': col.fk_column,
                    'to_table_name': col.fk_table,
                    'to_table_id': ref_table.id,
                })
    db.commit()

    # 3. Create physical table (with FK constraints if any)
    physical_name = f"{prefix}{table.name}"
    physical_fks = [{'from_col': f['from_col'], 'to_table': f['to_table'], 'to_col': f['to_col']} for f in fk_specs]
    success, msg = create_physical_table(physical_name, cols_data_for_ddl, foreign_keys=physical_fks or None)
    if not success:
        db.delete(db_table)
        db.commit()
        raise HTTPException(status_code=400, detail=msg)

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
def get_tables(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    tables = get_accessible_tables(current_user, db)
    result = []
    for t in tables:
        column_count = db.query(models.DynamicColumn).filter(models.DynamicColumn.table_id == t.id).count()
        relation_count = db.query(models.DynamicRelation).filter(models.DynamicRelation.from_table_id == t.id).count()
        row_count = 0
        physical_name = f"t{t.owner_id}_{t.name}" if t.owner_id else t.name
        try:
            row_count = db.execute(_text(f"SELECT COUNT(*) FROM \"{physical_name}\"")).scalar() or 0
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
    table_name: str,
    filter_col: str = None, filter_val: str = None, filter_op: str = "eq",
    sort: str = None, order: str = "asc",
    search: str = None,
    limit: int = 100, offset: int = 0,
    db: Session = Depends(get_db)
):
    db_table = db.query(models.DynamicTable).filter(
        models.DynamicTable.name == table_name,
        models.DynamicTable.is_public == True
    ).first()
    if not db_table:
        raise HTTPException(status_code=404, detail="Table not found or not public")
    
    prefix = f"t{db_table.owner_id}_"
    physical_name = f"{prefix}{table_name}"
    
    meta = MetaData()
    try:
        table = Table(physical_name, meta, autoload_with=engine)
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
async def create_record(table_name: str, request: Request, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    # Find the table in metadata to get owner_id
    accessible = get_accessible_tables(current_user, db)
    db_table = next((t for t in accessible if t.name == table_name), None)
    if not db_table:
        raise HTTPException(status_code=404, detail="Table not found or no access")
    
    prefix = f"t{db_table.owner_id}_"
    physical_name = f"{prefix}{table_name}"
    
    meta = MetaData()
    try:
        table = Table(physical_name, meta, autoload_with=engine)
    except Exception:
        raise HTTPException(status_code=404, detail="Physical table not found")
    
    data = await request.json()
    stmt = insert(table).values(**data)
    result = db.execute(stmt)
    db.commit()
    return {"message": "Record inserted", "id": result.inserted_primary_key[0]}

@app.get("/api/{table_name}")
def get_records(table_name: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    accessible = get_accessible_tables(current_user, db)
    db_table = next((t for t in accessible if t.name == table_name), None)
    if not db_table:
        raise HTTPException(status_code=404, detail="Table not found or no access")
    
    prefix = f"t{db_table.owner_id}_"
    physical_name = f"{prefix}{table_name}"
    
    meta = MetaData()
    try:
        table = Table(physical_name, meta, autoload_with=engine)
    except Exception:
        raise HTTPException(status_code=404, detail=f"Physical table {table_name} not found")
    
    stmt = select(table)
    result = db.execute(stmt)
    return [dict(row._mapping) for row in result.fetchall()]

@app.put("/api/{table_name}/{record_id}")
async def update_record(table_name: str, record_id: int, request: Request, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    accessible = get_accessible_tables(current_user, db)
    db_table = next((t for t in accessible if t.name == table_name), None)
    if not db_table:
        raise HTTPException(status_code=404, detail="Table not found or no access")
    
    prefix = f"t{db_table.owner_id}_"
    physical_name = f"{prefix}{table_name}"
    
    meta = MetaData()
    try:
        table = Table(physical_name, meta, autoload_with=engine)
    except Exception:
        raise HTTPException(status_code=404, detail=f"Physical table {table_name} not found")

    pk_col = next((c for c in table.primary_key.columns), None)
    if pk_col is None:
        if 'id' in table.columns:
            pk_col = table.columns['id']
        else:
            raise HTTPException(status_code=400, detail="No primary key found for this table")

    data = await request.json()
    stmt = update(table).where(pk_col == record_id).values(**data)
    result = db.execute(stmt)
    db.commit()
    if result.rowcount == 0:
         raise HTTPException(status_code=404, detail="Record not found")
    return {"message": "Record updated"}

@app.delete("/api/{table_name}/{record_id}")
def delete_record(table_name: str, record_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    accessible = get_accessible_tables(current_user, db)
    db_table = next((t for t in accessible if t.name == table_name), None)
    if not db_table:
        raise HTTPException(status_code=404, detail="Table not found or no access")
    
    prefix = f"t{db_table.owner_id}_"
    physical_name = f"{prefix}{table_name}"
    
    meta = MetaData()
    try:
        table = Table(physical_name, meta, autoload_with=engine)
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
    db.commit()
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
                    conn.execute(_text(prefixed_stmt))

                # Introspect columns from the newly created physical table
                inspector = _inspect(engine)
                cols_info = inspector.get_columns(physical_name)

                # Register _tables + _columns atomically in one commit
                db_table = models.DynamicTable(
                    name=table_name,
                    description=f"Imported from: {file.filename}",
                    owner_id=current_admin.id,
                    is_public=False
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
                    conn.execute(_text(prefixed_stmt))
                inserted_rows += 1
            except Exception as e:
                errors.append(f"INSERT error for {table_name}: {str(e)}")

    return {"created_tables": created_tables, "inserted_rows": inserted_rows, "errors": errors}

# ==========================================
# CSV / XLSX Data Import (Moderator + Admin)
# ==========================================
import pandas as pd

@app.post("/api/import/data/{table_name}")
async def import_data_file(table_name: str, file: UploadFile = File(...), db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    if current_user.role == "master":
        raise HTTPException(status_code=403, detail="Use an admin or moderator account for data imports")
    
    # Find accessible table
    accessible = get_accessible_tables(current_user, db)
    db_table = next((t for t in accessible if t.name == table_name), None)
    if not db_table:
        raise HTTPException(status_code=404, detail="Table not found or no access")
    
    prefix = f"t{db_table.owner_id}_"
    physical_name = f"{prefix}{table_name}"
    
    meta = MetaData()
    try:
        table = Table(physical_name, meta, autoload_with=engine)
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
                stmt = insert(table).values(**clean_record)
                db.execute(stmt)
                inserted += 1
        except Exception as e:
            errors.append(str(e))
    
    db.commit()
    return {"inserted_rows": inserted, "total_rows": len(records), "matched_columns": matching_columns, "errors": errors[:10]}
