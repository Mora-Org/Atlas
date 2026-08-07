"""M9 F3 — segredo de assinatura do webhook: encrypt-at-rest (decisão F3-4).

## Por que não é reveal-once como a API key

A API key só precisa **conferir** o segredo, então guardar o digest basta. Aqui
é o contrário: o Atlas precisa **recomputar** o HMAC a cada tentativa de entrega,
no drain assíncrono, muito depois de o admin ter fechado a tela. Digest não
serve — o segredo tem que voltar em claro.

Então o problema muda de "não guardar" pra "guardar de um jeito que o vazamento
do banco não entregue". Fernet (AES-128-CBC + HMAC, chave em env) é isso: o
banco sozinho não abre nada, porque a chave não mora nele.

## Falha ALTA quando não configurado

Sem `ATLAS_WEBHOOK_SIGNING_KEY`, o módulo **levanta**. Não gera chave efêmera,
não cai pra texto puro, não segue com aviso no log. Uma chave efêmera faria os
webhooks pararem de assinar corretamente no primeiro restart, com sintoma
distante da causa — e texto puro transformaria o vazamento do banco em vazamento
dos segredos de todos os clientes.

Gerar uma chave nova:

    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

O `cryptography` já estava no `requirements.txt` desde antes, sem nenhum import
no código (pin órfão). A partir daqui é dependência de primeira classe.
"""
from __future__ import annotations

import os
from typing import Optional

ENV_VAR = "ATLAS_WEBHOOK_SIGNING_KEY"


class SigningKeyMissing(RuntimeError):
    """Erro de CONFIGURAÇÃO, não de request. Quem chama traduz pra 503 com a
    instrução — o admin precisa saber que falta uma variável, não levar 500."""


def _fernet():
    from cryptography.fernet import Fernet  # import lazy: sobe sem a env setada

    chave = os.getenv(ENV_VAR)
    if not chave:
        raise SigningKeyMissing(
            f"{ENV_VAR} não está configurada — webhooks ficam desligados até ela existir. "
            "Gere com: python -c \"from cryptography.fernet import Fernet; "
            "print(Fernet.generate_key().decode())\""
        )
    try:
        return Fernet(chave.encode() if isinstance(chave, str) else chave)
    except Exception as exc:
        raise SigningKeyMissing(f"{ENV_VAR} inválida ({exc}). Precisa ser uma chave Fernet base64.")


def is_configured() -> bool:
    try:
        _fernet()
        return True
    except SigningKeyMissing:
        return False


def encrypt(segredo: str) -> str:
    return _fernet().encrypt(segredo.encode("utf-8")).decode("ascii")


def decrypt(cifrado: str) -> str:
    return _fernet().decrypt(cifrado.encode("ascii")).decode("utf-8")


def generate_secret() -> str:
    """Segredo de assinatura novo — mostrado UMA vez ao admin (ele precisa
    colar no receptor pra conferir a assinatura), e guardado cifrado."""
    import secrets
    return "whsec_" + secrets.token_urlsafe(32)


def try_decrypt(cifrado: Optional[str]) -> Optional[str]:
    """Versão que não levanta, pro drain: um endpoint com segredo ilegível não
    pode derrubar a drenagem dos outros."""
    if not cifrado:
        return None
    try:
        return decrypt(cifrado)
    except Exception:
        return None
