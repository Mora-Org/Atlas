"""FK do arquivo .sql vira relação declarada no catálogo (1.2.0).

A cláusula FK é REMOVIDA do DDL (o import nunca executou constraint entre
tabelas — é o guard do B13) e registrada como `DynamicRelation`, a mesma linha
que o `POST /api/relations` grava.

O que estes testes guardam, e por que cada um existe:

- **O DDL executado não pode conter FK.** Assertar 200 não prova nada: o
  `transform()` do sqlglot copia por padrão, então validar uma árvore e
  serializar outra manda a FK crua pro banco. Aqui a gente lê o SQL final.
- **O prefixo do tenant sobrevive à remoção.** Se a remoção rodar depois do
  `find(exp.Table)`, o `set()` do prefixo muta a árvore velha e a tabela nasce
  com nome sem prefixo — 200 na resposta, tabela órfã no banco.
- **A allowlist do B13 continua inteira.** A remoção reduz a árvore ANTES da
  checagem de forma; CTAS com FK de fachada tem que seguir bloqueado.
- **Origem por ID, não por nome.** `_tables.name` não é único entre tenants:
  resolver a origem por nome faz a relação nascer saindo da tabela homônima do
  vizinho — que então não consegue mais dropar a própria coluna, e nem enxerga
  o motivo (a lista de relações filtra os dois lados e devolve vazio pra ele).
"""
import io
import os

import pytest
from sqlalchemy import text

import models

# O import por SQL é o caminho legado (prefixo em `public`); em Postgres ele
# funciona, mas as tabelas nascem fora do schema-per-tenant (ver B17). Os
# testes de fronteira rodam nos DOIS engines de propósito — a fronteira é a
# mesma, e era exatamente ela que nunca tinha sido exercida em PG.
_e_postgres = os.environ.get("DATABASE_URL", "").startswith("postgres")


def _auth(tok):
    return {"Authorization": f"Bearer {tok}"}


def _sobe(client, token, sql, nome="teste.sql"):
    return client.post(
        "/api/import/sql",
        headers=_auth(token),
        files={"file": (nome, io.BytesIO(sql.encode()), "text/plain")},
    )


