"""B4 — inverso do mapa de tipos: tipo físico do SQLAlchemy → rótulo canônico.

Unit puro do `canonical_data_type`. O que ele protege: o rótulo de `_columns` é
lido por UI, seletor de tipo e pela whitelist de mídia. Se ele mente, a leitura
mente junto — e o import por SQL era o único caminho que gravava o nome da
classe do dialeto.

O caso que a ordem dos `isinstance` resolve está explícito aqui: os dialetais
(`VARCHAR`, `BIGINT`, `TIMESTAMP`) herdam dos genéricos, e `Text` herda de
`String` — testar só os genéricos deixaria passar o inverso escrito na ordem
errada.
"""
from sqlalchemy import (
    BIGINT, BOOLEAN, DATETIME, FLOAT, INTEGER, NUMERIC, TEXT, TIMESTAMP, VARCHAR,
    Boolean, Date, DateTime, Float, Integer, LargeBinary, String, Text,
)

from dynamic_schema import canonical_data_type, get_sqlalchemy_type
from schemas import ALLOWED_DATA_TYPES


def test_genericos():
    assert canonical_data_type(String()) == "String"
    assert canonical_data_type(Text()) == "Text"
    assert canonical_data_type(Integer()) == "Integer"
    assert canonical_data_type(Float()) == "Float"
    assert canonical_data_type(Boolean()) == "Boolean"
    assert canonical_data_type(DateTime()) == "DateTime"
    assert canonical_data_type(Date()) == "Date"


def test_dialetais_caem_no_generico_certo():
    """É este o caso real do import por SQL: o parser devolve tipo do dialeto."""
    assert canonical_data_type(VARCHAR(100)) == "String"
    assert canonical_data_type(TEXT()) == "Text"
    assert canonical_data_type(INTEGER()) == "Integer"
    assert canonical_data_type(BIGINT()) == "Integer"
    assert canonical_data_type(FLOAT()) == "Float"
    assert canonical_data_type(NUMERIC(10, 2)) == "Float"
    assert canonical_data_type(BOOLEAN()) == "Boolean"
    assert canonical_data_type(DATETIME()) == "DateTime"
    assert canonical_data_type(TIMESTAMP()) == "DateTime"


def test_nunca_devolve_rotulo_fora_da_whitelist():
    tipos = [String(), Text(), Integer(), Float(), Boolean(), DateTime(), Date(),
             VARCHAR(10), BIGINT(), NUMERIC(4, 1), TIMESTAMP(), LargeBinary()]
    for t in tipos:
        assert canonical_data_type(t) in ALLOWED_DATA_TYPES, t


def test_desconhecido_vira_string_e_isso_e_verdade():
    """`LargeBinary` não tem rótulo próprio; vira String — que é o mesmo
    fallback do `get_sqlalchemy_type`, então a coluna física TAMBÉM é String e
    o rótulo continua honesto."""
    assert canonical_data_type(LargeBinary()) == "String"
    assert get_sqlalchemy_type("Coisa") is String


def test_round_trip_com_o_mapa_de_ida():
    """Todo rótulo que o motor DDL sabe criar volta como ele mesmo.

    `Date` e `Text` ficam de fora: `get_sqlalchemy_type` os manda pro fallback
    String (dívida pré-existente do motor, anotada no plano do M8.5) — o inverso
    aqui não pode fingir que isso não acontece."""
    for rotulo in ("Integer", "String", "Boolean", "DateTime", "Float"):
        fisico = get_sqlalchemy_type(rotulo)
        assert canonical_data_type(fisico()) == rotulo

    assert get_sqlalchemy_type("Date") is String
    assert get_sqlalchemy_type("Text") is String
