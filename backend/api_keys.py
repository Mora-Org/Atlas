"""M9 F2 — API keys: geração, verificação e escopos. Módulo PURO.

Sem FastAPI, sem DB — recebe strings e devolve strings. É o mesmo motivo dos
outros puros do repo (`aggregation`, `chart_svg`, `import_infer`): dá pra testar
a parte que erra em silêncio sem subir servidor.

## Por que SHA-256 e não bcrypt/argon2

Hash lento existe pra defender segredo de BAIXA entropia — senha humana, que
cabe num dicionário. Uma key aqui é `token_urlsafe(32)`, ou seja **256 bits de
CSPRNG**: não há dicionário a atacar, o espaço de busca é ~10^77. Hash lento não
compra segurança nenhuma nesse caso, e cobra em dois lugares:

1. **Latência por request.** bcrypt cost 12 = 50-100ms. O Procfile do Atlas é UM
   processo web — isso é latência visível e uma alavanca de DoS de graça.
2. **O problema real: hash lento não é indexável.** Cada bcrypt tem salt próprio,
   então achar a key exigiria rodar bcrypt contra TODAS as linhas a cada request
   — O(n) operações lentas por chamada.

Daí o desenho que GitHub, Stripe e AWS usam: **prefixo público e indexado** pra
achar a linha em O(1), **SHA-256 do segredo** pra provar posse, comparação em
**tempo constante**.

## Formato

    mora_{prefixo}_{segredo}
    mora_a3f19c22_KzQ4...   (prefixo = 8 hex; segredo = token_urlsafe(32))

O prefixo é **público**: aparece na lista de keys pra a pessoa saber qual
revogar sem ter o segredo. O segredo aparece UMA vez, na resposta que criou a
key — depois disso o Atlas não tem como mostrar de novo, porque só guarda o
digest.

**Cuidado ao fazer parse:** `token_urlsafe` usa o alfabeto base64url, que inclui
`_`. Split ingênuo por `_` picota o segredo. Por isso `maxsplit=2`.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
from dataclasses import dataclass
from typing import Optional

PREFIX_LABEL = "mora"
_SEP = "_"
PREFIX_BYTES = 4          # token_hex(4) = 8 caracteres hex
SECRET_BYTES = 32         # 256 bits


@dataclass(frozen=True)
class NewKey:
    """Resultado de `generate()`. `token` é a ÚNICA vez que o segredo existe
    em texto — quem chama devolve na resposta HTTP e esquece."""
    token: str
    prefix: str
    secret_hash: str


def generate() -> NewKey:
    prefix = secrets.token_hex(PREFIX_BYTES)
    secret = secrets.token_urlsafe(SECRET_BYTES)
    token = f"{PREFIX_LABEL}{_SEP}{prefix}{_SEP}{secret}"
    return NewKey(token=token, prefix=prefix, secret_hash=hash_secret(secret))


def hash_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def looks_like_key(token: Optional[str]) -> bool:
    """Sniff de transporte (decisão do Diretor): a MESMA header
    `Authorization: Bearer` carrega JWT e key, e o prefixo decide qual caminho
    tentar. Sem isso, uma key chega no validador de JWT e 401a em todo lugar."""
    return bool(token) and token.startswith(PREFIX_LABEL + _SEP)


def parse(token: str) -> Optional[tuple[str, str]]:
    """`mora_{prefixo}_{segredo}` → (prefixo, segredo). None se malformado.

    `maxsplit=2` é load-bearing: o segredo é base64url e PODE conter `_`.
    """
    if not looks_like_key(token):
        return None
    parts = token.split(_SEP, 2)
    if len(parts) != 3:
        return None
    _, prefix, secret = parts
    if not prefix or not secret:
        return None
    return prefix, secret


def verify(secret: str, expected_hash: str) -> bool:
    """Comparação em tempo constante. `==` de string vaza, por timing, quantos
    caracteres iniciais bateram — com oráculo suficiente dá pra reconstruir o
    digest byte a byte."""
    return hmac.compare_digest(hash_secret(secret), expected_hash)


# ── Escopos ──────────────────────────────────────────────────────────────
# Formato: {"read": ["tabela_a", "tabela_b"], "write": [...]}
#
# Deny-by-default e SEM `*` na v1: um curinga transforma qualquer tabela criada
# no futuro em tabela já exposta, sem ninguém decidir isso. Verb-aware desde
# agora porque o vocabulário de escrita via key é decisão de outra fase — a
# coluna aceita `write`, o guard nega, e ligar depois não é migration.

READ = "read"
WRITE = "write"


def normalize_scopes(raw: Optional[dict]) -> dict:
    """Sanitiza o pacote vindo do cliente: só as chaves conhecidas, só strings,
    sem duplicata, ordem estável."""
    raw = raw or {}
    out = {}
    for verb in (READ, WRITE):
        vals = raw.get(verb) or []
        if not isinstance(vals, (list, tuple)):
            vals = []
        nomes = sorted({str(v).strip() for v in vals if str(v).strip()})
        out[verb] = nomes
    return out


def allows(scopes: Optional[dict], verb: str, table_name: str) -> bool:
    """A key pode `verb` nesta tabela?

    Nega o que não conhece: escopo ausente, verbo desconhecido ou tabela fora da
    lista = não. É o inverso do resto do app (onde o admin vê o que é dele por
    padrão) porque credencial de máquina não tem quem confira o que ela alcança.
    """
    if verb not in (READ, WRITE):
        return False
    return table_name in (normalize_scopes(scopes).get(verb) or [])
