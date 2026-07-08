"""Storage de mídia da Media Library (M8 F1).

Molde do `publication_storage.py`, estendido pra binário:
- **Supabase Storage** (prod): bucket público `workspace-media`, provisionado
  EM CÓDIGO (idempotente no startup) com `file_size_limit` e
  `allowed_mime_types` — o bucket de snapshots era manual no dashboard;
  este nasce certo.
- **Fallback filesystem** (dev/pytest, sem SUPABASE_URL): arquivos em
  `backend/.media_dev/` (gitignorado) servidos pela rota
  `GET /api/assets/dev/{owner_id}/{filename}`. O fallback in-memory do
  publication_storage não serve pra mídia: a URL pública precisa ser
  alcançável pelo browser e sobreviver ao --reload.

Decisões F1 (Diretor 2026-07-05): path opaco `{owner_id}/{uuid}{ext}`,
imutável, NUNCA upsert (novo-path-on-replace); teto 10MB/arquivo; SVG fora
da whitelist de MIME (stored-XSS — validação de conteúdo completa é F5).
"""
from __future__ import annotations

import logging
import os
import shutil

import supabase_admin


logger = logging.getLogger("atlas.media")

BUCKET = "workspace-media"
MAX_FILE_BYTES = 10 * 1024 * 1024  # 10MB/arquivo — decisão Diretor 2026-07-05
GC_MIN_AGE_HOURS = 24              # órfão só é coletável depois disso
_REMOVE_BATCH = 100                # remove() em lotes

# Whitelist de MIME da v1. SVG (image/svg+xml) fica FORA de propósito:
# bucket público + SVG = stored-XSS servido do nosso domínio. text/html e
# application/octet-stream idem (genérico demais). Revisita na F5.
ALLOWED_MIME = frozenset({
    # image
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/avif",
    # documentos
    "application/pdf", "text/plain", "text/csv", "application/json",
    "application/zip",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    # audio/video básicos
    "audio/mpeg", "video/mp4", "video/webm",
})

MEDIA_DEV_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".media_dev")


def _api_base() -> str:
    """Base pública do backend em dev — a URL absoluta gravada na célula
    precisa ser alcançável pelo browser (default: uvicorn local)."""
    return os.environ.get("API_BASE_URL", "http://localhost:8000").rstrip("/")


def _dev_url_prefix() -> str:
    return f"{_api_base()}/api/assets/dev/"


def _supabase_url_prefix() -> str:
    return f"{supabase_admin.SUPABASE_URL.rstrip('/')}/storage/v1/object/public/{BUCKET}/"


def public_url(path: str) -> str:
    """URL pública absoluta de um path gerenciado (é o que a célula guarda)."""
    if supabase_admin.is_configured():
        return _supabase_url_prefix() + path
    return _dev_url_prefix() + path


def url_to_path(url) -> str | None:
    """URL → path gerenciado, ou None se o valor não é nosso (URL externa
    legada, texto qualquer, None). É o gate do no-op dos hooks de refcount."""
    if not isinstance(url, str) or not url:
        return None
    prefixes = [_dev_url_prefix()]
    if supabase_admin.is_configured():
        prefixes.append(_supabase_url_prefix())
    for prefix in prefixes:
        if url.startswith(prefix):
            return url[len(prefix):] or None
    return None


def _dev_file(path: str) -> str:
    return os.path.join(MEDIA_DEV_DIR, *path.split("/"))


def upload(path: str, content: bytes, mime: str) -> str:
    """Sobe binário. SEM upsert — path é imutável (decisão #9); o
    content-type é sempre explícito (o default da lib é text/plain e
    corromperia o MIME servido)."""
    if not supabase_admin.is_configured():
        fp = _dev_file(path)
        os.makedirs(os.path.dirname(fp), exist_ok=True)
        with open(fp, "wb") as fh:
            fh.write(content)
        return path

    client = supabase_admin.get_admin()
    client.storage.from_(BUCKET).upload(
        path=path, file=content, file_options={"content-type": mime}
    )
    return path


def read_dev(path: str) -> bytes | None:
    """Bytes do fallback filesystem (só dev). None se não existe."""
    fp = _dev_file(path)
    if not os.path.isfile(fp):
        return None
    with open(fp, "rb") as fh:
        return fh.read()


def remove(paths: list[str]) -> None:
    """Remove blobs em lotes. Best-effort/idempotente — NUNCA relança
    (jurisprudência delete_owner_snapshots: o banco já está consistente
    quando isto roda; falha vira log, não 500)."""
    paths = [p for p in paths if p]
    if not paths:
        return

    if not supabase_admin.is_configured():
        for p in paths:
            try:
                os.remove(_dev_file(p))
            except OSError:
                pass
        return

    try:
        storage = supabase_admin.get_admin().storage.from_(BUCKET)
        for i in range(0, len(paths), _REMOVE_BATCH):
            storage.remove(paths[i : i + _REMOVE_BATCH])
    except Exception:
        logger.warning("cleanup de mídia falhou (blobs podem ter ficado órfãos)", exc_info=True)


