"""M8.5 F1 — Agregações server-side + views salvas.

Cobre as decisões do Diretor (2026-07-16) que viram comportamento observável:
- #3  endereço /api/views/me/* não é sombreado pela rota dinâmica
- #10 operações = count | count_distinct | sum | avg (min/max NÃO existem)
- #9  cardinalidade: top-N + "resto" + aviso dentro do dado
- #11 schema híbrido (campo próprio + pacote JSON validado na porta)
- #12 view é do workspace inteiro (mod usa; master 403)
- #13 (contrato) FK sem ondelete + cascade ORM limpa nos DOIS bancos

Os testes de divergência dev×prod (SUM sobre texto, ordenação de NULL) rodam
nos dois engines de propósito: é justamente onde SQLite e Postgres discordam.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import models


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _create_table(client, token, name="vendas"):
    res = client.post(
        "/tables/",
        json={
            "name": name,
            "description": "",
            "columns": [
                {"name": "regiao", "data_type": "String", "is_nullable": True},
                {"name": "vendedor", "data_type": "String", "is_nullable": True},
                {"name": "valor", "data_type": "Float", "is_nullable": True},
                {"name": "nota", "data_type": "String", "is_nullable": True},
            ],
        },
        headers=_auth(token),
    )
    assert res.status_code == 200, res.text
    return res.json()


def _seed(client, token, table="vendas"):
    """3 categorias grandes + 5 pequenas + 1 nula + 1 com métrica toda NULL."""
    rows = []
    rows += [{"regiao": "sul", "vendedor": "ana", "valor": 10.0, "nota": "x"}] * 10
    rows += [{"regiao": "norte", "vendedor": "bia", "valor": 5.0, "nota": "y"}] * 8
    rows += [{"regiao": "leste", "vendedor": "ana", "valor": 3.0, "nota": "z"}] * 6
    rows += [{"regiao": r, "vendedor": "caio", "valor": 1.0, "nota": "w"} for r in "abcde"]
    rows += [{"regiao": None, "vendedor": "dan", "valor": 7.0, "nota": "n"}]
    rows += [{"regiao": "oeste", "vendedor": "eva", "valor": None, "nota": "o"}] * 2
    for r in rows:
        res = client.post(f"/api/{table}", json=r, headers=_auth(token))
        assert res.status_code == 200, res.text
    return len(rows)


def _mkview(client, token, table_id, **over):
    body = {
        "table_id": table_id,
        "name": over.pop("name", "Vendas por região"),
        "group_by": over.pop("group_by", "regiao"),
        "operation": over.pop("operation", "count"),
        "metric_column": over.pop("metric_column", None),
        "config": over.pop("config", {}),
    }
    body.update(over)
    return client.post("/api/views/me", json=body, headers=_auth(token))


# --------------------------------------------------------------- guards

def test_master_cannot_use_views(client, master_token):
    """Decisão 15 do contrato: master não tem workspace (molde da Media Library)."""
    res = client.get("/api/views/me", headers=_auth(master_token))
    assert res.status_code == 403


def test_view_on_table_of_other_workspace_404(client, master_token, admin_token):
    """Escopo por identidade (owner_id), não por RLS."""
    t = _create_table(client, admin_token)
    res = client.post(
        "/api/admins",
        json={"username": "outro", "password": "Pwd12345!", "role": "admin"},
        headers=_auth(master_token),
    )
    assert res.status_code == 200, res.text
    res = _mkview(client, "test-outro", t["id"])
    assert res.status_code == 404


def test_moderator_can_use_views(client, admin_token, mod_token):
    """Decisão 12: a view é do workspace INTEIRO — mod usa e herda o owner."""
    t = _create_table(client, admin_token)
    res = _mkview(client, mod_token, t["id"])
    assert res.status_code == 200, res.text
    # A view nasce no workspace do admin (parent), não do mod.
    assert res.json()["owner_id"] != 0
    listed = client.get("/api/views/me", headers=_auth(admin_token)).json()
    assert len(listed) == 1, "admin tem que enxergar a view criada pelo mod"


# ------------------------------------------------- prova de tipo na porta

def test_sum_on_text_column_is_400(client, admin_token):
    """Decisão 10 / contrato 15. Medido: SUM sobre texto devolve
    [('a',12),('b',0.0)] no SQLite — verde e MENTIROSO — e 500 no Postgres.
    Barrar na porta mata os dois de uma vez."""
    t = _create_table(client, admin_token)
    res = _mkview(client, admin_token, t["id"], operation="sum", metric_column="nota")
    assert res.status_code == 400, res.text
    assert "numérica" in res.json()["detail"]


def test_min_max_do_not_exist(client, admin_token):
    """Decisão 10: min/max ficam FORA de propósito (MAX em booleana passa em
    dev e dá 500 em prod; MIN/MAX em texto dá eixo alfabético)."""
    t = _create_table(client, admin_token)
    res = _mkview(client, admin_token, t["id"], operation="max", metric_column="valor")
    assert res.status_code == 422, "o schema Pydantic barra antes do motor"


def test_group_by_internal_column_is_400(client, admin_token):
    """Contrato 5: id/tenant_id/mídia nunca são agrupáveis."""
    t = _create_table(client, admin_token)
    res = _mkview(client, admin_token, t["id"], group_by="id")
    assert res.status_code == 400, res.text


def test_count_rejects_metric_column(client, admin_token):
    t = _create_table(client, admin_token)
    res = _mkview(client, admin_token, t["id"], operation="count", metric_column="valor")
    assert res.status_code == 422


def test_sum_requires_metric_column(client, admin_token):
    t = _create_table(client, admin_token)
    res = _mkview(client, admin_token, t["id"], operation="sum")
    assert res.status_code == 422


# ------------------------------------------------------------ CRUD

def test_view_crud(client, admin_token):
    t = _create_table(client, admin_token)
    res = _mkview(client, admin_token, t["id"])
    assert res.status_code == 200, res.text
    vid = res.json()["id"]

    assert client.get(f"/api/views/me/{vid}", headers=_auth(admin_token)).status_code == 200

    upd = client.put(
        f"/api/views/me/{vid}",
        json={"name": "Soma por região", "group_by": "regiao", "operation": "sum",
              "metric_column": "valor", "config": {"top_n": 5}},
        headers=_auth(admin_token),
    )
    assert upd.status_code == 200, upd.text
    assert upd.json()["operation"] == "sum"
    assert upd.json()["config"]["top_n"] == 5

    assert client.delete(f"/api/views/me/{vid}", headers=_auth(admin_token)).status_code == 200
    assert client.get(f"/api/views/me/{vid}", headers=_auth(admin_token)).status_code == 404


def test_config_rejects_unknown_field(client, admin_token):
    """Decisão 11: o pacote JSON é ESTRITAMENTE validado na porta — o ganho do
    híbrido é a F2 crescer mudando o schema (código), não o banco."""
    t = _create_table(client, admin_token)
    res = _mkview(client, admin_token, t["id"], config={"inventado": 1})
    assert res.status_code == 422


def test_top_n_hard_cap(client, admin_token):
    """Decisão 9: teto DURO de 50."""
    t = _create_table(client, admin_token)
    assert _mkview(client, admin_token, t["id"], config={"top_n": 51}).status_code == 422
    assert _mkview(client, admin_token, t["id"], config={"top_n": 50}).status_code == 200


def test_max_4_slices(client, admin_token):
    """Contrato 11: 'A vs B' num request só, teto 4."""
    t = _create_table(client, admin_token)
    slices = [{"label": f"s{i}"} for i in range(5)]
    res = _mkview(client, admin_token, t["id"], config={"slices": slices})
    assert res.status_code == 422


def test_list_filters_by_table_id(client, admin_token):
    t1 = _create_table(client, admin_token, name="vendas")
    t2 = _create_table(client, admin_token, name="compras")
    _mkview(client, admin_token, t1["id"], name="v1")
    _mkview(client, admin_token, t2["id"], name="v2")
    got = client.get(f"/api/views/me?table_id={t1['id']}", headers=_auth(admin_token)).json()
    assert len(got) == 1 and got[0]["name"] == "v1"


# ------------------------------------------------------- colunas/preview

def test_aggregatable_columns(client, admin_token):
    t = _create_table(client, admin_token)
    res = client.get(f"/api/views/me/columns/{t['id']}", headers=_auth(admin_token))
    assert res.status_code == 200, res.text
    body = res.json()
    assert "id" not in body["groupable"], "PK não é agrupável"
    assert "tenant_id" not in body["groupable"]
    assert "regiao" in body["groupable"]
    assert body["summable"] == ["valor"], "só a coluna numérica é somável"
    assert "max" not in body["operations"]


def test_preview_without_saving(client, admin_token):
    """Espelha POST /api/publications/me/preview: mesmo motor do publish."""
    t = _create_table(client, admin_token)
    total = _seed(client, admin_token)
    res = client.post(
        "/api/views/me/preview",
        json={"table_id": t["id"], "group_by": "regiao", "operation": "count", "config": {}},
        headers=_auth(admin_token),
    )
    assert res.status_code == 200, res.text
    assert res.json()["series"][0]["source_row_count"] == total
    assert client.get("/api/views/me", headers=_auth(admin_token)).json() == [], \
        "preview não pode persistir nada"


# ------------------------------------------------------- dado agregado

def test_view_data_count(client, admin_token):
    t = _create_table(client, admin_token)
    total = _seed(client, admin_token)
    vid = _mkview(client, admin_token, t["id"], config={"top_n": 50}).json()["id"]

    res = client.get(f"/api/views/me/{vid}/data", headers=_auth(admin_token))
    assert res.status_code == 200, res.text
    s = res.json()["series"][0]
    assert s["source_row_count"] == total, "prova de honestidade: cobriu o dado completo"
    assert s["truncated"] is False
    assert sum(p["value"] for p in s["points"]) == total


def test_null_group_gets_own_label(client, admin_token):
    """Contrato 7: nulo é grupo PRÓPRIO, nunca zero."""
    t = _create_table(client, admin_token)
    _seed(client, admin_token)
    vid = _mkview(client, admin_token, t["id"], config={"top_n": 50}).json()["id"]
    s = client.get(f"/api/views/me/{vid}/data", headers=_auth(admin_token)).json()["series"][0]
    nulls = [p for p in s["points"] if p["is_null_group"]]
    assert len(nulls) == 1
    assert nulls[0]["category"] == "(sem valor)"


def test_null_metric_group_does_not_win_first_bar(client, admin_token):
    """Contrato 6 — a divergência que SÓ aparece em Postgres.

    Medido: `ORDER BY soma DESC LIMIT 1` devolve ('b',5) no SQLite e ('a',NULL)
    no Postgres, porque o PG ordena NULL como o MAIOR no DESC. Sem NULLS LAST
    explícito, em produção o grupo SEM DADO ganha a barra nº 1 e empurra o dado
    real pra fora — com o gate verde em dev. Este teste prende os dois.
    """
    t = _create_table(client, admin_token)
    _seed(client, admin_token)
    vid = _mkview(client, admin_token, t["id"], operation="sum", metric_column="valor",
                  config={"top_n": 50}).json()["id"]
    s = client.get(f"/api/views/me/{vid}/data", headers=_auth(admin_token)).json()["series"][0]
    assert s["points"][0]["value"] is not None, "grupo sem dado não pode abrir o gráfico"
    assert s["points"][-1]["category"] == "oeste", "grupo de soma NULL vai pro fim"


def test_rest_is_exact_for_sum(client, admin_token):
    """Decisão 9: o 'resto' sai exato, da MESMA consulta, sem 2ª passada."""
    t = _create_table(client, admin_token)
    _seed(client, admin_token)
    full_id = _mkview(client, admin_token, t["id"], name="full", operation="sum",
                      metric_column="valor", config={"top_n": 50}).json()["id"]
    cut_id = _mkview(client, admin_token, t["id"], name="cut", operation="sum",
                     metric_column="valor", config={"top_n": 3}).json()["id"]

    full = client.get(f"/api/views/me/{full_id}/data", headers=_auth(admin_token)).json()["series"][0]
    cut = client.get(f"/api/views/me/{cut_id}/data", headers=_auth(admin_token)).json()["series"][0]

    assert cut["truncated"] is True
    assert cut["cardinality"] == len(full["points"])
    top_cats = {p["category"] for p in cut["points"]}
    real = sum((p["sum"] or 0.0) for p in full["points"] if p["category"] not in top_cats)
    assert cut["rest"]["exact"] is True
    assert abs(cut["rest"]["value"] - real) < 1e-9
    assert cut["rest"]["categories_merged"] == cut["cardinality"] - len(cut["points"])


def test_rest_is_exact_for_avg(client, admin_token):
    """O denominador assassino: PREENCHIDOS, não linhas. Com o denominador
    errado a média do resto erra na 2ª casa, em silêncio."""
    t = _create_table(client, admin_token)
    _seed(client, admin_token)
    full_id = _mkview(client, admin_token, t["id"], name="full", operation="avg",
                      metric_column="valor", config={"top_n": 50}).json()["id"]
    cut_id = _mkview(client, admin_token, t["id"], name="cut", operation="avg",
                     metric_column="valor", config={"top_n": 3}).json()["id"]
    full = client.get(f"/api/views/me/{full_id}/data", headers=_auth(admin_token)).json()["series"][0]
    cut = client.get(f"/api/views/me/{cut_id}/data", headers=_auth(admin_token)).json()["series"][0]

    top_cats = {p["category"] for p in cut["points"]}
    tail = [p for p in full["points"] if p["category"] not in top_cats]
    real_sum = sum((p["sum"] or 0.0) for p in tail)
    real_n = sum(p["n"] for p in tail)
    assert abs(cut["rest"]["value"] - real_sum / real_n) < 1e-9
    # e o denominador errado daria outro número
    assert abs(real_sum / cut["rest"]["n_rows"] - real_sum / real_n) > 1e-9


def test_rest_for_count_distinct_refuses_to_invent_a_number(client, admin_token):
    """Achado CODANDO, corrigindo o detalhamento: count_distinct NÃO é somável.

    Somar os distintos-por-grupo das categorias cortadas conta em dobro quem
    aparece em mais de um grupo — a barra do resto sairia inflada com cara de
    verdade. A decisão 9 afirmou que só min/max seriam não-deriváveis; está
    errado. Versão honesta: valor nulo + exact=False + motivo, mantendo o aviso
    de quantas categorias foram fundidas.
    """
    t = _create_table(client, admin_token)
    _seed(client, admin_token)
    vid = _mkview(client, admin_token, t["id"], operation="count_distinct",
                  metric_column="vendedor", config={"top_n": 3}).json()["id"]
    s = client.get(f"/api/views/me/{vid}/data", headers=_auth(admin_token)).json()["series"][0]
    assert s["truncated"] is True
    assert s["rest"]["value"] is None, "não inventa número pro resto de distinct"
    assert s["rest"]["exact"] is False
    assert s["rest"]["inexact_reason"]
    assert s["rest"]["categories_merged"] > 0, "mas ainda avisa quantas cortou"


def test_a_vs_b_in_one_request(client, admin_token):
    """Contrato 11: 1 request = 1 transação = 1 ponto no tempo."""
    t = _create_table(client, admin_token)
    _seed(client, admin_token)
    vid = _mkview(client, admin_token, t["id"], config={"top_n": 50, "slices": [
        {"label": "A: ana", "filter_col": "vendedor", "filter_val": "ana"},
        {"label": "B: bia", "filter_col": "vendedor", "filter_val": "bia"},
    ]}).json()["id"]
    series = client.get(f"/api/views/me/{vid}/data", headers=_auth(admin_token)).json()["series"]
    assert len(series) == 2
    assert series[0]["label"] == "A: ana" and series[0]["source_row_count"] == 16
    assert series[1]["label"] == "B: bia" and series[1]["source_row_count"] == 8


# -------------------------------------------------------- ciclo de vida

def test_deleting_table_deletes_its_views(client, admin_token, db_session):
    """Contrato 13: FK SEM ondelete + cascade ORM — o ÚNICO desenho que limpa
    nos dois bancos (SQLite não enforce FK: sem PRAGMA foreign_keys, um
    ondelete=CASCADE seria no-op em dev e só funcionaria em prod)."""
    t = _create_table(client, admin_token)
    _mkview(client, admin_token, t["id"])
    assert db_session.query(models.DynamicView).count() == 1

    res = client.delete(f"/tables/{t['id']}", params={"confirm_name": "vendas"},
                        headers=_auth(admin_token))
    assert res.status_code == 200, res.text
    db_session.expire_all()
    assert db_session.query(models.DynamicView).count() == 0, "view órfã sobreviveu ao delete"
