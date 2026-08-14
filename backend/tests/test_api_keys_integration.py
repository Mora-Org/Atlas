"""M9 F2 — API keys ponta a ponta.

O teste que o plano marcou como **obrigatório** é o de leitura NÃO-VAZIA através
da key dentro do tenant certo. Só negação cross-tenant não serve: sob FORCE RLS,
uma sessão VIRGEM sem `app.tenant_id` devolve **zero linhas sem erro** (numa
conexão já reciclada pelo pool o GUC vem como `''` e a policy ERRA — ver B10). Um
endpoint de key com o GUC quebrado passaria verde num teste que só verifica
"o vizinho não vê" — e em produção devolveria 200 vazio pro dono, que é o pior
tipo de bug (parece "não tem dado").
"""
import datetime
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import api_keys  # noqa: E402
import audit  # noqa: E402
import models  # noqa: E402
import rate_limit  # noqa: E402


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _mk_table(client, token, name="clientes", linhas=3):
    r = client.post("/tables/", json={
        "name": name, "description": "",
        "columns": [{"name": "nome", "data_type": "String", "is_nullable": True}],
    }, headers=_auth(token))
    assert r.status_code == 200, r.text
    for i in range(linhas):
        client.post(f"/api/{name}", json={"nome": f"linha {i}"}, headers=_auth(token))
    return r.json()


def _mk_key(client, token, name="sync", read=("clientes",), expires_at=None):
    body = {"name": name, "scopes": {"read": list(read), "write": []}}
    if expires_at:
        body["expires_at"] = expires_at
    r = client.post("/api/keys/me", json=body, headers=_auth(token))
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(autouse=True)
def _zera_rate_limit():
    """O balde é global no processo; sem reset um teste envenena o outro."""
    rate_limit.limiter.reset()
    yield
    rate_limit.limiter.reset()


# ── o teste que o plano exigiu ───────────────────────────────────────────

def test_key_LE_o_dado_do_tenant_certo_e_NAO_vem_vazio(client, admin_token):
    """Sob FORCE RLS, sessão sem GUC devolve 0 linhas SEM erro. Se este teste
    só olhasse status 200, um wrapper de GUC quebrado passaria verde."""
    _mk_table(client, admin_token, linhas=3)
    key = _mk_key(client, admin_token)

    r = client.get("/api/clientes", headers=_auth(key["token"]))
    assert r.status_code == 200, r.text
    corpo = r.json()
    assert corpo["total"] == 3, "leitura via key veio vazia — cheiro de GUC não setado"
    assert len(corpo["data"]) == 3
    assert {x["nome"] for x in corpo["data"]} == {"linha 0", "linha 1", "linha 2"}


def test_key_ve_o_MESMO_que_o_dono_ve(client, admin_token):
    """Invariante: a key não é uma segunda fonte de verdade. Mesma tabela, mesmo
    conteúdo — o que muda é só o que o escopo corta."""
    _mk_table(client, admin_token, linhas=4)
    key = _mk_key(client, admin_token)
    via_dono = client.get("/api/clientes", headers=_auth(admin_token)).json()
    via_key = client.get("/api/clientes", headers=_auth(key["token"])).json()
    assert via_key["total"] == via_dono["total"]
    assert via_key["data"] == via_dono["data"]


# ── isolamento ───────────────────────────────────────────────────────────

def test_key_NAO_alcanca_tabela_de_outro_tenant(client, master_token, admin_token):
    _mk_table(client, admin_token, name="clientes")
    key = _mk_key(client, admin_token, read=("clientes",))

    # segundo tenant com tabela de nome DIFERENTE
    client.post("/api/admins", json={"username": "outro", "password": "x123", "role": "admin"},
                headers=_auth(master_token))
    _mk_table(client, "test-outro", name="segredos", linhas=2)

    r = client.get("/api/segredos", headers=_auth(key["token"]))
    assert r.status_code == 404, r.text  # não existe PRA ELA


def test_tabela_do_proprio_tenant_fora_do_escopo_da_403(client, admin_token):
    """404 vs 403 é deliberado: 404 = não existe pra você (outro tenant);
    403 = existe, você não pode. Inverter tornaria o 403 um oráculo de nomes."""
    _mk_table(client, admin_token, name="clientes")
    _mk_table(client, admin_token, name="financeiro", linhas=1)
    key = _mk_key(client, admin_token, read=("clientes",))

    assert client.get("/api/clientes", headers=_auth(key["token"])).status_code == 200
    assert client.get("/api/financeiro", headers=_auth(key["token"])).status_code == 403


