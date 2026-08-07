"""M9 F3 — webhooks: outbox, assinatura, SSRF e o drenador.

Os testes que importam aqui não são os de CRUD. São três:

1. **A outbox é atômica com a mutação.** Se o dado deu rollback, não pode
   sobrar entrega de uma escrita que não aconteceu. É a decisão #3 inteira.
2. **O corpo assinado é o corpo enviado.** Re-serializar em qualquer ponto
   quebraria a assinatura no receptor — que recusaria entrega legítima sem
   saber por quê.
3. **SSRF de verdade**, incluindo o furo que o cético apontou: resolve-and-pin
   sozinho não basta se redirect for seguido.
"""
import datetime
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import audit  # noqa: E402
import models  # noqa: E402
import webhook_crypto  # noqa: E402
import webhook_drain  # noqa: E402
import webhooks  # noqa: E402


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _chave_de_assinatura(monkeypatch):
    """Sem a env o módulo LEVANTA de propósito — o teste configura, e há um
    teste específico pro caminho não-configurado."""
    from cryptography.fernet import Fernet
    monkeypatch.setenv(webhook_crypto.ENV_VAR, Fernet.generate_key().decode())
    monkeypatch.setenv("ATLAS_WEBHOOK_ALLOW_PRIVATE", "1")
    yield


def _mk_table(client, token, name="pedidos", linhas=0):
    r = client.post("/tables/", json={
        "name": name, "description": "",
        "columns": [{"name": "cliente", "data_type": "String", "is_nullable": True}],
    }, headers=_auth(token))
    assert r.status_code == 200, r.text
    for i in range(linhas):
        client.post(f"/api/{name}", json={"cliente": f"c{i}"}, headers=_auth(token))
    return r.json()


def _mk_webhook(client, token, url="https://example.test/hook",
                events=webhooks.ALL_EVENTS, tables=None):
    body = {"name": "meu-receptor", "url": url, "events": list(events)}
    if tables is not None:
        body["table_names"] = tables
    r = client.post("/api/webhooks/me", json=body, headers=_auth(token))
    assert r.status_code == 200, r.text
    return r.json()


def _entregas(db_session, **f):
    q = db_session.query(models.WebhookDelivery)
    for k, v in f.items():
        q = q.filter(getattr(models.WebhookDelivery, k) == v)
    return q.order_by(models.WebhookDelivery.id).all()


# ── 1. a outbox é atômica com a mutação ──────────────────────────────────

def test_insert_gera_entrega_na_outbox(client, admin_token, db_session):
    _mk_table(client, admin_token)
    _mk_webhook(client, admin_token)
    r = client.post("/api/pedidos", json={"cliente": "ana"}, headers=_auth(admin_token))
    assert r.status_code == 200

    evs = _entregas(db_session, event=webhooks.EV_CREATED)
    assert len(evs) == 1
    assert evs[0].status == "pending"
    assert evs[0].attempts == 0


def test_mutacao_que_falha_NAO_deixa_entrega_orfa(client, admin_token, db_session, monkeypatch):
    """O coração da decisão #3: entrega e dado commitam juntos. Se sobrasse
    entrega de uma escrita revertida, o consumidor agiria sobre um fato que
    nunca existiu."""
    import main
    _mk_table(client, admin_token)
    _mk_webhook(client, admin_token)

    def explode(*a, **kw):
        raise RuntimeError("banco caiu depois do insert")

    monkeypatch.setattr(main.audit, "_build", explode)
    with pytest.raises(RuntimeError):
        client.post("/api/pedidos", json={"cliente": "fantasma"}, headers=_auth(admin_token))
    monkeypatch.undo()

    db_session.expire_all()
    assert _entregas(db_session) == []
    dados = client.get("/api/pedidos", headers=_auth(admin_token)).json()
    assert all(x["cliente"] != "fantasma" for x in dados["data"])


def test_sem_webhook_cadastrado_nao_grava_nada(client, admin_token, db_session):
    _mk_table(client, admin_token)
    client.post("/api/pedidos", json={"cliente": "ana"}, headers=_auth(admin_token))
    assert _entregas(db_session) == []