def _ddl_da_tabela(db_session, physical_name):
    """SQL de criação como o BANCO o guarda — a fonte da verdade do que rodou."""
    if _e_postgres:
        cols = db_session.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = :t"), {"t": physical_name}).fetchall()
        fks = db_session.execute(text(
            "SELECT count(*) FROM information_schema.table_constraints "
            "WHERE table_name = :t AND constraint_type = 'FOREIGN KEY'"),
            {"t": physical_name}).scalar()
        return {"colunas": [c[0] for c in cols], "fks_fisicas": fks}
    ddl = db_session.execute(text(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name = :t"),
        {"t": physical_name}).scalar()
    return {"ddl": ddl or ""}


# ───────────────────────── o caminho feliz ─────────────────────────

def test_fk_do_arquivo_vira_relacao_declarada(client, admin_token, db_session):
    sql = """
    CREATE TABLE autores (id_autor INTEGER PRIMARY KEY, nome TEXT);
    CREATE TABLE livros (
        id_livro INTEGER PRIMARY KEY,
        id_autor INTEGER,
        FOREIGN KEY (id_autor) REFERENCES autores(id_autor)
    );
    """
    r = _sobe(client, admin_token, sql)
    assert r.status_code == 200, r.text
    corpo = r.json()
    assert set(corpo["created_tables"]) == {"autores", "livros"}
    assert corpo["relations_created"] == 1, corpo

    rel = db_session.query(models.DynamicRelation).one()
    origem = db_session.query(models.DynamicTable).get(rel.from_table_id)
    destino = db_session.query(models.DynamicTable).get(rel.to_table_id)
    assert origem.name == "livros" and destino.name == "autores"
    assert rel.from_column_name == "id_autor"
    assert rel.to_column_name == "id_autor"


@pytest.mark.parametrize("clausula", [
    "FOREIGN KEY (id_autor) REFERENCES autores(id_autor)",
    "CONSTRAINT fk_la FOREIGN KEY (id_autor) REFERENCES autores(id_autor)",
])
def test_formas_de_fk_tabela_level(client, admin_token, clausula):
    sql = f"""
    CREATE TABLE autores (id_autor INTEGER PRIMARY KEY);
    CREATE TABLE livros (id_livro INTEGER PRIMARY KEY, id_autor INTEGER, {clausula});
    """
    r = _sobe(client, admin_token, sql)
    assert r.status_code == 200
    assert r.json()["relations_created"] == 1, r.json()


def test_forma_inline_referencia(client, admin_token):
    """`col INTEGER REFERENCES b(id)` não produz nó ForeignKey nenhum — quem
    varrer por ForeignKey em vez de Reference perde esta forma calado."""
    sql = """
    CREATE TABLE autores (id_autor INTEGER PRIMARY KEY);
    CREATE TABLE livros (id_livro INTEGER PRIMARY KEY, id_autor INTEGER REFERENCES autores(id_autor));
    """
    r = _sobe(client, admin_token, sql)
    assert r.status_code == 200
    assert r.json()["relations_created"] == 1, r.json()


# ───────────────── o DDL executado (as armadilhas medidas) ─────────────────

def test_ddl_executado_nao_tem_constraint_fisica(client, admin_token, db_session):
    """A armadilha do `copy=True`: validar uma árvore e serializar outra manda
    a FK crua pro banco. 200 na resposta não prova que o DDL saiu limpo."""
    sql = """
    CREATE TABLE autores (id_autor INTEGER PRIMARY KEY);
    CREATE TABLE livros (id_livro INTEGER PRIMARY KEY, id_autor INTEGER,
        FOREIGN KEY (id_autor) REFERENCES autores(id_autor));
    """
    assert _sobe(client, admin_token, sql).status_code == 200

    tab = db_session.query(models.DynamicTable).filter_by(name="livros").one()
    info = _ddl_da_tabela(db_session, tab.physical_name)
    if _e_postgres:
        assert info["fks_fisicas"] == 0, info
        assert "id_autor" in info["colunas"]
    else:
        ddl = info["ddl"].upper()
        assert "REFERENCES" not in ddl, info["ddl"]
        assert "FOREIGN KEY" not in ddl, info["ddl"]
        assert "ID_AUTOR" in ddl


def test_prefixo_sobrevive_a_remocao_da_fk(client, admin_token, db_session):
    """Se a remoção rodar DEPOIS do find(exp.Table), o prefixo se perde e o
    catálogo aponta pra uma tabela física que não existe."""
    sql = """
    CREATE TABLE autores (id_autor INTEGER PRIMARY KEY);
    CREATE TABLE livros (id_livro INTEGER PRIMARY KEY, id_autor INTEGER,
        FOREIGN KEY (id_autor) REFERENCES autores(id_autor));
    """
    assert _sobe(client, admin_token, sql).status_code == 200
    tab = db_session.query(models.DynamicTable).filter_by(name="livros").one()

    assert tab.physical_name and tab.physical_name != "livros", tab.physical_name
    assert tab.physical_name.endswith("_livros")
    # e a tabela física com esse nome tem que EXISTIR
    if _e_postgres:
        existe = db_session.execute(text(
            "SELECT count(*) FROM information_schema.tables WHERE table_name = :t"),
            {"t": tab.physical_name}).scalar()
    else:
        existe = db_session.execute(text(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name = :t"),
            {"t": tab.physical_name}).scalar()
    assert existe == 1, f"catálogo aponta pra {tab.physical_name}, que não existe"


def test_subquery_escondida_na_referencia_nao_chega_no_banco(client, admin_token, db_session):
    """`REFERENCES (SELECT ...)`: a remoção da FK engole o SELECT junto."""
    sql = """
    CREATE TABLE alvo (id INTEGER PRIMARY KEY, x INTEGER,
        FOREIGN KEY (x) REFERENCES (SELECT cpf FROM users));
    """
    r = _sobe(client, admin_token, sql)
    assert r.status_code == 200
    if "alvo" in r.json()["created_tables"]:
        tab = db_session.query(models.DynamicTable).filter_by(name="alvo").one()
        info = _ddl_da_tabela(db_session, tab.physical_name)
        texto = (info.get("ddl") or str(info)).upper()
        assert "SELECT" not in texto, info
        assert "USERS" not in texto, info


# ───────────────── a allowlist do B13 continua inteira ─────────────────

def test_ctas_com_fk_de_fachada_continua_bloqueado(client, admin_token):
    """A remoção não pode virar porta: CTAS segue recusado depois dela."""
    sql = ("CREATE TABLE roubo AS SELECT * FROM users;")
    r = _sobe(client, admin_token, sql)
    assert r.status_code == 200
    assert r.json()["created_tables"] == []
    assert r.json()["errors"], r.json()


def test_nome_qualificado_por_schema_continua_bloqueado(client, admin_token):
    sql = ("CREATE TABLE outro.roubo (id INTEGER, x INTEGER, "
           "FOREIGN KEY (x) REFERENCES outro.alvo(id));")
    r = _sobe(client, admin_token, sql)
    assert r.status_code == 200
    assert r.json()["created_tables"] == []


# ───────────────── a fronteira: 2 admins de verdade ─────────────────

def test_fk_para_tabela_de_outro_admin_e_ignorada(client, master_token, db_session):
    """O alvo é resolvido SÓ no catálogo de quem importa.

    Sem isso, um `.sql` do tenant B declarando FK pra uma tabela do tenant A
    plantaria aresta cruzando a fronteira.
    """
    r = client.post("/api/admins", json={"username": "vitima", "password": "x", "role": "admin"},
                    headers=_auth(master_token))
    assert r.status_code == 200
    r = client.post("/api/admins", json={"username": "atacante", "password": "x", "role": "admin"},
                    headers=_auth(master_token))
    assert r.status_code == 200

    assert _sobe(client, "test-vitima",
                 "CREATE TABLE dossie (id INTEGER PRIMARY KEY, cpf TEXT);").status_code == 200

    r = _sobe(client, "test-atacante", """
        CREATE TABLE pedidos (id INTEGER PRIMARY KEY, cliente_id INTEGER,
            FOREIGN KEY (cliente_id) REFERENCES dossie(id));
    """)
    assert r.status_code == 200
    corpo = r.json()
    assert corpo["relations_created"] == 0, corpo
    assert any("dossie" in w for w in corpo["warnings"]), corpo

    # nenhuma relação encostou na tabela da vítima
    vitima_tabs = [t.id for t in db_session.query(models.DynamicTable)
                   .join(models.User, models.DynamicTable.owner_id == models.User.id)
                   .filter(models.User.username == "vitima").all()]
    tocadas = db_session.query(models.DynamicRelation).filter(
        (models.DynamicRelation.from_table_id.in_(vitima_tabs)) |
        (models.DynamicRelation.to_table_id.in_(vitima_tabs))).count()
    assert tocadas == 0


def test_nome_colidindo_a_relacao_sai_da_MINHA_tabela(client, master_token, db_session):
    """`_tables.name` não é único entre tenants. Com nomes iguais dos dois
    lados, a relação tem que sair da tabela de quem importou — resolver a
    origem por nome pegaria a linha de id menor, a da vítima."""
    for u in ("vit2", "atk2"):
        assert client.post("/api/admins", json={"username": u, "password": "x", "role": "admin"},
                           headers=_auth(master_token)).status_code == 200

    base = """
    CREATE TABLE clientes (id INTEGER PRIMARY KEY, nome TEXT);
    CREATE TABLE pedidos (id INTEGER PRIMARY KEY, cliente_id INTEGER,
        FOREIGN KEY (cliente_id) REFERENCES clientes(id));
    """
    assert _sobe(client, "test-vit2", base).status_code == 200
    r = _sobe(client, "test-atk2", base)
    assert r.status_code == 200
    assert r.json()["relations_created"] == 1, r.json()

    atk = db_session.query(models.User).filter_by(username="atk2").one()
    vit = db_session.query(models.User).filter_by(username="vit2").one()
    # a relação do atacante sai de uma tabela DELE
    rels = db_session.query(models.DynamicRelation).all()
    for rel in rels:
        origem = db_session.query(models.DynamicTable).get(rel.from_table_id)
        destino = db_session.query(models.DynamicTable).get(rel.to_table_id)
        assert origem.owner_id == destino.owner_id, "relação cruzou a fronteira"
    donos = {db_session.query(models.DynamicTable).get(r.from_table_id).owner_id for r in rels}
    assert donos == {atk.id, vit.id}, donos


# ───────────────── higiene: repetição, coluna inexistente, teto ─────────────────

def test_reimportar_nao_duplica_relacao(client, admin_token, db_session):
    sql = """
    CREATE TABLE autores (id_autor INTEGER PRIMARY KEY);
    CREATE TABLE livros (id_livro INTEGER PRIMARY KEY, id_autor INTEGER,
        FOREIGN KEY (id_autor) REFERENCES autores(id_autor));
    """
    assert _sobe(client, admin_token, sql).json()["relations_created"] == 1
    # 2º import: os CREATEs conflitam, mas se a tabela for recriada a relação
    # não pode duplicar
    _sobe(client, admin_token, sql)
    total = db_session.query(models.DynamicRelation).count()
    assert total <= 1, f"{total} relações — reimport duplicou"


def test_fk_repetida_no_mesmo_arquivo_vira_uma_relacao(client, admin_token):
    repetidas = ",\n".join(
        ["FOREIGN KEY (id_autor) REFERENCES autores(id_autor)"] * 40)
    sql = f"""
    CREATE TABLE autores (id_autor INTEGER PRIMARY KEY);
    CREATE TABLE livros (id_livro INTEGER PRIMARY KEY, id_autor INTEGER, {repetidas});
    """
    r = _sobe(client, admin_token, sql)
    assert r.status_code == 200
    assert r.json()["relations_created"] == 1, r.json()


def test_fk_com_coluna_inexistente_e_ignorada(client, admin_token):
    sql = """
    CREATE TABLE autores (id_autor INTEGER PRIMARY KEY);
    CREATE TABLE livros (id_livro INTEGER PRIMARY KEY, id_autor INTEGER,
        FOREIGN KEY (id_autor) REFERENCES autores(coluna_que_nao_existe));
    """
    r = _sobe(client, admin_token, sql)
    assert r.status_code == 200
    assert r.json()["relations_created"] == 0
    assert r.json()["warnings"]


def test_dry_run_avisa_que_a_fk_vira_relacao(client, admin_token):
    """A promessa aparece ANTES do commit — quem lê o plano não pode ser
    surpreendido por relação que apareceu do nada."""
    sql = """
    CREATE TABLE autores (id_autor INTEGER PRIMARY KEY);
    CREATE TABLE livros (id_livro INTEGER PRIMARY KEY, id_autor INTEGER,
        FOREIGN KEY (id_autor) REFERENCES autores(id_autor));
    """
    r = client.post("/api/import/sql/dry-run", headers=_auth(admin_token),
                    files={"file": ("t.sql", io.BytesIO(sql.encode()), "text/plain")})
    assert r.status_code == 200
    corpo = r.json()
    assert corpo["summary"]["relations"] == 1, corpo
    assert any("relação declarada" in s.get("message", "") for s in corpo["statements"]), corpo
