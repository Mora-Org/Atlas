"""M8.5 F1: motor puro de agregação server-side.

Módulo PURO, no molde de `media_cleanup.py` / `import_infer.py`. É chamado por
DOIS caminhos com contratos de transação diferentes:

- o endpoint `/api/views/me/*`, que roda sob `tenant_db` (GUC `app.tenant_id`
  setado, commit no teardown);
- o publish (`_build_snapshot_payload`, main.py:1967), que roda sob `get_db` —
  SEM GUC de tenant (main.py:2147).

Por isso o motor NUNCA commita e NUNCA depende do GUC: recebe a tabela já
resolvida e escopada por `owner_id` pelo chamador. Um `db.commit()` aqui dentro
apagaria o GUC (transaction-local, main.py:514-537) do caminho do endpoint — a
F4 do M8 já pisou nesse ancinho e re-seta em main.py:1927.

Descartado explicitamente: o publish chamar o endpoint por HTTP. Conexão nova =
sem GUC = ou barra tudo ou vaza entre tenants.

Decisões do Diretor (2026-07-16) que este módulo materializa:
- #10 operações = count | count_distinct | sum | avg. `min`/`max` ficam FORA:
  MAX em booleana passa em dev (=1) e dá 500 em prod; MIN/MAX em texto dá eixo
  alfabético. Ambos invisíveis pro gate, que roda SQLite.
- #9  cardinalidade = top 20 (teto duro 50) + "resto" + aviso DENTRO do dado.
- #2  (2026-07-12) agregado computado sobre o dado COMPLETO no publish.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Sequence

from sqlalchemy import String, distinct, func, select, text
from sqlalchemy.orm import Session
from sqlalchemy.sql import Select
from sqlalchemy.sql.elements import ColumnElement


# ---------------------------------------------------------------- constantes

COUNT = "count"
COUNT_DISTINCT = "count_distinct"
SUM = "sum"
AVG = "avg"

OPERATIONS: tuple[str, ...] = (COUNT, COUNT_DISTINCT, SUM, AVG)
#: Operações que exigem coluna-métrica numérica de verdade (decisão #10).
NUMERIC_OPERATIONS: tuple[str, ...] = (SUM, AVG)
#: Operações cujo "resto" é derivável por soma das caudas. `count_distinct`
#: NÃO entra: somar distintos-por-grupo conta em dobro quem aparece em mais de
#: um grupo, e a barra do resto sairia inflada com cara de verdade. O
#: detalhamento afirmou que só min/max não seriam deriváveis — está errado, e
#: a consequência é tratada em `_build_rest_point` (valor nulo + aviso, nunca
#: número inventado).
ADDITIVE_OPERATIONS: tuple[str, ...] = (COUNT, SUM, AVG)

#: Os 7 operadores de filtro que já existem na rota de dados (main.py:1406).
#: Reusados como estão — a F1 não inventa linguagem de filtro nova.
FILTER_OPS: tuple[str, ...] = ("eq", "contains", "gt", "lt", "gte", "lte", "neq")

DEFAULT_TOP_N = 20
#: Teto DURO (decisão #9): nem o chamador nem a F2 passam disso.
MAX_TOP_N = 50
#: "A vs B" = 1 request com N recortes (decisão #11 do contrato): 1 request =
#: 1 transação = 1 ponto no tempo. Com 2 requests o dado muda no meio e o
#: gráfico compara maçã com laranja sem avisar.
MAX_SLICES = 4

#: Nulo é grupo PRÓPRIO, nunca zero — "zero" e "sem dado" são coisas
#: diferentes e o gráfico não pode fundir as duas.
NULL_LABEL = "(sem valor)"
REST_LABEL = "(resto)"

#: Dique de performance (decisão #16 do contrato): não há índice novo, e
#: `SET LOCAL statement_timeout` é o corte. Medido: índice em `tenant_id` é
#: REGRESSÃO de 30% (500k linhas: 787ms → 1025ms) porque nada no repo roda
#: ANALYZE e o planner escolhe o índice inútil; e guardar com `count(*)`
#: prévio custa uma varredura inteira pra proteger algo ~10x mais caro.
#: VALOR PROVISÓRIO: o `statement_timeout` de produção é desconhecido (o app
#: não seta nenhum; grep=0) e a leitura do Supabase foi barrada pelo
#: classificador. Até confirmar, assumimos o pior ("não há timeout") e setamos
#: o nosso. No-op em SQLite.
DEFAULT_STATEMENT_TIMEOUT_MS = 10_000

#: Nunca agrupáveis (decisão #5 do contrato).
#: `tenant_id` existe em PG e não em SQLite (dynamic_schema.py:117 vs :162) — e
#: nem toda tabela de PG tem: importada por SQL usa DDL crua (main.py:1644) e
#: não tem. Agrupar por ele passaria no gate SQLite (coluna inexistente) e em
#: PG devolveria um grupo único inútil, vazando o id interno. Precedente de
#: higiene: main.py:2021 dá pop no tenant_id antes de serializar.
NEVER_GROUPABLE: frozenset[str] = frozenset({"tenant_id", "id"})


class AggregationError(ValueError):
    """Erro de contrato — o chamador traduz pra HTTP 400.

    Prova de tipo ANTES do banco (decisão #10 do contrato): medido que
    `SUM` sobre coluna de texto devolve [('a',12),('b',0.0)] no SQLite —
    verde e MENTIROSO — e 500 no Postgres. Barrar na porta mata os dois de
    uma vez, inclusive no caminho de import por SQL, que hoje não tem
    cobertura em Postgres nenhuma.
    """


# ------------------------------------------------------------------- spec

@dataclass(frozen=True)
class Slice:
    """Um recorte nomeado ("filtro A"). Reusa os 7 ops da rota de dados."""
    label: str
    filter_col: str | None = None
    filter_val: str | None = None
    filter_op: str = "eq"


@dataclass(frozen=True)
class AggregationSpec:
    group_by: str
    operation: str
    metric_column: str | None = None
    slices: tuple[Slice, ...] = field(default_factory=tuple)
    top_n: int = DEFAULT_TOP_N
    search: str | None = None


# ------------------------------------------------------- tipos das colunas

def _python_type(col: ColumnElement) -> type | None:
    """Tipo PYTHON da coluna refletida. Nunca o rótulo, nunca o nome da classe.

    Fonte deliberada (decisão #4 do contrato): o tipo FÍSICO refletido por
    `_load_physical_table` (main.py:567) — mesmo caminho que o filtro já usa.
    O rótulo `_columns.data_type` MENTE em tabela importada por SQL (grava
    'VARCHAR'/'INTEGER', main.py:1671), e classificar pelo nome da classe
    classifica ZERO (medido). As duas fontes erram em direções opostas e por
    isso se cobrem: o rótulo serve SÓ pra excluir mídia, que o tipo físico não
    enxerga.
    """
    try:
        return col.type.python_type
    except (NotImplementedError, AttributeError):
        return None


def is_numeric_column(col: ColumnElement) -> bool:
    """True só pra numérico DE VERDADE. `bool` é subclasse de `int` em Python
    e precisa sair explícito: somar/mediar booleana é o caminho do 500 em prod.
    """
    t = _python_type(col)
    if t is None or t is bool:
        return False
    return issubclass(t, (int, float)) and not issubclass(t, bool)


def aggregatable_columns(table, media_columns: Sequence[str] = ()) -> dict[str, list[str]]:
    """Divide as colunas em agrupáveis e somáveis.

    `media_columns` vem do rótulo `_columns.data_type` (via
    `media_cleanup.media_column_names`) — é a única coisa que o rótulo faz bem,
    porque o tipo físico não distingue uma string-URL de uma string comum.
    """
    media = {c.lower() for c in media_columns}
    groupable: list[str] = []
    summable: list[str] = []
    for col in table.columns:
        name = col.name
        if name in NEVER_GROUPABLE or name.lower() in media:
            continue
        groupable.append(name)
        if is_numeric_column(col):
            summable.append(name)
    return {"groupable": groupable, "summable": summable}


# ------------------------------------------------------------- validação

def validate_spec(table, spec: AggregationSpec, media_columns: Sequence[str] = ()) -> None:
    """Prova de contrato ANTES de tocar o banco. Ver AggregationError."""
    cols = {c.name for c in table.columns}
    caps = aggregatable_columns(table, media_columns)

    if spec.operation not in OPERATIONS:
        raise AggregationError(
            f"Operação inválida: '{spec.operation}'. Disponíveis: {', '.join(OPERATIONS)}."
        )

    if spec.group_by not in cols:
        raise AggregationError(f"Coluna de agrupamento inexistente: '{spec.group_by}'.")
    if spec.group_by not in caps["groupable"]:
        raise AggregationError(
            f"Coluna '{spec.group_by}' não é agrupável (é interna, chave ou mídia)."
        )

    if spec.operation == COUNT:
        if spec.metric_column:
            raise AggregationError("Operação 'count' não usa coluna-métrica.")
    else:
        if not spec.metric_column:
            raise AggregationError(f"Operação '{spec.operation}' exige coluna-métrica.")
        if spec.metric_column not in cols:
            raise AggregationError(f"Coluna-métrica inexistente: '{spec.metric_column}'.")

    if spec.operation in NUMERIC_OPERATIONS:
        col = table.c[spec.metric_column]
        if not is_numeric_column(col):
            raise AggregationError(
                f"Operação '{spec.operation}' exige coluna numérica; "
                f"'{spec.metric_column}' não é. Somar coluna de texto devolve "
                f"resultado silenciosamente errado em SQLite e erro em Postgres."
            )

    if not 1 <= spec.top_n <= MAX_TOP_N:
        raise AggregationError(f"top_n fora do intervalo 1..{MAX_TOP_N}.")

    if len(spec.slices) > MAX_SLICES:
        raise AggregationError(f"Máximo de {MAX_SLICES} recortes por consulta.")

    for s in spec.slices:
        if s.filter_op not in FILTER_OPS:
            raise AggregationError(f"Operador de filtro inválido: '{s.filter_op}'.")
        if s.filter_col and s.filter_col not in cols:
            raise AggregationError(f"Coluna de filtro inexistente: '{s.filter_col}'.")


# ------------------------------------------------------------------ query

def _apply_filter(stmt: Select, table, s: Slice) -> Select:
    """Mesmíssimos 7 ops da rota de dados (main.py:1406)."""
    if not (s.filter_col and s.filter_val is not None):
        return stmt
    col = table.c[s.filter_col]
    op = s.filter_op
    if op == "eq":
        return stmt.where(col == s.filter_val)
    if op == "contains":
        return stmt.where(col.cast(String).ilike(f"%{s.filter_val}%"))
    if op == "gt":
        return stmt.where(col > s.filter_val)
    if op == "lt":
        return stmt.where(col < s.filter_val)
    if op == "gte":
        return stmt.where(col >= s.filter_val)
    if op == "lte":
        return stmt.where(col <= s.filter_val)
    if op == "neq":
        return stmt.where(col != s.filter_val)
    return stmt


def _apply_search(stmt: Select, table, search: str | None) -> Select:
    if not search:
        return stmt
    from sqlalchemy import cast, or_
    conditions = [cast(c, String).ilike(f"%{search}%") for c in table.columns]
    return stmt.where(or_(*conditions)) if conditions else stmt


def _value_expr(table, spec: AggregationSpec):
    if spec.operation == COUNT:
        return func.count()
    metric = table.c[spec.metric_column]
    if spec.operation == COUNT_DISTINCT:
        return func.count(distinct(metric))
    if spec.operation == SUM:
        return func.sum(metric)
    # AVG é derivado de soma/preenchidos (não `func.avg`): o mesmo denominador
    # que torna o "resto" exato precisa ser o de valores PREENCHIDOS. Medido:
    # com denominador de LINHAS a média erra na 2ª casa, em silêncio.
    return func.sum(metric)


def set_statement_timeout(db: Session, timeout_ms: int = DEFAULT_STATEMENT_TIMEOUT_MS) -> None:
    """`SET LOCAL statement_timeout` — o único dique de perf da F1.

    `SET LOCAL` morre no fim da transação, e encaixa no trilho que já existe
    (`tenant_db` = 1 transação com RESET ALL no fim). No-op em SQLite.
    """
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        db.execute(text(f"SET LOCAL statement_timeout = {int(timeout_ms)}"))


def _run_slice(db: Session, table, spec: AggregationSpec, s: Slice) -> dict[str, Any]:
    group_col = table.c[spec.group_by]
    metric = table.c[spec.metric_column] if spec.metric_column else None
    value = _value_expr(table, spec)

    # `n_filled` = contagem de valores PREENCHIDOS da métrica (COUNT(col) não
    # conta NULL). É o denominador correto da média e o que torna o resto
    # exato. `n_rows` = COUNT(*) — guardado só pra transparência; usar ele
    # como denominador é o bug silencioso.
    n_rows = func.count()
    n_filled = func.count(metric) if metric is not None else func.count()
    total = func.sum(metric) if (metric is not None and spec.operation in NUMERIC_OPERATIONS) else None

    cols = [
        group_col.label("category"),
        value.label("value"),
        n_rows.label("n_rows"),
        n_filled.label("n_filled"),
    ]
    if total is not None:
        cols.append(total.label("total"))

    # Window sobre agregado: dá os totais do universo INTEIRO na MESMA consulta,
    # então o "resto" sai exato sem 2ª consulta mesmo com LIMIT no banco.
    # Verificado empírico (SQLite 3.49): `SUM(COUNT(x)) OVER ()` junto de
    # GROUP BY + NULLS LAST funciona.
    cols.append(func.count().over().label("cardinality"))
    cols.append(func.sum(n_rows).over().label("grand_n_rows"))
    cols.append(func.sum(n_filled).over().label("grand_n_filled"))
    if total is not None:
        cols.append(func.sum(total).over().label("grand_total"))
    if spec.operation in ADDITIVE_OPERATIONS:
        cols.append(func.sum(value).over().label("grand_value"))

    stmt = select(*cols).select_from(table)
    stmt = _apply_filter(stmt, table, s)
    stmt = _apply_search(stmt, table, spec.search)
    stmt = stmt.group_by(group_col)

    # NULLS LAST explícito + desempate determinístico. NÃO é branch por banco:
    # é cláusula neutra que vale nos dois. Sem ela, medido: `ORDER BY soma DESC
    # LIMIT 1` devolve ('b',5) no SQLite e ('a',NULL) no Postgres — em produção
    # o grupo SEM DADO ganha a barra nº 1 e empurra o dado real pra fora, com o
    # gate verde em dev.
    stmt = stmt.order_by(value.desc().nullslast(), group_col.asc().nullslast())
    stmt = stmt.limit(spec.top_n)

    rows = db.execute(stmt).fetchall()
    return _shape_slice(rows, spec, s)


def _shape_slice(rows, spec: AggregationSpec, s: Slice) -> dict[str, Any]:
    if not rows:
        return {
            "label": s.label,
            "points": [],
            "cardinality": 0,
            "truncated": False,
            "source_row_count": 0,
            "rest": None,
        }

    head = rows[0]._mapping
    cardinality = int(head["cardinality"])
    grand_n_rows = int(head["grand_n_rows"] or 0)
    grand_n_filled = int(head["grand_n_filled"] or 0)
    grand_total = head.get("grand_total")
    grand_value = head.get("grand_value")

    points = [_shape_point(r._mapping, spec) for r in rows]
    truncated = cardinality > len(rows)

    rest = None
    if truncated:
        rest = _build_rest_point(points, spec, cardinality, grand_n_rows,
                                 grand_n_filled, grand_total, grand_value)

    return {
        "label": s.label,
        "points": points,
        # Aviso DENTRO do dado (decisão #9): quantas categorias existem no
        # total e quanto ficou no resto. O caso degenerado se denuncia sozinho
        # ("99,96% está no resto") em vez de mentir.
        "cardinality": cardinality,
        "truncated": truncated,
        # Prova de honestidade (decisão #9 do contrato): comparável com o
        # `total_rows` do snapshot (main.py:2007-2018). Se bater, o gráfico
        # PODE afirmar que foi computado sobre o dado completo (decisão 2 do
        # Diretor); se divergir, avisa. Sem isso, "computei sobre o dado
        # completo" é palavra, não prova.
        "source_row_count": grand_n_rows,
        "rest": rest,
    }


def _shape_point(m, spec: AggregationSpec) -> dict[str, Any]:
    category = m["category"]
    n_filled = int(m["n_filled"] or 0)
    total = m.get("total")
    value = m["value"]

    if spec.operation == AVG:
        # Denominador = PREENCHIDOS. Com linhas, erra na 2ª casa em silêncio.
        value = (float(total) / n_filled) if (n_filled and total is not None) else None

    return {
        "category": NULL_LABEL if category is None else category,
        "is_null_group": category is None,
        "value": float(value) if isinstance(value, (int, float)) else value,
        # `n` sempre acompanha a média, pra ser auditável.
        "n": n_filled,
        "n_rows": int(m["n_rows"] or 0),
        "sum": float(total) if total is not None else None,
        "is_rest": False,
    }


def _build_rest_point(points, spec, cardinality, grand_n_rows,
                      grand_n_filled, grand_total, grand_value) -> dict[str, Any]:
    """O "resto" das categorias cortadas, derivado dos totais da MESMA query.

    Exato pra count/sum/avg (medido: derivado == real). Para `count_distinct`
    NÃO é derivável — somar distintos-por-grupo conta em dobro quem aparece em
    mais de um grupo. Nesse caso o valor sai NULO com `exact=False` em vez de
    um número inflado: a jurisprudência do M6 F5 é avisar, nunca mentir.
    """
    top_n_rows = sum(p["n_rows"] for p in points)
    top_n_filled = sum(p["n"] for p in points)
    rest_n_rows = grand_n_rows - top_n_rows
    rest_n_filled = grand_n_filled - top_n_filled

    rest_sum = None
    if grand_total is not None:
        top_sum = sum(p["sum"] or 0.0 for p in points)
        rest_sum = float(grand_total) - top_sum

    exact = spec.operation in ADDITIVE_OPERATIONS
    if not exact:
        value = None
    elif spec.operation == AVG:
        value = (rest_sum / rest_n_filled) if (rest_n_filled and rest_sum is not None) else None
    elif spec.operation == SUM:
        value = rest_sum
    else:  # COUNT
        top_value = sum(p["value"] or 0 for p in points)
        value = float(grand_value) - top_value if grand_value is not None else None

    return {
        "category": REST_LABEL,
        "is_null_group": False,
        "value": value,
        "n": rest_n_filled,
        "n_rows": rest_n_rows,
        "sum": rest_sum,
        "is_rest": True,
        "categories_merged": cardinality - len(points),
        # False = a UI NÃO pode desenhar barra com este valor; só o aviso.
        "exact": exact,
        "inexact_reason": None if exact else (
            "count_distinct não é somável: o resto exigiria uma consulta própria."
        ),
        # Auto-denúncia do caso degenerado.
        "share_of_rows": (rest_n_rows / grand_n_rows) if grand_n_rows else 0.0,
    }


# ------------------------------------------------------------------ público

def run_aggregation(
    db: Session,
    table,
    spec: AggregationSpec,
    media_columns: Sequence[str] = (),
    statement_timeout_ms: int = DEFAULT_STATEMENT_TIMEOUT_MS,
) -> dict[str, Any]:
    """Agrega `table` conforme `spec`. NÃO commita. NÃO seta o GUC.

    O chamador entrega a tabela JÁ resolvida e escopada por `owner_id` — é o
    que `_build_snapshot_payload` já faz hoje (main.py:1983-1987). Escopo é por
    identidade, não por RLS.
    """
    validate_spec(table, spec, media_columns)
    set_statement_timeout(db, statement_timeout_ms)

    slices = spec.slices or (Slice(label="Total"),)
    series = [_run_slice(db, table, spec, s) for s in slices]

    return {
        "group_by": spec.group_by,
        "operation": spec.operation,
        "metric_column": spec.metric_column,
        "top_n": spec.top_n,
        "null_label": NULL_LABEL,
        "rest_label": REST_LABEL,
        "series": series,
    }
