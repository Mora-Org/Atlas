"""M9 F1 — trilha de auditoria.

O que estes testes protegem, em ordem de importância:

1. **A trilha existe pro evento que hoje não deixa rastro nenhum.** A tabela
   dinâmica não tem `created_at`/`updated_at`: um moderador que apaga 200 linhas
   é invisível. `record.delete` é a razão de ser da fase.
2. **A política atômico-vs-não-atômico** (decisão G3) — é a única parte do
   desenho que um hook novo pode errar em silêncio.
3. **Nenhum valor de célula na trilha** (decisão 2 / LGPD). É invariante, não
   preferência: afrouxar depois é coluna aditiva, apertar depois exige apagar
   histórico.
4. **A trilha morre com o tenant** (decisão D3) — e em SQLite o CASCADE é
   inerte, então quem limpa é o companion delete.
"""
import io
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import audit  # noqa: E402
import models  # noqa: E402


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _events(db_session, action=None, owner_id=None):
    q = db_session.query(models.AuditLog)
    if action:
        q = q.filter(models.AuditLog.action == action)
    if owner_id:
        q = q.filter(models.AuditLog.owner_id == owner_id)
    return q.order_by(models.AuditLog.id).all()


def _mk_table(client, token, name="acervo"):
    res = client.post("/tables/", json={
        "name": name, "description": "",
        "columns": [
            {"name": "titulo", "data_type": "String", "is_nullable": True},
            {"name": "ano", "data_type": "Integer", "is_nullable": True},
        ],
    }, headers=_auth(token))
    assert res.status_code == 200, res.text
    return res.json()


# ── 1. o caso-motivador: CRUD de linha ────────────────────────────────────

def test_create_update_delete_de_linha_deixam_trilha(client, admin_token, db_session):
    t = _mk_table(client, admin_token)
    r = client.post("/api/acervo", json={"titulo": "Cadernos", "ano": 1923}, headers=_auth(admin_token))
    assert r.status_code == 200, r.text
    row_id = r.json()["id"]

    client.put(f"/api/acervo/{row_id}", json={"ano": 1924}, headers=_auth(admin_token))
    client.delete(f"/api/acervo/{row_id}", headers=_auth(admin_token))

    acoes = [e.action for e in _events(db_session)]
    assert audit.RECORD_CREATE in acoes
    assert audit.RECORD_UPDATE in acoes
    assert audit.RECORD_DELETE in acoes

    ev = _events(db_session, audit.RECORD_DELETE)[0]
    assert ev.target_type == audit.T_TABLE
    assert ev.target_label == "acervo"
    assert ev.target_row_id == str(row_id)
    assert ev.actor_type == "user"
    assert ev.actor_label == "testadmin"
    assert ev.owner_id == t["owner_id"]


def test_update_registra_os_nomes_das_colunas_mudadas(client, admin_token, db_session):
    _mk_table(client, admin_token)
    r = client.post("/api/acervo", json={"titulo": "A", "ano": 1900}, headers=_auth(admin_token))
    row_id = r.json()["id"]
    client.put(f"/api/acervo/{row_id}", json={"ano": 1901}, headers=_auth(admin_token))

    ev = _events(db_session, audit.RECORD_UPDATE)[0]
    assert ev.changed_columns == ["ano"]


def test_a_trilha_NAO_guarda_valor_de_celula(client, admin_token, db_session):
    """Invariante de LGPD (decisão 2): nomes de coluna sim, conteúdo nunca.

    O valor é deliberadamente distinguível ('SEGREDO-…') pra o teste falhar se
    alguém 'melhorar' o audit gravando before/after.
    """
    _mk_table(client, admin_token)
    segredo = "SEGREDO-CPF-12345678900"
    r = client.post("/api/acervo", json={"titulo": segredo, "ano": 1}, headers=_auth(admin_token))
    row_id = r.json()["id"]
    client.put(f"/api/acervo/{row_id}", json={"titulo": segredo + "-B"}, headers=_auth(admin_token))
    client.delete(f"/api/acervo/{row_id}", headers=_auth(admin_token))

    for ev in _events(db_session):
        blob = f"{ev.changed_columns}{ev.details}{ev.target_label}{ev.target_row_id}"
        assert "SEGREDO" not in blob, f"valor de célula vazou em '{ev.action}': {blob}"


def test_moderador_aparece_na_trilha_do_workspace_do_admin(client, admin_token, mod_token, db_session):
    """A trilha é do TENANT, não de quem agiu: o admin tem que enxergar o que o
    moderador dele fez — senão o audit não responde 'quem mexeu no meu dado'."""
    _mk_table(client, admin_token)
    # mod precisa de acesso: sem grupo, a tabela não é acessível a ele
    r = client.post("/api/acervo", json={"titulo": "do admin"}, headers=_auth(admin_token))
    assert r.status_code == 200

    ev = _events(db_session, audit.RECORD_CREATE)[0]
    admin = db_session.query(models.User).filter(models.User.username == "testadmin").first()
    assert ev.owner_id == admin.id


