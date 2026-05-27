"""DDL físico das tabelas dinâmicas.

Dois caminhos:
- **Postgres**: schema-per-tenant (``tenant_N.clientes``) + coluna ``tenant_id``
  com RLS (``ENABLE`` + ``FORCE`` + policy) e ``CHECK`` redundante.
- **SQLite** (dev local): prefixo legado ``t{tenant_id}_clientes``, sem RLS
  (SQLite não suporta). Comportamento idêntico ao pré-M3.

A função pública ``create_physical_table`` despacha pro caminho correto.
"""
from sqlalchemy import (
    Table, Column, Integer, String, Boolean, DateTime, Float,
    MetaData, ForeignKeyConstraint, text,
)

from database import engine, is_postgres
from tenant_context import tenant_schema_name, tenant_table_prefix


metadata = MetaData()


def get_sqlalchemy_type(type_string: str):
    mapping = {
        "Integer": Integer,
        "String": String,
        "Boolean": Boolean,
        "DateTime": DateTime,
        "Float": Float,
    }
    return mapping.get(type_string, String)


def ensure_tenant_schema(tenant_id: int) -> str | None:
    """Garante que o schema ``tenant_N`` exista em Postgres.

    Retorna o nome do schema, ou ``None`` em SQLite (no-op).
    """
    if not is_postgres():
        return None
    schema = tenant_schema_name(tenant_id)
    with engine.begin() as conn:
        conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
    return schema


def create_physical_table(
    table_name: str,
    columns_data: list,
    tenant_id: int,
    foreign_keys: list | None = None,
):
    """Cria a tabela física para um tenant.

    Args:
        table_name: nome LÓGICO sem prefixo (ex.: ``"clientes"``).
        columns_data: ``[{name, data_type, is_primary, is_nullable, is_unique}, ...]``.
        tenant_id: admin id dono da tabela.
        foreign_keys: ``[{from_col, to_table (LÓGICO), to_col}, ...]`` ou ``None``.

    Returns:
        ``(success, message, schema_name, physical_name)``.
        - Postgres: ``schema_name="tenant_N"``, ``physical_name="clientes"``.
        - SQLite: ``schema_name=None``, ``physical_name="t{N}_clientes"``.
    """
    if is_postgres():
        return _create_physical_table_pg(table_name, columns_data, tenant_id, foreign_keys)
    return _create_physical_table_sqlite(table_name, columns_data, tenant_id, foreign_keys)


def _build_columns(columns_data: list, *, add_tenant_id: bool, tenant_id: int) -> list:
    columns = []
    has_primary = any(col.get("is_primary") for col in columns_data)
    if not has_primary:
        columns.append(Column("id", Integer, primary_key=True, index=True, autoincrement=True))

    for col_data in columns_data:
        if not has_primary and col_data["name"].lower() == "id":
            continue
        columns.append(
            Column(
                col_data["name"],
                get_sqlalchemy_type(col_data["data_type"]),
                primary_key=col_data.get("is_primary", False),
                nullable=col_data.get("is_nullable", True),
                unique=col_data.get("is_unique", False),
            )
        )

    if add_tenant_id:
        columns.append(
            Column(
                "tenant_id",
                Integer,
                nullable=False,
                default=tenant_id,
                server_default=str(tenant_id),
            )
        )
    return columns


def _create_physical_table_pg(table_name, columns_data, tenant_id, foreign_keys):
    schema = ensure_tenant_schema(tenant_id)
    full_name = f'"{schema}"."{table_name}"'

    local_meta = MetaData()
    local_meta.reflect(bind=engine, schema=schema)
    if f"{schema}.{table_name}" in local_meta.tables:
        return False, "Table already exists.", schema, table_name

    columns = _build_columns(columns_data, add_tenant_id=True, tenant_id=tenant_id)

    constraints = []
    if foreign_keys:
        for fk in foreign_keys:
            constraints.append(
                ForeignKeyConstraint(
                    [fk["from_col"]],
                    [f'{schema}.{fk["to_table"]}.{fk["to_col"]}'],
                    ondelete="CASCADE"
                )
            )

    new_table = Table(table_name, local_meta, *columns, *constraints, schema=schema)

    # DDL + RLS na mesma transação pra evitar "relation does not exist".
    with engine.begin() as conn:
        new_table.create(conn)
        conn.execute(text(f"ALTER TABLE {full_name} ENABLE ROW LEVEL SECURITY"))
        conn.execute(text(f"ALTER TABLE {full_name} FORCE ROW LEVEL SECURITY"))
        conn.execute(text(f"""
            CREATE POLICY tenant_isolation ON {full_name}
            USING (
                tenant_id = current_setting('app.tenant_id', true)::int
                OR current_setting('app.is_master', true) = 'true'
            )
            WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::int)
        """))
        # CHECK redundante: defesa em profundidade caso RLS seja desabilitado em bulk.
        conn.execute(text(f"""
            ALTER TABLE {full_name}
            ADD CONSTRAINT tenant_id_matches CHECK (tenant_id = {tenant_id})
        """))

    return True, f"Table {schema}.{table_name} created successfully.", schema, table_name


def _create_physical_table_sqlite(table_name, columns_data, tenant_id, foreign_keys):
    prefix = tenant_table_prefix(tenant_id)
    physical_name = f"{prefix}{table_name}"

    metadata.reflect(bind=engine)
    if physical_name in metadata.tables:
        return False, "Table already exists.", None, physical_name

    columns = _build_columns(columns_data, add_tenant_id=False, tenant_id=tenant_id)

    constraints = []
    if foreign_keys:
        for fk in foreign_keys:
            # SQLite path: FK aponta pro nome físico (com prefixo) — legado.
            to_table_physical = fk.get("to_table_physical") or f"{prefix}{fk['to_table']}"
            constraints.append(
                ForeignKeyConstraint(
                    [fk["from_col"]],
                    [f"{to_table_physical}.{fk['to_col']}"],
                    ondelete="CASCADE"
                )
            )

    new_table = Table(physical_name, metadata, *columns, *constraints)
    new_table.create(engine)

    return True, f"Table {physical_name} created successfully.", None, physical_name