def test_update_e_delete_geram_seus_eventos(client, admin_token, db_session):
    _mk_table(client, admin_token)
    _mk_webhook(client, admin_token)
    r = client.post("/api/pedidos", json={"cliente": "ana"}, headers=_auth(admin_token))
    rid = r.json()["id"]
    client.put(f"/api/pedidos/{rid}", json={"cliente": "beto"}, headers=_auth(admin_token))
    client.delete(f"/api/pedidos/{rid}", headers=_auth(admin_token))

    eventos = [e.event for e in _entregas(db_session)]
    assert eventos == [webhooks.EV_CREATED, webhooks.EV_UPDATED, webhooks.EV_DELETED]


def test_payload_do_update_leva_a_linha_INTEIRA(client, admin_token, db_session):
    """Decisão G-A. O body do PUT é parcial e o PK vem no path: mandar só o
    diff entregaria uma mudança sem identidade da linha."""
    _mk_table(client, admin_token)
    _mk_webhook(client, admin_token)
    rid = client.post("/api/pedidos", json={"cliente": "ana"},
                      headers=_auth(admin_token)).json()["id"]
    client.put(f"/api/pedidos/{rid}", json={"cliente": "beto"}, headers=_auth(admin_token))

    ev = _entregas(db_session, event=webhooks.EV_UPDATED)[0]
    corpo = json.loads(ev.body)
    assert corpo["pk"] == rid
    assert corpo["table"] == "pedidos"
    assert corpo["data"]["cliente"] == "beto"
    assert corpo["data"]["id"] == rid          # identidade veio junto
    assert corpo["changed"] == ["cliente"]     # o diff continua disponível
    assert corpo["actor"]["label"] == "testadmin"


def test_delete_leva_a_linha_como_ela_era(client, admin_token, db_session):
    """É a última vez que esse dado existe — sem ele o consumidor não sabe o
    que apagar do lado dele."""
    _mk_table(client, admin_token)
    _mk_webhook(client, admin_token)
    rid = client.post("/api/pedidos", json={"cliente": "ana"},
                      headers=_auth(admin_token)).json()["id"]
    client.delete(f"/api/pedidos/{rid}", headers=_auth(admin_token))
    corpo = json.loads(_entregas(db_session, event=webhooks.EV_DELETED)[0].body)
    assert corpo["data"]["cliente"] == "ana"


def test_import_gera_UM_evento_agregado(client, admin_token, db_session):
    import io
    _mk_table(client, admin_token)
    _mk_webhook(client, admin_token)
    csv = b"cliente\na\nb\nc\n"
    client.post("/api/import/data/pedidos",
                files={"file": ("d.csv", io.BytesIO(csv), "text/csv")},
                headers=_auth(admin_token))
    evs = _entregas(db_session, event=webhooks.EV_IMPORTED)
    assert len(evs) == 1
    assert json.loads(evs[0].body)["inserted_rows"] == 3
    assert _entregas(db_session, event=webhooks.EV_CREATED) == []


def test_filtro_por_tabela_e_por_evento(client, admin_token, db_session):
    _mk_table(client, admin_token, name="pedidos")
    _mk_table(client, admin_token, name="outra")
    _mk_webhook(client, admin_token, events=[webhooks.EV_CREATED], tables=["pedidos"])

    client.post("/api/pedidos", json={"cliente": "x"}, headers=_auth(admin_token))
    client.post("/api/outra", json={"cliente": "y"}, headers=_auth(admin_token))
    rid = client.get("/api/pedidos", headers=_auth(admin_token)).json()["data"][0]["id"]
    client.delete(f"/api/pedidos/{rid}", headers=_auth(admin_token))

    evs = _entregas(db_session)
    assert len(evs) == 1
    assert evs[0].event == webhooks.EV_CREATED
    assert json.loads(evs[0].body)["table"] == "pedidos"