# ── v1 é só-leitura ──────────────────────────────────────────────────────

@pytest.mark.parametrize("metodo,caminho", [
    ("post", "/api/clientes"),
    ("put", "/api/clientes/1"),
    ("delete", "/api/clientes/1"),
])
def test_key_NAO_escreve_na_v1(client, admin_token, metodo, caminho):
    _mk_table(client, admin_token, linhas=1)
    key = _mk_key(client, admin_token)
    fn = getattr(client, metodo)
    kwargs = {"headers": _auth(key["token"])}
    if metodo in ("post", "put"):
        kwargs["json"] = {"nome": "invasor"}
    r = fn(caminho, **kwargs)
    assert r.status_code == 403, r.text
    # e o dado não mudou
    dados = client.get("/api/clientes", headers=_auth(admin_token)).json()
    assert all(x["nome"] != "invasor" for x in dados["data"])


def test_escopo_de_write_no_pacote_NAO_libera_escrita_na_v1(client, admin_token):
    """A coluna aceita `write` pra ligar depois não ser migration. Quem nega é
    o guard — e é isso que este teste trava."""
    _mk_table(client, admin_token, linhas=1)
    r = client.post("/api/keys/me", json={
        "name": "tenta-escrever", "scopes": {"read": ["clientes"], "write": ["clientes"]},
    }, headers=_auth(admin_token))
    assert r.status_code == 200
    key = r.json()
    assert key["scopes"]["write"] == ["clientes"]
    assert client.post("/api/clientes", json={"nome": "x"},
                       headers=_auth(key["token"])).status_code == 403


# ── gate anti-master ─────────────────────────────────────────────────────

def test_master_NAO_cria_key(client, master_token):
    """`get_accessible_tables(master)` devolve as tabelas de TODOS os tenants:
    uma key de master exfiltraria a plataforma e não morreria com tenant nenhum."""
    r = client.post("/api/keys/me", json={"name": "deus", "scopes": {"read": []}},
                    headers=_auth(master_token))
    assert r.status_code == 403, r.text


def test_moderador_NAO_cria_key(client, admin_token, mod_token):
    r = client.post("/api/keys/me", json={"name": "do-mod", "scopes": {"read": []}},
                    headers=_auth(mod_token))
    assert r.status_code == 403, r.text


def test_key_de_master_gravada_na_marra_NAO_autentica(client, admin_token, db_session):
    """Fail-closed, a 2ª camada do gate: se a linha nascer por bug, migração ou
    escrita direta no banco, a resolução ainda recusa."""
    _mk_table(client, admin_token)
    master = db_session.query(models.User).filter(models.User.role == "master").first()
    nova = api_keys.generate()
    db_session.add(models.ApiKey(
        owner_id=master.id, created_by=master.id, name="forjada",
        prefix=nova.prefix, secret_hash=nova.secret_hash,
        scopes={"read": ["clientes"], "write": []},
    ))
    db_session.commit()

    r = client.get("/api/clientes", headers=_auth(nova.token))
    assert r.status_code == 403, r.text


# ── ciclo de vida ────────────────────────────────────────────────────────

def test_token_aparece_UMA_vez_e_nunca_mais(client, admin_token):
    _mk_table(client, admin_token)
    key = _mk_key(client, admin_token)
    assert key["token"].startswith("mora_")

    listagem = client.get("/api/keys/me", headers=_auth(admin_token)).json()
    assert len(listagem) == 1
    assert "token" not in listagem[0]
    assert "secret_hash" not in listagem[0]
    # o prefixo é público de propósito: é como se identifica qual revogar
    assert listagem[0]["prefix"] == key["prefix"]


def test_o_banco_NAO_guarda_o_segredo(client, admin_token, db_session):
    _mk_table(client, admin_token)
    key = _mk_key(client, admin_token)
    _, segredo = api_keys.parse(key["token"])
    linha = db_session.query(models.ApiKey).filter(models.ApiKey.prefix == key["prefix"]).first()
    assert segredo not in linha.secret_hash
    assert linha.secret_hash == api_keys.hash_secret(segredo)


