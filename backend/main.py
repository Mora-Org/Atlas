from fastapi import FastAPI, Depends, HTTPException, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import Table, MetaData, insert, select, update, delete, text
from typing import List
import io

import models, schemas
from database import engine, Base, get_db
from dynamic_schema import create_physical_table
from auth import auth_router, create_master_account, get_current_active_user, get_current_admin

# Create metadata tables if they don't exist
Base.metadata.create_all(bind=engine)

# Seed master account on startup
db_seed = next(get_db())
create_master_account(db_seed)
db_seed.close()

app = FastAPI(title="Dynamic Template API")

# Setup CORS for Next.js
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Change in production
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
    return {"message": "Welcome to Dynamic Template API"}

# ==========================================
# User Management (Admin only)
# ==========================================
@app.get("/api/users", response_model=List[schemas.UserResponse])
def list_users(db: Session = Depends(get_db), current_admin: models.User = Depends(get_current_admin)):
    return db.query(models.User).all()

# ==========================================
# Table Management (Authenticated)
# ==========================================

def get_tenant_prefix(user: models.User) -> str:
    """Get the tenant prefix for physical table names"""
    owner_id = user.id if user.role == "admin" else user.parent_id
    return f"t{owner_id}_"

@app.post("/tables/", response_model=schemas.TableResponse)
def create_table(table: schemas.TableCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    # Only admins can create tables
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can create tables")
    
    # 1. Register in meta table with owner
    db_table = models.DynamicTable(
        name=table.name,
        description=table.description,
        owner_id=current_user.id,
        is_public=table.is_public if hasattr(table, 'is_public') else False
    )
    db.add(db_table)
    db.commit()
    db.refresh(db_table)
    
    created_columns = []
    cols_data_for_ddl = []
    
    # 2. Register columns
    for col in table.columns:
        db_col = models.DynamicColumn(
            table_id=db_table.id,
            name=col.name,
            data_type=col.data_type,
            is_nullable=col.is_nullable,
            is_unique=col.is_unique,
            is_primary=col.is_primary
        )
        db.add(db_col)
        created_columns.append(db_col)
        cols_data_for_ddl.append({
            'name': col.name,
            'data_type': col.data_type,
            'is_nullable': col.is_nullable,
            'is_unique': col.is_unique,
            'is_primary': col.is_primary
        })
        
    db.commit()
    
    # 3. Create Physical Table with tenant prefix
    prefix = get_tenant_prefix(current_user)
    physical_name = f"{prefix}{table.name}"
    success, msg = create_physical_table(physical_name, cols_data_for_ddl)
    if not success:
        # Rollback meta entries if physical creation fails
        db.delete(db_table)
        db.commit()
        raise HTTPException(status_code=400, detail=msg)
    
    db.refresh(db_table)
    return db_table

@app.get("/tables/", response_model=List[schemas.TableResponse])
def get_tables(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    # Admin sees their own tables; Moderator sees tables from their parent admin
    if current_user.role == "admin":
        return db.query(models.DynamicTable).filter(models.DynamicTable.owner_id == current_user.id).all()
    else:
        return db.query(models.DynamicTable).filter(models.DynamicTable.owner_id == current_user.parent_id).all()

@app.patch("/tables/{table_id}/visibility")
def toggle_table_visibility(table_id: int, db: Session = Depends(get_db), current_admin: models.User = Depends(get_current_admin)):
    table = db.query(models.DynamicTable).filter(models.DynamicTable.id == table_id, models.DynamicTable.owner_id == current_admin.id).first()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    table.is_public = not table.is_public
    db.commit()
    return {"is_public": table.is_public}

# ==========================================
# Public Tables (No Auth needed)
# ==========================================
@app.get("/public/tables/")
def get_public_tables(db: Session = Depends(get_db)):
    tables = db.query(models.DynamicTable).filter(models.DynamicTable.is_public == True).all()
    return [{"id": t.id, "name": t.name, "description": t.description} for t in tables]

@app.get("/public/api/{table_name}")
def get_public_records(table_name: str, db: Session = Depends(get_db)):
    # Find the table in metadata to confirm it's public
    db_table = db.query(models.DynamicTable).filter(models.DynamicTable.name == table_name, models.DynamicTable.is_public == True).first()
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
    result = db.execute(stmt)
    records = [dict(row._mapping) for row in result.fetchall()]
    return records

# ==========================================
# Dynamic Data Endpoints (CRUD - Authenticated)
# ==========================================

@app.post("/api/{table_name}")
async def create_record(table_name: str, request: Request, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    prefix = get_tenant_prefix(current_user)
    physical_name = f"{prefix}{table_name}"
    
    meta = MetaData()
    try:
        table = Table(physical_name, meta, autoload_with=engine)
    except Exception:
        raise HTTPException(status_code=404, detail="Table not found.")
        
    data = await request.json()
    stmt = insert(table).values(**data)
    result = db.execute(stmt)
    db.commit()
    
    return {"message": "Record inserted", "id": result.inserted_primary_key[0]}

@app.get("/api/{table_name}")
def get_records(table_name: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    prefix = get_tenant_prefix(current_user)
    physical_name = f"{prefix}{table_name}"
    
    meta = MetaData()
    try:
        table = Table(physical_name, meta, autoload_with=engine)
    except Exception:
        raise HTTPException(status_code=404, detail=f"Table {table_name} not found.")
        
    stmt = select(table)
    result = db.execute(stmt)
    records = [dict(row._mapping) for row in result.fetchall()]
    return records

# ==========================================
# SQL Script Import (Admin only)
# ==========================================
import sqlparse

ALLOWED_SQL_TYPES = {'CREATE', 'INSERT'}

@app.post("/api/import/sql")
async def import_sql_script(file: UploadFile = File(...), db: Session = Depends(get_db), current_admin: models.User = Depends(get_current_admin)):
    content = await file.read()
    sql_text = content.decode("utf-8")
    
    statements = sqlparse.split(sql_text)
    prefix = get_tenant_prefix(current_admin)
    
    created_tables = []
    inserted_rows = 0
    errors = []
    
    for raw_stmt in statements:
        stmt = raw_stmt.strip()
        if not stmt:
            continue
        
        parsed = sqlparse.parse(stmt)[0]
        stmt_type = parsed.get_type()
        
        if stmt_type and stmt_type.upper() not in ALLOWED_SQL_TYPES:
            errors.append(f"Blocked statement type: {stmt_type}")
            continue
        
        if stmt_type and stmt_type.upper() == 'CREATE':
            # Extract table name from CREATE TABLE statement
            tokens = [t for t in parsed.tokens if not t.is_whitespace]
            table_name = None
            for i, token in enumerate(tokens):
                if token.ttype is sqlparse.tokens.Keyword and token.value.upper() == 'TABLE':
                    # Next non-whitespace token is the table name
                    remaining = tokens[i+1:]
                    for t in remaining:
                        if hasattr(t, 'get_real_name') and t.get_real_name():
                            table_name = t.get_real_name()
                            break
                        elif t.ttype is sqlparse.tokens.Name:
                            table_name = t.value
                            break
                    break
            
            if table_name:
                # Replace table name with prefixed version in the SQL
                physical_name = f"{prefix}{table_name}"
                prefixed_stmt = stmt.replace(table_name, physical_name, 1)
                try:
                    db.execute(text(prefixed_stmt))
                    db.commit()
                    
                    # Register in metadata
                    db_table = models.DynamicTable(
                        name=table_name,
                        description=f"Imported from SQL script: {file.filename}",
                        owner_id=current_admin.id,
                        is_public=False
                    )
                    db.add(db_table)
                    db.commit()
                    
                    # Reflect columns and register them
                    meta = MetaData()
                    reflected = Table(physical_name, meta, autoload_with=engine)
                    for col in reflected.columns:
                        col_type = type(col.type).__name__
                        db_col = models.DynamicColumn(
                            table_id=db_table.id,
                            name=col.name,
                            data_type=col_type,
                            is_nullable=col.nullable if col.nullable is not None else True,
                            is_unique=col.unique if col.unique else False,
                            is_primary=col.primary_key
                        )
                        db.add(db_col)
                    db.commit()
                    
                    created_tables.append(table_name)
                except Exception as e:
                    db.rollback()
                    errors.append(f"CREATE error for {table_name}: {str(e)}")
        
        elif stmt_type and stmt_type.upper() == 'INSERT':
            # Extract table name from INSERT INTO statement
            tokens = [t for t in parsed.tokens if not t.is_whitespace]
            table_name = None
            for i, token in enumerate(tokens):
                if token.ttype is sqlparse.tokens.Keyword.DML and token.value.upper() == 'INSERT':
                    remaining = tokens[i+1:]
                    for t in remaining:
                        if hasattr(t, 'get_real_name') and t.get_real_name():
                            table_name = t.get_real_name()
                            break
                        elif t.ttype is sqlparse.tokens.Name:
                            table_name = t.value
                            break
                    break
            
            if table_name:
                physical_name = f"{prefix}{table_name}"
                prefixed_stmt = stmt.replace(table_name, physical_name, 1)
                try:
                    db.execute(text(prefixed_stmt))
                    db.commit()
                    inserted_rows += 1
                except Exception as e:
                    db.rollback()
                    errors.append(f"INSERT error: {str(e)}")
    
    return {
        "created_tables": created_tables,
        "inserted_rows": inserted_rows,
        "errors": errors
    }

# ==========================================
# CSV / XLSX Data Import (Admin only)
# ==========================================
import pandas as pd

@app.post("/api/import/data/{table_name}")
async def import_data_file(table_name: str, file: UploadFile = File(...), db: Session = Depends(get_db), current_admin: models.User = Depends(get_current_admin)):
    prefix = get_tenant_prefix(current_admin)
    physical_name = f"{prefix}{table_name}"
    
    # Verify table exists
    meta = MetaData()
    try:
        table = Table(physical_name, meta, autoload_with=engine)
    except Exception:
        raise HTTPException(status_code=404, detail=f"Table {table_name} not found.")
    
    content = await file.read()
    filename = file.filename.lower()
    
    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif filename.endswith(".xlsx") or filename.endswith(".xls"):
            df = pd.read_excel(io.BytesIO(content))
        else:
            raise HTTPException(status_code=400, detail="Only .csv and .xlsx/.xls files are supported.")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error reading file: {str(e)}")
    
    # Get valid column names from the physical table
    valid_columns = [col.name for col in table.columns]
    
    # Filter dataframe to only include valid columns
    matching_columns = [col for col in df.columns if col in valid_columns]
    if not matching_columns:
        raise HTTPException(status_code=400, detail=f"No matching columns found. Expected: {valid_columns}")
    
    df_filtered = df[matching_columns]
    
    # Replace NaN with None for SQL compatibility
    df_filtered = df_filtered.where(pd.notnull(df_filtered), None)
    
    records = df_filtered.to_dict(orient="records")
    
    inserted = 0
    errors = []
    for record in records:
        try:
            # Remove None values for columns that shouldn't be null
            clean_record = {k: v for k, v in record.items() if v is not None}
            if clean_record:
                stmt = insert(table).values(**clean_record)
                db.execute(stmt)
                inserted += 1
        except Exception as e:
            errors.append(str(e))
    
    db.commit()
    
    return {
        "inserted_rows": inserted,
        "total_rows": len(records),
        "matched_columns": matching_columns,
        "errors": errors[:10]  # Limit error output
    }
