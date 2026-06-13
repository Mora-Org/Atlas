"""M-Ops F1 — health check que toca o banco (vs GET / que mente)."""


def test_health_touches_db(client):
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["db"] == "ok"


def test_health_needs_no_auth(client):
    # uptime monitor / keep-alive batem sem token
    res = client.get("/health")
    assert res.status_code == 200


def test_root_still_welcomes(client):
    res = client.get("/")
    assert res.status_code == 200
    assert "message" in res.json()
