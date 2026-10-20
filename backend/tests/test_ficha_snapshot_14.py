"""1.4 — ficha do registro: o snapshot carrega chave, título, rótulos,
colocação por coluna e as relações entre as tabelas publicadas.

Cenário espelha o acervo do budismopuc: `templo` e `personalidade` são abas,
`personalidade_templo` é a junção (com a coluna extra `funcao`) que só alimenta
fichas. As relações são declaradas como o import .sql declara (`many-to-one`).
"""
from __future__ import annotations

import pytest

import publication_storage


@pytest.fixture(autouse=True)
def _reset_storage():
    publication_storage._reset_local_store_for_tests()
    yield
    publication_storage._reset_local_store_for_tests()


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def _tabela(client, token, nome, colunas):
    r = client.post("/tables/", json={
        "name": nome, "is_public": False,
        "columns": [{"name": c, "data_type": t, "is_nullable": True} for c, t in colunas],
    }, headers=_h(token))
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _linha(client, token, tabela, dados):
    r = client.post(f"/api/{tabela}", json=dados, headers=_h(token))
    assert r.status_code == 200, r.text


def _relacao(client, token, de_id, de_col, para_id, para_col, tipo="many-to-one"):
    r = client.post("/api/relations", json={
        "name": f"{de_col}_rel", "from_table_id": de_id, "to_table_id": para_id,
        "relation_type": tipo, "from_column_name": de_col, "to_column_name": para_col,
    }, headers=_h(token))
    assert r.status_code == 200, r.text


@pytest.fixture
def acervo(client, admin_token):
    """templo(id, nome, escola) · personalidade(id, nome_personalidade, senha) ·
    personalidade_templo(id, pt_templo, pt_personalidade, funcao)."""
    t = _tabela(client, admin_token, "templo", [("nome", "String"), ("escola", "String")])
    p = _tabela(client, admin_token, "personalidade", [("nome_personalidade", "String"), ("senha", "String")])
    j = _tabela(client, admin_token, "personalidade_templo",
                [("pt_templo", "Integer"), ("pt_personalidade", "Integer"), ("funcao", "String")])
    _linha(client, admin_token, "templo", {"nome": "Templo Zu Lai", "escola": "Fo"})
    _linha(client, admin_token, "personalidade", {"nome_personalidade": "Monja Coen", "senha": "segredo-123"})
    _linha(client, admin_token, "personalidade_templo",
           {"pt_templo": 1, "pt_personalidade": 1, "funcao": "Fundadora"})
    _relacao(client, admin_token, j, "pt_templo", t, "id")
    _relacao(client, admin_token, j, "pt_personalidade", p, "id")
    return {"templo": t, "personalidade": p, "junção": j}


def _publicar(client, token, selecao, charts=None):
    r = client.post("/api/publications/me/versions", json={
        "description": "1.4", "theme_config": {}, "table_selection": selecao, "charts": charts or [],
    }, headers=_h(token))
    return r


def _snapshot_ativo(client, token, selecao):
    v = _publicar(client, token, selecao)
    assert v.status_code == 200, v.text
    a = client.post(f"/api/publications/me/versions/{v.json()['id']}/activate", headers=_h(token))
    assert a.status_code == 200, a.text
    slug = client.get("/api/auth/me", headers=_h(token)).json()["workspace_slug"]
    s = client.get(f"/public/{slug}/snapshot")
    assert s.status_code == 200, s.text
    return s.json()


def _por_nome(snap):
    return {t["name"]: t for t in snap["tables"]}


SELECAO = lambda a: [  # noqa: E731
    {"table_id": a["templo"], "order": 0, "layout": "tabela", "label": "Templos",
     "columns": [{"name": "nome", "label": "Nome"}, {"name": "escola", "label": "Escola / Tradição", "placement": "ficha"}]},
    {"table_id": a["personalidade"], "order": 1, "layout": "tabela", "label": "Personalidades",
     "columns": [{"name": "senha", "placement": "oculta"}]},
    {"table_id": a["junção"], "order": 2, "layout": "tabela", "role": "ficha",
     "columns": [{"name": "funcao", "label": "Função"}]},
]


