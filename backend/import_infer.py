"""Inferência de schema + sanitização de headers pra o import que CRIA tabela
(M8 F4). Módulo PURO — sem FastAPI, sem DB — unit-testável isolado.

- `parse_spreadsheet`: CSV lido como string (preserva zero à esquerda: CEP/CPF)
  ou XLSX 1ª aba tipado; capa bytes/linhas/colunas (guard de OOM no Railway).
- `infer_column`: DataFrame column → uma das 7 grafias canônicas do
  `ALLOWED_DATA_TYPES` (nunca mídia, nunca minúsculo). Varre a coluna INTEIRA
  (capada) — sem subamostragem, pra outlier tardio não mistipar e quebrar o load.
- `sanitize_headers`: header não-confiável → identificador seguro
  (`^[a-z][a-z0-9_]*$`, ≤63, ∉ sistema, único). F4 é a 1ª feature a alimentar
  header de terceiro em posição de identificador DDL.
"""
from __future__ import annotations

import io
import re
import unicodedata
from datetime import datetime

import pandas as pd
from pandas.api import types as pt


# ── Caps (guard de OOM — o import bufferiza o arquivo inteiro em RAM) ─────
MAX_BYTES = 10 * 1024 * 1024   # 10MB (alinhado ao teto de arquivo da F1)
MAX_ROWS = 50_000
MAX_COLS = 100

# Colunas auto-injetadas por create_physical_table (dynamic_schema.py:79-104):
# `id` PK (sem is_primary) e `tenant_id` (Postgres). Um header que colide com
# elas corromperia o create — o sanitizer renomeia.
SYSTEM_COLUMN_NAMES = ("id", "tenant_id")
_RESERVED_RENAMES = {"id": "id_col", "tenant_id": "tenant_id_col"}

_INT32_MIN, _INT32_MAX = -2_147_483_648, 2_147_483_647


# ───────────────────────────── parse ─────────────────────────────

def parse_spreadsheet(content: bytes, filename: str) -> pd.DataFrame:
    """CSV (`dtype=str`) / XLSX (1ª aba, tipado). Capa linhas/colunas.
    Levanta ValueError com mensagem controlada (o endpoint traduz p/ 400/413)."""
    name = (filename or "").lower()
    try:
        if name.endswith(".csv"):
            df = pd.read_csv(
                io.BytesIO(content), dtype=str, keep_default_na=True,
                na_values=[""], nrows=MAX_ROWS + 1,
            )
        elif name.endswith(".xlsx") or name.endswith(".xls"):
            df = pd.read_excel(io.BytesIO(content), sheet_name=0, nrows=MAX_ROWS + 1)
        else:
            raise ValueError("Só arquivos .csv e .xlsx são suportados")
    except ValueError:
        raise
    except Exception as e:  # parse quebrado / arquivo corrompido
        raise ValueError(f"Erro ao ler o arquivo: {e}")

    if len(df.columns) > MAX_COLS:
        raise ValueError(f"Arquivo excede o limite: máx {MAX_COLS} colunas")
    if len(df) > MAX_ROWS:
        raise ValueError(f"Arquivo excede o limite: máx {MAX_ROWS:,} linhas")
    return df


# ─────────────────────────── inferência ───────────────────────────

def _int32(lo, hi) -> bool:
    return _INT32_MIN <= lo and hi <= _INT32_MAX


def _int32_str(v: str) -> bool:
    try:
        n = int(v)
    except (ValueError, TypeError):
        return False
    return _INT32_MIN <= n <= _INT32_MAX


_INT_RE = re.compile(r"^[+-]?(0|[1-9]\d*)$")
_FLOAT_RE = re.compile(r"^[+-]?(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?$")
# Boolean só com evidência TEXTUAL — {0,1} puro NÃO é boolean (cai p/ Integer).
_BOOL_TOKENS = frozenset({
    "true", "t", "yes", "y", "sim", "verdadeiro", "1",
    "false", "f", "no", "n", "nao", "não", "falso", "0",
})
_DATE_FORMATS = ["%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d", "%d-%m-%Y", "%d.%m.%Y"]
_DATETIME_FORMATS = ["%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M", "%d/%m/%Y %H:%M:%S"]


def _all_match_format(vals: list[str], fmt: str) -> bool:
    for v in vals:
        try:
            datetime.strptime(v, fmt)
        except ValueError:
            return False
    return True


def detect_temporal_format(vals: list[str]) -> tuple[str, str] | None:
    """(kind, fmt) onde kind ∈ {'Date','DateTime'} se UM formato casa 100% da
    coluna; senão None. Usado tanto pela inferência quanto pela normalização
    ISO do load (só DateTime vira TIMESTAMP real)."""
    for fmt in _DATE_FORMATS:
        if _all_match_format(vals, fmt):
            return "Date", fmt
    for fmt in _DATETIME_FORMATS:
        if _all_match_format(vals, fmt):
            return "DateTime", fmt
    return None


