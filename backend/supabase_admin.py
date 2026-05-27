"""Cliente Admin do Supabase + provisionamento de usuários (M4).

Backend usa a Service Role key pra criar/atualizar contas no
`auth.users` do Supabase. `app_metadata` carrega `role` e `tenant_id`
— Supabase embute no JWT, frontend lê via SDK, RLS lê via
`auth.jwt() -> 'app_metadata'`.

Em dev (sem SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY), as funções
levantam RuntimeError clara — feito propositalmente pra não silenciar
configuração faltante.
"""
from __future__ import annotations

import os
from typing import Optional

from supabase import Client, create_client


SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip()
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()


_admin_client: Optional[Client] = None


def is_configured() -> bool:
    return bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)


def get_admin() -> Client:
    """Cliente Admin singleton. Lazy: só conecta quando chamado."""
    global _admin_client
    if not is_configured():
        raise RuntimeError(
            "Supabase Admin não configurado. Defina SUPABASE_URL e "
            "SUPABASE_SERVICE_ROLE_KEY nas env vars."
        )
    if _admin_client is None:
        _admin_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    return _admin_client


def email_for_username(username: str) -> str:
    """Username → email interno pra Supabase Auth.

    Mantemos o form do frontend pedindo só `username` (UX inalterada),
    geramos um email determinístico que o Supabase aceita.
    """
    return f"{username}@users.atlas-mora.app"


def provision_user(
    *,
    username: str,
    password: str,
    role: str,
    tenant_id: Optional[int] = None,
    email: Optional[str] = None,
) -> str:
    """Cria user no Supabase Auth e devolve o UUID.

    `app_metadata` embute role+tenant_id direto no JWT que o Supabase
    emitir depois (zero triggers, zero Edge Functions).

    Args:
        username: nosso identificador local.
        password: senha em texto puro (Supabase faz o hash).
        role: 'master' | 'admin' | 'moderator'.
        tenant_id: admin id pra mods/admins; None pra master.
        email: opcional, override do email fake (usado pelo master).

    Returns:
        UUID do auth.users criado, pronto pra gravar em
        `public.users.supabase_uid`.

    Raises:
        RuntimeError: Supabase Admin não configurado.
        Exception: erros da Admin API (email duplicado, etc).
    """
    client = get_admin()
    user_email = (email or email_for_username(username)).strip()

    app_metadata = {"role": role}
    if tenant_id is not None:
        app_metadata["tenant_id"] = tenant_id

    resp = client.auth.admin.create_user(
        {
            "email": user_email,
            "password": password,
            "email_confirm": True,
            "app_metadata": app_metadata,
            "user_metadata": {"username": username},
        }
    )
    if not resp or not resp.user or not resp.user.id:
        raise RuntimeError(f"Supabase admin.create_user devolveu resposta inválida: {resp!r}")
    return resp.user.id


def update_user_metadata(
    supabase_uid,
    *,
    role: Optional[str] = None,
    tenant_id: Optional[int] = None,
) -> None:
    """Patch do `app_metadata` (role + tenant_id) num user existente.

    Usado depois do INSERT em `public.users` pra cravar o `tenant_id`
    real (id auto-gerado pelo Postgres) no JWT. Supabase faz merge — só
    chaves passadas sobrescrevem; o resto fica intacto.

    `supabase_uid` aceita `uuid.UUID` ou `str` — converte sempre pro SDK.
    """
    if role is None and tenant_id is None:
        return
    client = get_admin()
    patch = {}
    if role is not None:
        patch["role"] = role
    if tenant_id is not None:
        patch["tenant_id"] = tenant_id
    client.auth.admin.update_user_by_id(str(supabase_uid), {"app_metadata": patch})


def delete_user(supabase_uid) -> None:
    """Remove user do auth.users. Idempotente — ignora 404.

    `supabase_uid` pode chegar como `uuid.UUID` (quando lido de coluna
    Postgres `uuid`) ou `str`. O SDK precisa de str — converte sempre.
    """
    client = get_admin()
    try:
        client.auth.admin.delete_user(str(supabase_uid))
    except Exception as exc:
        # Pode ser 404 (já deletado). Não relançamos — chamadores
        # geralmente estão tentando garantir limpeza.
        if "not found" not in str(exc).lower() and "404" not in str(exc):
            raise
