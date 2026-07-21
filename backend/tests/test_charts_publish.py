"""M8.5 F2.1 — gráficos congelados no snapshot.

Cobre as decisões do Diretor (2026-07-17):
- G0: o gráfico é REFERÊNCIA a uma view salva (`view_id`)
- D1: SVG puro gerado no publish (sem browser)
- #8: fonte = `table_selection` ∪ `is_public`, **cross-owner** (o Diretor
      segurou esse escopo em vez de estreitar pra owner-only)
- D4: só barra
- G4: gráfico quebrado NUNCA derruba o publish

Inclui o **teste de invariante da GUC** que o cético do detalhamento marcou
como gate da #8: o motor tem que devolver as MESMAS linhas com `tenant_db`
(GUC setado) e com `get_db` (sem GUC). Todo o "preview==publish" descansa
nesse invariante, que até agora nunca foi afirmado — é a classe exata do bug
"verde-no-dev-errado-no-prod" da F1.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import models

IS_POSTGRES = os.environ.get("DATABASE_URL", "").startswith("postgres")


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
            ],
        },
        headers=_auth(token),
    )
    assert res.status_code == 200, res.text
    return res.json()


def _seed(client, token, table="vendas"):
    rows = []
    rows += [{"regiao": "sul", "vendedor": "ana", "valor": 10.0}] * 6
    rows += [{"regiao": "norte", "vendedor": "bia", "valor": 5.0}] * 4
    rows += [{"regiao": "leste", "vendedor": "ana", "valor": 3.0}] * 2
    for r in rows:
        assert client.post(f"/api/{table}", json=r, headers=_auth(token)).status_code == 200
    return len(rows)


def _mkview(client, token, table_id, **over):
    body = {
        "table_id": table_id,
        "name": over.pop("name", "Por região"),
        "group_by": over.pop("group_by", "regiao"),
        "operation": over.pop("operation", "count"),
        "metric_column": over.pop("metric_column", None),
        "config": over.pop("config", {}),
    }
    body.update(over)
    res = client.post("/api/views/me", json=body, headers=_auth(token))
    assert res.status_code == 200, res.text
    return res.json()


def _preview(client, token, table_selection, charts):
    return client.post(
        "/api/publications/me/preview",
        json={"table_selection": table_selection, "charts": charts},
        headers=_auth(token),
    )


# ------------------------------------------------------------ congelamento

def test_chart_is_frozen_as_svg_in_snapshot(client, admin_token):
    """D1: o publish congela o gráfico como STRING SVG no blob."""
    t = _create_table(client, admin_token)
    _seed(client, admin_token)
    v = _mkview(client, admin_token, t["id"])

    res = _preview(client, admin_token,
                   [{"table_id": t["id"], "order": 0, "layout": "list"}],
                   [{"view_id": v["id"], "title": "Vendas por região"}])
    assert res.status_code == 200, res.text
    payload = res.json()

    assert "charts" in payload, "blob tem que carregar charts[]"
    assert len(payload["charts"]) == 1
    ch = payload["charts"][0]
    assert "error" not in ch, ch
    assert ch["svg"].startswith("<svg") and ch["svg"].endswith("</svg>")
    assert ch["chart_type"] == "bar"
    assert ch["title"] == "Vendas por região"


def test_schema_version_does_not_bump(client, admin_token):
    """`charts[]` é aditivo — mesmo precedente do M8 F3 (mídia congelada sem bump)."""
    t = _create_table(client, admin_token)
    _seed(client, admin_token)
    v = _mkview(client, admin_token, t["id"])
    res = _preview(client, admin_token,
                   [{"table_id": t["id"], "order": 0, "layout": "list"}],
                   [{"view_id": v["id"], "title": "x"}])
    assert res.json()["schema_version"] == 1


def test_chart_is_script_free(client, admin_token):
    """Gate de injeção (decisão D5): o SVG é 100% nosso → script-free por
    construção. Rótulo hostil do tenant sai escapado."""
    t = _create_table(client, admin_token, name="hostil")
    r = client.post("/api/hostil",
                    json={"regiao": "<script>alert(1)</script>", "vendedor": "x", "valor": 1.0},
                    headers=_auth(admin_token))
    assert r.status_code == 200, r.text
    v = _mkview(client, admin_token, t["id"], name="h")

    res = _preview(client, admin_token,
                   [{"table_id": t["id"], "order": 0, "layout": "list"}],
                   [{"view_id": v["id"], "title": "t"}])
    svg = res.json()["charts"][0]["svg"]
    assert "<script" not in svg
    assert "<foreignObject" not in svg
    assert "&lt;script" in svg, "o rótulo hostil tem que aparecer ESCAPADO"


def test_alt_table_accompanies_chart(client, admin_token):
    """A tabela-alternativa é obrigatória (a11y): resolve leitor-de-tela, no-JS
    e daltônico num artefato só."""
    t = _create_table(client, admin_token)
    _seed(client, admin_token)
    v = _mkview(client, admin_token, t["id"])
    res = _preview(client, admin_token,
                   [{"table_id": t["id"], "order": 0, "layout": "list"}],
                   [{"view_id": v["id"], "title": "x"}])
    alt = res.json()["charts"][0]["alt_table"]
    assert alt["header"][0] == "Categoria"
    assert len(alt["rows"]) >= 1


def test_chart_aggregates_over_complete_data(client, admin_token):
    """Decisão 2: o agregado é computado sobre o dado COMPLETO, não sobre as
    linhas truncadas do snapshot. `source_row_count` prova."""
    t = _create_table(client, admin_token)
    total = _seed(client, admin_token)
    v = _mkview(client, admin_token, t["id"])
    res = _preview(client, admin_token,
                   [{"table_id": t["id"], "order": 0, "layout": "list"}],
                   [{"view_id": v["id"], "title": "x"}])
    meta = res.json()["charts"][0]["series_meta"][0]
    assert meta["source_row_count"] == total


# ------------------------------------------------------- trava da decisão 8

def test_chart_on_selected_table_is_allowed(client, admin_token):
    """Fonte na `table_selection` → permitida."""
    t = _create_table(client, admin_token)
    _seed(client, admin_token)
    v = _mkview(client, admin_token, t["id"])
    res = _preview(client, admin_token,
                   [{"table_id": t["id"], "order": 0, "layout": "list"}],
                   [{"view_id": v["id"], "title": "x"}])
    assert "error" not in res.json()["charts"][0]


def test_chart_on_private_unpublished_table_is_refused(client, admin_token):
    """Fonte privada E fora da seleção → recusa. É o vazamento que a decisão 8
    impede: agregado de dado que o público não alcança por via nenhuma."""
    t = _create_table(client, admin_token)
    _seed(client, admin_token)
    v = _mkview(client, admin_token, t["id"])
    # publica OUTRA tabela; a fonte do gráfico fica de fora da seleção
    outra = _create_table(client, admin_token, name="outra")
    res = _preview(client, admin_token,
                   [{"table_id": outra["id"], "order": 0, "layout": "list"}],
                   [{"view_id": v["id"], "title": "x"}])
    ch = res.json()["charts"][0]
    assert ch.get("error") == "source_not_published", ch


def test_chart_on_public_table_is_allowed_even_outside_selection(client, admin_token):
    """Decisão 8: `is_public` sozinho basta — o dado já está público pela API,
    então o agregado dele não revela nada novo."""
    t = _create_table(client, admin_token)
    _seed(client, admin_token)
    assert client.patch(f"/tables/{t['id']}/visibility",
                        headers=_auth(admin_token)).status_code == 200
    v = _mkview(client, admin_token, t["id"])
    outra = _create_table(client, admin_token, name="outra")
    res = _preview(client, admin_token,
                   [{"table_id": outra["id"], "order": 0, "layout": "list"}],
                   [{"view_id": v["id"], "title": "x"}])
    ch = res.json()["charts"][0]
    assert "error" not in ch, ch


def test_chart_view_of_other_workspace_is_not_found(client, master_token, admin_token):
    """A VIEW é do workspace: view de outro owner não é resolvida."""
    t = _create_table(client, admin_token)
    v = _mkview(client, admin_token, t["id"])
    assert client.post("/api/admins",
                       json={"username": "outro2", "password": "Pwd12345!", "role": "admin"},
                       headers=_auth(master_token)).status_code == 200
    res = _preview(client, "test-outro2", [], [{"view_id": v["id"], "title": "x"}])
    assert res.json()["charts"][0].get("error") == "view_not_found"


# ------------------------------------------------- gráfico não derruba publish

def test_broken_chart_never_breaks_publish(client, admin_token):
    """G4: gráfico que falha cai com `error` — nunca 500a o publish inteiro.
    Mesmo padrão das tabelas (que já engolem erro por-tabela)."""
    t = _create_table(client, admin_token)
    _seed(client, admin_token)
    res = _preview(client, admin_token,
                   [{"table_id": t["id"], "order": 0, "layout": "list"}],
                   [{"view_id": 999999, "title": "fantasma"}])
    assert res.status_code == 200, "publish tem que sobreviver a gráfico quebrado"
    assert res.json()["charts"][0]["error"] == "view_not_found"
    # e as tabelas continuam publicadas normalmente
    assert len(res.json()["tables"]) == 1


def test_publish_without_charts_still_works(client, admin_token):
    """Retrocompatibilidade: body sem `charts` continua publicando."""
    t = _create_table(client, admin_token)
    _seed(client, admin_token)
    res = client.post("/api/publications/me/preview",
                      json={"table_selection": [{"table_id": t["id"], "order": 0, "layout": "list"}]},
                      headers=_auth(admin_token))
    assert res.status_code == 200, res.text
    assert res.json()["charts"] == []


def test_charts_respect_order(client, admin_token):
    t = _create_table(client, admin_token)
    _seed(client, admin_token)
    v1 = _mkview(client, admin_token, t["id"], name="v1")
    v2 = _mkview(client, admin_token, t["id"], name="v2")
    res = _preview(client, admin_token,
                   [{"table_id": t["id"], "order": 0, "layout": "list"}],
                   [{"view_id": v1["id"], "title": "segundo", "order": 2},
                    {"view_id": v2["id"], "title": "primeiro", "order": 1}])
    titles = [c["title"] for c in res.json()["charts"]]
    assert titles == ["primeiro", "segundo"]


# ------------------------------- persistência (F2.2b): round-trip do spec

def test_chart_selection_survives_publish_and_reload(client, admin_token):
    """F2.2b: o spec dos gráficos persiste na versão (simétrico com
    table_selection). Sem isso o builder perde os gráficos no reload — que é
    justamente o ponto de guardar. O SVG vive no blob; o SPEC vive na row."""
    t = _create_table(client, admin_token)
    _seed(client, admin_token)
    v = _mkview(client, admin_token, t["id"])

    # publica de verdade (não preview): cria versão + ativa
    create = client.post(
        "/api/publications/me/versions",
        json={
            "description": "com gráfico",
            "theme_config": {},
            "table_selection": [{"table_id": t["id"], "order": 0, "layout": "list"}],
            "charts": [{"view_id": v["id"], "title": "Vendas", "order": 0}],
        },
        headers=_auth(admin_token),
    )
    assert create.status_code == 200, create.text
    body = create.json()
    # a resposta já devolve o chart_selection
    assert body["chart_selection"] == [
        {"view_id": v["id"], "title": "Vendas", "chart_type": "bar", "order": 0}
    ], body["chart_selection"]

    client.post(f"/api/publications/me/versions/{body['id']}/activate", headers=_auth(admin_token))

    # recarrega a versão ativa (o que o Studio faz ao abrir) → spec volta
    active = client.get("/api/publications/me/active", headers=_auth(admin_token))
    assert active.status_code == 200, active.text
    assert active.json()["chart_selection"][0]["view_id"] == v["id"]
    assert active.json()["chart_selection"][0]["title"] == "Vendas"


def test_publish_without_charts_stores_empty_selection(client, admin_token):
    t = _create_table(client, admin_token)
    _seed(client, admin_token)
    create = client.post(
        "/api/publications/me/versions",
        json={"description": None, "theme_config": {},
              "table_selection": [{"table_id": t["id"], "order": 0, "layout": "list"}]},
        headers=_auth(admin_token),
    )
    assert create.status_code == 200, create.text
    assert create.json()["chart_selection"] == []


# --------------------------- decisão #8 CROSS-OWNER, ponta a ponta no builder

def test_builder_can_use_public_table_of_another_workspace(client, master_token, admin_token):
    """Decisão #8 mantida CROSS-OWNER pelo Diretor: dá pra montar view/gráfico
    sobre tabela `is_public` de OUTRO workspace.

    Antes deste caminho o builder 404ava justo no conjunto que a decisão 8
    adiciona — ou seja, a decisão só valeria no papel. O dado dessa tabela já é
    legível sem autenticação em `/api/{tabela}`, então o agregado não revela
    nada novo.
    """
    # workspace A publica uma tabela
    t = _create_table(client, admin_token, name="publica")
    _seed(client, admin_token, table="publica")
    assert client.patch(f"/tables/{t['id']}/visibility",
                        headers=_auth(admin_token)).status_code == 200

    # workspace B (outro admin) monta view sobre a tabela pública de A
    assert client.post("/api/admins",
                       json={"username": "vizinho", "password": "Pwd12345!", "role": "admin"},
                       headers=_auth(master_token)).status_code == 200
    tok_b = "test-vizinho"

    cols = client.get(f"/api/views/me/columns/{t['id']}", headers=_auth(tok_b))
    assert cols.status_code == 200, "builder tem que listar colunas de tabela pública alheia"
    assert "regiao" in cols.json()["groupable"]

    prev = client.post("/api/views/me/preview",
                       json={"table_id": t["id"], "group_by": "regiao",
                             "operation": "count", "config": {}},
                       headers=_auth(tok_b))
    assert prev.status_code == 200, prev.text
    assert prev.json()["series"][0]["source_row_count"] > 0

    v = _mkview(client, tok_b, t["id"], name="sobre alheia")
    data = client.get(f"/api/views/me/{v['id']}/data", headers=_auth(tok_b))
    assert data.status_code == 200, data.text


def test_builder_still_refuses_private_table_of_another_workspace(client, master_token, admin_token):
    """O outro lado da #8: tabela PRIVADA de outro workspace continua invisível."""
    t = _create_table(client, admin_token, name="privada")
    assert client.post("/api/admins",
                       json={"username": "vizinho2", "password": "Pwd12345!", "role": "admin"},
                       headers=_auth(master_token)).status_code == 200
    res = client.get(f"/api/views/me/columns/{t['id']}", headers=_auth("test-vizinho2"))
    assert res.status_code == 404


