"""B13 — a forma permitida do statement no import por SQL.

O parser antigo classificava só o nó de TOPO e reescrevia só a PRIMEIRA
`exp.Table`. Tudo dentro passava intacto. Um admin comum, enviando um `.sql`,
conseguia ler a tabela de outro workspace, escrever no schema alheio, ler
`/etc/passwd` e forjar a flag de master usada pela RLS.

**Por que uma allowlist de FORMA e não uma lista de funções proibidas:** lista
de nome de função envelhece a cada versão do Postgres, e o atacante só precisa
de uma que ninguém lembrou. O caso de uso real do import é dump de ferramenta —
`CREATE TABLE` com colunas e `INSERT ... VALUES` com literais. Tudo fora disso
é recusado, mesmo parecendo inofensivo.

Estes testes batem no parser direto (não pelo HTTP) porque é lá que a decisão
mora, e porque assim eles rodam nos dois engines — o endpoint é SQLite-only.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import _parse_sql_statements  # noqa: E402

PREFIXO = "t2_"


def _parse(sql):
    return _parse_sql_statements(sql, prefix=PREFIXO)


def _um(sql):
    r = _parse(sql)
    assert len(r) == 1, f"esperava 1 statement, veio {len(r)}"
    return r[0]


# ── o que tem que ser BLOQUEADO ──────────────────────────────────────────

@pytest.mark.parametrize("rotulo,sql", [
    # exfiltração cross-tenant: a origem nunca era prefixada
    ("insert-select alheia", "INSERT INTO minha (a) SELECT a FROM t5_alheia;"),
    ("create-as-select", "CREATE TABLE roubo AS SELECT * FROM t5_alheia;"),
    ("cte escondendo a origem",
     "WITH x AS (SELECT a FROM t5_alheia) INSERT INTO minha (a) SELECT a FROM x;"),
    ("join cross-tenant",
     "CREATE TABLE d AS SELECT a.*, b.* FROM t5_alheia a JOIN users b ON 1=1;"),
    # tabela de SISTEMA: hashes de senha
    ("dump da tabela users", "CREATE TABLE dump AS SELECT * FROM users;"),
    # escrita no schema de outro tenant (layout do Postgres)
    ("insert schema-qualificado", "INSERT INTO tenant_2.alvo (c) VALUES (1);"),
    ("create schema-qualificado", "CREATE TABLE tenant_2.roubada (a INT);"),
    ("read schema-qualificado", "INSERT INTO minha (a) SELECT a FROM tenant_5.alheia;"),
    # execução de função
    ("forja da flag de master",
     "INSERT INTO t (c) SELECT set_config('app.is_master','true',false);"),
    ("leitura de arquivo", "INSERT INTO t (c) SELECT pg_read_file('/etc/passwd');"),
    ("rede via dblink", "INSERT INTO t (c) SELECT dblink('host=evil','SELECT 1');"),
    ("função no DEFAULT",
     "CREATE TABLE x (c text DEFAULT set_config('app.is_master','true',false));"),
    ("função no RETURNING",
     "INSERT INTO t (c) VALUES (1) RETURNING set_config('app.is_master','true',false);"),
])
def test_ataque_e_bloqueado(rotulo, sql):
    r = _um(sql)
    assert r["status"] == "blocked", f"{rotulo} PASSOU: {r}"
    assert r.get("message"), "recusa sem motivo não ajuda quem importou"


# ── o que tem que CONTINUAR passando (o custo do fix é real) ─────────────

@pytest.mark.parametrize("rotulo,sql", [
    ("create simples",
     "CREATE TABLE employees (id INTEGER PRIMARY KEY, name VARCHAR(100) NOT NULL, dept VARCHAR(50));"),
    ("insert com literais", "INSERT INTO employees (name, dept) VALUES ('Alice','Eng');"),
    ("insert multi-linha",
     "INSERT INTO employees (name, dept) VALUES ('A','X'), ('B','Y');"),
    ("default literal",
     "CREATE TABLE t (id INTEGER PRIMARY KEY, ativo BOOLEAN DEFAULT 1, n INT DEFAULT 0);"),
    ("valor nulo", "INSERT INTO employees (name, dept) VALUES ('C', NULL);"),
])
def test_dump_de_ferramenta_continua_passando(rotulo, sql):
    """É a forma que o import existe pra aceitar. Se isto quebrar, a trava
    virou proibição genérica e a feature morreu junto."""
    r = _um(sql)
    assert r["status"] == "ok", f"{rotulo} foi recusado: {r.get('message')}"


def test_a_tabela_alvo_continua_recebendo_o_prefixo_do_tenant():
    r = _um("INSERT INTO employees (name) VALUES ('x');")
    assert r["physical_name"] == f"{PREFIXO}employees"
    assert f"{PREFIXO}employees" in r["statement"]


def test_recusa_sempre_diz_o_motivo():
    """Import é parcial por desenho: quem manda o arquivo precisa saber QUAL
    statement caiu e por quê, senão o único caminho é adivinhar."""
    r = _um("INSERT INTO minha (a) SELECT a FROM t5_alheia;")
    assert "tabela" in r["message"].lower()


def test_statement_ruim_nao_derruba_o_resto_do_arquivo():
    """O contrato do import: parcial. Um recusado no meio não pode levar os
    bons junto."""
    sql = ("CREATE TABLE boa (id INTEGER PRIMARY KEY);\n"
           "INSERT INTO t (c) SELECT set_config('app.is_master','true',false);\n"
           "INSERT INTO boa (id) VALUES (1);")
    r = _parse(sql)
    assert len(r) == 3
    assert [x["status"] for x in r] == ["ok", "blocked", "ok"]


def test_piggybacking_continua_bloqueado():
    """Já era o caso antes (cada statement é revalidado) — teste de regressão,
    porque a trava nova mexe justo no caminho de validação."""
    r = _parse("INSERT INTO a (c) VALUES (1); DROP TABLE users;")
    assert any(x["status"] == "blocked" for x in r)
