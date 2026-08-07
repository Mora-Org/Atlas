"""M9 F3 — o drenador da outbox. Onde a promessa de durabilidade vira mecanismo.

## O claim em DUAS FASES não é otimização

O Procfile do Atlas é **um processo** com pool 5+10 (`database.py`). Um
receptor lento leva os 10s do timeout. Se a conexão ficasse presa durante o
`requests.post`, **10 entregas lentas em paralelo esgotariam o pool** e o app
inteiro pararia de responder — por causa de webhook, não de carga de usuário.

Então:

1. **Fase 1** — marca `in_flight`, incrementa tentativa, **COMMITA e solta a
   conexão**. A entrega fica reservada; outro drenador concorrente não a pega.
2. **HTTP acontece FORA de qualquer transação.**
3. **Fase 2** — abre de novo, grava `delivered` ou reagenda.

O efeito colateral honesto: se o processo morrer entre 2 e 3, a entrega fica
`in_flight` órfã. Por isso `in_flight` mais velho que `STUCK_AFTER_SECONDS`
volta pra fila — e volta como retentativa, não como perda. É at-least-once: o
receptor pode ver a mesma entrega duas vezes, e é pra isso que existe o
`delivery_id` estável.

## Ordem é best-effort, e isso está documentado no contrato

Duas mutações na mesma linha podem ser entregues fora de ordem se a primeira
falhar e for reagendada. É o modelo GitHub/Stripe: o consumidor usa
`occurred_at` pra decidir, não a ordem de chegada. Prometer ordem exigiria fila
por-endpoint com bloqueio de cabeça de linha — um receptor morto pararia as
entregas de todos os outros.
"""
from __future__ import annotations

import datetime
import logging
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

import models
import webhook_crypto
import webhooks

logger = logging.getLogger("atlas")

BATCH_SIZE = 50
# `in_flight` mais velho que isso = processo morreu no meio; volta pra fila.
# Precisa ser confortavelmente maior que o timeout do POST (10s) pra não
# ressuscitar entrega que ainda está viajando.
STUCK_AFTER_SECONDS = 120


@dataclass
class DrainReport:
    claimed: int = 0
    delivered: int = 0
    failed: int = 0
    dead: int = 0
    requeued_stuck: int = 0
    erros: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "claimed": self.claimed, "delivered": self.delivered,
            "failed": self.failed, "dead": self.dead,
            "requeued_stuck": self.requeued_stuck,
            "errors": self.erros[:5],
        }


def _now() -> datetime.datetime:
    return datetime.datetime.utcnow()


def requeue_stuck(db: Session, now: datetime.datetime | None = None) -> int:
    """Devolve pra fila o que ficou `in_flight` além do razoável."""
    agora = now or _now()
    corte = agora - datetime.timedelta(seconds=STUCK_AFTER_SECONDS)
    presas = db.query(models.WebhookDelivery).filter(
        models.WebhookDelivery.status == "in_flight",
        models.WebhookDelivery.created_at < corte,
    ).all()
    n = 0
    for d in presas:
        # Só volta se ainda houver tentativa; senão morre, pra não ficar
        # circulando pra sempre.
        if d.attempts >= webhooks.MAX_ATTEMPTS:
            d.status = "dead"
            d.last_error = "in_flight órfã e sem tentativas restantes"
        else:
            d.status = "pending"
            d.next_attempt_at = agora
            d.last_error = "retomada após in_flight órfã (processo caiu no meio?)"
        n += 1
    if n:
        db.commit()
    return n


def _claim(db: Session, limite: int, now: datetime.datetime) -> list[models.WebhookDelivery]:
    """FASE 1: reserva o lote e SOLTA a conexão (commit) antes de qualquer HTTP."""
    pendentes = (
        db.query(models.WebhookDelivery)
        .filter(
            models.WebhookDelivery.status == "pending",
            (models.WebhookDelivery.next_attempt_at == None) |  # noqa: E711
            (models.WebhookDelivery.next_attempt_at <= now),
        )
        .order_by(models.WebhookDelivery.id)
        .limit(limite)
        .all()
    )
    for d in pendentes:
        d.status = "in_flight"
        d.attempts = (d.attempts or 0) + 1
    db.commit()  # <- solta a conexão. Nada de HTTP com transação aberta.
    return pendentes


def drain(db: Session, *, limite: int = BATCH_SIZE, permitir_privado: bool = False,
          now: datetime.datetime | None = None) -> DrainReport:
    rel = DrainReport()
    agora = now or _now()

    rel.requeued_stuck = requeue_stuck(db, agora)

    lote = _claim(db, limite, agora)
    rel.claimed = len(lote)
    if not lote:
        return rel

    # Cache de segredo por endpoint: um lote pra o mesmo destino não deve
    # pagar N descriptografias.
    segredos: dict[int, str | None] = {}

    for entrega in lote:
        ep = db.query(models.WebhookEndpoint).filter(
            models.WebhookEndpoint.id == entrega.endpoint_id).first()
        if ep is None or not ep.is_active:
            _finaliza(db, entrega, ok=False, status=None,
                      erro="endpoint removido ou desativado", morre=True)
            rel.dead += 1
            continue

        if ep.id not in segredos:
            segredos[ep.id] = webhook_crypto.try_decrypt(ep.secret_encrypted)
        segredo = segredos[ep.id]
        if not segredo:
            # Chave de assinatura ausente/trocada: não dá pra assinar, e mandar
            # sem assinatura seria pior que não mandar (o receptor não teria
            # como saber que veio do Atlas).
            _finaliza(db, entrega, ok=False, status=None,
                      erro="segredo do endpoint ilegível (ATLAS_WEBHOOK_SIGNING_KEY trocada?)",
                      morre=False)
            rel.failed += 1
            continue

        ts = str(int(agora.timestamp()))
        assinatura = webhooks.sign(segredo, ts, entrega.delivery_id, entrega.body)
        headers = webhooks.delivery_headers(
            event=entrega.event, delivery_id=entrega.delivery_id,
            timestamp=ts, assinatura=assinatura,
        )

        # ── HTTP FORA DE TRANSAÇÃO ──
        resultado = webhooks.send(ep.url, entrega.body, headers,
                                  permitir_privado=permitir_privado)

        if resultado.ok:
            _finaliza(db, entrega, ok=True, status=resultado.status, erro=None, morre=False)
            rel.delivered += 1
        else:
            morre = entrega.attempts >= webhooks.MAX_ATTEMPTS
            _finaliza(db, entrega, ok=False, status=resultado.status,
                      erro=resultado.erro, morre=morre, agora=agora)
            if morre:
                rel.dead += 1
            else:
                rel.failed += 1
            if resultado.erro:
                rel.erros.append(f"{ep.url}: {resultado.erro}")

    return rel


def _finaliza(db: Session, entrega: models.WebhookDelivery, *, ok: bool,
              status: int | None, erro: str | None, morre: bool,
              agora: datetime.datetime | None = None) -> None:
    """FASE 2: grava o desfecho. Transação curta, sem HTTP dentro."""
    agora = agora or _now()
    entrega.response_status = status
    entrega.last_error = erro
    if ok:
        entrega.status = "delivered"
        entrega.delivered_at = agora
        entrega.next_attempt_at = None
    elif morre:
        # `dead` é o que impede a outbox de crescer sem teto com um endpoint
        # morto permanente retentando pra sempre.
        entrega.status = "dead"
        entrega.next_attempt_at = None
    else:
        entrega.status = "pending"
        entrega.next_attempt_at = agora + datetime.timedelta(
            seconds=webhooks.next_retry_delay(entrega.attempts or 1))
    db.commit()