# --------------------------------- INVARIANTE DA GUC (gate da decisão #8)

def test_aggregation_identical_with_and_without_guc(client, admin_token, db_session):
    """GATE da decisão #8 (cross-owner), exigido pelo cético do detalhamento.

    O builder ao vivo roda sob `tenant_db` (GUC `app.tenant_id` setado); o
    publish roda sob `get_db` (SEM GUC). Todo o "preview==publish" descansa na
    premissa de que o motor devolve as MESMAS linhas nos dois contextos —
    premissa que nunca foi afirmada. Se um dia o modelo virar tabela física
    compartilhada, o gráfico do publish agregaria linhas de outros tenants que
    o preview esconde: exatamente o "verde-no-dev-errado-no-prod" da F1.

    Roda nos dois engines. Em Postgres é o teste de verdade (é lá que o GUC
    existe); em SQLite o `set_tenant_for_session` é no-op e o teste vira
    tautológico — mas custa nada e prende o contrato.
    """
    import aggregation
    from tenant_context import set_tenant_for_session

    t = _create_table(client, admin_token)
    _seed(client, admin_token)

    db_table = db_session.query(models.DynamicTable).filter(
        models.DynamicTable.id == t["id"]).first()
    assert db_table is not None

    from main import _load_physical_table, _spec_from
    phys = _load_physical_table(db_table)
    spec = _spec_from("regiao", "count", None, {})

    # 1) COM GUC (o que o builder ao vivo faz)
    set_tenant_for_session(db_session, db_table.tenant_id)
    com_guc = aggregation.run_aggregation(db_session, phys, spec)
    db_session.rollback()  # solta o GUC (transaction-local)

    # 2) SEM GUC (o que o publish faz)
    sem_guc = aggregation.run_aggregation(db_session, phys, spec)

    def _shape(agg):
        return [
            (s["label"], s["source_row_count"],
             sorted((p["category"], p["value"]) for p in s["points"]))
            for s in agg["series"]
        ]

    assert _shape(com_guc) == _shape(sem_guc), (
        "INVARIANTE QUEBRADO: o motor devolve linhas diferentes com e sem GUC. "
        "O 'preview==publish' da F2 não vale mais — e o gráfico publicado pode "
        "conter linhas que o preview escondeu."
    )
