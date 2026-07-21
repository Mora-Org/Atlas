"""M8.5 F2: renderizador de gráfico de barras como SVG puro (sem browser, sem dep).

Decisão D1 do Diretor (2026-07-17): o gráfico congelado é uma STRING SVG gerada
no publish a partir do agregado do motor da F1 — recharts NÃO renderiza fora do
browser (parede verificada), e o backend não tem renderizador nenhum (sem
matplotlib/cairo/pillow no requirements). Este módulo é a única forma de a
figura e o número nascerem na MESMA passada sobre o dado completo (honra a
decisão 2), ser testável no gate sem browser, e ser script-free por construção.

PURO: recebe o dict de `aggregation.run_aggregation` + as cores do tema, devolve
`{svg, alt_table, warnings}`. Sem I/O, sem estado, sem browser.

Invariantes de honestidade (o ponto do projeto — "não mentir"):
- **A×B por UNIÃO de categorias** (decisão D3): cada série (slice) é query
  independente com seu top-N (aggregation.py:_run_slice), então A e B podem ter
  conjuntos de categoria diferentes. Uma categoria no top-N de A mas fora do de
  B: se a série B TRUNCOU, marca "fora do top-N" (não sabemos o valor) — NUNCA
  desenha 0. Se a série B NÃO truncou, a ausência é 0 genuíno (nenhuma linha
  casou aquele recorte) e aí sim desenha 0.
- **Casos degenerados que o core já emite** (G8): `value=None` (count_distinct
  "resto" não-derivável, avg sem denominador) desenha "sem barra + aviso", nunca
  zero nem crash. Série vazia → placeholder honesto.
- **Escape obrigatório** (decisão D5): rótulos são dado do tenant → todo texto
  passa por `_esc` antes de entrar no SVG. Com D1(a) o SVG é 100% nosso, então
  não há `<script>`/`<foreignObject>` por construção; o gate ainda assere isso.
- **pt-BR puro** (sem dep de ICU — o host Railway não garante locale).
"""
from __future__ import annotations

import html
import math
from typing import Any, Sequence

# ---- paleta categórica fixa, colorblind-safe (decisão G2) --------------------
# Okabe-Ito, segura pra deuteranopia/protanopia e legível em fundo claro. As
# séries (recortes A×B, até 4) puxam daqui — NUNCA do accent único do tema, que
# não distingue categoria. O accent do tema tinge só o cromo (eixo/rótulos).
SERIES_PALETTE: tuple[str, ...] = (
    "#0072B2",  # azul
    "#E69F00",  # laranja
    "#009E73",  # verde
    "#CC79A7",  # rosa
)
REST_HATCH = "#9AA0A6"  # cinza pro grupo "(resto)"
NODATA_INK = "#9AA0A6"

# ---- geometria (px) ----------------------------------------------------------
WIDTH = 720
HEIGHT = 420
PAD_L = 56   # eixo Y + rótulos de valor
PAD_R = 16
PAD_T = 48   # título
PAD_B = 96   # rótulos de categoria (rotacionados) + legenda
DEFAULT_FONT = "'IBM Plex Sans', system-ui, sans-serif"
# Sem font-metrics real (G7): largura de texto é aproximada. Fator conservador
# pra IBM Plex Sans. Usado só pra truncar rótulo e posicionar — não é exato, e a
# figura não fica pixel-igual ao preview recharts (custo aceito na decisão D1).
CHAR_W = 0.58
MAX_CAT_CHARS = 14


def _esc(s: Any) -> str:
    """Escape pra texto dentro de SVG. `quote=True` cobre `"` e `'`."""
    return html.escape(str(s), quote=True)


def _approx_text_w(s: str, font_size: float) -> float:
    return len(s) * CHAR_W * font_size


def _truncate(s: str, n: int = MAX_CAT_CHARS) -> str:
    return s if len(s) <= n else s[: n - 1] + "…"


def fmt_ptbr(value: float | int | None, operation: str) -> str:
    """Formata número em pt-BR sem dep de locale. `count`/`count_distinct` são
    inteiros; `sum`/`avg` levam 2 casas. Ex.: 1234567.89 → '1.234.567,89'."""
    if value is None:
        return "—"
    if operation in ("count", "count_distinct"):
        raw = f"{int(round(value)):,}"          # 1,234,567
        return raw.replace(",", ".")            # 1.234.567
    raw = f"{value:,.2f}"                        # 1,234,567.89
    # swap . e , via placeholder
    return raw.replace(",", "\x00").replace(".", ",").replace("\x00", ".")