def normalize_temporal_series(series: pd.Series) -> pd.Series:
    """Normaliza uma coluna temporal pra ISO (`YYYY-MM-DD HH:MM:SS`) SE um
    formato casa 100% dos valores não-nulos; senão devolve a série intocada.
    Usado no load de colunas DateTime — psycopg mistparseia dd/mm por-linha
    (DateStyle) se receber o formato BR cru. Preserva NaN/None."""
    vals = [str(v).strip() for v in series.dropna().tolist()]
    if not vals:
        return series
    detected = detect_temporal_format(vals)
    if not detected:
        return series
    _, fmt = detected

    def _conv(v):
        if v is None or (isinstance(v, float) and pd.isna(v)):
            return v
        try:
            return datetime.strptime(str(v).strip(), fmt).isoformat(sep=" ")
        except (ValueError, TypeError):
            return v

    return series.map(_conv)


def _infer_from_values(vals: list[str]) -> str:
    s = [v for v in vals if v != ""]
    if not s:
        return "String"
    lower = {v.lower() for v in s}
    # 1) Boolean — todos os tokens boolean E ≥1 não-numérico ({0,1} puro → Integer)
    if lower <= _BOOL_TOKENS and (lower - {"0", "1"}):
        return "Boolean"
    # 2) Integer — estrito, sem zero à esquerda, int32
    if all(_INT_RE.match(v) for v in s):
        return "Integer" if all(_int32_str(v) for v in s) else "String"
    # 3) Float — ponto-decimal/expoente, com ≥1 fracionário (vírgula BR fica String)
    if all(_FLOAT_RE.match(v) for v in s) and any(("." in v or "e" in v.lower()) for v in s):
        return "Float"
    # 4) Temporal — whitelist strptime, 100% da coluna casa (depois de int/float)
    kind = detect_temporal_format(s)
    if kind:
        return kind[0]
    # 5) String vs Text por comprimento
    return "Text" if max(len(v) for v in s) > 255 else "String"


def infer_column(series: pd.Series) -> str:
    """Column → uma das 7 grafias canônicas (Integer/Float/Boolean/Date/DateTime/
    String/Text). Nunca mídia. CSV chega tudo string → cai no classificador."""
    nn = series.dropna()
    if nn.empty:
        return "String"
    if pt.is_bool_dtype(series):
        return "Boolean"
    if pt.is_integer_dtype(series):
        return "Integer" if _int32(nn.min(), nn.max()) else "String"
    if pt.is_float_dtype(series):
        if bool(((nn % 1) == 0).all()):
            return "Integer" if _int32(nn.min(), nn.max()) else "String"
        return "Float"
    if pt.is_datetime64_any_dtype(series):
        return "Date" if bool((nn.dt.normalize() == nn).all()) else "DateTime"
    return _infer_from_values([str(v).strip() for v in nn.tolist()])


# ─────────────────────────── sanitizer ───────────────────────────

def sanitize_column_name(header, position: int) -> tuple[str, str]:
    """1 header → (nome_normalizado, badge). badge ∈ empty/reserved/sanitized/ok.
    position é 1-based (pra header vazio virar column_{N}). Dedupe é do
    sanitize_headers (precisa do contexto do lote)."""
    raw = "" if header is None else str(header).strip()
    folded = unicodedata.normalize("NFKD", raw).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "_", folded.lower())
    slug = re.sub(r"_+", "_", slug).strip("_")
    if not slug:
        return f"column_{position}", "empty"
    if slug[0].isdigit():
        slug = "col_" + slug
    slug = slug[:63]
    if slug in _RESERVED_RENAMES:
        return _RESERVED_RENAMES[slug], "reserved"
    # "ok" só se o header já era exatamente o identificador limpo
    return slug, ("ok" if raw == slug else "sanitized")


def sanitize_headers(headers) -> list[dict]:
    """Lote de headers → [{original_header, name, badge}] com dedupe. Invariante:
    todo `name` casa ^[a-z][a-z0-9_]*$, ≤63, ∉ sistema, único. IDEMPOTENTE:
    um nome já válido/único passa verbatim (o commit re-roda sobre os editados)."""
    seen = set(SYSTEM_COLUMN_NAMES)  # semeia p/ dedupe evitar colisão c/ sistema
    out: list[dict] = []
    for i, h in enumerate(headers):
        name, badge = sanitize_column_name(h, i + 1)
        base, n = name, 2
        while name in seen:
            name = f"{base}_{n}"
            n += 1
            if badge in ("ok", "sanitized"):  # empty/reserved têm precedência
                badge = "deduped"
        seen.add(name)
        out.append({
            "original_header": "" if h is None else str(h),
            "name": name,
            "badge": badge,
        })
    return out