def test_endpoint_de_outro_tenant_nao_recebe(client, master_token, admin_token, db_session):
    _mk_table(client, admin_token)
    _mk_webhook(client, admin_token)
    client.post("/api/admins", json={"username": "vizinho", "password": "x123", "role": "admin"},
                headers=_auth(master_token))
    _mk_table(client, "test-vizinho", name="deles")
    client.post("/api/deles", json={"cliente": "z"}, headers=_auth("test-vizinho"))

    # nada da tabela do vizinho caiu na outbox do nosso admin
    assert _entregas(db_session) == []


# ── 2. assinatura: o corpo assinado é o corpo enviado ────────────────────

def test_assinatura_confere_sobre_ts_id_e_corpo():
    seg = "whsec_teste"
    corpo = '{"a":1}'
    a = webhooks.sign(seg, "1700000000", "abc", corpo)
    assert webhooks.verify_signature(seg, "1700000000", "abc", corpo, a)
    # trocar QUALQUER parte invalida — inclusive o timestamp, que é o ponto:
    # com ele fora do MAC o anti-replay seria decorativo
    assert not webhooks.verify_signature(seg, "1700000001", "abc", corpo, a)
    assert not webhooks.verify_signature(seg, "1700000000", "outro", corpo, a)
    assert not webhooks.verify_signature(seg, "1700000000", "abc", '{"a":2}', a)
    assert not webhooks.verify_signature("outro", "1700000000", "abc", corpo, a)


def test_corpo_e_serializado_UMA_vez_e_e_estavel():
    p1 = webhooks.build_payload(event="x", table="t", pk=1, row={"b": 2, "a": 1},
                                actor=None, occurred_at="z", delivery_id="d")
    p2 = webhooks.build_payload(event="x", table="t", pk=1, row={"a": 1, "b": 2},
                                actor=None, occurred_at="z", delivery_id="d")
    assert webhooks.canonical_body(p1) == webhooks.canonical_body(p2)


def test_o_que_o_drain_envia_e_EXATAMENTE_o_que_esta_na_outbox(client, admin_token,
                                                               db_session, monkeypatch):
    """Se o drain re-serializasse, a ordem das chaves poderia mudar e a
    assinatura quebraria no receptor."""
    _mk_table(client, admin_token)
    wh = _mk_webhook(client, admin_token)
    client.post("/api/pedidos", json={"cliente": "ana"}, headers=_auth(admin_token))
    guardado = _entregas(db_session)[0].body

    capturado = {}

    def fake_send(url, body, headers, **kw):
        capturado["body"] = body
        capturado["headers"] = headers
        return webhooks.SendResult(ok=True, status=200)

    monkeypatch.setattr(webhook_drain.webhooks, "send", fake_send)
    webhook_drain.drain(db_session, permitir_privado=True)

    assert capturado["body"] == guardado
    ts = capturado["headers"][webhooks.TIMESTAMP_HEADER]
    did = capturado["headers"][webhooks.DELIVERY_HEADER]
    assert webhooks.verify_signature(wh["secret"], ts, did, capturado["body"],
                                     capturado["headers"][webhooks.SIGNATURE_HEADER])


# ── 3. SSRF ──────────────────────────────────────────────────────────────

@pytest.mark.parametrize("url", [
    "https://127.0.0.1/hook",
    "https://localhost/hook",
    "https://169.254.169.254/latest/meta-data/",   # metadata da cloud
    "https://10.0.0.5/hook",
    "https://192.168.1.10/hook",
    "https://[::1]/hook",
])
def test_url_interna_e_bloqueada(url):
    with pytest.raises(webhooks.WebhookError):
        webhooks.validate_url(url)


def test_http_puro_e_bloqueado():
    with pytest.raises(webhooks.WebhookError):
        webhooks.validate_url("http://example.com/hook")


def test_ipv4_mapeado_em_ipv6_nao_escapa():
    """`::ffff:169.254.169.254` passaria batido numa checagem que só olha o
    objeto IPv6 — por isso o desembrulho antes de julgar."""
    assert webhooks._ip_e_privado("::ffff:169.254.169.254")
    assert webhooks._ip_e_privado("::ffff:127.0.0.1")
    assert not webhooks._ip_e_privado("::ffff:8.8.8.8")


