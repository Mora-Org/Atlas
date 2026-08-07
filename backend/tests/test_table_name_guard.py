"""M9 F4 — fronteira: o nome da tabela.

Antes desta fase, `POST /tables/` aceitava QUALQUER string como nome. Medido na
sonda: nome vazio, 200 caracteres, unicode, espaço, hífen, começando com dígito
e `x" (id int); DROP TABLE users; --` — todos com **200**.

**Não era injeção**, e é importante não vender como tal: o CREATE passa pelo
SQLAlchemy (que escapa o identificador) e o `_quote_ident` do motor DDL barra
aspa dupla. O `security.md` chamava isso de "superfície de injeção" e exagerava.

O estrago real era outro, e pior de conviver: a tabela com aspa no nome nascia
**indeletável** — o `_quote_ident` levantava `ValueError` não tratado no DELETE,
virando 500 pra sempre. Uma tabela zumbi, ocupando nome e aparecendo na lista.
"""
import io
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import main  # noqa: E402
import schemas  # noqa: E402


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _criar(client, token, nome):
    return client.post("/tables/", json={
        "name": nome, "description": "",
        "columns": [{"name": "x", "data_type": "String", "is_nullable": True}],
    }, headers=_auth(token))


# ── forma do nome ────────────────────────────────────────────────────────

@pytest.mark.parametrize("nome", [
    "vendas", "pedidos_2026", "a", "tabela_com_underscore", "x9",
])
def test_nome_valido_passa(client, admin_token, nome):
    assert _criar(client, admin_token, nome).status_code == 200


@pytest.mark.parametrize("rotulo,nome", [
    ("vazio", ""),
    ("so_espaco", "   "),
    ("com_espaco", "minha tabela"),
    ("com_hifen", "all-users"),
    ("maiuscula", "Vendas"),
    ("unicode", "ação"),
    ("comeca_com_digito", "1tabela"),
    ("comeca_com_underscore", "_oculta"),
    ("aspas_duplas", 'x" (id int); DROP TABLE users; --'),
    ("ponto_e_virgula", "a;b"),
    ("gigante", "a" * 64),
])
def test_nome_invalido_e_400(client, admin_token, rotulo, nome):
    r = _criar(client, admin_token, nome)
    assert r.status_code in (400, 422), f"{rotulo} passou: {r.status_code}"


def test_63_caracteres_passa_e_64_nao(client, admin_token):
    """Limite de identificador do Postgres. Não é número mágico."""
    assert _criar(client, admin_token, "a" * 63).status_code == 200
    assert _criar(client, admin_token, "b" * 64).status_code in (400, 422)


def test_espaco_nas_pontas_e_aparado(client, admin_token):
    r = _criar(client, admin_token, "  vendas  ")
    assert r.status_code == 200
    assert r.json()["name"] == "vendas"


# ── o estrago que isso causava ───────────────────────────────────────────

def test_a_tabela_indeletavel_nao_nasce_mais(client, admin_token):
    """O caso que motivou a fase: com aspa dupla no nome, o CREATE passava e o
    DELETE explodia com `ValueError` não tratado (500) — pra sempre."""
    r = _criar(client, admin_token, 'zz"; DROP TABLE users; --')
    assert r.status_code in (400, 422)


def test_o_banco_de_sistema_continua_inteiro(client, admin_token, db_session):
    """Prova direta de que não houve injeção — nem antes (o SQLAlchemy escapa),
    nem agora. O teste existe pra que uma mudança futura no motor DDL não
    reabra isso em silêncio."""
    from sqlalchemy import inspect as _inspect
    _criar(client, admin_token, 'x"; DROP TABLE users; --')
    assert _inspect(db_session.get_bind()).has_table("users")


# ── nomes reservados (B5) ────────────────────────────────────────────────

