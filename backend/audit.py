"""M9 F1 — trilha de auditoria: vocabulário de ações + helper de gravação.

Módulo PURO (sem FastAPI): recebe uma `Session` e uma abstração de ator, nunca
um `models.User` cru. É isso que deixa a F2 emitir `('key', id, nome)` no mesmo
helper sem migration e sem tocar em nenhum handler.

## A regra que não é óbvia: o helper DIFERE POR CAMINHO (decisão G3)

Não existe caminho único de mutação neste backend — nem service layer, nem
event listener de ORM. Há dois regimes, e o audit tem que se comportar
diferente em cada um:

- **Atômico** (`tenant_db`): 1 transação por request, commit no teardown. O
  INSERT do audit entra na MESMA transação da mutação. Se ele falhar, é certo
  abortar tudo junto — a mutação não fica sem trilha. Use `record()`.

- **Não-atômico** (DDL, `import_sql_script`, `create_table`): a mutação já é
  DURÁVEL quando o audit roda (o DDL usa `engine.begin()` em conexão própria e
  já commitou). Aqui um audit que levanta derruba uma operação que **funcionou**
  — o cliente veria erro numa tabela que foi criada. Use `record_best_effort()`:
  engole a exceção e grita no logger `atlas`.

Registrar isso em código, e não só no plano, é o ponto: quem for adicionar hook
novo escolhe pelo regime do handler, não pelo gosto.

## O que NUNCA entra aqui

Valor de célula. `changed_columns` são NOMES de coluna (decisão 2). Diff seria
uma segunda cópia de PII do tenant num log append-only, colidindo com pedido de
erasure. Afrouxar isso depois é coluna aditiva; o inverso exige apagar histórico.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Iterable, Optional

from sqlalchemy.orm import Session

import models

logger = logging.getLogger("atlas")


# ── Vocabulário ───────────────────────────────────────────────────────────
# `action` é String livre no banco de propósito (F2/F3 acrescentam sem
# migration), mas o CONJUNTO é nomeado aqui — string solta no handler vira
# vocabulário ad-hoc e o consumidor da trilha não tem o que filtrar.

# dado do cliente (atômico, tenant_db)
RECORD_CREATE = "record.create"
RECORD_UPDATE = "record.update"
RECORD_DELETE = "record.delete"

# M9 F2 — LEITURA, e só quando feita por API key (decisão 1 do Diretor).
# Leitura humana fica fora: auditar todo GET de tela explodiria o volume no free
# tier sem responder nada que já não se saiba. Leitura por key é o oposto — é o
# ÚNICO jeito de detectar key read-only vazada exfiltrando o tenant, e sem
# `row_count`/`offset` no payload a detecção nasce cega (mil requests de 1 linha
# e um request de mil linhas ficariam idênticos na trilha).
RECORD_READ = "record.read"
CATALOG_READ = "catalog.read"

# forma da tabela (não-atômico)
TABLE_CREATE = "table.create"
TABLE_DELETE = "table.delete"
COLUMN_ADD = "table.column_add"
COLUMN_DROP = "table.column_drop"
TABLE_VISIBILITY = "table.visibility"
TABLE_SOURCE = "table.source"

# entrada em massa (evento AGREGADO — nunca 1 por linha, decisão 5)
IMPORT_APPEND = "import.append"
IMPORT_CREATE_TABLE = "import.create_table"
IMPORT_SQL = "import.sql_script"

# plano de acesso — o de maior valor forense
MODERATOR_CREATE = "moderator.create"
MODERATOR_DELETE = "moderator.delete"
MODERATOR_PASSWORD_RESET = "moderator.password_reset"
PERMISSION_GRANT = "permission.grant"
PERMISSION_REVOKE = "permission.revoke"
GROUP_CREATE = "group.create"
GROUP_DELETE = "group.delete"
WORKSPACE_UPDATE = "workspace.update"

# publicação (activate = o site vai ao ar)
PUBLICATION_CREATE = "publication.create"
PUBLICATION_ACTIVATE = "publication.activate"
PUBLICATION_DELETE = "publication.delete"

# views/gráficos (M8.5)
VIEW_CREATE = "view.create"
VIEW_UPDATE = "view.update"
VIEW_DELETE = "view.delete"

# relações e mídia
# credencial de máquina (M9 F2) — quem criou e quem revogou key é dos eventos
# mais sensíveis da trilha: é a porta que um atacante quer abrir e fechar.
KEY_CREATE = "key.create"
KEY_REVOKE = "key.revoke"

# webhooks (M9 F3) — apontar o Atlas pra uma URL nova é mudança de para onde o
# dado do tenant sai; tem que ficar registrado igual à criação de key.
WEBHOOK_CREATE = "webhook.create"
WEBHOOK_DELETE = "webhook.delete"

RELATION_CREATE = "relation.create"
RELATION_DELETE = "relation.delete"
ASSET_UPLOAD = "asset.upload"
ASSET_DELETE = "asset.delete"
ASSET_GC = "asset.gc"

# Tipos de alvo (polimórfico — auth e publish não têm tabela-alvo)
T_TABLE = "table"
T_COLUMN = "column"
T_USER = "user"
T_GROUP = "group"
T_PERMISSION = "permission"
T_VERSION = "version"
T_VIEW = "view"
T_RELATION = "relation"
T_ASSET = "asset"
T_WORKSPACE = "workspace"
T_KEY = "api_key"
T_WEBHOOK = "webhook"


@dataclass(frozen=True)
class Actor:
    """Quem fez. `type` é 'user' na F1 e 'key' na F2 — o helper não muda.

    `label` é um SNAPSHOT do nome no momento do evento: sobrevive à deleção do
    ATOR (não à do OWNER, que leva a trilha inteira junto por decisão D3).
    `ip`/`user_agent` nascem aqui e ficam vazios na F1 de propósito — o
    preenchimento vira load-bearing na F2, quando é o único sinal capaz de
    flagrar uma key vazada sendo usada de outro lugar (decisão D4).
    """
    type: str
    id: Optional[int] = None
    label: Optional[str] = None
    ip: Optional[str] = None
    user_agent: Optional[str] = None


def user_actor(user: "models.User", request=None) -> Actor:
    """Ator a partir do usuário logado (+ request, quando o handler tiver um)."""
    ip = None
    ua = None
    if request is not None:
        # `client.host` é o IP do PROXY quando há um na frente (Railway). Ler o
        # header correto é spike de plataforma da F2 — aqui fica o que dá pra
        # afirmar, e a coluna aceita NULL.
        ip = getattr(getattr(request, "client", None), "host", None)
        ua = request.headers.get("user-agent") if hasattr(request, "headers") else None
    return Actor(type="user", id=user.id, label=user.username, ip=ip, user_agent=ua)


def tenant_of(user: "models.User") -> Optional[int]:
    """Dono da TRILHA para um usuário: admin = ele mesmo, moderador = o admin.

    Master devolve None — ele não tem workspace próprio, então quem age sobre o
    tenant de outro precisa passar `owner_id` explícito (o dono do alvo). Sem
    isso a ação do master cairia numa trilha que não é de ninguém.
    """
    if user.role == "admin":
        return user.id
    if user.role == "moderator":
        return user.parent_id
    return None


def _build(
    *,
    owner_id: int,
    actor: Actor,
    action: str,
    target_type: Optional[str] = None,
    target_id: Optional[int] = None,
    target_label: Optional[str] = None,
    target_row_id: Optional[Any] = None,
    changed_columns: Optional[Iterable[str]] = None,
    details: Optional[dict] = None,
) -> models.AuditLog:
    return models.AuditLog(
        owner_id=owner_id,
        action=action,
        actor_type=actor.type,
        actor_id=actor.id,
        actor_label=actor.label,
        actor_ip=actor.ip,
        user_agent=actor.user_agent,
        target_type=target_type,
        target_id=target_id,
        target_label=target_label,
        # A PK da linha é do cliente e pode não ser int — guardar como texto
        # evita perder o evento por tipo (e a trilha não faz aritmética com ela).
        target_row_id=None if target_row_id is None else str(target_row_id),
        changed_columns=list(changed_columns) if changed_columns is not None else None,
        details=details,
    )


def record(db: Session, *, owner_id: Optional[int], actor: Actor, action: str, **kw) -> None:
    """Caminho ATÔMICO: entra na transação da mutação e pode levantar.

    Não commita — quem commita é o `tenant_db` no teardown. `flush()` existe pra
    o erro aparecer aqui, com o handler no stack, e não num teardown anônimo.

    `owner_id=None` (ação de master sem tenant resolvido) é NO-OP explícito, não
    exceção: melhor perder um evento de plataforma do que derrubar a escrita de
    um cliente por causa da trilha.
    """
    if owner_id is None:
        logger.warning("audit sem owner_id resolvido; evento '%s' descartado", action)
        return
    db.add(_build(owner_id=owner_id, actor=actor, action=action, **kw))
    db.flush()


def record_best_effort(db: Session, *, owner_id: Optional[int], actor: Actor,
                       action: str, **kw) -> None:
    """Caminho NÃO-ATÔMICO: a mutação já é durável, então o audit não pode matá-la.

    Commita por conta própria justamente porque não há transação da mutação pra
    pegar carona. Em caso de falha, faz rollback (pra devolver a sessão usável)
    e grita no logger — a operação do cliente segue de pé, e o buraco na trilha
    fica registrado em algum lugar em vez de sumir.
    """
    if owner_id is None:
        logger.warning("audit sem owner_id resolvido; evento '%s' descartado", action)
        return
    try:
        db.add(_build(owner_id=owner_id, actor=actor, action=action, **kw))
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("falha ao gravar audit '%s' (owner=%s) — mutação já durável",
                         action, owner_id)


def purge_for_owner(db: Session, owner_id: int) -> int:
    """Apaga a trilha de um tenant. Companion OBRIGATÓRIO do `delete_admin`.

    O `ondelete=CASCADE` da FK só age em Postgres: o SQLite não enforce FK (não
    há `PRAGMA foreign_keys` em lugar nenhum do backend), então em dev a trilha
    sobreviveria ao dono e ficaria órfã apontando pra um usuário inexistente.
    """
    n = db.query(models.AuditLog).filter(models.AuditLog.owner_id == owner_id).delete(
        synchronize_session=False
    )
    return n
