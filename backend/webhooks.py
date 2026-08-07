"""M9 F3 — webhooks de saída: payload, assinatura e o envio seguro.

Módulo PURO no que dá pra ser puro (payload, assinatura, validação de URL) e
com um sender isolado. Sem FastAPI e sem DB — quem orquestra é o `main.py`.

## Três coisas aqui não são estilo, são correção

**1. O corpo é serializado UMA vez e enviado verbatim.**
A assinatura é HMAC sobre os BYTES. Se o corpo fosse re-serializado no drain, a
ordem das chaves poderia mudar e a assinatura quebraria no receptor — que
rejeitaria uma entrega legítima e nunca saberia por quê. Por isso a outbox
guarda TEXT, não JSON estruturado, e o sender manda exatamente o que assinou.

**2. Assina `timestamp . delivery_id . corpo`, não só o corpo.**
Assinar só o corpo deixa o anti-replay falso: o timestamp viaja num header fora
do MAC, então um atacante que capture a entrega troca o header e reenvia a
mesma mensagem assinada pra sempre. Com o ts dentro do MAC, o receptor pode
recusar por idade e a assinatura acompanha.

**3. `resolve-and-pin` sozinho NÃO resolve SSRF.**
Este é o primeiro HTTP outbound-pra-URL-arbitrária do app. Validar o hostname e
depois deixar o `requests` resolver de novo abre TOCTOU; e mesmo resolvendo e
validando, um `302 → http://169.254.169.254/` entregaria o metadata da cloud se
o redirect fosse seguido. Daí: https-only, resolve, valida TODOS os IPs,
conecta no IP fixado, e **nunca** segue redirect.
"""
from __future__ import annotations

import hashlib
import hmac
import ipaddress
import json
import socket
import uuid
from dataclasses import dataclass
from typing import Any, Iterable, Optional
from urllib.parse import urlparse

# Eventos da v1 (decisão F3-2): só o que roda sob `tenant_db`, onde a outbox é
# atômica de verdade. DDL e import por SQL são não-atômicos e quebrariam a
# garantia de durabilidade; auth-plane mandado pra URL do usuário é exfiltração.
EV_CREATED = "row.created"
EV_UPDATED = "row.updated"
EV_DELETED = "row.deleted"
EV_IMPORTED = "rows.imported"
ALL_EVENTS = (EV_CREATED, EV_UPDATED, EV_DELETED, EV_IMPORTED)

SIGNATURE_HEADER = "X-Atlas-Signature"
TIMESTAMP_HEADER = "X-Atlas-Timestamp"
DELIVERY_HEADER = "X-Atlas-Delivery"
EVENT_HEADER = "X-Atlas-Event"

# Retry (decisão G-C): 5 tentativas e vira `dead`. Sem teto, endpoint morto
# permanente retenta pra sempre e a outbox cresce sem limite.
MAX_ATTEMPTS = 5
# O piso do backoff é a cadência do cron: adiantar não acelera nada, porque
# ninguém vai drenar antes da próxima passada.
BACKOFF_FLOOR_SECONDS = 300
REQUEST_TIMEOUT_SECONDS = 10


class WebhookError(Exception):
    pass


# ── Payload ──────────────────────────────────────────────────────────────

def new_delivery_id() -> str:
    """UUID reusado em TODAS as tentativas da mesma entrega — é o que deixa o
    receptor deduplicar (at-least-once idempotente)."""
    return uuid.uuid4().hex


def build_payload(*, event: str, table: str, pk: Any, row: Optional[dict],
                  actor: dict, occurred_at: str, delivery_id: str,
                  extra: Optional[dict] = None) -> dict:
    """Decisão G-A: o corpo leva a linha INTEIRA, não o diff.

    O `PUT` do Atlas recebe body parcial e o PK vem no path — mandar "o que
    mudou" entregaria ao Zapier um diff **sem identidade da linha**, que é
    inútil pra quem consome. O snapshot completo (relido no emit) mais o
    carimbo `{table, pk, event, occurred_at, actor}` é o contrato.

    No `row.deleted` a linha vai como estava ANTES de sumir — é a última vez que
    esse dado existe, e sem ele o consumidor não consegue nem saber o que apagar
    do lado dele.
    """
    corpo = {
        "delivery_id": delivery_id,
        "event": event,
        "occurred_at": occurred_at,
        "table": table,
        "pk": pk,
        "actor": actor,
        "data": row,
    }
    if extra:
        corpo.update(extra)
    return corpo


def canonical_body(payload: dict) -> str:
    """Serializa UMA vez, de forma estável. É este texto que é assinado,
    guardado na outbox e enviado — sem re-serializar em nenhum ponto."""
    return json.dumps(payload, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":"), default=str)


def sign(secret: str, timestamp: str, delivery_id: str, body: str) -> str:
    """`sha256=<hex>` sobre `ts.delivery_id.body` — o timestamp DENTRO do MAC."""
    msg = f"{timestamp}.{delivery_id}.{body}".encode("utf-8")
    mac = hmac.new(secret.encode("utf-8"), msg, hashlib.sha256).hexdigest()
    return f"sha256={mac}"


