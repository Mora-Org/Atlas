"""M9 F2 — unit do módulo puro de API keys.

O que estes testes protegem é a parte que erra em SILÊNCIO: um parse que
picota o segredo, um escopo que aceita o que não devia, uma comparação que
vaza timing. Nada disso levanta exceção — só passa a aceitar credencial
errada, ou a recusar a certa.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import api_keys  # noqa: E402


def test_token_tem_o_formato_publicado():
    k = api_keys.generate()
    assert k.token.startswith("mora_")
    prefixo, segredo = api_keys.parse(k.token)
    assert prefixo == k.prefix
    assert len(prefixo) == 8               # token_hex(4)
    assert len(segredo) >= 40              # token_urlsafe(32)


def test_o_segredo_NAO_e_derivavel_do_que_fica_no_banco():
    """O banco guarda prefixo + digest. Nenhum dos dois pode conter o segredo —
    é o que torna o vazamento do banco insuficiente pra usar a key."""
    k = api_keys.generate()
    _, segredo = api_keys.parse(k.token)
    assert segredo not in k.secret_hash
    assert segredo not in k.prefix
    assert len(k.secret_hash) == 64        # sha256 hex


def test_cada_key_e_unica():
    tokens = {api_keys.generate().token for _ in range(50)}
    prefixos = {api_keys.generate().prefix for _ in range(50)}
    assert len(tokens) == 50
    assert len(prefixos) == 50


def test_parse_aguenta_underscore_no_segredo():
    """`token_urlsafe` usa base64url, que INCLUI `_`. Um split ingênuo por `_`
    picotaria o segredo e a key legítima passaria a falhar — de forma
    intermitente, só nas keys que sorteassem um underscore.
    """
    token = "mora_deadbeef_abc_def_ghi"
    prefixo, segredo = api_keys.parse(token)
    assert prefixo == "deadbeef"
    assert segredo == "abc_def_ghi"


def test_parse_recusa_lixo():
    for ruim in ["", "mora_", "mora_sozinho", "outra_coisa_aqui", "Bearer xyz",
                 "mora__segredo", "mora_prefixo_"]:
        assert api_keys.parse(ruim) is None, ruim


def test_sniff_separa_key_de_jwt():
    """É o que a decisão de transporte compra: a mesma header carrega os dois,
    e o prefixo decide qual validador tentar. Sem o sniff, toda key cairia no
    validador de JWT e 401aria."""
    assert api_keys.looks_like_key("mora_abc_def")
    assert not api_keys.looks_like_key("eyJhbGciOiJFUzI1NiJ9.abc.def")
    assert not api_keys.looks_like_key("test-testadmin")
    assert not api_keys.looks_like_key(None)


def test_verify_aceita_o_certo_e_recusa_o_resto():
    k = api_keys.generate()
    _, segredo = api_keys.parse(k.token)
    assert api_keys.verify(segredo, k.secret_hash)
    assert not api_keys.verify(segredo + "x", k.secret_hash)
    assert not api_keys.verify("", k.secret_hash)
    outra = api_keys.generate()
    _, outro_segredo = api_keys.parse(outra.token)
    assert not api_keys.verify(outro_segredo, k.secret_hash)


# ── escopos ──────────────────────────────────────────────────────────────

def test_escopo_nega_por_padrao():
    """Deny-by-default é o inverso do resto do app, e de propósito: credencial
    de máquina não tem quem confira o que ela alcança."""
    assert not api_keys.allows(None, api_keys.READ, "clientes")
    assert not api_keys.allows({}, api_keys.READ, "clientes")
    assert not api_keys.allows({"read": []}, api_keys.READ, "clientes")


def test_escopo_de_leitura_libera_so_a_tabela_listada():
    esc = api_keys.normalize_scopes({"read": ["clientes"]})
    assert api_keys.allows(esc, api_keys.READ, "clientes")
    assert not api_keys.allows(esc, api_keys.READ, "vendas")


def test_curinga_NAO_e_atalho_pra_tudo():
    """Sem `*` na v1: um curinga transformaria toda tabela criada no futuro em
    tabela já exposta, sem ninguém decidir isso. `*` é tratado como nome
    literal — e nenhuma tabela pode se chamar assim."""
    esc = api_keys.normalize_scopes({"read": ["*"]})
    assert not api_keys.allows(esc, api_keys.READ, "clientes")


def test_verbo_desconhecido_nega():
    esc = api_keys.normalize_scopes({"read": ["clientes"]})
    assert not api_keys.allows(esc, "delete", "clientes")
    assert not api_keys.allows(esc, "admin", "clientes")


def test_normalize_limpa_o_pacote_do_cliente():
    esc = api_keys.normalize_scopes({
        "read": ["  b  ", "a", "a", ""],
        "write": ["z"],
        "inventado": ["x"],
    })
    assert esc == {"read": ["a", "b"], "write": ["z"]}
    assert "inventado" not in esc


def test_write_e_aceito_no_pacote_mas_o_guard_da_v1_e_quem_decide():
    """A coluna já fala `write` pra ligar escrita depois não virar migration.
    Quem nega na v1 é o handler, não o formato."""
    esc = api_keys.normalize_scopes({"write": ["clientes"]})
    assert api_keys.allows(esc, api_keys.WRITE, "clientes")
