"""1.3.2 — o endereço público que o Studio mostra é o que a rota pública acha.

O defeito, medido em produção em 20/10/2026: o admin `budismopuc` publicou e
ativou, e `/public/budismopuc/snapshot` respondia 404 "Workspace não
encontrado". O `create_admin` deixava `workspace_slug` NULL, nenhuma tela chama
o PATCH que grava, e o `/api/auth/me` inventava `budismopuc` a partir do
username. O link do Studio nunca existiu.

Junto: o "Publicar" aceitava versão sem tabela nem gráfico, e o site saía no ar
com "0 registros · 0 coleções".
"""
from __future__ import annotations

import importlib.util
import os

import pytest
from sqlalchemy import text

import models
import publication_storage


@pytest.fixture(autouse=True)
def _reset_storage():
    publication_storage._reset_local_store_for_tests()
    yield
    publication_storage._reset_local_store_for_tests()


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def _criar_admin(client, master_token, username):
    r = client.post(
        "/api/admins",
        json={"username": username, "password": "Senha123!", "role": "admin"},
        headers=_h(master_token),
    )
    assert r.status_code == 200, r.text
    return f"test-{username}"


def _publicar_e_ativar(client, token):
    t = client.post(
        "/tables/",
        json={"name": "templo", "columns": [{"name": "nome", "data_type": "String", "is_nullable": True}],
              "is_public": False},
        headers=_h(token),
    )
    assert t.status_code == 200, t.text
    client.post("/api/templo", json={"nome": "Templo Zu Lai"}, headers=_h(token))
    v = client.post(
        "/api/publications/me/versions",
        json={"description": "v1", "theme_config": {},
              "table_selection": [{"table_id": t.json()["id"], "order": 0, "layout": "tabela"}]},
        headers=_h(token),
    )
    assert v.status_code == 200, v.text
    a = client.post(f"/api/publications/me/versions/{v.json()['id']}/activate", headers=_h(token))
    assert a.status_code == 200, a.text


# ── o caminho do budismopuc, sem PATCH nenhum ─────────────────────────────

def test_admin_novo_publica_e_o_endereco_do_studio_responde(client, master_token):
    """O caminho que falhou em produção: criar admin → publicar → ativar →
    abrir o endereço que o `/api/auth/me` mostra. Sem PATCH no meio."""
    token = _criar_admin(client, master_token, "budismopuc")
    me = client.get("/api/auth/me", headers=_h(token)).json()
    assert me["workspace_slug"] == "budismopuc"

    _publicar_e_ativar(client, token)

    pub = client.get(f"/public/{me['workspace_slug']}/snapshot")
    assert pub.status_code == 200, pub.text
    assert pub.json()["owner"] == {"workspace_slug": "budismopuc", "workspace_name": "budismopuc"}


def test_endereco_nasce_gravado_no_banco(client, master_token, db_session):
    _criar_admin(client, master_token, "Centro_Budista")
    u = db_session.query(models.User).filter(models.User.username == "Centro_Budista").one()
    assert u.workspace_slug == "centrobudista"  # o `_slugify` apaga o `_`
    assert u.workspace_name == "Centro_Budista"


def test_endereco_reservado_ganha_sufixo(client, master_token, db_session):
    _criar_admin(client, master_token, "admin")
    u = db_session.query(models.User).filter(models.User.username == "admin").one()
    assert u.workspace_slug == "admin-2"


def test_endereco_ocupado_ganha_sufixo(client, master_token, db_session):
    primeiro = _criar_admin(client, master_token, "primeiro")
    r = client.patch("/api/admins/me/workspace",
                     json={"workspace_name": "X", "workspace_slug": "fulano"}, headers=_h(primeiro))
    assert r.status_code == 200, r.text
    _criar_admin(client, master_token, "fulano")
    u = db_session.query(models.User).filter(models.User.username == "fulano").one()
    assert u.workspace_slug == "fulano-2"


def test_moderador_ve_o_endereco_do_admin(client, admin_token, mod_token):
    """O moderador publica no workspace do admin; o endereço é o do admin,
    não o username do moderador."""
    admin = client.get("/api/auth/me", headers=_h(admin_token)).json()
    mod = client.get("/api/auth/me", headers=_h(mod_token)).json()
    assert mod["workspace_slug"] == admin["workspace_slug"] == "testadmin"


def test_me_nao_inventa_endereco(client, master_token, db_session):
    """Coluna vazia (admin antigo, antes da migration) devolve None — nunca um
    slug que a rota pública não acha."""
    token = _criar_admin(client, master_token, "antigo")
    db_session.execute(text("UPDATE users SET workspace_slug = NULL WHERE username = 'antigo'"))
    db_session.commit()
    me = client.get("/api/auth/me", headers=_h(token)).json()
    assert me["workspace_slug"] is None


# ── migration de preenchimento ────────────────────────────────────────────

def _migration():
    caminho = os.path.join(os.path.dirname(__file__), "..", "migrations", "versions",
                           "b2d9e6f1a4c7_backfill_workspace_slug.py")
    spec = importlib.util.spec_from_file_location("mig_132", caminho)
    mig = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mig)
    return mig


def test_migration_preenche_so_quem_esta_vazio(client, master_token, db_session):
    _criar_admin(client, master_token, "vazio")
    _criar_admin(client, master_token, "escolheu")
    db_session.execute(text(
        "UPDATE users SET workspace_slug = NULL, workspace_name = NULL WHERE username = 'vazio'"))
    db_session.execute(text(
        "UPDATE users SET workspace_slug = 'meu-acervo', workspace_name = 'Meu Acervo' "
        "WHERE username = 'escolheu'"))
    db_session.commit()

    mig = _migration()
    with db_session.bind.begin() as conn:
        assert mig.preencher(conn) == 1
    db_session.expire_all()

    vazio = db_session.query(models.User).filter(models.User.username == "vazio").one()
    escolheu = db_session.query(models.User).filter(models.User.username == "escolheu").one()
    assert (vazio.workspace_slug, vazio.workspace_name) == ("vazio", "vazio")
    assert (escolheu.workspace_slug, escolheu.workspace_name) == ("meu-acervo", "Meu Acervo")

    # idempotente: segunda rodada não acha ninguém
    with db_session.bind.begin() as conn:
        assert mig.preencher(conn) == 0


def test_migration_e_o_app_usam_a_mesma_regra():
    """A migration congela uma cópia da regra (não importa o app). Se as duas
    divergirem, admin antigo e admin novo ganham endereços por regras
    diferentes, e nada no sistema compara."""
    import main
    from auth import _slugify
    mig = _migration()
    assert mig.RESERVADOS == main._RESERVED_SLUGS
    for nome in ["budismopuc", "Centro_Budista", "  Joao  Silva ", "ab", "x" * 40, "çã"]:
        assert mig._slugify(nome) == _slugify(nome)


# ── publicar vazio ────────────────────────────────────────────────────────

def test_publicar_sem_tabela_nem_grafico_e_recusado(client, admin_token):
    r = client.post(
        "/api/publications/me/versions",
        json={"description": "vazia", "theme_config": {}, "table_selection": [], "charts": []},
        headers=_h(admin_token),
    )
    assert r.status_code == 400
    assert "tabela" in r.json()["detail"]
    assert client.get("/api/publications/me/versions", headers=_h(admin_token)).json() == []
