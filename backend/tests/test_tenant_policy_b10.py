"""B10 — a policy de isolamento sob uma role que NÃO bypassa a RLS.

**Por que sob role própria:** a role da aplicação tem `rolbypassrls=TRUE` (medido
em prod no `0.7.2` e no PG local). Com bypass, a policy nunca é avaliada — então
qualquer teste que rode como ela é **tautológico**: passa com a policy certa,
com a policy errada e sem policy nenhuma. Era exatamente por isso que o B10
podia existir sem nenhum teste vermelho.

Estes testes criam uma role `NOBYPASSRLS` e exercitam a policy de verdade.

Os dois defeitos cobertos:
1. `current_setting(...)::int` levantava **22P02** quando o GUC estava em string
   vazia — o estado de qualquer conexão devolvida ao pool. Vira 500 em vez de
   negar.
2. O ramo do master aceitava a **flag sozinha**, então uma sessão que setasse só
   `app.is_master` lia o banco inteiro. Corrigir o (1) pela via óbvia teria
   **alargado** o (2).
"""
import os
import sys

import pytest
import sqlalchemy as sa

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dynamic_schema import TENANT_POLICY_CHECK, TENANT_POLICY_USING  # noqa: E402

IS_POSTGRES = os.environ.get("DATABASE_URL", "").startswith("postgres")
pytestmark = pytest.mark.skipif(not IS_POSTGRES, reason="RLS é PG-only")

ROLE = "b10_norls"
SENHA = "b10pass"


@pytest.fixture
def tabela_com_policy(db_session):
    """Tabela de tenant com a policy REAL do produto, e uma role sem bypass."""
    db_session.execute(sa.text(f"""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='{ROLE}') THEN
                CREATE ROLE {ROLE} LOGIN PASSWORD '{SENHA}' NOSUPERUSER NOBYPASSRLS;
            END IF;
        END $$;
    """))
    db_session.execute(sa.text("DROP TABLE IF EXISTS public.b10_alvo"))
    db_session.execute(sa.text(
        "CREATE TABLE public.b10_alvo (id serial primary key, tenant_id int, v text)"))
    db_session.execute(sa.text(
        "INSERT INTO public.b10_alvo (tenant_id, v) VALUES (2,'do dois'),(3,'do tres'),(3,'outro do tres')"))
    db_session.execute(sa.text(f"ALTER TABLE public.b10_alvo OWNER TO {ROLE}"))
    db_session.execute(sa.text("ALTER TABLE public.b10_alvo ENABLE ROW LEVEL SECURITY"))
    db_session.execute(sa.text("ALTER TABLE public.b10_alvo FORCE ROW LEVEL SECURITY"))
    db_session.execute(sa.text(
        f"CREATE POLICY tenant_isolation ON public.b10_alvo "
        f"USING ({TENANT_POLICY_USING}) WITH CHECK ({TENANT_POLICY_CHECK})"))
    db_session.execute(sa.text(f"GRANT USAGE ON SCHEMA public TO {ROLE}"))
    db_session.commit()

    url = os.environ["DATABASE_URL"]
    tail = url.split("://", 1)[1].split("@", 1)[-1]
    eng = sa.create_engine(f"postgresql://{ROLE}:{SENHA}@{tail}", poolclass=sa.pool.NullPool)
    yield eng
    eng.dispose()
    db_session.execute(sa.text("DROP TABLE IF EXISTS public.b10_alvo"))
    db_session.commit()


def _conta(eng, tenant=None, master=None):
    with eng.connect() as c:
        if tenant is not None:
            c.execute(sa.text("SELECT set_config('app.tenant_id', :t, false)"), {"t": tenant})
        if master is not None:
            c.execute(sa.text("SELECT set_config('app.is_master', :m, false)"), {"m": master})
        return c.execute(sa.text("SELECT count(*) FROM public.b10_alvo")).scalar()


# ── o defeito 1: GUC vazio nega, não erra ────────────────────────────────

def test_guc_vazio_NEGA_em_vez_de_levantar_22P02(tabela_com_policy):
    """O caso do B10. Antes: `''::int` → 22P02 → 500 na rota que pegasse a
    conexão. Agora: 0 linhas, que é a semântica pretendida."""
    assert _conta(tabela_com_policy, tenant="", master="false") == 0


def test_conexao_virgem_continua_negando(tabela_com_policy):
    assert _conta(tabela_com_policy) == 0


def test_tenant_certo_ve_so_o_dele(tabela_com_policy):
    assert _conta(tabela_com_policy, tenant="2", master="false") == 1
    assert _conta(tabela_com_policy, tenant="3", master="false") == 2


def test_escrita_com_guc_vazio_tambem_nega_sem_erro(tabela_com_policy):
    """O `WITH CHECK` sofria do mesmo 22P02 — o B10 pegava escrita, não só
    leitura. Agora tem que ser recusa limpa (42501), não erro de cast."""
    with tabela_com_policy.connect() as c:
        c.execute(sa.text("SELECT set_config('app.tenant_id', '', false)"))
        with pytest.raises(Exception) as exc:
            c.execute(sa.text("INSERT INTO public.b10_alvo (tenant_id, v) VALUES (2,'x')"))
        codigo = getattr(getattr(exc.value, "orig", None), "pgcode", "")
        assert codigo == "42501", f"esperava violação de RLS, veio {codigo}"


# ── o defeito 2: a flag de master sozinha não basta ──────────────────────

def test_master_legitimo_ve_tudo(tabela_com_policy):
    """`set_tenant_for_session(None)` seta sentinela '0' + flag. Esse é o
    master de verdade, e ele continua vendo tudo."""
    assert _conta(tabela_com_policy, tenant="0", master="true") == 3


def test_flag_de_master_SOZINHA_nao_vaza(tabela_com_policy):
    """Buraco que existia ANTES do B10 e que o fix fechou: quem setasse só
    `app.is_master` lia o banco inteiro. Medido na policy antiga: vazava 3
    linhas com tenant válido, e o `NULLIF` sozinho passaria a vazar também com
    o tenant vazio — que é o estado normal de conexão reciclada."""
    assert _conta(tabela_com_policy, tenant="", master="true") == 0
    assert _conta(tabela_com_policy, tenant="2", master="true") == 1, \
        "flag de master com tenant alheio vazou — o ramo não está amarrado à sentinela"


# ── a expressão é fonte única ────────────────────────────────────────────

def test_a_migration_e_o_create_usam_a_MESMA_expressao():
    """Se divergirem, metade dos tenants fica com uma regra e metade com outra,
    e nada no sistema compara as duas."""
    import importlib.util
    caminho = os.path.join(os.path.dirname(__file__), "..", "migrations", "versions",
                           "f3a80c5d1e97_fix_tenant_policy_nullif.py")
    spec = importlib.util.spec_from_file_location("mig_b10", caminho)
    mig = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mig)
    assert mig.TENANT_POLICY_USING == TENANT_POLICY_USING
    assert mig.TENANT_POLICY_CHECK == TENANT_POLICY_CHECK
    assert "NULLIF" in TENANT_POLICY_USING and "'0'" in TENANT_POLICY_USING