def _nice_axis(max_value: float) -> tuple[float, float]:
    """Teto 'nice' + passo de tick a partir do maior valor. Retorna (teto, passo)."""
    if max_value <= 0:
        return 1.0, 1.0
    raw_step = max_value / 4.0
    mag = 10 ** math.floor(math.log10(raw_step))
    for mult in (1, 2, 5, 10):
        step = mult * mag
        if step * 4 >= max_value:
            return step * math.ceil(max_value / step), step
    step = 10 * mag
    return step * math.ceil(max_value / step), step


# ---- modelo do gráfico (pivot + reconciliação) -------------------------------

def build_chart_model(agg: dict) -> dict:
    """Pivota `run_aggregation` num modelo pronto pra desenhar: categorias na
    UNIÃO de todos os recortes, cada célula com estado explícito.

    Estados de célula:
      - value      : número real (desenha barra)
      - zero       : 0 genuíno (série não truncou e a categoria não apareceu)
      - not_in_topn: série truncou e a categoria não está no top-N dela (não
                     sabemos o valor — marca, não desenha 0)
      - no_data    : value=None do core (count_distinct resto / avg sem n)
    """
    operation = agg.get("operation", "count")
    series = agg.get("series", [])

    # ordem das categorias: 1ª aparição percorrendo as séries (que já vêm
    # ordenadas por valor DESC + NULLS LAST), "(resto)" sempre por último.
    order: list[str] = []
    seen: set[str] = set()
    rest_label = agg.get("rest_label", "(resto)")
    for s in series:
        for p in s.get("points", []):
            cat = p["category"]
            if cat not in seen:
                seen.add(cat)
                order.append(cat)
    has_rest = any(s.get("rest") for s in series)

    series_models = []
    global_max = 0.0
    for si, s in enumerate(series):
        by_cat = {p["category"]: p for p in s.get("points", [])}
        truncated = bool(s.get("truncated"))
        cells: dict[str, dict] = {}
        for cat in order:
            p = by_cat.get(cat)
            if p is None:
                cells[cat] = {"state": "not_in_topn" if truncated else "zero",
                              "value": None if truncated else 0.0}
                if not truncated:
                    global_max = max(global_max, 0.0)
            elif p.get("value") is None:
                cells[cat] = {"state": "no_data", "value": None}
            else:
                v = float(p["value"])
                cells[cat] = {"state": "value", "value": v, "n": p.get("n")}
                global_max = max(global_max, v)
        rest = s.get("rest")
        if has_rest:
            if rest and rest.get("value") is not None:
                rv = float(rest["value"])
                cells[rest_label] = {"state": "value", "value": rv, "n": rest.get("n")}
                global_max = max(global_max, rv)
            elif rest is not None:
                # resto não-derivável (count_distinct): existe mas sem número
                cells[rest_label] = {"state": "no_data", "value": None,
                                     "categories_merged": rest.get("categories_merged")}
            else:
                cells[rest_label] = {"state": "zero", "value": 0.0}
        series_models.append({
            "label": s.get("label", f"Série {si+1}"),
            "color": SERIES_PALETTE[si % len(SERIES_PALETTE)],
            "cells": cells,
            "truncated": truncated,
            "source_row_count": s.get("source_row_count"),
            "cardinality": s.get("cardinality"),
        })

    categories = order + ([rest_label] if has_rest else [])
    return {
        "operation": operation,
        "categories": categories,
        "rest_label": rest_label,
        "series": series_models,
        "max_value": global_max,
        "empty": len(categories) == 0,
    }


def build_alt_table(model: dict) -> dict:
    """Tabela-alternativa a11y (decisão: obrigatória). Resolve leitor-de-tela +
    no-JS + daltônico. Números já formatados em pt-BR."""
    op = model["operation"]
    header = ["Categoria"] + [s["label"] for s in model["series"]]
    rows = []
    for cat in model["categories"]:
        row = [cat]
        for s in model["series"]:
            cell = s["cells"].get(cat, {"state": "zero", "value": 0.0})
            if cell["state"] == "value":
                row.append(fmt_ptbr(cell["value"], op))
            elif cell["state"] == "zero":
                row.append(fmt_ptbr(0, op))
            elif cell["state"] == "not_in_topn":
                row.append("fora do top-N")
            else:
                row.append("sem dado")
        rows.append(row)
    return {"header": header, "rows": rows}


