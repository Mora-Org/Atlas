"""M8.5 — fidelidade do gráfico congelado ao tema (regression do bug 2026-07-21).

O bug: `render_bar_svg` lia as cores em chave PLANA (`theme.get('ink')`), mas o
publish passa o `theme_config` ANINHADO (`{colors: {ink, ...}}`). Resultado: o
gráfico ignorava o tema e usava sempre cor default (#1a1a1a sobre #ffffff) +
fonte hardcoded, ficando fora do tema em todo preset não-default. Vivo em prod,
e o gate E2E não pegou (testava 1 preset e theme vazio).

Estes testes são de FUNÇÃO PURA (sem DB/cliente) e cobrem a matriz que faltava:
tema aninhado real × tema vazio × tema flat legado.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import chart_svg

# tema ANINHADO real, como o publish passa (preset editorial do produto)
NESTED_THEME = {
    "version": 1,
    "preset": "editorial",
    "typography": {
        "display": {"family": "'Fraunces', Georgia, serif", "italic": True, "size": 88, "weight": 400},
        "body": {"family": "'IBM Plex Serif', Georgia, serif"},
        "mono": {"family": "'IBM Plex Mono', monospace"},
    },
    "colors": {"bg": "#FAEFD9", "surface": "#FFFCF3", "ink": "#212842",
               "muted": "#4A5468", "accent": "#C2441C", "rule": "#212842"},
    "layout": {"density": "comfy", "default_table_layout": "grid"},
    "copy": {},
}

AGG = {
    "operation": "count", "group_by": "regiao", "metric_column": None,
    "null_label": "(sem valor)", "rest_label": "(resto)",
    "series": [{"label": "Total", "points": [
        {"category": "sul", "value": 6.0, "n": 6, "is_null_group": False},
        {"category": "norte", "value": 4.0, "n": 4, "is_null_group": False},
    ], "truncated": False, "source_row_count": 10, "cardinality": 2, "rest": None}],
}


def _svg(theme):
    return chart_svg.render_chart(AGG, theme, "Contagem por região")["svg"]


def test_nested_theme_colors_reach_the_svg():
    """O fix: com o tema aninhado real, as cores do TEMA aparecem no SVG."""
    svg = _svg(NESTED_THEME)
    assert "#212842" in svg, "cor ink do tema (título/eixo) tem que estar no SVG"
    assert "#FFFCF3" in svg, "cor surface do tema (fundo) tem que estar no SVG"
    assert "#4A5468" in svg, "cor muted do tema (rótulos) tem que estar no SVG"


def test_nested_theme_font_reaches_the_svg():
    """O fix da fonte: o gráfico usa a família de corpo do tema, não a hardcoded."""
    svg = _svg(NESTED_THEME)
    assert "IBM Plex Serif" in svg, "a fonte de corpo do tema tem que estar no SVG"
    # e NÃO a hardcoded antiga (o preset editorial não usa Plex Sans)
    assert "IBM Plex Sans" not in svg


def test_bug_regression_nested_theme_is_not_default():
    """Regression direto do bug: um tema aninhado com cores distintas NÃO pode
    produzir o fundo branco default — era exatamente a 'caixa branca na página
    creme' que passou batido no gate."""
    svg = _svg(NESTED_THEME)
    # o fundo do gráfico é o surface do tema, não o #ffffff default
    assert 'fill="#ffffff"' not in svg, "gráfico não pode usar fundo branco default sob tema"
    assert 'fill="#FFFCF3"' in svg


def test_empty_theme_falls_back_to_defaults():
    """Tema vazio (o que o preview do M8 F3 passa) cai nos defaults, sem crashar."""
    svg = _svg({})
    assert "#1a1a1a" in svg      # ink default
    assert "#ffffff" in svg      # surface default
    assert "IBM Plex Sans" in svg  # fonte default


def test_flat_theme_backward_compat():
    """Fixtures antigos passam o tema FLAT — tem que continuar funcionando
    (o resolver aceita `colors` aninhado OU o dict flat)."""
    flat = {"ink": "#111827", "surface": "#f9fafb", "muted": "#6b7280", "rule": "#e5e7eb"}
    svg = _svg(flat)
    assert "#111827" in svg
    assert "#f9fafb" in svg


def test_none_color_in_theme_falls_back():
    """Cor None no tema não vira `fill="None"` — cai no default."""
    svg = _svg({"colors": {"ink": None, "surface": None}})
    assert "None" not in svg
    assert "#1a1a1a" in svg