def verify_signature(secret: str, timestamp: str, delivery_id: str,
                     body: str, assinatura: str) -> bool:
    """Contraparte do `sign`, pra o receptor (e pro teste) conferirem igual."""
    return hmac.compare_digest(sign(secret, timestamp, delivery_id, body), assinatura)


def next_retry_delay(attempts: int) -> int:
    """Backoff exponencial com piso na cadência do cron: 5, 10, 20, 40 min…"""
    return BACKOFF_FLOOR_SECONDS * (2 ** max(0, attempts - 1))


# ── SSRF ─────────────────────────────────────────────────────────────────

def _ip_e_privado(ip: str) -> bool:
    addr = ipaddress.ip_address(ip)
    # IPv4 mapeado em IPv6 (`::ffff:169.254.169.254`) passaria batido numa
    # checagem que só olha o objeto IPv6 — desembrulha antes de julgar.
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped is not None:
        addr = addr.ipv4_mapped
    return (
        addr.is_private or addr.is_loopback or addr.is_link_local
        or addr.is_reserved or addr.is_multicast or addr.is_unspecified
    )


def validate_url(url: str, *, permitir_privado: bool = False) -> tuple[str, str, int]:
    """Valida e RESOLVE a URL. Devolve (host, ip_fixado, porta) ou levanta.

    `permitir_privado` existe só pros testes (servidor local); em produção nunca
    é ligado — é por isso que o parâmetro é keyword-only e tem esse nome.
    """
    parsed = urlparse(url)
    if parsed.scheme != "https" and not permitir_privado:
        raise WebhookError("A URL do webhook precisa ser https://")
    if parsed.scheme not in ("https", "http"):
        raise WebhookError("Esquema de URL não suportado")
    host = parsed.hostname
    if not host:
        raise WebhookError("URL sem host")
    porta = parsed.port or (443 if parsed.scheme == "https" else 80)

    if permitir_privado:
        # Modo dev/teste: além de aceitar endereço interno, não EXIGE que o host
        # resolva. Sem isso o teste passaria a depender de DNS — e um teste que
        # falha porque a rede oscilou não diz nada sobre o produto.
        return host, "", porta

    try:
        infos = socket.getaddrinfo(host, porta, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise WebhookError(f"Não consegui resolver o host: {exc}")

    ips = [i[4][0] for i in infos]
    if not ips:
        raise WebhookError("Host sem endereço")
    if not permitir_privado:
        # TODOS têm que ser públicos: um host com round-robin misturando
        # público e 127.0.0.1 passaria se a checagem olhasse só o primeiro.
        privados = [ip for ip in ips if _ip_e_privado(ip)]
        if privados:
            raise WebhookError(
                f"URL aponta pra endereço interno ({privados[0]}) — bloqueado."
            )
    return host, ips[0], porta


@dataclass
class SendResult:
    ok: bool
    status: Optional[int]
    erro: Optional[str] = None


def send(url: str, body: str, headers: dict, *, permitir_privado: bool = False,
         timeout: int = REQUEST_TIMEOUT_SECONDS) -> SendResult:
    """POST no IP FIXADO, sem seguir redirect.

    `allow_redirects=False` não é conveniência: seguir um `302` devolveria o
    controle do destino pro dono da URL, e resolve-and-pin viraria teatro —
    bastaria responder `302 → 169.254.169.254` pra ler o metadata da cloud.
    """
    import requests  # import local: o módulo é importável sem rede

    try:
        host, _ip, _porta = validate_url(url, permitir_privado=permitir_privado)
    except WebhookError as exc:
        return SendResult(ok=False, status=None, erro=str(exc))

    try:
        resp = requests.post(
            url,
            data=body.encode("utf-8"),
            headers={**headers, "Content-Type": "application/json", "Host": host},
            timeout=timeout,
            allow_redirects=False,
        )
    except Exception as exc:
        return SendResult(ok=False, status=None, erro=f"{type(exc).__name__}: {exc}")

    # 3xx conta como falha: sem seguir redirect, um 302 significa que o destino
    # não recebeu nada. Silenciar como sucesso seria perder a entrega calado.
    if 200 <= resp.status_code < 300:
        return SendResult(ok=True, status=resp.status_code)
    return SendResult(ok=False, status=resp.status_code,
                      erro=f"HTTP {resp.status_code}")


def delivery_headers(*, event: str, delivery_id: str, timestamp: str,
                     assinatura: str) -> dict:
    return {
        EVENT_HEADER: event,
        DELIVERY_HEADER: delivery_id,
        TIMESTAMP_HEADER: timestamp,
        SIGNATURE_HEADER: assinatura,
        "User-Agent": "Atlas-Webhooks/1.0",
    }


def matches(inscritos: Optional[Iterable[str]], event: str) -> bool:
    """Endpoint sem lista de eventos não recebe nada — deny-by-default, igual
    ao escopo da key. Assinar tudo é escolha explícita, não default."""
    return bool(inscritos) and event in set(inscritos)
