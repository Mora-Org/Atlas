"""Tests for FEAT-01: Foreign Key / Relations API."""


def _create_parent_child(client, token):
    """Create a parent table + a child table with FK pointing to parent."""
    parent = client.post("/tables/", json={
        "name": "categories",
        "columns": [
            {"name": "id",   "data_type": "Integer", "is_nullable": False, "is_unique": False, "is_primary": True},
            {"name": "name", "data_type": "String",  "is_nullable": False, "is_unique": False, "is_primary": False},
        ],
    }, headers={"Authorization": f"Bearer {token}"})
    assert parent.status_code == 200

    child = client.post("/tables/", json={
        "name": "items",
        "columns": [
            {"name": "id",    "data_type": "Integer", "is_nullable": False, "is_unique": False, "is_primary": True},
            {"name": "title", "data_type": "String",  "is_nullable": False, "is_unique": False, "is_primary": False},
            {"name": "category_id", "data_type": "Integer", "is_nullable": False,
             "is_unique": False, "is_primary": False,
             "fk_table": "categories", "fk_column": "id"},
        ],
    }, headers={"Authorization": f"Bearer {token}"})
    assert child.status_code == 200
    return parent.json(), child.json()


def test_foreign_key_population(client, admin_token):
    """Creating a child table with fk_table/fk_column registers a DynamicRelation
    and /api/relations/table/{name} returns the expected lookup payload."""
    _create_parent_child(client, admin_token)

    res = client.get("/api/relations/table/items",
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    rels = res.json()
    assert len(rels) == 1
    rel = rels[0]
    assert rel["from_table"] == "items"
    assert rel["from_column_name"] == "category_id"
    assert rel["to_table"] == "categories"
    assert rel["to_column_name"] == "id"


# ──────────────────────────────────────────────────────────────────────────
# M7 PR2b — GET /api/relations/ agregado (Schema Visualizer)
# ──────────────────────────────────────────────────────────────────────────

def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_workspace_relations_aggregated(client, admin_token):
    """GET /api/relations/ devolve todas as relações do workspace em 1 chamada,
    incluindo o espelho DynamicRelation criado junto com a FK física."""
    _create_parent_child(client, admin_token)

    res = client.get("/api/relations/", headers=_auth(admin_token))
    assert res.status_code == 200
    rels = res.json()
    assert len(rels) == 1
    assert rels[0]["from_table"] == "items"
    assert rels[0]["to_table"] == "categories"
    assert rels[0]["from_column_name"] == "category_id"


def test_workspace_relations_includes_null_columns(client, admin_token):
    """Relação lógica com column names NULL ENTRA no agregado
    (o per-table /api/relations/table/{name} a descarta)."""
    parent, child = _create_parent_child(client, admin_token)

    res = client.post("/api/relations", json={
        "name": "relacao_sem_colunas",
        "from_table_id": child["id"],
        "to_table_id": parent["id"],
        "relation_type": "many_to_one",
        "from_column_name": None,
        "to_column_name": None,
    }, headers=_auth(admin_token))
    assert res.status_code == 200

    rels = client.get("/api/relations/", headers=_auth(admin_token)).json()
    solta = next(r for r in rels if r["name"] == "relacao_sem_colunas")
    assert solta["from_column_name"] is None
    assert solta["to_column_name"] is None
    # e o per-table continua descartando — comportamento dele intocado
    per_table = client.get("/api/relations/table/items", headers=_auth(admin_token)).json()
    assert all(r["name"] != "relacao_sem_colunas" for r in per_table)


def test_workspace_relations_tenant_isolation(client, master_token, admin_token):
    """Admin de outro tenant NÃO vê as relações deste workspace."""
    _create_parent_child(client, admin_token)

    res = client.post("/api/admins",
                      json={"username": "outroadmin", "password": "admin123", "role": "admin"},
                      headers=_auth(master_token))
    assert res.status_code == 200, res.text

    rels = client.get("/api/relations/", headers=_auth("test-outroadmin")).json()
    assert rels == []


def _table(name, group_id=None, fk=None):
    cols = [
        {"name": "id",   "data_type": "Integer", "is_nullable": False, "is_unique": False, "is_primary": True},
        {"name": "nome", "data_type": "String",  "is_nullable": False, "is_unique": False, "is_primary": False},
    ]
    if fk:
        cols.append({"name": f"{fk}_id", "data_type": "Integer", "is_nullable": False,
                     "is_unique": False, "is_primary": False,
                     "fk_table": fk, "fk_column": "id"})
    body = {"name": name, "columns": cols}
    if group_id is not None:
        body["group_id"] = group_id
    return body


def test_workspace_relations_moderator_scoped(client, admin_token, mod_token):
    """Moderator só vê relações cujos DOIS lados estão nos grupos permitidos —
    não herda o leak do per-table (to_table sem checagem de acesso)."""
    g = client.post("/api/database-groups", json={"name": "Permitido"},
                    headers=_auth(admin_token)).json()
    mods = client.get("/api/moderators", headers=_auth(admin_token)).json()
    client.post(f"/api/database-groups/{g['id']}/permissions",
                json={"moderator_id": mods[0]["id"]}, headers=_auth(admin_token))

    # parent FORA do grupo; child DENTRO, com FK pro parent
    assert client.post("/tables/", json=_table("autores"),
                       headers=_auth(admin_token)).status_code == 200
    assert client.post("/tables/", json=_table("livros", group_id=g["id"], fk="autores"),
                       headers=_auth(admin_token)).status_code == 200
    # par totalmente DENTRO do grupo
    assert client.post("/tables/", json=_table("colecoes", group_id=g["id"]),
                       headers=_auth(admin_token)).status_code == 200
    assert client.post("/tables/", json=_table("volumes", group_id=g["id"], fk="colecoes"),
                       headers=_auth(admin_token)).status_code == 200

    rels = client.get("/api/relations/", headers=_auth(mod_token)).json()
    names = {(r["from_table"], r["to_table"]) for r in rels}
    # vê a relação cujos dois lados estão no grupo…
    assert ("volumes", "colecoes") in names
    # …e NÃO vê a que tem o lado 'autores' fora do acesso
    assert ("livros", "autores") not in names

    # admin dono vê as duas
    all_rels = client.get("/api/relations/", headers=_auth(admin_token)).json()
    all_names = {(r["from_table"], r["to_table"]) for r in all_rels}
    assert {("volumes", "colecoes"), ("livros", "autores")} <= all_names


def test_relations_delete(client, admin_token):
    """DELETE /api/relations/{id} removes the logical relation record."""
    _create_parent_child(client, admin_token)
    rels = client.get("/api/relations/table/items",
                      headers={"Authorization": f"Bearer {admin_token}"}).json()
    rel_id = rels[0]["id"]

    res = client.delete(f"/api/relations/{rel_id}",
                        headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200

    after = client.get("/api/relations/table/items",
                       headers={"Authorization": f"Bearer {admin_token}"}).json()
    assert all(r["id"] != rel_id for r in after)
