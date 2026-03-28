import os
from sqlalchemy import create_engine, text, inspect
from database import DATABASE_URL, Base
import models

engine = create_engine(DATABASE_URL)
inspector = inspect(engine)

def force_fix():
    print(f"Connecting to: {DATABASE_URL.split('@')[-1]}") # Hide credentials
    
    # 1. Create all missing tables
    print("Creating tables via SQLAlchemy...")
    Base.metadata.create_all(bind=engine)
    
    # 2. Add missing columns manually if needed
    with engine.connect() as conn:
        print("Checking for missing columns...")
        
        # _tables migration
        if "_tables" in inspector.get_table_names():
            cols = [c["name"] for c in inspector.get_columns("_tables")]
            for col, dtype in [("group_id", "INTEGER"), ("is_public", "BOOLEAN DEFAULT FALSE"), ("owner_id", "INTEGER")]:
                if col not in cols:
                    print(f"Adding {col} to _tables...")
                    try:
                        conn.execute(text(f"ALTER TABLE _tables ADD COLUMN {col} {dtype}"))
                        conn.commit()
                    except Exception as e:
                        print(f"Failed to add {col}: {e}")
                        conn.rollback()

        # users migration
        if "users" in inspector.get_table_names():
            cols = [c["name"] for c in inspector.get_columns("users")]
            if "role" not in cols:
                print("Adding role to users...")
                try:
                    conn.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR DEFAULT 'admin'"))
                    conn.commit()
                except Exception as e:
                    print(f"Failed to add role: {e}")
                    conn.rollback()
            if "parent_id" not in cols:
                print("Adding parent_id to users...")
                try:
                    conn.execute(text("ALTER TABLE users ADD COLUMN parent_id INTEGER"))
                    conn.commit()
                except Exception as e:
                    print(f"Failed to add parent_id: {e}")
                    conn.rollback()

    # 3. Seed master
    from sqlalchemy.orm import Session
    from auth import get_password_hash
    session = Session(engine)
    master = session.query(models.User).filter(models.User.username == "puczaras").first()
    if not master:
        print("Seeding master account...")
        new_master = models.User(
            username="puczaras",
            password_hash=get_password_hash("Zup Paras"),
            role="master"
        )
        session.add(new_master)
        session.commit()
        print("Master account created.")
    else:
        print("Master account already exists.")
    session.close()

if __name__ == "__main__":
    force_fix()