def test_redirect_nao_e_seguido_e_conta_como_falha(monkeypatch):
    """O furo que o cético apontou: resolve-and-pin sozinho é contornável por
    `302 → 169.254.169.254`. Não seguir redirect é o que fecha."""
    chamadas = {}

    class FakeResp:
        status_code = 302

    def fake_post(url, **kw):
        chamadas.update(kw)
        return FakeResp()

    import requests
    monkeypatch.setattr(requests, "post", fake_post)
    r = webhooks.send("http://example.test/hook", "{}", {}, permitir_privado=True)
    assert chamadas["allow_redirects"] is False
    assert not r.ok and r.status == 302


def test_criar_webhook_com_url_interna_e_400(client, admin_token, monkeypatch):
    monkeypatch.delenv("ATLAS_WEBHOOK_ALLOW_PRIVATE", raising=False)
    _mk_table(client, admin_token)
    r = client.post("/api/webhooks/me", json={
        "name": "ssrf", "url": "https://169.254.169.254/x", "events": [webhooks.EV_CREATED],
    }, headers=_auth(admin_token))
    assert r.status_code == 400
    assert "interno" in r.json()["detail"].lower()


# ── 4. drenador ──────────────────────────────────────────────────────────

def test_entrega_bem_sucedida_vira_delivered(client, admin_token, db_session, monkeypatch):
    _mk_table(client, admin_token)
    _mk_webhook(client, admin_token)
    client.post("/api/pedidos", json={"cliente": "ana"}, headers=_auth(admin_token))
    monkeypatch.setattr(webhook_drain.webhooks, "send",
                        lambda *a, **k: webhooks.SendResult(ok=True, status=200))

    rel = webhook_drain.drain(db_session, permitir_privado=True)
    assert (rel.claimed, rel.delivered) == (1, 0 + 1)
    e = _entregas(db_session)[0]
    assert e.status == "delivered" and e.attempts == 1 and e.delivered_at is not None


def test_falha_reagenda_com_backoff_crescente(client, admin_token, db_session, monkeypatch):
    _mk_table(client, admin_token)
    _mk_webhook(client, admin_token)
    client.post("/api/pedidos", json={"cliente": "ana"}, headers=_auth(admin_token))
    monkeypatch.setattr(webhook_drain.webhooks, "send",
                        lambda *a, **k: webhooks.SendResult(ok=False, status=500, erro="HTTP 500"))

    # Ancora no instante do PRÓPRIO evento: um `now` fixo no passado ficaria
    # antes do `next_attempt_at` gravado no emit e o claim não pegaria nada —
    # o teste passaria a medir o relógio, não o backoff.
    t0 = _entregas(db_session)[0].next_attempt_at
    webhook_drain.drain(db_session, permitir_privado=True, now=t0)
    e = _entregas(db_session)[0]
    assert e.status == "pending" and e.attempts == 1
    espera1 = (e.next_attempt_at - t0).total_seconds()
    assert espera1 == webhooks.BACKOFF_FLOOR_SECONDS

    webhook_drain.drain(db_session, permitir_privado=True, now=e.next_attempt_at)
    db_session.refresh(e)
    assert e.attempts == 2
    assert (e.next_attempt_at - t0).total_seconds() > espera1


def test_apos_o_teto_de_tentativas_vira_dead(client, admin_token, db_session, monkeypatch):
    """Sem `dead`, endpoint morto permanente retenta pra sempre e a outbox
    cresce sem teto."""
    _mk_table(client, admin_token)
    _mk_webhook(client, admin_token)
    client.post("/api/pedidos", json={"cliente": "ana"}, headers=_auth(admin_token))
    monkeypatch.setattr(webhook_drain.webhooks, "send",
                        lambda *a, **k: webhooks.SendResult(ok=False, status=500, erro="x"))

    quando = _entregas(db_session)[0].next_attempt_at
    for _ in range(webhooks.MAX_ATTEMPTS):
        webhook_drain.drain(db_session, permitir_privado=True, now=quando)
        e = _entregas(db_session)[0]
        quando = (e.next_attempt_at or quando) + datetime.timedelta(seconds=1)

    e = _entregas(db_session)[0]
    assert e.status == "dead"
    assert e.attempts == webhooks.MAX_ATTEMPTS
    assert e.next_attempt_at is None


