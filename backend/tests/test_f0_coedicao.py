"""F0 — o que quebra na co-edição HOJE, sem realtime nenhum.

Três defeitos independentes, todos silenciosos, todos anteriores ao M10:

1. **LWW na LINHA, não na célula.** O `commitEdit` do DataViewer mandava
   `{...record, [col]: v}` — a linha inteira, relida do estado local. Dois
   admins editando células **diferentes** da mesma linha se sobrescreviam: o
   segundo PUT reenviava a versão antiga da célula do primeiro. O backend sempre
   aceitou parcial; quem violava o contrato era o cliente.

2. **A trilha do M9 mentia.** Como o body ia inteiro, `changed_columns`
   registrava TODAS as colunas a cada edição de uma célula. A trilha existia e
   dava a resposta errada pra "o que essa pessoa mudou?".

3. **Sem `ORDER BY`, a listagem não tem ordem.** O banco devolve a ordem física,
   que muda no `UPDATE`. Some e repete linha na paginação, e o snapshot
   publicado corta linhas arbitrárias — duas publicações do mesmo dado davam
   sites diferentes.

Estes testes batem no HTTP, não na função, porque o contrato que interessa é o
que o cliente enxerga.
"""
import os
import sys

import pytest
from sqlalchemy import select

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import audit  # noqa: E402
import models  # noqa: E402


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _mk_table(client, token, name="acervo"):
    res = client.post("/tables/", json={
        "name": name, "description": "",
        "columns": [
            {"name": "titulo", "data_type": "String", "is_nullable": True},
            {"name": "ano", "data_type": "Integer", "is_nullable": True},
            {"name": "nota", "data_type": "String", "is_nullable": True},
        ],
    }, headers=_auth(token))
    assert res.status_code == 200, res.text
    return res.json()


def _linhas(client, token, tabela="acervo", **params):
    res = client.get(f"/api/{tabela}", params=params, headers=_auth(token))
    assert res.status_code == 200, res.text
    corpo = res.json()
    return corpo["data"] if isinstance(corpo, dict) else corpo


# ── 1. PUT parcial: o defeito de co-edição ───────────────────────────────

def test_dois_editores_em_celulas_diferentes_nao_se_sobrescrevem(client, admin_token):
    """O cenário exato do bug, com dois PUTs parciais concorrentes.

    Antes do F0 o cliente mandava a linha inteira: o PUT do editor B carregava
    junto o valor ANTIGO de `titulo`, desfazendo a edição do editor A sem erro
    nenhum. Nenhum dos dois via nada acontecer de errado.
    """
    _mk_table(client, admin_token)
    client.post("/api/acervo", json={"titulo": "original", "ano": 1900, "nota": "x"},
                headers=_auth(admin_token))
    linha = _linhas(client, admin_token)[0]
    pk = linha["id"]

    # Editor A muda `titulo`. Editor B, com a linha JÁ CARREGADA antes disso,
    # muda `ano`. Em PUT parcial, um não toca no campo do outro.
    assert client.put(f"/api/acervo/{pk}", json={"titulo": "editado por A"},
                      headers=_auth(admin_token)).status_code == 200
    assert client.put(f"/api/acervo/{pk}", json={"ano": 1999},
                      headers=_auth(admin_token)).status_code == 200

    final = _linhas(client, admin_token)[0]
    assert final["ano"] == 1999, "a edição do editor B se perdeu"
    assert final["titulo"] == "editado por A", (
        "a edição do editor A foi DESFEITA pelo PUT do editor B — é o LWW na linha"
    )
    assert final["nota"] == "x", "coluna não mencionada em nenhum PUT foi alterada"


def test_put_parcial_nao_apaga_coluna_ausente(client, admin_token):
    """Chave ausente = 'não mudou', nunca 'apagar'.

    É o que separa PUT parcial de PUT semanticamente destrutivo. Se ausência
    virasse NULL, o conserto do item 1 apagaria dado em produção.
    """
    _mk_table(client, admin_token)
    client.post("/api/acervo", json={"titulo": "t", "ano": 2000, "nota": "preservar"},
                headers=_auth(admin_token))
    pk = _linhas(client, admin_token)[0]["id"]

    client.put(f"/api/acervo/{pk}", json={"ano": 2001}, headers=_auth(admin_token))

    final = _linhas(client, admin_token)[0]
    assert final["nota"] == "preservar"
    assert final["titulo"] == "t"


# ── 2. A trilha do M9 volta a dizer a verdade ────────────────────────────

def test_audit_registra_so_a_coluna_que_mudou(client, admin_token, db_session):
    """`changed_columns` é a única coisa que a trilha guarda sobre um UPDATE —
    o valor fica de fora por decisão (LGPD). Se ela lista todas as colunas, a
    trilha não responde a pergunta que existe pra responder."""
    _mk_table(client, admin_token)
    client.post("/api/acervo", json={"titulo": "t", "ano": 1900, "nota": "n"},
                headers=_auth(admin_token))
    pk = _linhas(client, admin_token)[0]["id"]

    client.put(f"/api/acervo/{pk}", json={"ano": 1999}, headers=_auth(admin_token))

    ev = (db_session.query(models.AuditLog)
          .filter(models.AuditLog.action == audit.RECORD_UPDATE)
          .order_by(models.AuditLog.id.desc()).first())
    assert ev is not None
    assert ev.changed_columns == ["ano"], (
        f"a trilha registrou {ev.changed_columns} numa edição de 1 célula"
    )


