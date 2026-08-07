"""Autenticação via Supabase Auth (M4).

Migrado de JWT custom HS256 → Supabase Auth ES256:
- `get_current_user` valida o Bearer JWT contra o JWKS público do
  Supabase e busca o user em `public.users` pelo `supabase_uid`.
- `create_master_account` orquestra Supabase Admin API + `public.users`,
  com backfill idempotente pra contas legadas (M3) sem `supabase_uid`.
- Senhas em texto puro vão pra Admin API; `password_hash` em
  `public.users` é mantido como fallback opcional (será removido em
  release subsequente).

QR login está desabilitado no M4 — emitir JWT do Supabase pelo backend
não é suportado pela Admin API. Rotas continuam montadas mas retornam
503.
"""
from __future__ import annotations

import datetime
import re
from dataclasses import dataclass
from typing import Optional

import bcrypt
import jwt as pyjwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jwt import PyJWKClient
from sqlalchemy.orm import Session

import api_keys
import models
import supabase_admin
from database import get_db


# ---------------------------------------------------------------------- #
# Helpers
# ---------------------------------------------------------------------- #


def _slugify(s: str) -> str:
    s = s.lower().strip()
    s = re.sub(r"[^a-z0-9\s-]", "", s)
    s = re.sub(r"[\s_]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s[:32] or "workspace"


def _user_dict(user: models.User) -> dict:
    workspace_name = user.workspace_name or user.username
    workspace_slug = user.workspace_slug or _slugify(user.username)
    return {
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "workspace_name": workspace_name,
        "workspace_slug": workspace_slug,
    }


def get_password_hash(password: str) -> str:
    """Hash bcrypt — usado só como fallback legado em `public.users`."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


# ---------------------------------------------------------------------- #
# Supabase JWT validation
# ---------------------------------------------------------------------- #

# Bearer token extractor. O `tokenUrl` é fake (login é via SDK do
# Supabase no frontend, não bate no backend) — só serve pro Swagger UI.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login", auto_error=False)

_jwks_client: Optional[PyJWKClient] = None


def _get_jwks_client() -> PyJWKClient:
    """JWKS singleton. PyJWKClient cacheia internamente as keys."""
    global _jwks_client
    if _jwks_client is None:
        if not supabase_admin.SUPABASE_URL:
            raise RuntimeError(
                "SUPABASE_URL não configurado — não posso validar JWTs do Supabase."
            )
        jwks_url = f"{supabase_admin.SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json"
        _jwks_client = PyJWKClient(jwks_url)
    return _jwks_client


def _decode_supabase_jwt(token: str) -> dict:
    """Valida assinatura + expiração e devolve o payload.

    `audience='authenticated'` é o aud padrão pra users logados no
    Supabase. Service-to-service usa `service_role` (não chega aqui).
    """
    signing_key = _get_jwks_client().get_signing_key_from_jwt(token).key
    return pyjwt.decode(
        token,
        signing_key,
        algorithms=["ES256"],
        audience="authenticated",
        options={"require": ["exp", "sub"]},
    )


# ---------------------------------------------------------------------- #
# FastAPI dependencies
# ---------------------------------------------------------------------- #

_CRED_EXC = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def _resolve_user_token(token: str, db: Session) -> models.User:
    """Token HUMANO → `models.User`. Extraído pra o principal da F2 reusar o
    mesmo caminho em vez de manter uma segunda cópia da regra de auth."""
    # Dev/test sem Supabase: aceita token fake `test-<username>` (emitido
    # pelo /api/auth/login em modo offline). Permite dev local rodar sem
    # Supabase e mantém a suite pytest sem reescrita.
    if not supabase_admin.is_configured() and token.startswith("test-"):
        username = token[len("test-"):]
        user = db.query(models.User).filter(models.User.username == username).first()
        if user is None:
            raise _CRED_EXC
        return user

    try:
        payload = _decode_supabase_jwt(token)
    except Exception:
        raise _CRED_EXC

    supabase_uid = payload.get("sub")
    if not supabase_uid:
        raise _CRED_EXC

    user = db.query(models.User).filter(models.User.supabase_uid == supabase_uid).first()
    if user is None:
        # JWT válido mas user nunca foi provisionado no nosso banco —
        # estado inconsistente. 401 em vez de 500 pra não vazar info.
        raise _CRED_EXC
    return user


async def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    if not token:
        raise _CRED_EXC
    # Uma API key NÃO é um usuário: quem a apresenta aqui está batendo numa
    # rota humana (criar tabela, publicar…). 401 explícito em vez de deixar o
    # validador de JWT falhar por acidente — a mensagem some, o motivo fica.
    if api_keys.looks_like_key(token):
        raise _CRED_EXC
    return _resolve_user_token(token, db)


async def get_current_active_user(current_user: models.User = Depends(get_current_user)):
    return current_user


async def get_current_master(current_user: models.User = Depends(get_current_active_user)):
    if current_user.role != "master":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Master access required")
    return current_user


async def get_current_admin(current_user: models.User = Depends(get_current_active_user)):
    if current_user.role not in ("admin", "master"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


# ---------------------------------------------------------------------- #
# M9 F2 — Principal: humano OU API key, resolvido no mesmo header
# ---------------------------------------------------------------------- #

@dataclass(frozen=True)
class Principal:
    """Quem está falando com a API.

    `user` é SEMPRE o dono do workspace — pra uma key, é o admin dono dela. É
    isso que mantém `resolve_tenant_id` e `get_accessible_tables` intactos:
    eles continuam recebendo um `models.User` e não sabem que existe key.
    O que a key restringe é aplicado por cima, pelo escopo.
    """
    kind: str                                  # 'user' | 'key'
    user: models.User
    key: Optional["models.ApiKey"] = None

    @property
    def is_key(self) -> bool:
        return self.kind == "key"

    @property
    def scopes(self) -> dict:
        return (self.key.scopes if self.key is not None else None) or {}

    @property
    def label(self) -> str:
        if self.key is not None:
            return f"{self.key.name} ({self.key.prefix})"
        return self.user.username


_KEY_EXC = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="API key inválida, revogada ou expirada",
    headers={"WWW-Authenticate": "Bearer"},
)


def resolve_key(token: str, db: Session) -> "models.ApiKey":
    """Token `mora_…` → linha de `_api_keys`, ou 401.

    Lookup é por PREFIXO indexado (O(1)); a posse é provada por comparação de
    digest em tempo constante. Todas as recusas devolvem a MESMA mensagem — key
    inexistente, segredo errado, revogada e expirada são indistinguíveis de
    fora, senão o 401 vira oráculo de enumeração.
    """
    parsed = api_keys.parse(token)
    if parsed is None:
        raise _KEY_EXC
    prefix, secret = parsed

    key = db.query(models.ApiKey).filter(models.ApiKey.prefix == prefix).first()
    if key is None:
        # Gasta o mesmo trabalho de um acerto: sem isto, o tempo de resposta
        # separa "prefixo existe" de "não existe".
        api_keys.verify(secret, "0" * 64)
        raise _KEY_EXC
    if not api_keys.verify(secret, key.secret_hash):
        raise _KEY_EXC
    if not key.is_live(datetime.datetime.utcnow()):
        raise _KEY_EXC
    return key


async def get_principal(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Principal:
    """Transporte único (decisão do Diretor): `Authorization: Bearer` carrega os
    dois, e o prefixo `mora_` decide qual validador tentar — o sniff vem ANTES
    do JWT, senão toda key 401aria no validador errado."""
    if not token:
        raise _CRED_EXC

    if api_keys.looks_like_key(token):
        key = resolve_key(token, db)
        owner = db.query(models.User).filter(models.User.id == key.owner_id).first()
        if owner is None:
            raise _KEY_EXC
        # GATE ANTI-MASTER, segunda camada (a primeira barra na criação).
        # `get_accessible_tables(master)` devolve as tabelas de TODOS os
        # tenants: uma key de master exfiltraria a plataforma inteira e não
        # morreria com tenant nenhum. Fail-closed aqui cobre o caso de a linha
        # ter nascido por bug, migração ou escrita direta no banco.
        if owner.role == "master":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="API key de conta master não é permitida",
            )
        return Principal(kind="key", user=owner, key=key)

    return Principal(kind="user", user=_resolve_user_token(token, db))


# ---------------------------------------------------------------------- #
# Master seeding (idempotente, com backfill pra contas legadas)
# ---------------------------------------------------------------------- #

MASTER_USERNAME = "puczaras"
MASTER_PASSWORD = "Zup Paras"
MASTER_EMAIL = "cesarsibila210@gmail.com"


def create_master_account(db: Session) -> None:
    """Garante que o master existe em `public.users` E `auth.users`.

    Cenários:
    - DB fresh: cria em ambos.
    - DB com master legado (sem supabase_uid): provisiona em
      `auth.users` e backfilla `supabase_uid` em `public.users`.
    - Tudo OK: no-op.

    Em SQLite (dev sem Supabase configurado) cria só em `public.users`
    com password_hash — bridge pra rodar localmente sem env vars do
    Supabase. Em prod sempre passa pelo Admin API.
    """
    user = db.query(models.User).filter(models.User.username == MASTER_USERNAME).first()

    if user is None:
        # Cria do zero.
        sup_uid = None
        if supabase_admin.is_configured():
            sup_uid = supabase_admin.provision_user(
                username=MASTER_USERNAME,
                password=MASTER_PASSWORD,
                role="master",
                email=MASTER_EMAIL,
            )
        master = models.User(
            username=MASTER_USERNAME,
            password_hash=get_password_hash(MASTER_PASSWORD),
            role="master",
            supabase_uid=sup_uid,
        )
        db.add(master)
        db.commit()
        return

    if user.supabase_uid is None and supabase_admin.is_configured():
        # Backfill: master existe localmente mas não no Supabase.
        sup_uid = supabase_admin.provision_user(
            username=MASTER_USERNAME,
            password=MASTER_PASSWORD,
            role="master",
            email=MASTER_EMAIL,
        )
        user.supabase_uid = sup_uid
        db.commit()


# ---------------------------------------------------------------------- #
# Auth router — endpoints públicos
# ---------------------------------------------------------------------- #

auth_router = APIRouter()


@auth_router.post("/login")
async def login_route(request: Request, db: Session = Depends(get_db)) -> dict:
    """Login dual-mode.

    - **Prod (Supabase configurado):** 410 Gone. Frontend deve usar
      `supabase.auth.signInWithPassword()` direto.
    - **Dev/test local (sem `SUPABASE_URL`):** valida username/password
      contra `public.users` e devolve token fake `test-<username>` que
      o conftest dos testes (e dev local em modo offline) entende.

    Esse dual-mode permite (a) frontend dev rodar contra backend local
    sem precisar Supabase, e (b) suite pytest existente continuar usando
    `POST /api/auth/login` sem reescrita de cada teste.
    """
    if supabase_admin.is_configured():
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail=(
                "Backend login foi descontinuado no M4. Use "
                "`supabase.auth.signInWithPassword()` no frontend."
            ),
        )

    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        body = await request.json()
        username = body.get("username", "")
        password = body.get("password", "")
    else:
        form = await request.form()
        username = form.get("username", "")
        password = form.get("password", "")

    if not username or not password:
        raise HTTPException(status_code=422, detail="username and password are required")

    user = db.query(models.User).filter(models.User.username == username).first()
    if not user or not bcrypt.checkpw(password.encode("utf-8"), user.password_hash.encode("utf-8")):
        raise HTTPException(
            status_code=401,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return {
        "access_token": f"test-{user.username}",
        "token_type": "bearer",
        "user": _user_dict(user),
    }


# QR login desabilitado no M4 (emitir JWT do Supabase pelo backend não
# é suportado pela Admin API). Rotas mantidas pra não quebrar URLs
# antigas; retornam 503.

_QR_DISABLED = HTTPException(
    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
    detail="QR login temporariamente indisponível (será reimplementado em release futura via Supabase Magic Link).",
)


@auth_router.post("/qr/session")
def qr_session_disabled() -> dict:
    raise _QR_DISABLED


@auth_router.get("/qr/status/{session_id}")
def qr_status_disabled(session_id: str) -> dict:  # noqa: ARG001
    raise _QR_DISABLED


@auth_router.post("/qr/authorize")
def qr_authorize_disabled() -> dict:
    raise _QR_DISABLED