def test_nao_drena_antes_da_hora(client, admin_token, db_session, monkeypatch):
    _mk_table(client, admin_token)
    _mk_webhook(client, admin_token)
    client.post("/api/pedidos", json={"cliente": "ana"}, headers=_auth(admin_token))
    monkeypatch.setattr(webhook_drain.webhooks, "send",
                        lambda *a, **k: webhooks.SendResult(ok=False, status=500, erro="x"))
    t0 = _entregas(db_session)[0].next_attempt_at
    webhook_drain.drain(db_session, permitir_privado=True, now=t0)
    rel = webhook_drain.drain(db_session, permitir_privado=True, now=t0)
    assert rel.claimed == 0


def test_in_flight_orfa_volta_pra_fila(client, admin_token, db_session):
    """Se o processo morrer entre o claim e o desfecho, a entrega não pode
    ficar presa pra sempre — volta como retentativa (at-least-once)."""
    _mk_table(client, admin_token)
    _mk_webhook(client, admin_token)
    client.post("/api/pedidos", json={"cliente": "ana"}, headers=_auth(admin_token))
    e = _entregas(db_session)[0]
    e.status = "in_flight"
    e.attempts = 1
    e.created_at = datetime.datetime.utcnow() - datetime.timedelta(seconds=600)
    db_session.commit()

    n = webhook_drain.requeue_stuck(db_session)
    assert n == 1
    db_session.refresh(e)
    assert e.status == "pending"


def test_delivery_id_e_o_MESMO_em_todas_as_tentativas(client, admin_token, db_session, monkeypatch):
    """É o que permite ao receptor deduplicar num contrato at-least-once."""
    _mk_table(client, admin_token)
    _mk_webhook(client, admin_token)
    client.post("/api/pedidos", json={"cliente": "ana"}, headers=_auth(admin_token))
    vistos = []

    def fake(url, body, headers, **kw):
        vistos.append(headers[webhooks.DELIVERY_HEADER])
        return webhooks.SendResult(ok=False, status=500, erro="x")

    monkeypatch.setattr(webhook_drain.webhooks, "send", fake)
    quando = datetime.datetime(2026, 8, 7, 12, 0, 0)
    for _ in range(3):
        webhook_drain.drain(db_session, permitir_privado=True, now=quando)
        quando = _entregas(db_session)[0].next_attempt_at + datetime.timedelta(seconds=1)
    assert len(set(vistos)) == 1


def test_endpoint_desativado_mata_a_entrega(client, admin_token, db_session):
    _mk_table(client, admin_token)
    wh = _mk_webhook(client, admin_token)
    client.post("/api/pedidos", json={"cliente": "ana"}, headers=_auth(admin_token))
    ep = db_session.query(models.WebhookEndpoint).filter(
        models.WebhookEndpoint.id == wh["id"]).first()
    ep.is_active = False
    db_session.commit()

    rel = webhook_drain.drain(db_session, permitir_privado=True)
    assert rel.dead == 1
    assert _entregas(db_session)[0].status == "dead"


# ── 5. gestão e configuração ─────────────────────────────────────────────

def test_segredo_aparece_uma_vez_e_fica_cifrado(client, admin_token, db_session):
    _mk_table(client, admin_token)
    wh = _mk_webhook(client, admin_token)
    assert wh["secret"].startswith("whsec_")

    listagem = client.get("/api/webhooks/me", headers=_auth(admin_token)).json()
    assert "secret" not in listagem[0]

    ep = db_session.query(models.WebhookEndpoint).filter(
        models.WebhookEndpoint.id == wh["id"]).first()
    assert wh["secret"] not in ep.secret_encrypted           # cifrado no banco
    assert webhook_crypto.decrypt(ep.secret_encrypted) == wh["secret"]