# ---- render SVG --------------------------------------------------------------

def _svg_text(x, y, s, *, size=12, fill="#000", anchor="start", weight="normal",
              rotate=None, font=DEFAULT_FONT):
    t = (f'<text x="{x:.1f}" y="{y:.1f}" font-family="{font}" font-size="{size}" '
         f'fill="{fill}" text-anchor="{anchor}" font-weight="{weight}"')
    if rotate is not None:
        t += f' transform="rotate({rotate} {x:.1f} {y:.1f})"'
    return t + f">{_esc(s)}</text>"


def _theme_color(theme: dict, key: str, default: str) -> str:
    """Lê uma cor do tema. O `theme_config` de produção é ANINHADO
    (`{colors: {ink, surface, ...}}`, PublishContext.ThemeColors); os fixtures
    antigos passam FLAT. Aceita os dois: `colors` se existir, senão o próprio
    dict. Foi o `theme.get('ink')` num dict aninhado — que devolvia None e caía
    no default — o bug de fidelidade que deixava o gráfico fora do tema em todo
    preset não-default (fix 2026-07-21)."""
    src = theme.get("colors", theme) if isinstance(theme, dict) else {}
    if not isinstance(src, dict):
        src = {}
    return src.get(key) or default


def _theme_font(theme: dict) -> str:
    """Fonte do gráfico = a família de corpo do tema (`typography.body.family`).

    Usar a fonte do tema conserta a fidelidade E o embedding offline: o
    `collectFontRequests` do export (exportStatic.tsx) embute justamente as
    famílias que o tema usa, então o texto do gráfico deixa de cair em
    system-ui no ZIP. Antes era `'IBM Plex Sans'` hardcoded — fiel só no preset
    que por acaso usava Plex Sans (o acadêmico)."""
    typ = theme.get("typography", {}) if isinstance(theme, dict) else {}
    body = typ.get("body", {}) if isinstance(typ, dict) else {}
    fam = body.get("family") if isinstance(body, dict) else None
    return fam or DEFAULT_FONT