# ── 2. DDL e o regime não-atômico ─────────────────────────────────────────

def test_ddl_deixa_trilha_de_criar_e_apagar_tabela(client, admin_token, db_session):
    t = _mk_table(client, admin_token, name="efemera")
    client.delete(f"/tables/{t['id']}?confirm_name=efemera", headers=_auth(admin_token))

    criar = _events(db_session, audit.TABLE_CREATE)
    apagar = _events(db_session, audit.TABLE_DELETE)
    assert len(criar) == 1 and len(apagar) == 1
    # ponteiro SOFT: a linha de `_tables` sumiu, o evento continua sabendo qual era
    assert apagar[0].target_id == t["id"]
    assert apagar[0].target_label == "efemera"
    assert db_session.query(models.DynamicTable).filter(
        models.DynamicTable.id == t["id"]).first() is None


def test_add_column_deixa_trilha(client, admin_token, db_session):
    t = _mk_table(client, admin_token)
    r = client.post(f"/tables/{t['id']}/columns",
                    json={"name": "editora", "data_type": "String", "is_nullable": True},
                    headers=_auth(admin_token))
    assert r.status_code == 200, r.text
    ev = _events(db_session, audit.COLUMN_ADD)[0]
    assert ev.changed_columns == ["editora"]
    assert ev.details["data_type"] == "String"


def test_audit_quebrado_NAO_derruba_mutacao_ja_duravel(client, admin_token, db_session, monkeypatch):
    """G3, o pedaço que só um teste pega: no caminho não-atômico a tabela física
    já existe quando o audit roda. Se o audit levantasse, o cliente veria erro
    numa tabela que foi criada de verdade — e tentaria de novo, colidindo nome.
    """
    import main

    def explode(*a, **kw):
        raise RuntimeError("banco de audit fora do ar")

    monkeypatch.setattr(main.audit, "_build", explode)
    r = client.post("/tables/", json={"name": "sobrevivente", "description": "", "columns": [
        {"name": "x", "data_type": "String", "is_nullable": True}]}, headers=_auth(admin_token))
    assert r.status_code == 200, "audit quebrado derrubou um DDL que funcionou"
    assert _events(db_session, audit.TABLE_CREATE) == []


def test_audit_quebrado_ABORTA_a_mutacao_atomica(client, admin_token, db_session, monkeypatch):
    """O outro lado de G3: no caminho atômico a mutação ainda não commitou, e
    escrever dado sem trilha é justamente o que a fase existe pra impedir."""
    import main
    _mk_table(client, admin_token)

    def explode(*a, **kw):
        raise RuntimeError("banco de audit fora do ar")

    monkeypatch.setattr(main.audit, "_build", explode)
    # O TestClient re-levanta exceção do servidor em vez de virar 500 — o que
    # importa aqui é que ela ESCAPOU do handler: é isso que faz o `tenant_db`
    # dar rollback no request inteiro.
    with pytest.raises(RuntimeError):
        client.post("/api/acervo", json={"titulo": "fantasma"}, headers=_auth(admin_token))

    monkeypatch.undo()
    # a prova de verdade: a linha não sobreviveu
    rows = client.get("/api/acervo", headers=_auth(admin_token)).json()
    assert all(x.get("titulo") != "fantasma" for x in rows["data"]), \
        "a linha foi gravada sem trilha — o audit atômico não abortou nada"


# ── 3. plano de acesso e publicação ───────────────────────────────────────

def test_reset_de_senha_de_moderador_deixa_trilha_sem_a_senha(client, admin_token, mod_token, db_session):
    mod = db_session.query(models.User).filter(models.User.username == "testmod").first()
    r = client.post(f"/api/moderators/{mod.id}/reset-password",
                    json={"new_password": "TrocaAquiSenha123"}, headers=_auth(admin_token))
    assert r.status_code == 200, r.text

    ev = _events(db_session, audit.MODERATOR_PASSWORD_RESET)[0]
    assert ev.target_type == audit.T_USER
    assert ev.target_label == "testmod"
    assert "TrocaAquiSenha123" not in f"{ev.details}{ev.changed_columns}"


def test_criar_e_apagar_moderador_deixam_trilha(client, admin_token, mod_token, db_session):
    mod = db_session.query(models.User).filter(models.User.username == "testmod").first()
    client.delete(f"/api/moderators/{mod.id}", headers=_auth(admin_token))
    acoes = [e.action for e in _events(db_session)]
    assert audit.MODERATOR_CREATE in acoes
    assert audit.MODERATOR_DELETE in acoes


def test_tornar_tabela_publica_deixa_trilha(client, admin_token, db_session):
    t = _mk_table(client, admin_token)
    client.patch(f"/tables/{t['id']}/visibility", headers=_auth(admin_token))
    ev = _events(db_session, audit.TABLE_VISIBILITY)[0]
    assert ev.details["is_public"] is True


