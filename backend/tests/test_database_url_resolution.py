"""A resolução do `DATABASE_URL` — ausente, vazia e suja caem no mesmo lugar.

Achado pelo CI: a perna SQLite da matriz declarava `DATABASE_URL: ""` e o
backend morreu no import com "Could not parse SQLAlchemy URL". A causa é que
`os.environ.get(k, default)` só usa o default quando a chave **não existe** —
chave presente e vazia devolve `""`.

Testa a função pura em vez de recarregar o módulo: `importlib.reload(database)`
recriaria `engine`/`SessionLocal` no meio da sessão de testes, e todo mundo que
já segura referência pra eles passaria a falar com outro engine.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import _URL_PADRAO, _resolver_url  # noqa: E402


@pytest.mark.parametrize("bruta", [
    None,          # variável nunca setada (dev na máquina do autor)
    "",            # setada e vazia — o caso que quebrou o CI
    "   ",         # só espaço (campo do painel "limpo" sem apagar a chave)
    "\n",          # newline solto
])
def test_sem_valor_util_cai_no_padrao(bruta):
    assert _resolver_url(bruta) == _URL_PADRAO


def test_valor_real_e_respeitado():
    assert _resolver_url("postgresql://u:p@h:5432/d") == "postgresql://u:p@h:5432/d"


def test_newline_colado_do_dashboard_e_aparado():
    """O `.strip()` original: copiar do painel do Railway traz `\\n` junto, e o
    psycopg2 falha com FATAL: database "postgres\\n" does not exist."""
    assert _resolver_url("postgresql://u:p@h:5432/d\n") == "postgresql://u:p@h:5432/d"