def test_sem_a_chave_de_assinatura_o_endpoint_FALHA_ALTO(client, admin_token, monkeypatch):
    """Não gera chave efêmera (quebraria no restart) nem grava em texto puro
    (o dump do banco entregaria os segredos de todos os clientes)."""
    monkeypatch.delenv(webhook_crypto.ENV_VAR, raising=False)
    _mk_table(client, admin_token)
    r = client.post("/api/webhooks/me", json={
        "name": "x", "url": "https://example.test/h", "events": [webhooks.EV_CREATED],
    }, headers=_auth(admin_token))
    assert r.status_code == 503
    assert webhook_crypto.ENV_VAR in r.json()["detail"]


def test_webhook_sem_evento_e_400(client, admin_token):
    _mk_table(client, admin_token)
    r = client.post("/api/webhooks/me", json={
        "name": "x", "url": "https://example.test/h", "events": [],
    }, headers=_auth(admin_token))
    assert r.status_code == 400


def test_master_e_moderador_nao_gerenciam_webhook(client, master_token, admin_token, mod_token):
    for tok in (master_token, mod_token):
        r = client.post("/api/webhooks/me", json={
            "name": "x", "url": "https://example.test/h", "events": [webhooks.EV_CREATED],
        }, headers=_auth(tok))
        assert r.status_code == 403


def test_criar_e_remover_webhook_ficam_na_trilha(client, admin_token, db_session):
    _mk_table(client, admin_token)
    wh = _mk_webhook(client, admin_token)
    client.delete(f"/api/webhooks/me/{wh['id']}", headers=_auth(admin_token))
    acoes = {e.action for e in db_session.query(models.AuditLog).all()}
    assert audit.WEBHOOK_CREATE in acoes
    assert audit.WEBHOOK_DELETE in acoes


def test_drain_sem_token_configurado_e_503(client, monkeypatch):
    """Inverte o footgun do keep-alive: sem config, quebra alto em vez de
    ficar verde sem drenar."""
    monkeypatch.delenv("ATLAS_DRAIN_TOKEN", raising=False)
    r = client.post("/api/webhooks/drain")
    assert r.status_code == 503
    assert "ATLAS_DRAIN_TOKEN" in r.json()["detail"]


def test_drain_com_token_errado_e_401(client, monkeypatch):
    monkeypatch.setenv("ATLAS_DRAIN_TOKEN", "certo")
    assert client.post("/api/webhooks/drain").status_code == 401
    assert client.post("/api/webhooks/drain",
                       headers={"X-Atlas-Drain-Token": "errado"}).status_code == 401


def test_drain_autenticado_responde_o_relatorio(client, admin_token, monkeypatch):
    monkeypatch.setenv("ATLAS_DRAIN_TOKEN", "certo")
    _mk_table(client, admin_token)
    _mk_webhook(client, admin_token)
    client.post("/api/pedidos", json={"cliente": "ana"}, headers=_auth(admin_token))
    monkeypatch.setattr(webhook_drain.webhooks, "send",
                        lambda *a, **k: webhooks.SendResult(ok=True, status=200))

    r = client.post("/api/webhooks/drain", headers={"X-Atlas-Drain-Token": "certo"})
    assert r.status_code == 200
    assert r.json()["delivered"] == 1


def test_key_de_api_nao_gerencia_webhook(client, admin_token):
    """Key que cadastra webhook desviaria o dado do tenant pra uma URL nova —
    escalada com cara de configuração."""
    _mk_table(client, admin_token)
    k = client.post("/api/keys/me", json={"name": "k", "scopes": {"read": ["pedidos"]}},
                    headers=_auth(admin_token)).json()
    r = client.post("/api/webhooks/me", json={
        "name": "x", "url": "https://example.test/h", "events": [webhooks.EV_CREATED],
    }, headers=_auth(k["token"]))
    assert r.status_code == 401