def render_bar_svg(model: dict, theme: dict, title: str) -> tuple[str, list[str]]:
    """Barra agrupada (decisão D4). Devolve (svg_string, warnings)."""
    warnings: list[str] = []
    ink = _theme_color(theme, "ink", "#1a1a1a")
    muted = _theme_color(theme, "muted", "#6b6b6b")
    rule = _theme_color(theme, "rule", "#e0e0e0")
    bg = _theme_color(theme, "surface", _theme_color(theme, "bg", "#ffffff"))
    font = _theme_font(theme)
    op = model["operation"]

    plot_w = WIDTH - PAD_L - PAD_R
    plot_h = HEIGHT - PAD_T - PAD_B
    x0, y0 = PAD_L, PAD_T + plot_h  # origem do eixo (canto inferior esquerdo)

    parts: list[str] = []
    parts.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" '
        f'viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-label="{_esc(title)}">'
    )
    parts.append(f'<rect width="{WIDTH}" height="{HEIGHT}" fill="{bg}"/>')
    parts.append(_svg_text(PAD_L, 26, title, size=16, fill=ink, weight="600", font=font))

    if model["empty"]:
        parts.append(_svg_text(WIDTH / 2, HEIGHT / 2, "Sem dados para exibir",
                               size=14, fill=muted, anchor="middle", font=font))
        parts.append("</svg>")
        warnings.append("gráfico sem categorias (dado vazio)")
        return "".join(parts), warnings

    ceil_v, step = _nice_axis(model["max_value"])

    # eixo Y: linhas de grade + rótulos de valor
    ticks = int(round(ceil_v / step)) if step else 0
    for i in range(ticks + 1):
        val = i * step
        gy = y0 - (val / ceil_v) * plot_h if ceil_v else y0
        parts.append(f'<line x1="{x0}" y1="{gy:.1f}" x2="{x0+plot_w}" y2="{gy:.1f}" '
                     f'stroke="{rule}" stroke-width="1"/>')
        parts.append(_svg_text(x0 - 8, gy + 4, fmt_ptbr(val, op), size=10,
                               fill=muted, anchor="end", font=font))

    cats = model["categories"]
    series = model["series"]
    n_cat = len(cats)
    n_ser = len(series)
    group_w = plot_w / n_cat
    bar_gap = group_w * 0.18
    bars_w = group_w - bar_gap
    bar_w = bars_w / max(n_ser, 1)

    for ci, cat in enumerate(cats):
        gx = x0 + ci * group_w + bar_gap / 2
        for si, s in enumerate(series):
            cell = s["cells"].get(cat, {"state": "zero", "value": 0.0})
            bx = gx + si * bar_w
            color = REST_HATCH if cat == model["rest_label"] else s["color"]
            st = cell["state"]
            if st in ("value", "zero"):
                v = cell["value"] or 0.0
                bh = (v / ceil_v) * plot_h if ceil_v else 0.0
                bh = max(bh, 0.0)
                parts.append(
                    f'<rect x="{bx:.1f}" y="{(y0-bh):.1f}" width="{max(bar_w-1,1):.1f}" '
                    f'height="{bh:.1f}" fill="{color}">'
                    f'<title>{_esc(s["label"])} · {_esc(cat)}: '
                    f'{_esc(fmt_ptbr(v, op))}</title></rect>'
                )
            else:
                # not_in_topn / no_data: marca honesta, NUNCA barra de 0
                label = "fora do top-N" if st == "not_in_topn" else "sem dado"
                parts.append(
                    f'<line x1="{bx:.1f}" y1="{y0:.1f}" x2="{(bx+bar_w-1):.1f}" '
                    f'y2="{y0:.1f}" stroke="{NODATA_INK}" stroke-width="2" '
                    f'stroke-dasharray="2 2"><title>{_esc(s["label"])} · '
                    f'{_esc(cat)}: {label}</title></line>'
                )
        # rótulo de categoria (rotacionado 35° pra caber)
        lx = gx + bars_w / 2
        parts.append(_svg_text(lx, y0 + 14, _truncate(str(cat)), size=10,
                               fill=muted, anchor="end", rotate=-35, font=font))

    # eixo X base
    parts.append(f'<line x1="{x0}" y1="{y0}" x2="{x0+plot_w}" y2="{y0}" '
                 f'stroke="{ink}" stroke-width="1.5"/>')

    # legenda (recortes A×B)
    ly = HEIGHT - 26
    lx = PAD_L
    if n_ser > 1 or (series and series[0]["label"] != "Total"):
        for s in series:
            parts.append(f'<rect x="{lx}" y="{ly-9}" width="11" height="11" '
                         f'fill="{s["color"]}"/>')
            parts.append(_svg_text(lx + 16, ly, s["label"], size=11, fill=ink, font=font))
            lx += 20 + _approx_text_w(s["label"], 11) + 24

    # nota de honestidade: total sobre o dado COMPLETO (pode passar das 2000
    # linhas visíveis do snapshot — feature, não bug; mas o público leria como
    # inconsistência sem a nota).
    src = next((s["source_row_count"] for s in series if s.get("source_row_count")), None)
    if src is not None:
        parts.append(_svg_text(x0 + plot_w, HEIGHT - 8,
                               f"agregado sobre {fmt_ptbr(src, 'count')} linhas (dado completo)",
                               size=9, fill=muted, anchor="end", font=font))

    # avisos de truncamento (o "resto" / "fora do top-N" existem)
    if any(s["truncated"] for s in series):
        warnings.append("categorias cortadas no top-N; ver grupo (resto) e a tabela")

    parts.append("</svg>")
    return "".join(parts), warnings


def render_chart(agg: dict, theme: dict, title: str, chart_type: str = "bar") -> dict:
    """Ponto de entrada. `agg` = saída de aggregation.run_aggregation.

    Devolve `{svg, alt_table, warnings, chart_type}`. Só 'bar' na v1 (decisão D4).
    """
    if chart_type != "bar":
        raise ValueError(f"v1 só desenha barra; recebido: {chart_type!r}")
    model = build_chart_model(agg)
    svg, warnings = render_bar_svg(model, theme, title)
    alt = build_alt_table(model)
    return {"chart_type": "bar", "svg": svg, "alt_table": alt, "warnings": warnings}