# ── Cópias imutáveis por publish (M8 F3, decisão #3=A) ──────────────────
# O publish COPIA os assets referenciados pra um retrato imutável por-versão,
# pra o snapshot nunca 404ar quando a célula viva for trocada/limpada depois.
# Tudo num nível só sob `{owner}/pub/` (nome = `v{N}__{basename}`) pra deleção
# por prefixo ser trivial (list de 1 nível, sem folders aninhados). O refcount
# NÃO participa: essas cópias vivem/morrem com o snapshot, não com `_assets`.
PUB_PREFIX = "pub"


def _basename(path: str) -> str:
    return path.rsplit("/", 1)[-1]


def snapshot_copy_path(owner_id: int, version_number: int, src_path: str) -> str:
    """Path da cópia imutável de um asset pro snapshot v{N}."""
    return f"{owner_id}/{PUB_PREFIX}/v{version_number}__{_basename(src_path)}"


def copy(src_path: str, dst_path: str) -> None:
    """Copia um blob server-side (Supabase `storage.copy` = sem passar bytes
    pelo app; dev = `shutil.copyfile`). Best-effort: dst já existente (retry
    de publish) ou src sumido vira log — o publish não pode morrer por causa
    de uma cópia (a URL viva ainda resolve como fallback)."""
    if not supabase_admin.is_configured():
        try:
            dst_fp = _dev_file(dst_path)
            os.makedirs(os.path.dirname(dst_fp), exist_ok=True)
            shutil.copyfile(_dev_file(src_path), dst_fp)
        except OSError:
            logger.warning("copy de mídia (dev) %s -> %s falhou", src_path, dst_path, exc_info=True)
        return
    try:
        supabase_admin.get_admin().storage.from_(BUCKET).copy(from_path=src_path, to_path=dst_path)
    except Exception:
        logger.warning("copy de mídia %s -> %s falhou", src_path, dst_path, exc_info=True)


def remove_pub_media(owner_id: int, version_number: int | None = None) -> None:
    """Remove as cópias de snapshot de um owner. `version_number=None` = todas
    (delete do admin). Coleta-então-remove (não lista enquanto deleta) e pagina.
    Idempotente, nunca relança."""
    prefix = f"{owner_id}/{PUB_PREFIX}"
    match = None if version_number is None else f"v{version_number}__"

    if not supabase_admin.is_configured():
        base = _dev_file(prefix)
        if not os.path.isdir(base):
            return
        for fn in os.listdir(base):
            if match is None or fn.startswith(match):
                try:
                    os.remove(os.path.join(base, fn))
                except OSError:
                    pass
        return

    try:
        storage = supabase_admin.get_admin().storage.from_(BUCKET)
        to_remove: list[str] = []
        offset = 0
        while True:
            entries = storage.list(prefix, {"limit": _REMOVE_BATCH, "offset": offset})
            if not entries:
                break
            for e in entries:
                n = e.get("name")
                if n and (match is None or n.startswith(match)):
                    to_remove.append(f"{prefix}/{n}")
            if len(entries) < _REMOVE_BATCH:
                break
            offset += _REMOVE_BATCH
        for i in range(0, len(to_remove), _REMOVE_BATCH):
            storage.remove(to_remove[i : i + _REMOVE_BATCH])
    except Exception:
        logger.warning("cleanup de cópias de snapshot (owner=%s) falhou", owner_id, exc_info=True)


def ensure_bucket() -> None:
    """Provisiona o bucket de mídia em código, idempotente. No-op sem
    Supabase. Nunca relança — bucket faltando vira erro controlado no
    primeiro upload, não startup quebrado."""
    if not supabase_admin.is_configured():
        return
    options = {
        "public": True,
        "file_size_limit": MAX_FILE_BYTES,
        "allowed_mime_types": sorted(ALLOWED_MIME),
    }
    client = supabase_admin.get_admin()
    try:
        client.storage.create_bucket(BUCKET, options=options)
        logger.info("bucket de mídia '%s' criado", BUCKET)
    except Exception:
        # Provavelmente já existe — sincroniza as options (teto/MIME).
        try:
            client.storage.update_bucket(BUCKET, options=options)
        except Exception:
            logger.warning("ensure_bucket('%s') falhou", BUCKET, exc_info=True)


def _reset_local_store_for_tests() -> None:
    """Limpa o fallback filesystem. Chamado pelos testes de mídia."""
    shutil.rmtree(MEDIA_DEV_DIR, ignore_errors=True)
