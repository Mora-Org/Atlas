"""M8 F4 — unit tests do módulo puro de inferência + sanitização (import_infer).
Sem FastAPI, sem DB. Cobre a ladder de tipo (grafias canônicas), o sanitizador
de header (anti-injeção via nome de coluna) e o parse com caps."""
from __future__ import annotations

import io

import pandas as pd
import pytest

import import_infer as ii


def _col(values, dtype=str):
    """Série no formato que o CSV entrega (tudo string) por default."""
    return pd.Series(values, dtype=dtype)


# ─────────────────────── inferência (via valores string, caminho CSV) ───────────────────────

@pytest.mark.parametrize("values,expected", [
    (["007", "008", "010"], "String"),                 # zero à esquerda preservado (CEP/CPF)
    (["1", "2", "2147483647"], "Integer"),             # int32 no limite
    (["1", "2147483648"], "String"),                   # estoura int32 → String
    (["1", "2", "3"], "Integer"),                      # int puro
    (["0", "1", "0"], "Integer"),                      # {0,1} puro NÃO é boolean
    (["sim", "não", "sim"], "Boolean"),                # token textual → Boolean
    (["true", "false"], "Boolean"),
    (["1.5", "2", "3.25"], "Float"),                   # ≥1 fracionário
    (["3,14", "2,71"], "String"),                      # vírgula BR ambígua → String
    (["2020", "2021"], "Integer"),                     # ano bare é Integer, NÃO Date
    (["01/02/2020", "15/03/2021"], "Date"),            # dd/mm/yyyy
    (["2020-01-01", "2021-12-31"], "Date"),            # ISO date
    (["2020-01-01 10:30:00", "2021-12-31 23:59:59"], "DateTime"),
    (["x" * 300], "Text"),                             # >255 chars → Text
    (["curto", "texto"], "String"),
    (["", "", ""], "String"),                          # coluna vazia
])
def test_infer_column_from_strings(values, expected):
    assert ii.infer_column(_col(values)) == expected


def test_infer_column_typed_xlsx_paths():
    # XLSX entrega tipos: int/float/bool/datetime nativos
    assert ii.infer_column(pd.Series([1, 2, 3], dtype="int64")) == "Integer"
    assert ii.infer_column(pd.Series([2**40, 2**41], dtype="int64")) == "String"  # > int32
    assert ii.infer_column(pd.Series([1.0, 2.0, 3.0])) == "Integer"              # float integral
    assert ii.infer_column(pd.Series([1.5, 2.0])) == "Float"
    assert ii.infer_column(pd.Series([True, False, True])) == "Boolean"
    assert ii.infer_column(pd.to_datetime(pd.Series(["2020-01-01", "2021-06-15"]))) == "Date"
    assert ii.infer_column(pd.to_datetime(pd.Series(["2020-01-01 08:00", "2021-06-15 09:30"]))) == "DateTime"


def test_infer_only_emits_canonical_non_media():
    from schemas import ALLOWED_DATA_TYPES, MEDIA_TYPES
    for vals in (["1"], ["a"], ["1.5"], ["sim", "não"], ["2020-01-01"], ["x" * 300], [""]):
        t = ii.infer_column(_col(vals))
        assert t in ALLOWED_DATA_TYPES and t not in MEDIA_TYPES


# ─────────────────────────────── sanitizer ───────────────────────────────

def test_sanitize_basic_and_accents():
    out = ii.sanitize_headers(["Preço (R$)", "Café", "Nome Completo"])
    names = [c["name"] for c in out]
    assert names == ["preco_r", "cafe", "nome_completo"]
    assert out[0]["badge"] == "sanitized"


def test_sanitize_dedupe():
    out = ii.sanitize_headers(["Café", "cafe", "CAFE"])
    assert [c["name"] for c in out] == ["cafe", "cafe_2", "cafe_3"]
    assert out[1]["badge"] == "deduped"


def test_sanitize_empty_and_leading_digit():
    out = ii.sanitize_headers(["###", "2024 Total", ""])
    assert out[0]["name"] == "column_1" and out[0]["badge"] == "empty"
    assert out[1]["name"] == "col_2024_total"
    assert out[2]["name"] == "column_3" and out[2]["badge"] == "empty"


def test_sanitize_reserved_system_collision():
    out = ii.sanitize_headers(["id", "tenant_id", "nome"])
    assert out[0]["name"] == "id_col" and out[0]["badge"] == "reserved"
    assert out[1]["name"] == "tenant_id_col" and out[1]["badge"] == "reserved"
    assert out[2]["name"] == "nome"


def test_sanitize_length_cap():
    long = "a" * 100
    out = ii.sanitize_headers([long])
    assert len(out[0]["name"]) == 63


def test_sanitize_idempotence():
    # nome já válido/único passa verbatim (o commit re-roda sobre os editados)
    already = ["nome", "idade", "email_principal"]
    out = ii.sanitize_headers(already)
    assert [c["name"] for c in out] == already
    assert all(c["badge"] == "ok" for c in out)
    # e re-rodar sobre a saída dá o mesmo (idempotente)
    twice = ii.sanitize_headers([c["name"] for c in out])
    assert [c["name"] for c in twice] == already


def test_sanitize_output_invariant():
    import re
    adversario = ["", "id", "id", "Preço", "preço", "1col", "tenant_id", "  ", "SELECT"]
    out = ii.sanitize_headers(adversario)
    names = [c["name"] for c in out]
    assert len(names) == len(set(names))                 # únicos
    for n in names:
        assert re.match(r"^[a-z][a-z0-9_]*$", n)          # identificador limpo
        assert len(n) <= 63
        assert n not in ii.SYSTEM_COLUMN_NAMES            # ∉ sistema


# ──────────────────────────────── parse ────────────────────────────────

def test_parse_csv_and_xlsx():
    csv = b"nome,idade\nAna,30\nBia,25\n"
    df = ii.parse_spreadsheet(csv, "x.csv")
    assert list(df.columns) == ["nome", "idade"] and len(df) == 2
    # CSV lido como string (idade não vira int 30 no parse — preserva verbatim)
    assert df["idade"].iloc[0] == "30" and isinstance(df["idade"].iloc[0], str)

    buf = io.BytesIO()
    pd.DataFrame({"a": [1, 2], "b": ["x", "y"]}).to_excel(buf, index=False, sheet_name="Plan1")
    df2 = ii.parse_spreadsheet(buf.getvalue(), "y.xlsx")
    assert list(df2.columns) == ["a", "b"] and len(df2) == 2


def test_parse_xlsx_reads_only_first_sheet():
    buf = io.BytesIO()
    with pd.ExcelWriter(buf) as w:
        pd.DataFrame({"a": [1]}).to_excel(w, index=False, sheet_name="Primeira")
        pd.DataFrame({"z": [9]}).to_excel(w, index=False, sheet_name="Segunda")
    df = ii.parse_spreadsheet(buf.getvalue(), "multi.xlsx")
    assert list(df.columns) == ["a"]  # só a 1ª aba


def test_parse_unsupported_and_corrupt():
    with pytest.raises(ValueError):
        ii.parse_spreadsheet(b"...", "x.txt")
    with pytest.raises(ValueError):
        ii.parse_spreadsheet(b"\x00\x01corrompido", "x.xlsx")


def test_parse_col_cap():
    header = ",".join(f"c{i}" for i in range(ii.MAX_COLS + 1)).encode()
    with pytest.raises(ValueError):
        ii.parse_spreadsheet(header + b"\n", "big.csv")