def test_revogar_derruba_a_key_na_hora_mas_preserva_a_linha(client, admin_token, db_session):
    """Revogação soft: a trilha referencia a key por id/label. Apagar a linha
    cegaria retroativamente justo o registro de quem usou a credencial vazada."""
    _mk_table(client, admin_token)
    key = _mk_key(client, admin_token)
    assert client.get("/api/clientes", headers=_auth(key["token"])).status_code == 200

    r = client.delete(f"/api/keys/me/{key['id']}", headers=_auth(admin_token))
    assert r.status_code == 200, r.text
    assert client.get("/api/clientes", headers=_auth(key["token"])).status_code == 401

    linha = db_session.query(models.ApiKey).filter(models.ApiKey.id == key["id"]).first()
    assert linha is not None
    assert linha.revoked_at is not None


def test_key_expirada_NAO_autentica(client, admin_token, db_session):
    _mk_table(client, admin_token)
    key = _mk_key(client, admin_token)
    linha = db_session.query(models.ApiKey).filter(models.ApiKey.id == key["id"]).first()
    linha.expires_at = datetime.datetime.utcnow() - datetime.timedelta(minutes=1)
    db_session.commit()
    assert client.get("/api/clientes", headers=_auth(key["token"])).status_code == 401


def test_key_com_validade_futura_funciona(client, admin_token):
    _mk_table(client, admin_token)
    futuro = (datetime.datetime.utcnow() + datetime.timedelta(days=1)).isoformat()
    key = _mk_key(client, admin_token, expires_at=futuro)
    assert client.get("/api/clientes", headers=_auth(key["token"])).status_code == 200


def test_segredo_errado_com_prefixo_certo_e_401(client, admin_token):
    _mk_table(client, admin_token)
    key = _mk_key(client, admin_token)
    prefixo, _ = api_keys.parse(key["token"])
    forjado = f"mora_{prefixo}_naoEhOSegredoCerto"
    assert client.get("/api/clientes", headers=_auth(forjado)).status_code == 401


def test_escopo_com_tabela_inexistente_e_recusado_na_criacao(client, admin_token):
    """Erro de digitação no escopo falharia depois como 404 no meio de uma
    integração. Barra na porta, com o nome errado na mensagem."""
    _mk_table(client, admin_token)
    r = client.post("/api/keys/me", json={
        "name": "typo", "scopes": {"read": ["clienntes"]},
    }, headers=_auth(admin_token))
    assert r.status_code == 400
    assert "clienntes" in r.json()["detail"]


# ── a key não é um usuário ───────────────────────────────────────────────

@pytest.mark.parametrize("caminho", ["/api/keys/me", "/api/publications/me/versions"])
def test_key_NAO_alcanca_rota_humana(client, admin_token, caminho):
    """Key que cria key seria escalada de privilégio: uma credencial vazada
    geraria outras, com escopo maior, e revogar a original não adiantaria."""
    _mk_table(client, admin_token)
    key = _mk_key(client, admin_token)
    assert client.get(caminho, headers=_auth(key["token"])).status_code == 401


def test_key_NAO_cria_tabela(client, admin_token):
    _mk_table(client, admin_token)
    key = _mk_key(client, admin_token)
    r = client.post("/tables/", json={"name": "nova", "description": "", "columns": [
        {"name": "x", "data_type": "String", "is_nullable": True}]}, headers=_auth(key["token"]))
    assert r.status_code == 401, r.text


# ── catálogo ─────────────────────────────────────────────────────────────

def test_catalogo_via_key_mostra_SO_o_que_esta_no_escopo(client, admin_token):
    """Sem catálogo a key não descobre o que pode ler; com catálogo inteiro ela
    descobriria os nomes do que NÃO pode. O filtro é o meio-termo."""
    _mk_table(client, admin_token, name="clientes")
    _mk_table(client, admin_token, name="financeiro", linhas=1)
    key = _mk_key(client, admin_token, read=("clientes",))

    nomes = {t["name"] for t in client.get("/tables/", headers=_auth(key["token"])).json()}
    assert nomes == {"clientes"}
    # o dono continua vendo tudo
    nomes_dono = {t["name"] for t in client.get("/tables/", headers=_auth(admin_token)).json()}
    assert nomes_dono == {"clientes", "financeiro"}


# ── audit de leitura ─────────────────────────────────────────────────────

