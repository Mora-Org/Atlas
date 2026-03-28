import os
from sqlalchemy import create_engine, inspect, text
from database import DATABASE_URL

engine = create_engine(DATABASE_URL)
inspector = inspect(engine)

print("--- Tables ---")
tables = inspector.get_table_names()
for table_name in tables:
    print(f"Table: {table_name}")
    try:
        cols = inspector.get_columns(table_name)
        for c in cols:
            print(f"  - {c['name']} ({c['type']})")
    except Exception as e:
        print(f"  Error inspecting {table_name}: {e}")

print("\n--- End of report ---")