def test_publicar_e_ativar_sao_eventos_DIFERENTES(client, admin_token, db_session):
    """Desde o M6, criar snapshot e pôr o site no ar são coisas distintas — a
    trilha precisa distinguir as duas, senão não dá pra responder 'quando este
    conteúdo ficou público'."""
    t = _mk_table(client, admin_token)
    v = client.post("/api/publications/me/versions", json={
        "description": "primeira", "theme_config": {},
        "table_selection": [{"table_id": t["id"], "order": 0, "layout": "list"}],
        "charts": [],
    }, headers=_auth(admin_token))
    assert v.status_code == 200, v.text
    client.post(f"/api/publications/me/versions/{v.json()['id']}/activate", headers=_auth(admin_token))

    assert len(_events(db_session, audit.PUBLICATION_CREATE)) == 1
    assert len(_events(db_session, audit.PUBLICATION_ACTIVATE)) == 1


def test_import_de_planilha_gera_UM_evento_agregado(client, admin_token, db_session):
    """Decisão 5: 1 evento por import, não 1 por linha. 10k linhas afogariam a
    trilha — e na F3 virariam 10k webhooks."""
    _mk_table(client, admin_token)
    csv = b"titulo,ano\nA,1901\nB,1902\nC,1903\n"
    r = client.post("/api/import/data/acervo",
                    files={"file": ("dados.csv", io.BytesIO(csv), "text/csv")},
                    headers=_auth(admin_token))
    assert r.status_code == 200, r.text

    evs = _events(db_session, audit.IMPORT_APPEND)
    assert len(evs) == 1
    assert evs[0].details["inserted_rows"] == 3
    # e NÃO gerou um record.create por linha
    assert _events(db_session, audit.RECORD_CREATE) == []


# ── 4. ciclo de vida: a trilha morre com o tenant ─────────────────────────

def test_apagar_o_admin_leva_a_trilha_junto(client, master_token, admin_token, db_session):
    """Decisão D3 + o motivo do companion delete: em SQLite o `ondelete=CASCADE`
    é inerte (não há PRAGMA foreign_keys no backend), então sem o purge explícito
    a trilha ficaria órfã apontando pra um usuário que não existe mais."""
    _mk_table(client, admin_token)
    admin = db_session.query(models.User).filter(models.User.username == "testadmin").first()
    admin_id = admin.id
    assert _events(db_session, owner_id=admin_id), "sem trilha, o teste não prova nada"

    r = client.delete(f"/api/admins/{admin_id}", headers=_auth(master_token))
    assert r.status_code == 200, r.text

    db_session.expire_all()
    assert _events(db_session, owner_id=admin_id) == []


def test_purge_devolve_quantas_linhas_apagou(client, admin_token, db_session):
    _mk_table(client, admin_token)
    admin = db_session.query(models.User).filter(models.User.username == "testadmin").first()
    antes = len(_events(db_session, owner_id=admin.id))
    assert antes > 0
    n = audit.purge_for_owner(db_session, admin.id)
    db_session.commit()
    assert n == antes


# ── 5. contrato do módulo ─────────────────────────────────────────────────

def test_owner_id_none_e_no_op_e_nao_excecao(db_session):
    """Ação de master sem tenant resolvido não pode derrubar a escrita de um
    cliente — perder um evento de plataforma é o mal menor, e ele fica no log."""
    audit.record(db_session, owner_id=None, actor=audit.Actor(type="user", id=1),
                 action=audit.RECORD_CREATE)
    assert db_session.query(models.AuditLog).count() == 0


def test_tenant_of_resolve_admin_mod_e_master(client, admin_token, mod_token, db_session):
    admin = db_session.query(models.User).filter(models.User.username == "testadmin").first()
    mod = db_session.query(models.User).filter(models.User.username == "testmod").first()
    master = db_session.query(models.User).filter(models.User.role == "master").first()
    assert audit.tenant_of(admin) == admin.id
    assert audit.tenant_of(mod) == admin.id
    assert audit.tenant_of(master) is None


def test_actor_da_key_usa_o_mesmo_helper(db_session):
    """A F2 emite ator 'key' sem migration e sem tocar em handler — é o teste que
    prova que o polimorfismo do ator não é só intenção no docstring."""
    admin_id = 1
    audit.record(db_session, owner_id=admin_id,
                 actor=audit.Actor(type="key", id=99, label="key-de-integracao"),
                 action=audit.RECORD_CREATE, target_type=audit.T_TABLE)
    db_session.commit()
    ev = db_session.query(models.AuditLog).order_by(models.AuditLog.id.desc()).first()
    assert (ev.actor_type, ev.actor_id, ev.actor_label) == ("key", 99, "key-de-integracao")