def test_leitura_via_key_entra_na_trilha_com_contagem(client, admin_token, db_session):
    """Decisão 1 do M9: leitura por key é auditada (a humana não). Sem
    `rows`/`offset`, mil requests de 1 linha e 1 request de mil linhas ficariam
    idênticos — e a detecção de exfiltração nasceria cega."""
    _mk_table(client, admin_token, linhas=3)
    key = _mk_key(client, admin_token)
    client.get("/api/clientes", headers=_auth(key["token"]))

    evs = db_session.query(models.AuditLog).filter(
        models.AuditLog.action == audit.RECORD_READ).all()
    assert len(evs) == 1
    ev = evs[0]
    assert ev.actor_type == "key"
    assert ev.details["rows"] == 3
    assert ev.details["offset"] == 0
    assert key["prefix"] in ev.actor_label


def test_leitura_HUMANA_nao_entra_na_trilha(client, admin_token, db_session):
    """Auditar todo GET de tela explodiria o volume no free tier sem responder
    nada que já não se saiba."""
    _mk_table(client, admin_token, linhas=2)
    client.get("/api/clientes", headers=_auth(admin_token))
    assert db_session.query(models.AuditLog).filter(
        models.AuditLog.action == audit.RECORD_READ).count() == 0


def test_criar_e_revogar_key_ficam_na_trilha(client, admin_token, db_session):
    _mk_table(client, admin_token)
    key = _mk_key(client, admin_token)
    client.delete(f"/api/keys/me/{key['id']}", headers=_auth(admin_token))
    acoes = {e.action for e in db_session.query(models.AuditLog).all()}
    assert audit.KEY_CREATE in acoes
    assert audit.KEY_REVOKE in acoes


# ── rate limit ───────────────────────────────────────────────────────────

def test_rate_limit_corta_a_rajada(client, admin_token, monkeypatch):
    """**Não depende de relógio, e a 1ª versão dependia** — o balde repõe
    1 token/segundo, então em Postgres (mais lento) as ~95 requisições levavam
    mais de um segundo e ele recarregava durante o próprio teste: nunca dava
    429, e o teste falhava sem nada estar quebrado.

    A correção é apertar o limite em vez de correr contra o relógio: com teto 3,
    a 4ª chamada é barrada muito antes de qualquer reposição acontecer.
    """
    _mk_table(client, admin_token, linhas=1)
    key = _mk_key(client, admin_token)
    monkeypatch.setattr(rate_limit, "limiter",
                        rate_limit.TokenBucketLimiter(rate_per_minute=3, burst=0))

    codigos = [client.get("/api/clientes", headers=_auth(key["token"])).status_code
               for _ in range(6)]
    assert codigos[0] == 200, "a primeira chamada de uma key nova não pode ser negada"
    assert 429 in codigos, "a key passou do teto sem ser barrada"
    assert codigos[-1] == 429


def test_rate_limit_nao_atrapalha_humano(client, admin_token, monkeypatch):
    """O balde é por KEY. Usuário logado não passa por ele.

    Com o teto apertado a 1, um humano que passasse pelo balde seria barrado na
    2ª chamada — então 6 chamadas com 200 provam que ele não passa. Antes isto
    fazia 95 requisições pra provar o mesmo, e dependia do relógio.
    """
    _mk_table(client, admin_token, linhas=1)
    monkeypatch.setattr(rate_limit, "limiter",
                        rate_limit.TokenBucketLimiter(rate_per_minute=1, burst=0))
    codigos = {client.get("/api/clientes", headers=_auth(admin_token)).status_code
               for _ in range(6)}
    assert codigos == {200}


def test_balde_recarrega_com_o_tempo():
    """Unit do balde com tempo INJETADO — teste de tempo que dorme é lento e
    intermitente."""
    lim = rate_limit.TokenBucketLimiter(rate_per_minute=60, burst=0)
    t = 1000.0
    assert all(lim.allow("k", now=t) for _ in range(60))
    assert not lim.allow("k", now=t)
    assert lim.allow("k", now=t + 1.0)      # 1s = 1 token de volta


def test_baldes_sao_por_key():
    lim = rate_limit.TokenBucketLimiter(rate_per_minute=2, burst=0)
    t = 0.0
    assert lim.allow("a", now=t) and lim.allow("a", now=t)
    assert not lim.allow("a", now=t)
    assert lim.allow("b", now=t), "o balde de uma key derrubou a outra"
