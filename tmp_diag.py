import sys
import os
sys.path.append('backend')
from database import SessionLocal, engine
import models
import schemas
from main import create_table
from sqlalchemy.orm import Session

db = SessionLocal()
# Mock user
user = db.query(models.User).filter(models.User.role == 'admin').first()
if not user:
    user = models.User(username="testadmin", password_hash="x", role="admin")
    db.add(user)
    db.commit()
    db.refresh(user)

table_data = schemas.TableCreate(
    name="test_diag",
    columns=[
        schemas.ColumnCreate(name="id", data_type="Integer", is_primary=True),
        schemas.ColumnCreate(name="name", data_type="String")
    ]
)

try:
    res = create_table(table_data, db, user)
    print("SUCCESS")
except Exception as e:
    print(f"FAILED: {str(e)}")
finally:
    db.close()