# ── ida e volta: o Studio recupera o que configurou ───────────────────────

def test_config_ida_e_volta_pela_rota(client, admin_token, acervo):
    """Sem os campos no schema, o Pydantic descartava tudo calado e o
    LOAD_DRAFT seguinte trazia a versão sem a configuração."""
    _snapshot_ativo(client, admin_token, SELECAO(acervo))
    ativa = client.get("/api/publications/me/active", headers=_h(admin_token)).json()
    t0 = ativa["table_selection"][0]
    assert t0["label"] == "Templos"
    assert t0["columns"][1] == {"name": "escola", "label": "Escola / Tradição", "placement": "ficha"}
    assert ativa["table_selection"][2]["role"] == "ficha"


@pytest.mark.parametrize("campo,valor", [("role", "escondida"), ("placement", "talvez")])
def test_valor_invalido_e_422(client, admin_token, acervo, campo, valor):
    item = {"table_id": acervo["templo"], "order": 0, "layout": "tabela"}
    if campo == "role":
        item["role"] = valor
    else:
        item["columns"] = [{"name": "nome", "placement": valor}]
    assert _publicar(client, admin_token, [item]).status_code == 422


# ── o que o snapshot entrega ─────────────────────────────────────────────

def test_snapshot_resolve_chave_titulo_rotulos_e_relacoes(client, admin_token, acervo):
    snap = _snapshot_ativo(client, admin_token, SELECAO(acervo))
    t = _por_nome(snap)

    templo = t["templo"]
    assert templo["role"] == "aba" and templo["label"] == "Templos"
    assert templo["key_column"] == "id"
    assert templo["title_column"] == "nome"
    assert [(c["name"], c["label"], c["placement"]) for c in templo["columns"]] == [
        ("nome", "Nome", "grade"), ("escola", "Escola / Tradição", "ficha")]

    assert t["personalidade"]["title_column"] == "nome_personalidade"
    junc = t["personalidade_templo"]
    assert junc["role"] == "ficha" and junc["label"] == "personalidade_templo"
    # coluna fora da config vale `grade` com rótulo = nome (coluna nova nunca some)
    assert {c["name"]: c["placement"] for c in junc["columns"]}["pt_templo"] == "grade"

    assert sorted(snap["relations"], key=lambda r: r["from_column"]) == [
        {"from": "personalidade_templo", "from_column": "pt_personalidade", "to": "personalidade", "to_column": "id"},
        {"from": "personalidade_templo", "from_column": "pt_templo", "to": "templo", "to_column": "id"},
    ]


def test_oculta_some_de_colunas_e_linhas(client, admin_token, acervo):
    snap = _snapshot_ativo(client, admin_token, SELECAO(acervo))
    pers = _por_nome(snap)["personalidade"]
    assert "senha" not in [c["name"] for c in pers["columns"]]
    assert all("senha" not in linha for linha in pers["rows"])
    assert "segredo-123" not in str(snap)


def test_chave_e_ponta_de_relacao_ocultas_ficam_nas_linhas(client, admin_token, acervo):
    """Sem a chave e as pontas não há ligação: elas saem de `columns` (nada as
    exibe) mas continuam nas linhas."""
    sel = SELECAO(acervo)
    sel[2]["columns"] = [{"name": "pt_templo", "placement": "oculta"}]
    snap = _snapshot_ativo(client, admin_token, sel)
    junc = _por_nome(snap)["personalidade_templo"]
    assert "pt_templo" not in [c["name"] for c in junc["columns"]]
    assert junc["rows"][0]["pt_templo"] == 1


def test_titulo_configurado_oculto_cai_na_heuristica(client, admin_token, acervo):
    sel = SELECAO(acervo)
    sel[1]["title_column"] = "senha"
    snap = _snapshot_ativo(client, admin_token, sel)
    assert _por_nome(snap)["personalidade"]["title_column"] == "nome_personalidade"
    assert "segredo-123" not in str(snap)


