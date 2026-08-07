"""M9 F2 — rate limit por API key. Token bucket em memória.

Default-ON porque a superfície tem que nascer protegida: uma key vazada sem
limite exfiltra a tabela inteira na velocidade da rede.

## A dívida que vem junto, declarada aqui e não no rodapé de um plano

O balde vive **no processo**. Com mais de um worker, cada um tem o seu, e o
limite efetivo vira `N × limite` — sem erro, sem log, sem sintoma. O Procfile
do Atlas é 1 processo web hoje, mas `WEB_CONCURRENCY` é variável de PLATAFORMA:
alguém pode setá-la no Railway sem tocar no repo, e o teto silenciosamente
multiplica.

Por isso o `startup_report()` existe e é chamado no startup: se o número de
workers mudar, aparece no log em vez de virar surpresa numa investigação de
incidente. Quando isso acontecer, a troca é contador-em-tabela (ou Redis) —
não é ajuste de constante.

Sem dependência nova: `time.monotonic` + dict.
"""
from __future__ import annotations

import logging
import os
import threading
import time
from dataclasses import dataclass, field

logger = logging.getLogger("atlas")

# 60 req/min sustentado, com folga de 30 pra rajada. Um cliente de integração
# honesto (Zapier, script de sync) não encosta nisso; um loop de exfiltração
# encosta na primeira página.
DEFAULT_RATE_PER_MINUTE = 60
DEFAULT_BURST = 30


@dataclass
class _Bucket:
    tokens: float
    updated_at: float


@dataclass
class TokenBucketLimiter:
    rate_per_minute: int = DEFAULT_RATE_PER_MINUTE
    burst: int = DEFAULT_BURST
    _buckets: dict[str, _Bucket] = field(default_factory=dict)
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def allow(self, chave: str, now: float | None = None) -> bool:
        """Consome 1 token. False = estourou o limite.

        `now` é injetável pra o teste não depender de sleep — teste de tempo
        que dorme é teste lento e intermitente.
        """
        agora = time.monotonic() if now is None else now
        capacidade = float(self.rate_per_minute + self.burst)
        por_segundo = self.rate_per_minute / 60.0

        with self._lock:
            b = self._buckets.get(chave)
            if b is None:
                # Nasce cheio: a primeira chamada de uma key nova não pode ser
                # negada, e o balde só existe a partir do primeiro uso.
                self._buckets[chave] = _Bucket(tokens=capacidade - 1.0, updated_at=agora)
                return True
            decorrido = max(0.0, agora - b.updated_at)
            b.tokens = min(capacidade, b.tokens + decorrido * por_segundo)
            b.updated_at = agora
            if b.tokens < 1.0:
                return False
            b.tokens -= 1.0
            return True

    def reset(self) -> None:
        with self._lock:
            self._buckets.clear()


limiter = TokenBucketLimiter()


def startup_report() -> None:
    """Loga o nº de workers no startup — é o tripwire da dívida acima."""
    workers = os.getenv("WEB_CONCURRENCY") or os.getenv("UVICORN_WORKERS")
    if workers and workers.strip() not in ("", "1"):
        logger.warning(
            "rate limit por key e EM MEMORIA e WEB_CONCURRENCY=%s: o teto efetivo "
            "e %s x %s req/min. Trocar por contador compartilhado antes de confiar no limite.",
            workers, workers, DEFAULT_RATE_PER_MINUTE,
        )
    else:
        logger.info("rate limit por key: %s req/min (+%s burst), em memoria, 1 worker",
                    DEFAULT_RATE_PER_MINUTE, DEFAULT_BURST)