def test_reservados_saem_das_rotas_reais(client):
    """A lista era escrita à mão e tinha só `assets` — já desatualizada em duas
    milestones. Agora é computada do app montado, então rota nova entra sozinha."""
    reservados = main._compute_reserved_table_names()
    for esperado in ("admins", "assets", "moderators", "relations"):
        assert esperado in reservados, esperado


def test_rota_de_2_segmentos_NAO_reserva_o_nome(client):
    """`/api/views/me` tem 2 segmentos e a rota dinâmica ocupa 1 — o probe do
    M8.5 F1 mediu que uma tabela chamada "views" continua acessível. Reservar
    esses nomes proibiria nome legítimo à toa."""
    reservados = main._compute_reserved_table_names()
    for livre in ("views", "keys", "webhooks", "publications", "import", "auth"):
        assert livre not in reservados, livre


@pytest.mark.parametrize("nome", ["admins", "moderators", "relations", "assets"])
def test_nome_reservado_e_recusado(client, admin_token, nome):
    r = _criar(client, admin_token, nome)
    assert r.status_code == 400
    assert "reservado" in r.json()["detail"].lower()


def test_tabela_chamada_views_continua_permitida(client, admin_token):
    """Contraprova da trava: ela não pode virar proibição genérica."""
    assert _criar(client, admin_token, "views").status_code == 200


# ── o furo do B5: import por SQL ─────────────────────────────────────────

def test_import_sql_NAO_cria_mais_tabela_reservada(client, admin_token, db_session):
    """Era o furo: este caminho criava `DynamicTable` sem passar por trava
    nenhuma, então bastava um `.sql` pra contornar a régua da porta da frente."""
    import models
    sql = b"CREATE TABLE admins (id INTEGER PRIMARY KEY, x TEXT);"
    r = client.post("/api/import/sql",
                    files={"file": ("m.sql", io.BytesIO(sql), "application/sql")},
                    headers=_auth(admin_token))
    assert r.status_code == 200, r.text
    assert "admins" not in r.json()["created_tables"]
    assert any("reservado" in e.lower() for e in r.json()["errors"]), r.json()["errors"]
    assert db_session.query(models.DynamicTable).filter(
        models.DynamicTable.name == "admins").first() is None


def test_import_sql_recusa_nome_malformado_sem_derrubar_o_resto(client, admin_token):
    """O import é parcial por desenho: uma tabela recusada não pode levar as
    outras do mesmo arquivo junto."""
    sql = (b'CREATE TABLE "tab com espaco" (id INTEGER PRIMARY KEY);\n'
           b"CREATE TABLE boa_tabela (id INTEGER PRIMARY KEY, x TEXT);")
    r = client.post("/api/import/sql",
                    files={"file": ("m.sql", io.BytesIO(sql), "application/sql")},
                    headers=_auth(admin_token))
    assert r.status_code == 200, r.text
    assert "boa_tabela" in r.json()["created_tables"]
    assert r.json()["errors"]


def test_import_de_planilha_com_nome_reservado_da_400(client, admin_token):
    csv = b"col\n1\n"
    r = client.post("/api/import/table/commit",
                    files={"file": ("d.csv", io.BytesIO(csv), "text/csv")},
                    data={"table_name": "relations",
                          "columns": '[{"original_header":"col","name":"col","data_type":"String","is_nullable":true}]'},
                    headers=_auth(admin_token))
    assert r.status_code == 400
    assert "reservado" in r.json()["detail"].lower()


# ── a régua é uma só ─────────────────────────────────────────────────────

def test_validador_e_o_mesmo_usado_pelas_duas_portas():
    """Antes, `POST /tables/` e o import de planilha discordavam: o import
    sanitizava (`^[a-z][a-z0-9_]*$`) e o endpoint aceitava tudo."""
    assert schemas.validate_table_name("  vendas ") == "vendas"
    with pytest.raises(ValueError):
        schemas.validate_table_name("Vendas")
    with pytest.raises(ValueError):
        schemas.validate_table_name("x", reservados=("x",))