# ── 3. Ordem estável ─────────────────────────────────────────────────────

def _semear(client, token, n=12):
    for i in range(n):
        client.post("/api/acervo", json={"titulo": f"t{i:02d}", "ano": 1900 + i, "nota": "z"},
                    headers=_auth(token))


def test_listagem_sai_ordenada_por_pk(client, admin_token):
    _mk_table(client, admin_token)
    _semear(client, admin_token)
    pks = [r["id"] for r in _linhas(client, admin_token, limit=100)]
    assert pks == sorted(pks), f"listagem fora de ordem: {pks}"


def test_update_no_meio_nao_reordena_a_listagem(client, admin_token):
    """O sintoma real em Postgres: `UPDATE` grava versão nova no fim da heap, e
    sem `ORDER BY` a linha editada PULA pro fim da listagem. Quem estava na
    página 1 vê a linha sumir."""
    _mk_table(client, admin_token)
    _semear(client, admin_token)
    antes = [r["id"] for r in _linhas(client, admin_token, limit=100)]

    alvo = antes[len(antes) // 2]
    client.put(f"/api/acervo/{alvo}", json={"nota": "mexido"}, headers=_auth(admin_token))

    depois = [r["id"] for r in _linhas(client, admin_token, limit=100)]
    assert depois == antes, "a linha editada mudou de posição na listagem"


def test_paginacao_nao_perde_nem_repete_linha_apos_edicao(client, admin_token):
    """Percorre TODAS as páginas editando entre elas — que é o que acontece
    quando duas pessoas usam a tabela ao mesmo tempo. Sem ordem estável, a
    união das páginas não é a tabela."""
    _mk_table(client, admin_token)
    _semear(client, admin_token, n=12)

    vistos, off, passo = [], 0, 4
    while True:
        pagina = _linhas(client, admin_token, limit=passo, offset=off)
        if not pagina:
            break
        vistos += [r["id"] for r in pagina]
        # alguém edita a primeira linha da página que acabou de ser lida
        client.put(f"/api/acervo/{pagina[0]['id']}", json={"nota": f"off{off}"},
                   headers=_auth(admin_token))
        off += passo

    assert len(vistos) == 12, f"paginação devolveu {len(vistos)} linhas de 12"
    assert len(set(vistos)) == 12, f"linha repetida entre páginas: {vistos}"


def test_ordem_do_usuario_ganha_e_a_pk_desempata(client, admin_token):
    """A PK entra como ÚLTIMO critério, não substituindo o `sort` do usuário.
    Coluna com valores repetidos também não tem ordem definida — o desempate
    por PK é o que torna a paginação previsível mesmo ordenando por ela."""
    _mk_table(client, admin_token)
    for i in range(6):
        client.post("/api/acervo", json={"titulo": "igual", "ano": 2000, "nota": f"n{i}"},
                    headers=_auth(admin_token))

    linhas = _linhas(client, admin_token, sort="ano", order="asc", limit=100)
    pks = [r["id"] for r in linhas]
    assert pks == sorted(pks), f"empate de `ano` não desempatou por PK: {pks}"

    desc = _linhas(client, admin_token, sort="titulo", order="desc", limit=100)
    assert [r["id"] for r in desc] == sorted(r["id"] for r in desc)


def test_snapshot_publico_e_estavel_entre_publicacoes(client, admin_token, db_session):
    """O corte do snapshot (teto de linhas) sem ordem pega o que a heap
    devolver: duas publicações do MESMO dado davam sites diferentes. Aqui o
    dado não é alterado entre as duas leituras — só a ordem precisa bater."""
    import main
    import schemas

    tabela = _mk_table(client, admin_token)
    _semear(client, admin_token, n=12)

    dono = db_session.query(models.User).filter(models.User.username == "testadmin").first()
    assert dono is not None
    selecao = [schemas.TableSelectionItem(table_id=tabela["id"], order=0)]

    def snap():
        return main._build_snapshot_payload(
            owner=dono, version_number=1, description=None, theme_config={},
            table_selection=selecao, db=db_session,
        )

    a = snap()
    pks_a = [r["id"] for r in a["tables"][0]["rows"]]
    assert len(pks_a) == 12, f"snapshot trouxe {len(pks_a)} linhas de 12"
    assert pks_a == sorted(pks_a), f"snapshot fora de ordem: {pks_a}"

    # A EDIÇÃO NO MEIO é o que dá poder ao teste. Sem ela, a ordem física
    # coincide com a de inserção e o teste passaria mesmo sem `ORDER BY` —
    # exatamente o teste que "passa pelo motivo errado". Em Postgres o UPDATE
    # grava versão nova no fim da heap; sem ordem, a linha muda de lugar no
    # snapshot e o site publicado sai com as linhas embaralhadas.
    alvo = pks_a[len(pks_a) // 2]
    client.put(f"/api/acervo/{alvo}", json={"nota": "editado entre publicações"},
               headers=_auth(admin_token))
    db_session.commit()

    pks_b = [r["id"] for r in snap()["tables"][0]["rows"]]
    assert pks_b == pks_a, (
        f"a ordem do snapshot mudou por causa de uma edição: {pks_a} -> {pks_b}"
    )
