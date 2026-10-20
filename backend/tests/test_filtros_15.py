"""1.5 (fatia 1) — busca como a do site antigo: filtro por coluna, ordem por
nome do registro e subtítulo da tabela no snapshot.

O site antigo filtra por lista (Público-Alvo, Gênero), por data "a partir de" e
"até", e lista em ordem alfabética. Aqui o filtro é escolha explícita por coluna
(`texto | lista | data | nenhum`): sem config, a listagem segue com caixa de
texto e a ficha sem filtro — site publicado não muda sem alguém escolher.
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


@pytest.fixture
def templo(client, admin_token):
    r = client.post("/tables/", json={
        "name": "templo", "is_public": False, "description": "Pesquise ou filtre os templos.",
        "columns": [
            {"name": "nome", "data_type": "String", "is_nullable": True},
            {"name": "publico_alvo", "data_type": "String", "is_nullable": True},
            {"name": "abertura", "data_type": "Date", "is_nullable": True},
            {"name": "estado", "data_type": "String", "is_nullable": True},
        ],
    }, headers=_h(admin_token))
    assert r.status_code == 200, r.text
    for nome, alvo, data, uf in [
        ("Zendo Brasil", "Conversão", "1975-01-01", "SP"),
        ("Águia Dourada", "Misto", None, "RS"),
        ("busshinji", "Étnico", "1955-06-10", "SP"),
    ]:
        x = client.post("/api/templo", json={"nome": nome, "publico_alvo": alvo, "abertura": data, "estado": uf},
                        headers=_h(admin_token))
        assert x.status_code == 200, x.text
    return r.json()["id"]


def _snapshot(client, token, item):
    v = client.post("/api/publications/me/versions", json={
        "description": "1.5", "theme_config": {}, "table_selection": [item], "charts": [],
    }, headers=_h(token))
    if v.status_code != 200:
        return v
    a = client.post(f"/api/publications/me/versions/{v.json()['id']}/activate", headers=_h(token))
    assert a.status_code == 200, a.text
    slug = client.get("/api/auth/me", headers=_h(token)).json()["workspace_slug"]
    return client.get(f"/public/{slug}/snapshot").json()["tables"][0]


def test_filtro_resolvido_por_coluna_e_volta_pro_studio(client, admin_token, templo):
    t = _snapshot(client, admin_token, {
        "table_id": templo, "order": 0, "layout": "tabela",
        "columns": [
            {"name": "publico_alvo", "filter": "lista"},
            {"name": "abertura", "filter": "data"},
            {"name": "estado", "placement": "ficha"},
        ],
    })
    filtros = {c["name"]: c["filter"] for c in t["columns"]}
    # sem config: listagem = texto, ficha = nenhum
    assert filtros == {"nome": "texto", "publico_alvo": "lista", "abertura": "data", "estado": "nenhum"}
    ativa = client.get("/api/publications/me/active", headers=_h(admin_token)).json()
    assert {c["name"]: c.get("filter") for c in ativa["table_selection"][0]["columns"]}["abertura"] == "data"


def test_filtro_de_data_em_coluna_de_texto_e_422(client, admin_token, templo):
    r = _snapshot(client, admin_token, {
        "table_id": templo, "order": 0, "columns": [{"name": "estado", "filter": "data"}],
    })
    assert r.status_code == 422
    assert "estado" in r.json()["detail"]


def test_filtro_invalido_e_422(client, admin_token, templo):
    r = _snapshot(client, admin_token, {
        "table_id": templo, "order": 0, "columns": [{"name": "estado", "filter": "talvez"}],
    })
    assert r.status_code == 422


def test_ordem_por_titulo_ignora_acento_e_caixa(client, admin_token, templo):
    t = _snapshot(client, admin_token, {"table_id": templo, "order": 0, "sort": "titulo"})
    assert [r["nome"] for r in t["rows"]] == ["Águia Dourada", "busshinji", "Zendo Brasil"]
    assert t["sort"] == "titulo"


def test_ordem_padrao_continua_a_do_banco(client, admin_token, templo):
    t = _snapshot(client, admin_token, {"table_id": templo, "order": 0})
    assert [r["nome"] for r in t["rows"]] == ["Zendo Brasil", "Águia Dourada", "busshinji"]
    assert t["sort"] == "banco"


def test_subtitulo_e_curado_na_publicacao_e_a_descricao_interna_nao_vaza(client, admin_token, templo):
    """A `_tables.description` é interna (o import grava "Importado de <arquivo>"
    nela e nenhuma tela edita). O subtítulo do site é opt-in, na publicação."""
    t = _snapshot(client, admin_token, {"table_id": templo, "order": 0})
    assert t["subtitle"] is None
    assert "description" not in t and "Pesquise ou filtre os templos." not in str(t)
    t = _snapshot(client, admin_token, {"table_id": templo, "order": 0, "subtitle": " Explore os templos. "})
    assert t["subtitle"] == "Explore os templos."


def test_filtro_de_data_com_valor_fora_de_iso_e_422(client, admin_token):
    """Rótulo `Date` não garante ISO: o import de CSV grava "13/09/2025" como
    veio. O de/até compara AAAA-MM-DD; valor fora disso sairia calado."""
    r = client.post("/tables/", json={"name": "evento", "is_public": False, "columns": [
        {"name": "nome", "data_type": "String", "is_nullable": True},
        {"name": "dia", "data_type": "Date", "is_nullable": True}]}, headers=_h(admin_token))
    assert r.status_code == 200, r.text
    for nome, dia in [("a", "2025-09-13"), ("b", "13/09/2025")]:
        assert client.post("/api/evento", json={"nome": nome, "dia": dia}, headers=_h(admin_token)).status_code == 200
    resp = _snapshot(client, admin_token, {"table_id": r.json()["id"], "order": 0,
                                           "columns": [{"name": "dia", "filter": "data"}]})
    assert resp.status_code == 422
    assert "13/09/2025" in resp.json()["detail"] and "1 valor" in resp.json()["detail"]


def test_ordem_por_titulo_numerico_e_numerica(client, admin_token):
    r = client.post("/tables/", json={"name": "lote", "is_public": False, "columns": [
        {"name": "numero", "data_type": "Integer", "is_nullable": True}]}, headers=_h(admin_token))
    for n in (10, 2, 1):
        client.post("/api/lote", json={"numero": n}, headers=_h(admin_token))
    t = _snapshot(client, admin_token, {"table_id": r.json()["id"], "order": 0, "sort": "titulo", "title_column": "numero"})
    assert [l["numero"] for l in t["rows"]] == [1, 2, 10]


def test_ordem_por_titulo_que_e_fk_segue_o_nome_do_alvo(client, admin_token):
    """Título FK: a célula mostra o nome do registro apontado, então a ordem
    é por esse nome, não pelo id."""
    esc = client.post("/tables/", json={"name": "escola", "is_public": False, "columns": [
        {"name": "nome", "data_type": "String", "is_nullable": True}]}, headers=_h(admin_token)).json()["id"]
    alu = client.post("/tables/", json={"name": "matricula", "is_public": False, "columns": [
        {"name": "escola_id", "data_type": "Integer", "is_nullable": True}]}, headers=_h(admin_token)).json()["id"]
    for nome in ("Zen", "Agon"):          # id 1 = Zen, id 2 = Agon
        client.post("/api/escola", json={"nome": nome}, headers=_h(admin_token))
    for eid in (1, 2):
        client.post("/api/matricula", json={"escola_id": eid}, headers=_h(admin_token))
    rel = client.post("/api/relations", json={"name": "m_e", "from_table_id": alu, "to_table_id": esc,
                                             "relation_type": "many-to-one", "from_column_name": "escola_id",
                                             "to_column_name": "id"}, headers=_h(admin_token))
    assert rel.status_code == 200, rel.text
    v = client.post("/api/publications/me/versions", json={"description": "x", "theme_config": {}, "charts": [],
        "table_selection": [
            {"table_id": esc, "order": 0},
            {"table_id": alu, "order": 1, "sort": "titulo", "title_column": "escola_id"}]}, headers=_h(admin_token))
    assert v.status_code == 200, v.text
    client.post(f"/api/publications/me/versions/{v.json()['id']}/activate", headers=_h(admin_token))
    slug = client.get("/api/auth/me", headers=_h(admin_token)).json()["workspace_slug"]
    mat = [t for t in client.get(f"/public/{slug}/snapshot").json()["tables"] if t["name"] == "matricula"][0]
    assert [l["escola_id"] for l in mat["rows"]] == [2, 1]   # Agon antes de Zen


def test_ordem_das_colunas_segue_a_config_completa(client, admin_token, templo):
    """O banco tem nome, publico_alvo, abertura, estado. Com a lista inteira (o
    que o Studio manda), a ordem da config manda."""
    t = _snapshot(client, admin_token, {
        "table_id": templo, "order": 0,
        "columns": [{"name": "estado"}, {"name": "abertura"}, {"name": "nome"}, {"name": "publico_alvo"}],
    })
    assert [c["name"] for c in t["columns"]] == ["estado", "abertura", "nome", "publico_alvo"]


def test_config_parcial_nao_reordena(client, admin_token, templo):
    """Configurar o filtro de UMA coluna pela API não pode fazê-la pular pra
    frente da grade."""
    t = _snapshot(client, admin_token, {
        "table_id": templo, "order": 0, "columns": [{"name": "abertura", "filter": "data"}],
    })
    assert [c["name"] for c in t["columns"]] == ["nome", "publico_alvo", "abertura", "estado"]
