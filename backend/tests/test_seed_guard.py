"""M-Ops F4 — guard do seed do testadmin (senha conhecida) fora de dev local."""
from main import _should_seed_test_admin


def test_skip_seed_always_wins():
    assert _should_seed_test_admin("1", False, None) is False
    assert _should_seed_test_admin("1", True, "1") is False


def test_sqlite_dev_seeds():
    assert _should_seed_test_admin(None, False, None) is True


def test_postgres_prod_does_not_seed_by_default():
    # o bug que isto fecha: prod (postgres) seedava admin de senha conhecida
    assert _should_seed_test_admin(None, True, None) is False


def test_postgres_seeds_only_with_explicit_enable():
    assert _should_seed_test_admin(None, True, "1") is True