def test_relacao_so_entre_tabelas_publicadas(client, admin_token, acervo):
    """Junção fora da seleção: a relação não tem como ser mostrada e não entra."""
    sel = SELECAO(acervo)[:2]
    snap = _snapshot_ativo(client, admin_token, sel)
    assert snap["relations"] == []


def test_one_to_many_sai_invertida_e_many_to_many_fica_fora(client, admin_token):
    pai = _tabela(client, admin_token, "escola", [("nome", "String")])
    filho = _tabela(client, admin_token, "aluno", [("nome", "String"), ("escola_id", "Integer")])
    _relacao(client, admin_token, pai, "id", filho, "escola_id", tipo="one-to-many")
    _relacao(client, admin_token, pai, "nome", filho, "nome", tipo="many-to-many")
    snap = _snapshot_ativo(client, admin_token, [
        {"table_id": pai, "order": 0}, {"table_id": filho, "order": 1}])
    assert snap["relations"] == [{"from": "aluno", "from_column": "escola_id", "to": "escola", "to_column": "id"}]
    assert _por_nome(snap)["aluno"]["key_column"] == "id"


def test_to_column_nulo_vira_a_chave_do_alvo(client, admin_token):
    """`REFERENCES t` sem coluna aponta pra PK; descartar calado publicava um
    site sem relacionado nenhum."""
    pai = _tabela(client, admin_token, "escola", [("nome", "String")])
    filho = _tabela(client, admin_token, "aluno", [("nome", "String"), ("escola_id", "Integer")])
    _relacao(client, admin_token, filho, "escola_id", pai, None)
    snap = _snapshot_ativo(client, admin_token, [
        {"table_id": pai, "order": 0}, {"table_id": filho, "order": 1}])
    assert snap["relations"] == [{"from": "aluno", "from_column": "escola_id", "to": "escola", "to_column": "id"}]


def test_preview_com_tabela_de_outro_tenant_nao_vaza_nome(client, master_token, admin_token, acervo):
    """O preview recebe `table_id` do cliente. A relação sai do conjunto que
    passou pelo filtro de owner — nunca dos ids crus."""
    r = client.post("/api/admins", json={"username": "outro", "password": "Senha123!", "role": "admin"},
                    headers=_h(master_token))
    assert r.status_code == 200, r.text
    b = "test-outro"
    x = _tabela(client, b, "segredo_alheio", [("nome", "String")])
    y = _tabela(client, b, "outro_alvo", [("nome", "String"), ("ref", "Integer")])
    _relacao(client, b, y, "ref", x, "id")

    prev = client.post("/api/publications/me/preview", json={"table_selection": [
        {"table_id": acervo["templo"], "order": 0}, {"table_id": x, "order": 1}, {"table_id": y, "order": 2},
    ]}, headers=_h(admin_token))
    assert prev.status_code == 200, prev.text
    corpo = prev.json()
    assert corpo["relations"] == []
    assert "segredo_alheio" not in str(corpo) and "outro_alvo" not in str(corpo)


def test_so_tabelas_ficha_sem_grafico_e_recusado(client, admin_token, acervo):
    r = _publicar(client, admin_token, [{"table_id": acervo["junção"], "order": 0, "role": "ficha"}])
    assert r.status_code == 400
    assert "aba" in r.json()["detail"]


def test_config_antiga_sai_igual_com_chaves_novas_em_padrao(client, admin_token, acervo):
    """Guarda de regressão (já passaria antes nas partes antigas): versão sem os
    campos novos mantém colunas, linhas e layout, e só ganha os padrões."""
    snap = _snapshot_ativo(client, admin_token, [{"table_id": acervo["templo"], "order": 0, "layout": "list"}])
    templo = _por_nome(snap)["templo"]
    assert templo["layout"] == "list"
    assert [c["name"] for c in templo["columns"]] == ["nome", "escola"]
    assert all(c["placement"] == "grade" and c["label"] == c["name"] for c in templo["columns"])
    assert templo["rows"][0]["nome"] == "Templo Zu Lai"
    assert templo["role"] == "aba" and templo["label"] == "templo"
