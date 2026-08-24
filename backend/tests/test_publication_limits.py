"""Tetos do snapshot publicado (1.3).

O teto por tabela subiu de 2.000 pra 10.000 e entrou um orçamento pro blob
inteiro. Os dois existem pela mesma razão: o snapshot é **um** JSON que o site
busca por completo a cada revalidação e que o ZIP carrega junto — sem teto, um
acervo grande derruba a página no ar em vez de degradar.

A regra que estes testes guardam é a da casa desde a M8.5 F3: **corte tem que
ser declarado**. `truncated`, `total_rows` e `budget_exceeded` são o que
impedem o site publicado de mostrar um recorte com cara de acervo inteiro.
"""
from __future__ import annotations

import pytest

import publication_storage


@pytest.fixture(autouse=True)
def _reset_storage():
    publication_storage._reset_local_store_for_tests()
    yield
    publication_storage._reset_local_store_for_tests()


def _auth(tok):
    return {"Authorization": f"Bearer {tok}"}


def test_teto_por_tabela_e_10k():
    """O número é decisão do Diretor (21/08), medida: ~491 bytes/linha no JSON
    do acervo real, então 10k ≈ 4,7 MB por tabela."""
    assert publication_storage.MAX_ROWS_PER_TABLE == 10_000


def test_existe_orcamento_pro_snapshot_inteiro():
    """Teto por tabela sozinho não segura o blob: 17 tabelas cheias dariam
    ~80 MB. O orçamento global é o que impede a página de ficar impraticável."""
    assert publication_storage.MAX_SNAPSHOT_BYTES >= 10 * 1024 * 1024
    assert publication_storage.MAX_SNAPSHOT_BYTES <= 100 * 1024 * 1024


def test_snapshot_declara_o_corte_por_tabela(client, admin_token, monkeypatch):
    """Acima do teto, o payload tem que dizer `truncated` E o total REAL.

    Mentir o `total_rows` seria pior que truncar: quem cita o acervo publicado
    citaria um tamanho que não existe.
    """
    # Teto minúsculo pro teste não precisar inserir 10 mil linhas.
    monkeypatch.setattr(publication_storage, "MAX_ROWS_PER_TABLE", 3)

    res = client.patch("/api/admins/me/workspace",
                       json={"workspace_name": "Acervo", "workspace_slug": "acervo"},
                       headers=_auth(admin_token))
    assert res.status_code == 200

    res = client.post("/tables/", json={
        "name": "grande",
        "columns": [{"name": "titulo", "data_type": "String", "is_nullable": True}],
    }, headers=_auth(admin_token))
    assert res.status_code == 200, res.text
    tid = res.json()["id"]

    for i in range(7):
        assert client.post("/api/grande", json={"titulo": f"item {i}"},
                           headers=_auth(admin_token)).status_code == 200

    res = client.post("/api/publications/me/versions", json={
        "description": "corte",
        "theme_config": {},
        "table_selection": [{"table_id": tid, "order": 0, "layout": "tabela"}],
    }, headers=_auth(admin_token))
    assert res.status_code == 200, res.text
    vid = res.json()["id"]
    assert client.post(f"/api/publications/me/versions/{vid}/activate",
                       headers=_auth(admin_token)).status_code == 200

    snap = client.get("/public/acervo/snapshot").json()
    tabela = snap["tables"][0]
    assert len(tabela["rows"]) == 3, "o teto tem que ser respeitado"
    assert tabela["truncated"] is True
    assert tabela["total_rows"] == 7, "o total precisa ser o REAL, não o truncado"


def test_orcamento_estourado_zera_as_linhas_e_declara(client, admin_token, monkeypatch):
    """Passado o orçamento do blob, a tabela entra sem linha — e com
    `budget_exceeded=True`, pra o corte nunca ser silencioso."""
    monkeypatch.setattr(publication_storage, "MAX_SNAPSHOT_BYTES", 1)  # estoura na 2ª

    assert client.patch("/api/admins/me/workspace",
                        json={"workspace_name": "Acervo", "workspace_slug": "acervo2"},
                        headers=_auth(admin_token)).status_code == 200

    ids = []
    for nome in ("uma", "outra"):
        res = client.post("/tables/", json={
            "name": nome,
            "columns": [{"name": "titulo", "data_type": "String", "is_nullable": True}],
        }, headers=_auth(admin_token))
        assert res.status_code == 200, res.text
        ids.append(res.json()["id"])
        assert client.post(f"/api/{nome}", json={"titulo": "x" * 50},
                           headers=_auth(admin_token)).status_code == 200

    res = client.post("/api/publications/me/versions", json={
        "description": "orcamento",
        "theme_config": {},
        "table_selection": [
            {"table_id": ids[0], "order": 0, "layout": "tabela"},
            {"table_id": ids[1], "order": 1, "layout": "tabela"},
        ],
    }, headers=_auth(admin_token))
    assert res.status_code == 200, res.text
    vid = res.json()["id"]
    assert client.post(f"/api/publications/me/versions/{vid}/activate",
                       headers=_auth(admin_token)).status_code == 200

    snap = client.get("/public/acervo2/snapshot").json()
    primeira, segunda = snap["tables"][0], snap["tables"][1]

    # A primeira entra inteira: o orçamento só é conferido DEPOIS de contabilizar.
    assert len(primeira["rows"]) == 1
    assert primeira["budget_exceeded"] is False
    # A segunda entra vazia, mas declarando — e o nome/colunas continuam lá,
    # pra o site poder dizer que a tabela existe.
    assert segunda["budget_exceeded"] is True
    assert segunda["rows"] == []
    assert segunda["name"] == "outra"
    assert len(segunda["columns"]) >= 1


def test_layout_tabela_e_aceito_e_e_o_default(client, admin_token):
    """`tabela` (1.3) é a grade interativa — filtro, paginação e Excel."""
    import schemas

    campo = schemas.TableSelectionItem.model_fields["layout"]
    assert campo.default == "tabela"

    assert client.patch("/api/admins/me/workspace",
                        json={"workspace_name": "A", "workspace_slug": "acervo3"},
                        headers=_auth(admin_token)).status_code == 200
    res = client.post("/tables/", json={
        "name": "coisas",
        "columns": [{"name": "titulo", "data_type": "String", "is_nullable": True}],
    }, headers=_auth(admin_token))
    tid = res.json()["id"]

    ok = client.post("/api/publications/me/versions", json={
        "description": None, "theme_config": {},
        "table_selection": [{"table_id": tid, "order": 0, "layout": "tabela"}],
    }, headers=_auth(admin_token))
    assert ok.status_code == 200, ok.text

    ruim = client.post("/api/publications/me/versions", json={
        "description": None, "theme_config": {},
        "table_selection": [{"table_id": tid, "order": 0, "layout": "planilha"}],
    }, headers=_auth(admin_token))
    assert ruim.status_code == 422, "layout fora da lista tem que ser recusado"
