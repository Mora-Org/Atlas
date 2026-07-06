"""Refcount + ciclo de vida dos assets (M8 F1).

Funções explícitas penduradas nos hooks que a F0 armou (create/update/
delete de row, drop-column, delete-table). Regras de ouro:

- Valor que não resolve pra asset do PRÓPRIO tenant é **no-op** (URL
  externa legada, import, texto qualquer) — nunca refcount fantasma,
  nunca erro no CRUD por causa de mídia.
- Refcount é sempre expressão SQL (``refcount = refcount ± 1``), nunca
  read-modify-write.
- **Nenhuma função aqui remove blob do Storage** (decisão #3: hooks nunca
  deletam mídia — snapshot publicado pode referenciar). Blob sai pelo GC
  explícito, pelo DELETE do asset (refcount 0) ou pelo delete_admin.
"""
from sqlalchemy import update as _sa_update
from sqlalchemy.orm import Session

import models
from media_storage import url_to_path
from schemas import MEDIA_TYPES


def media_column_names(db_table: "models.DynamicTable") -> list[str]:
    """Nomes das colunas de tipo mídia de uma tabela dinâmica."""
    return [c.name for c in db_table.columns if (c.data_type or "") in MEDIA_TYPES]


def _adjust(db: Session, tenant_id: int, path: str, delta: int) -> None:
    stmt = _sa_update(models.Asset).where(
        models.Asset.path == path,
        models.Asset.owner_id == tenant_id,  # hotlink cross-tenant não conta
    )
    if delta < 0:
        stmt = stmt.where(models.Asset.refcount > 0)  # nunca negativo
    db.execute(stmt.values(refcount=models.Asset.refcount + delta))


def adjust_for_values(db: Session, tenant_id: int, values, delta: int) -> None:
    """Ajusta refcount pra cada valor que resolver pra um asset gerenciado."""
    for value in values:
        path = url_to_path(value)
        if path:
            _adjust(db, tenant_id, path, delta)


def on_record_insert(db: Session, db_table, data: dict) -> None:
    for col in media_column_names(db_table):
        adjust_for_values(db, db_table.tenant_id, [data.get(col)], +1)


def on_record_update(db: Session, db_table, old_map: dict, data: dict) -> None:
    """Body parcial: chave AUSENTE = coluna não mudou (não decrementa)."""
    for col in media_column_names(db_table):
        if col not in data:
            continue
        new_value, old_value = data.get(col), old_map.get(col)
        if new_value == old_value:
            continue
        adjust_for_values(db, db_table.tenant_id, [old_value], -1)
        adjust_for_values(db, db_table.tenant_id, [new_value], +1)


def on_record_delete(db: Session, db_table, row_map: dict) -> None:
    for col in media_column_names(db_table):
        adjust_for_values(db, db_table.tenant_id, [row_map.get(col)], -1)
