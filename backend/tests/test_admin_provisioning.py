"""B11 — o provisionamento de admin ou nasce inteiro, ou não nasce.

O `create_admin` faz três coisas em ordem: provisiona no Supabase, grava em
`public.users`, e faz um PATCH do `app_metadata.tenant_id` — que só pode
acontecer DEPOIS do commit, porque precisa do id local.

Esse último passo ficava **fora de qualquer compensação**. Quando falhava, o
master recebia 500 mas o admin já existia nos dois lados, sem `tenant_id` no
`app_metadata`, e ninguém desfazia. Hoje é invisível porque nenhum código do
backend lê esse claim — o tenant sai do banco local. Vira falha permanente e
silenciosa no dia em que algo o ler.

Estes testes precisam FINGIR que o Supabase está configurado: em teste ele nunca
está (`is_configured()` é False e `sup_uid` fica None), então o caminho inteiro
da compensação seria pulado e o teste não provaria nada.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import models  # noqa: E402
import supabase_admin  # noqa: E402


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def supabase_fake(monkeypatch, db_session):
    """Supabase de mentira, com registro do que foi chamado.

    **Por que também troca a auth:** `auth.py` só aceita o token fake
    `test-<user>` quando `supabase_admin.is_configured()` é False. Fingir que o
    Supabase existe — que é exatamente o que este teste precisa — derruba o
    login e tudo vira 401. `auth` e `main` importam o MESMO objeto de módulo,
    então não dá pra ligar num e desligar no outro.

    A saída honesta é dispensar o token: sobrescreve a dependency de master
    direto. O alvo do teste é a compensação do `create_admin`, não a auth.
    """
    import main
    from auth import get_current_master

    estado = {"criados": [], "apagados": [], "metadata": []}

    monkeypatch.setattr(supabase_admin, "is_configured", lambda: True)
    monkeypatch.setattr(supabase_admin, "provision_user",
                        lambda **kw: (estado["criados"].append(kw), "uid-fake-123")[1])
    monkeypatch.setattr(supabase_admin, "delete_user",
                        lambda uid: estado["apagados"].append(uid))
    monkeypatch.setattr(supabase_admin, "update_user_metadata",
                        lambda uid, **kw: estado["metadata"].append((uid, kw)))

    master = db_session.query(models.User).filter(models.User.role == "master").first()
    assert master is not None, "o setup_db deveria ter seedado o master"
    main.app.dependency_overrides[get_current_master] = lambda: master
    yield estado
    main.app.dependency_overrides.pop(get_current_master, None)


def test_caminho_feliz_grava_o_tenant_id_no_metadata(client, master_token, supabase_fake, db_session):
    r = client.post("/api/admins",
                    json={"username": "adm_ok", "password": "Pwd12345!", "role": "admin"},
                    headers=_auth(master_token))
    assert r.status_code == 200, r.text
    novo = db_session.query(models.User).filter(models.User.username == "adm_ok").first()
    assert novo is not None

    # o PATCH aconteceu, e com o id LOCAL recém-criado (é por isso que ele só
    # pode rodar depois do commit)
    assert len(supabase_fake["metadata"]) == 1
    uid, kw = supabase_fake["metadata"][0]
    assert uid == "uid-fake-123"
    assert kw["tenant_id"] == novo.id
    assert supabase_fake["apagados"] == []


def test_backfill_que_falha_NAO_deixa_admin_meio_criado(client, master_token,
                                                        supabase_fake, monkeypatch, db_session):
    """O caso do B11: antes, o admin sobrevivia sem tenant_id e ninguém revertia."""
    def explode(uid, **kw):
        raise RuntimeError("Supabase fora do ar no PATCH")

    monkeypatch.setattr(supabase_admin, "update_user_metadata", explode)

    r = client.post("/api/admins",
                    json={"username": "adm_ruim", "password": "Pwd12345!", "role": "admin"},
                    headers=_auth(master_token))
    assert r.status_code == 502, r.text

    db_session.expire_all()
    sobrou = db_session.query(models.User).filter(models.User.username == "adm_ruim").first()
    assert sobrou is None, "o admin sobreviveu sem tenant_id no app_metadata — é o B11"

    # e o lado do Supabase foi limpo junto, senão fica órfão em auth.users
    assert supabase_fake["apagados"] == ["uid-fake-123"]


def test_o_username_fica_livre_depois_da_falha(client, master_token, supabase_fake, monkeypatch):
    """Consequência prática de desfazer: dá pra tentar de novo. Antes, o admin
    meio-criado ocupava o username e a 2ª tentativa batia em 400."""
    chamadas = {"n": 0}

    def falha_so_na_primeira(uid, **kw):
        chamadas["n"] += 1
        if chamadas["n"] == 1:
            raise RuntimeError("falha transitória")

    monkeypatch.setattr(supabase_admin, "update_user_metadata", falha_so_na_primeira)

    corpo = {"username": "adm_retry", "password": "Pwd12345!", "role": "admin"}
    assert client.post("/api/admins", json=corpo, headers=_auth(master_token)).status_code == 502
    assert client.post("/api/admins", json=corpo, headers=_auth(master_token)).status_code == 200


def test_sem_supabase_configurado_nada_disso_roda(client, master_token, db_session):
    """Dev e pytest rodam sem Supabase: `sup_uid` é None e o bloco inteiro é
    pulado. O admin nasce normalmente — sem este teste, um fix no caminho do
    Supabase poderia quebrar o caminho local sem ninguém ver."""
    r = client.post("/api/admins",
                    json={"username": "adm_local", "password": "Pwd12345!", "role": "admin"},
                    headers=_auth(master_token))
    assert r.status_code == 200, r.text
    novo = db_session.query(models.User).filter(models.User.username == "adm_local").first()
    assert novo is not None and novo.supabase_uid is None
