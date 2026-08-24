"""Snapshot storage helpers para publicações (M6 Fase 1).

Snapshot publicado é JSON único por versão, gravado no Supabase Storage
no bucket `public-snapshots`. Path: `{owner_id}/v{version_number}.json`.

Quando Supabase Storage não está configurado (dev local / pytest), as
funções usam um in-memory fallback: dict global keyed por path. Isso
permite rodar a suite sem depender de rede.

Convenção de schema do blob (formato versionado em `schema_version`):

```json
{
  "schema_version": 1,
  "owner": {"workspace_slug": "...", "workspace_name": "..."},
  "version_number": 1,
  "created_at": "ISO-8601",
  "theme": { ... },                  // theme_config da row
  "tables": [
    {
      "name": "eventos",
      "layout": "list",              // list | grid | essay
      "columns": [{"name": "...", "data_type": "..."}, ...],
      "rows": [{...}, ...],          // truncado em MAX_ROWS_PER_TABLE
      "truncated": false,
      "total_rows": 12
    }
  ]
}
```
"""
from __future__ import annotations

import datetime as _datetime
import decimal
import json
import uuid
from typing import Any

import supabase_admin


BUCKET = "public-snapshots"
# Teto por tabela no snapshot. Subiu de 2.000 pra 10.000 no 1.3 (decisão do
# Diretor, 21/08/2026), agora que o site pagina em vez de despejar tudo na tela.
#
# O número não é chute: com o acervo real medido, cada linha custa ~491 bytes no
# JSON do snapshot (a chave se repete em cada linha), então 10.000 linhas = ~4,7 MB
# por tabela. Acima disso o Diretor prefere que a pessoa tenha base própria ou fale
# com ele — o Atlas publica acervo, não substitui banco de produção.
MAX_ROWS_PER_TABLE = 10_000

# Orçamento do snapshot INTEIRO. O blob é único e o site busca ele todo a cada
# revalidação: 17 tabelas no teto novo dariam ~80 MB e a página no ar ficaria
# impraticável. Estourado o orçamento, as tabelas seguintes entram sem linhas e
# o relatório DECLARA o corte — truncar calado é o que a M8.5 F3 existiu pra evitar.
MAX_SNAPSHOT_BYTES = 40 * 1024 * 1024


def _json_default(value: Any) -> Any:
    """Serializa tipos que rows de tabelas dinâmicas podem carregar
    (DateTime/Date do Postgres, Decimal de colunas Float/Numeric, UUID).
    Publish nunca pode falhar por tipo de coluna — fallback final é str."""
    if isinstance(value, (_datetime.datetime, _datetime.date, _datetime.time)):
        return value.isoformat()
    if isinstance(value, decimal.Decimal):
        return float(value)
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return str(value)

# In-memory fallback pra dev/test sem Supabase Storage.
_local_store: dict[str, bytes] = {}


def snapshot_path(owner_id: int, version_number: int) -> str:
    """Path determinístico do blob: `{owner_id}/v{N}.json`."""
    return f"{owner_id}/v{version_number}.json"


def upload(path: str, payload: dict[str, Any]) -> str:
    """Sobe `payload` como JSON no bucket. Devolve o `path`.

    Em dev/test sem Supabase, guarda em memória.
    """
    body = json.dumps(
        payload, ensure_ascii=False, separators=(",", ":"), default=_json_default
    ).encode("utf-8")

    if not supabase_admin.is_configured():
        _local_store[path] = body
        return path

    client = supabase_admin.get_admin()
    storage = client.storage.from_(BUCKET)
    # `upsert=true` permite sobrescrever em retries (idempotente).
    storage.upload(path=path, file=body, file_options={"content-type": "application/json", "upsert": "true"})
    return path


def download(path: str) -> dict[str, Any] | None:
    """Baixa e desserializa o JSON. Devolve None se path não existir."""
    if not supabase_admin.is_configured():
        body = _local_store.get(path)
        return json.loads(body.decode("utf-8")) if body else None

    client = supabase_admin.get_admin()
    storage = client.storage.from_(BUCKET)
    try:
        body = storage.download(path)
    except Exception:
        return None
    if not body:
        return None
    return json.loads(body.decode("utf-8") if isinstance(body, bytes) else body)


def delete(path: str) -> None:
    """Idempotente — não falha se o blob não existir."""
    if not supabase_admin.is_configured():
        _local_store.pop(path, None)
        return

    client = supabase_admin.get_admin()
    try:
        client.storage.from_(BUCKET).remove([path])
    except Exception:
        # Já deletado / não existe — ignora.
        pass


def delete_owner_snapshots(owner_id: int) -> None:
    """Remove TODOS os snapshots de um owner (`{owner_id}/*`).

    Usado no cleanup quando um admin é deletado — sem isso os blobs ficam
    órfãos no bucket (o cascade do Postgres só limpa `_publication_versions`,
    não o Storage). Idempotente, nunca relança.
    """
    if not supabase_admin.is_configured():
        for key in [k for k in _local_store if k.startswith(f"{owner_id}/")]:
            _local_store.pop(key, None)
        return

    client = supabase_admin.get_admin()
    try:
        storage = client.storage.from_(BUCKET)
        entries = storage.list(str(owner_id))
        paths = [f"{owner_id}/{e['name']}" for e in (entries or []) if e.get("name")]
        if paths:
            storage.remove(paths)
    except Exception:
        # Bucket vazio / prefixo inexistente / erro de rede — não bloqueia
        # a deleção do admin (banco já está consistente).
        pass


def _reset_local_store_for_tests() -> None:
    """Limpa o fallback in-memory. Chamado pelo conftest entre testes."""
    _local_store.clear()
