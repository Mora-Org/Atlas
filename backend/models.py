from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Text, JSON, Index, func
from sqlalchemy.orm import relationship
import datetime
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="moderator", nullable=False)  # 'master', 'admin', or 'moderator'
    parent_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # admin→master, mod→admin
    workspace_name = Column(String, nullable=True)   # editorial display name, e.g. "Centro Budista do Brasil"
    workspace_slug = Column(String, nullable=True, unique=True)  # URL-safe slug, e.g. "centrobudista"
    # M4: referência ao auth.users.id do Supabase. Nullable durante
    # cutover — backfilled pelo startup do backend via Admin API.
    supabase_uid = Column(String(36), unique=True, nullable=True, index=True)

    # Admin owns database groups
    owned_groups = relationship("DatabaseGroup", back_populates="admin", cascade="all, delete-orphan")
    # Moderator permissions
    permissions = relationship("ModeratorPermission", back_populates="moderator", cascade="all, delete-orphan",
                               foreign_keys="ModeratorPermission.moderator_id")
    # Tables owned by this admin
    owned_tables = relationship("DynamicTable", back_populates="owner", cascade="all, delete-orphan", foreign_keys="DynamicTable.owner_id")


class DatabaseGroup(Base):
    """Logical group of tables owned by an admin"""
    __tablename__ = "database_groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    admin_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    admin = relationship("User", back_populates="owned_groups")
    tables = relationship("DynamicTable", back_populates="group", cascade="all, delete-orphan")
    permissions = relationship("ModeratorPermission", back_populates="group", cascade="all, delete-orphan")


class ModeratorPermission(Base):
    """Links a moderator to a database group they can access"""
    __tablename__ = "moderator_permissions"

    id = Column(Integer, primary_key=True, index=True)
    moderator_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    database_group_id = Column(Integer, ForeignKey("database_groups.id"), nullable=False)

    moderator = relationship("User", back_populates="permissions", foreign_keys=[moderator_id])
    group = relationship("DatabaseGroup", back_populates="permissions")


class DynamicTable(Base):
    __tablename__ = "_tables"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    description = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    group_id = Column(Integer, ForeignKey("database_groups.id"), nullable=True)
    is_public = Column(Boolean, default=False)

    # M8.5 F3: proveniência do dado, pra citação honesta no impresso acadêmico.
    # Preenchido no import (o filename da fonte) ou editável pelo admin. NULL =
    # o acadêmico cita só o metadado do snapshot (workspace/versão/data), nunca
    # fabrica bibliografia (decisão D2 do Diretor, 2026-07-21). `description` é
    # texto livre de UI; `source` é especificamente a origem citável.
    source = Column(String, nullable=True)

    # Tenant metadata (M3 Fase 2):
    # tenant_id    = admin id explícito; vai pra RLS no Postgres.
    # schema_name  = "tenant_5" no Postgres; NULL no SQLite (fallback prefix).
    # physical_name = nome real no schema (ex.: "clientes" — sem prefixo legado t5_).
    tenant_id = Column(Integer, nullable=False, index=True)
    schema_name = Column(String, nullable=True)
    physical_name = Column(String, nullable=True)

    owner = relationship("User", back_populates="owned_tables", foreign_keys=[owner_id])
    group = relationship("DatabaseGroup", back_populates="tables")
    columns = relationship("DynamicColumn", back_populates="table", cascade="all, delete-orphan")
    from_relations = relationship("DynamicRelation", back_populates="from_table", cascade="all, delete-orphan", foreign_keys="DynamicRelation.from_table_id")
    to_relations = relationship("DynamicRelation", back_populates="to_table", cascade="all, delete-orphan", foreign_keys="DynamicRelation.to_table_id")
    # M8.5 F1: cascade ORM (não `ondelete`) — SQLite não enforce FK, então
    # `ondelete=CASCADE` seria no-op em dev e só funcionaria em prod. Isto dá
    # de graça a limpeza no delete de tabela (main.py:1016) e de admin (:285).
    views = relationship("DynamicView", back_populates="table", cascade="all, delete-orphan")


class DynamicColumn(Base):
    __tablename__ = "_columns"

    id = Column(Integer, primary_key=True, index=True)
    table_id = Column(Integer, ForeignKey("_tables.id"), nullable=False)
    name = Column(String, nullable=False)
    data_type = Column(String, nullable=False)
    is_nullable = Column(Boolean, default=True)
    is_unique = Column(Boolean, default=False)
    is_primary = Column(Boolean, default=False)
    fk_table = Column(String, nullable=True)   # logical name of referenced table
    fk_column = Column(String, nullable=True)  # referenced column (e.g. "id")

    table = relationship("DynamicTable", back_populates="columns")


class DynamicRelation(Base):
    __tablename__ = "_relations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    from_table_id = Column(Integer, ForeignKey("_tables.id"), nullable=False)
    to_table_id = Column(Integer, ForeignKey("_tables.id"), nullable=False)
    relation_type = Column(String, nullable=False)
    junction_table_name = Column(String, nullable=True)
    from_column_name = Column(String, nullable=True)
    to_column_name = Column(String, nullable=True)

    from_table = relationship("DynamicTable", back_populates="from_relations", foreign_keys=[from_table_id])
    to_table = relationship("DynamicTable", back_populates="to_relations", foreign_keys=[to_table_id])

class QRLoginSession(Base):
    """Temporary session for QR code login"""
    __tablename__ = "qr_login_sessions"

    session_id = Column(String, primary_key=True, index=True)
    authorized_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    is_authorized = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)

    user = relationship("User")


class Asset(Base):
    """M8 F1: Media Library central do workspace.

    Um asset = um blob no bucket de mídia + metadados aqui. A célula da
    tabela dinâmica guarda a URL pública (string); a resolução URL→asset é
    por `path` (opaco: `{owner_id}/{uuid}{ext}`, imutável, nunca upsert).
    `refcount` conta referências de células — mantido por expressão SQL nos
    hooks do CRUD/DDL (media_cleanup.py). Blob órfão (refcount=0) só sai
    via GC explícito (idade mínima), DELETE do asset ou delete_admin.
    """
    __tablename__ = "_assets"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # Autoria (admin ou moderador — a biblioteca é do workspace inteiro).
    uploaded_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    path = Column(String, unique=True, nullable=False, index=True)
    mime = Column(String, nullable=False)
    size_bytes = Column(Integer, nullable=False)
    original_name = Column(String, nullable=False)
    refcount = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    owner = relationship("User", foreign_keys=[owner_id])


class DynamicView(Base):
    """M8.5 F1: view salva — recorte + agregação persistidos como artefato de
    workspace consultável (decisão 4 do Diretor, 2026-07-12). É o insumo do
    chart builder da F2 e o substrato dos live charts do M10 F4.

    Schema HÍBRIDO (decisão 11, 2026-07-16): o que o backend precisa PROCURAR
    mora em coluna própria — o publish varre as views de uma tabela por campo
    indexado sem abrir o pacote, e o guard de "essa coluna está em uso por um
    gráfico" filtra por `group_by`/`metric_column` como já se faz pras relações
    (main.py:940-949). O resto (filtros, ordenação, e o que a F2 inventar) mora
    em `config`, que cresce sem migration em produção.

    `config` é OPACA em SQL — filtrada em Python, nunca com `@>`/GIN. O tipo
    físico divergiu por história do banco: prod (incremental) tem `jsonb`, mas
    DB fresh e o test-DB têm `json`, porque este model declara `JSON` e o
    `create_all` emite `JSON` enquanto a migration c5dad43f9889:40 emite
    `JSONB`. Operador de jsonb funcionaria em prod e quebraria em ambiente
    novo — e o teste passaria/falharia pelo motivo errado.
    """
    __tablename__ = "_views"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # Autoria (admin ou moderador — a view é do workspace inteiro, molde da
    # Media Library; decisão 12).
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    # FK SEM `ondelete`: a limpeza é pelo cascade ORM em DynamicTable.views —
    # único desenho que limpa nos DOIS bancos (medido). Ligar por NOME está
    # descartado: não existe rename, então reciclar um nome seria drop+create e
    # a view velha se re-attacharia a uma tabela nova com dado diferente.
    table_id = Column(Integer, ForeignKey("_tables.id"), nullable=False, index=True)
    name = Column(String, nullable=False)

    # --- Campos próprios: o backend procura por estes ---
    # Coluna de agrupamento (o eixo das categorias).
    group_by = Column(String, nullable=False)
    # count | count_distinct | sum | avg — decisão 10. `min`/`max` ficam FORA
    # de propósito: MAX em booleana passa em dev (=1) e dá 500 em prod, e
    # MIN/MAX em texto dá eixo alfabético. Validado na porta pelo schema.
    operation = Column(String, nullable=False)
    # NULL quando operation='count' (contar não precisa de coluna-métrica).
    metric_column = Column(String, nullable=True)

    # --- Pacote flexível: a F2 cresce aqui sem tocar no banco ---
    config = Column(JSON, default=dict, nullable=False)

    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow,
                        onupdate=datetime.datetime.utcnow, nullable=False)

    table = relationship("DynamicTable", back_populates="views")
    owner = relationship("User", foreign_keys=[owner_id])
    author = relationship("User", foreign_keys=[created_by])


class PublicationVersion(Base):
    """M6 Fase 1: snapshot imutável publicado de um workspace.

    - Metadados ficam aqui (tema, seleção de tabelas, layouts).
    - Os dados (rows das tabelas curadas) ficam em Supabase Storage no
      caminho `storage_path` como JSON único. Esse split mantém a DB
      enxuta e permite servir o site público sem hit no backend.
    - Apenas uma `is_active=True` por owner (UNIQUE INDEX parcial na
      migration).
    """
    __tablename__ = "_publication_versions"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)  # 1, 2, 3… por owner
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    is_active = Column(Boolean, default=False, nullable=False)
    # Quando esta versão foi ATIVADA pela última vez (publish ou rollback).
    # created_at diz quando o snapshot nasceu; sem este campo a data da
    # "edição vigente" mente após um rollback (M6.5 PR3).
    activated_at = Column(DateTime, nullable=True)
    description = Column(Text, nullable=True)
    storage_path = Column(Text, nullable=False)
    theme_config = Column(JSON, default=dict, nullable=False)
    table_selection = Column(JSON, default=list, nullable=False)
    # M8.5 F2: a SPEC dos gráficos (refs a views + título/ordem), pra a versão
    # ser re-editável — simétrico com `table_selection`. O SVG renderizado vive
    # no blob (não aqui); isto é só o que o builder precisa pra recarregar.
    chart_selection = Column(JSON, default=list, nullable=False)

    owner = relationship("User", foreign_keys=[owner_id])
    author = relationship("User", foreign_keys=[created_by])


class AuditLog(Base):
    """M9 F1: trilha de auditoria — a única história de mutação do tenant.

    As tabelas dinâmicas não têm `created_at`/`updated_at` (dynamic_schema.py):
    sem esta tabela, um moderador que apaga 200 linhas não deixa rastro nenhum.

    **Os webhooks da F3 NÃO leem esta tabela** — este docstring afirmava o
    contrário e induziu a erro o detalhamento do M10 (B12). O que a F3 faz é
    emitir `emit_webhook` *ao lado* do `audit.record()`, no mesmo handler e na
    mesma transação, com a linha **relida do banco** (`_row_snapshot`). Tem que
    ser assim: o audit se proíbe de guardar valor de célula (decisão 2/LGPD),
    então ele serve como sinal de "a linha X mudou", nunca como payload.

    **Ator e alvo são POLIMÓRFICOS** (decisão D1 + decorrência G2). O ator é
    `user` na F1 e vira `key` na F2 sem migration; o alvo precisa disso porque
    o escopo é forense COMPLETO (G1): reset de senha tem como alvo um usuário,
    ativar publicação tem uma versão, e nenhum dos dois é tabela dinâmica.
    Os ponteiros são SOFT (sem FK) de propósito: apagar a tabela É um evento
    auditado, e uma FK apagaria justamente o registro de que ela existiu.

    **Nunca guarda valor de célula** (decisão 2): `changed_columns` são NOMES.
    Diff seria uma 2ª cópia de PII num log append-only e colidiria com pedido
    de erasure (LGPD). Afrouxar depois é coluna aditiva; o inverso não é.

    `actor_label` é NULLABLE por segurança de produção: o INSERT é atômico com
    a mutação do cliente, então um NOT NULL violado por bug de audit abortaria
    a escrita de quem não tem nada a ver com isso. A invariante vive no app.

    `details` — nunca `metadata`, que é reservado pelo SQLAlchemy.
    """
    __tablename__ = "_audit_log"

    id = Column(Integer, primary_key=True, index=True)
    # Morre com o tenant (decisão D3) — + companion delete explícito no
    # delete_admin, porque SQLite não enforce FK e o CASCADE é inerte em dev.
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # `server_default` além do default Python: sem ele, a tabela nasce DIFERENTE
    # conforme a origem — num banco novo ela vem do `create_all` (só default de
    # Python) e num incremental vem da migration (com default de servidor).
    # É a mesma família de divergência do `json` vs `jsonb` que o M8.5 documentou,
    # e um INSERT que não passe pelo ORM quebraria só num dos ambientes.
    created_at = Column(DateTime, default=datetime.datetime.utcnow,
                        server_default=func.now(), nullable=False)

    # String livre, NUNCA enum/CHECK no banco (F2/F3 acrescentam ações sem
    # migration). O conjunto de strings é nomeado em `audit.py`.
    action = Column(String, nullable=False)

    # --- Ator (polimórfico, soft) ---
    actor_type = Column(String, nullable=False, default="user")  # 'user' | 'key' (F2)
    actor_id = Column(Integer, nullable=True)
    actor_label = Column(String, nullable=True)
    # D4: nascem na F1, preenchimento vira load-bearing na F2 — é o único sinal
    # que detecta key vazada sendo usada de outro lugar.
    actor_ip = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)

    # --- Alvo (polimórfico, soft) ---
    target_type = Column(String, nullable=True)   # 'table' | 'user' | 'version' | 'view' | …
    target_id = Column(Integer, nullable=True)
    target_label = Column(String, nullable=True)  # snapshot do nome no momento
    # Só faz sentido quando target_type='table': a PK da linha mexida. String
    # porque a PK da tabela dinâmica é do cliente, não necessariamente int.
    target_row_id = Column(String, nullable=True)

    changed_columns = Column(JSON, nullable=True)  # NOMES, nunca valores
    details = Column(JSON, nullable=True)

    owner = relationship("User", foreign_keys=[owner_id])

    # Consulta canônica = "o que aconteceu no meu workspace, mais recente
    # primeiro". Precisa existir no MODEL e na migration: o create_all serve o
    # CI e a migration serve prod — declarar num só some do outro ambiente.
    __table_args__ = (
        Index("ix__audit_log_owner_created", "owner_id", "created_at"),
    )


class ApiKey(Base):
    """M9 F2: credencial de máquina — segunda via de auth ao lado do JWT.

    **O segredo NÃO mora aqui.** A tabela guarda `prefix` (público, indexado) e
    `secret_hash` (SHA-256). O token completo existe uma única vez, na resposta
    que criou a key; depois disso nem o Atlas consegue reconstruí-lo.

    Por que SHA-256 e não bcrypt: o segredo tem 256 bits de CSPRNG, então não há
    dicionário a defender — hash lento não compra segurança e cobra 50-100ms por
    request num Procfile de UM processo. Pior: hash com salt não é indexável, e
    achar a key exigiria rodar bcrypt contra todas as linhas a cada chamada. O
    prefixo indexado resolve o lookup em O(1) e o digest prova posse. Racional
    completo em `api_keys.py`.

    **Revogação é SOFT** (`revoked_at`), não DELETE: a trilha de auditoria
    referencia a key por id e label, e apagar a linha cegaria o audit
    retroativamente — justo o registro de quem usou a credencial vazada.

    **Nunca de dono master** (gate anti-master): `get_accessible_tables(master)`
    devolve as tabelas de TODOS os tenants, então uma key de master exfiltraria a
    plataforma inteira e não morreria com tenant nenhum. Barrado na criação e,
    de novo, na resolução (fail-closed).
    """
    __tablename__ = "_api_keys"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    name = Column(String, nullable=False)
    prefix = Column(String, unique=True, nullable=False, index=True)
    secret_hash = Column(String, nullable=False)
    # {"read": [...], "write": [...]} — deny-by-default, sem curinga na v1.
    scopes = Column(JSON, default=dict, nullable=False)
    # server_default alinhado com a migration — ver a nota no AuditLog.
    created_at = Column(DateTime, default=datetime.datetime.utcnow,
                        server_default=func.now(), nullable=False)
    # Nullable = não expira. Quando setado é CHECADO — o plano tinha marcado
    # como "coluna morta"; nascer aplicada custa duas linhas.
    expires_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)

    owner = relationship("User", foreign_keys=[owner_id])
    author = relationship("User", foreign_keys=[created_by])

    def is_live(self, now: datetime.datetime) -> bool:
        """Uma key só serve se não foi revogada e não venceu."""
        if self.revoked_at is not None:
            return False
        if self.expires_at is not None and self.expires_at <= now:
            return False
        return True


class WebhookEndpoint(Base):
    """M9 F3: URL do cliente que recebe eventos de mutação.

    `secret_encrypted` é Fernet, não digest: diferente da API key, o Atlas
    precisa RECOMPUTAR o HMAC a cada tentativa no drain assíncrono, então o
    segredo tem que voltar em claro. A chave mora em env, nunca no banco — é
    isso que faz o vazamento do dump não entregar os segredos dos clientes.

    `events` é lista de nomes; endpoint sem eventos não recebe nada
    (deny-by-default, mesma régua do escopo da key).
    """
    __tablename__ = "_webhook_endpoints"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    name = Column(String, nullable=False)
    url = Column(String, nullable=False)
    secret_encrypted = Column(String, nullable=False)
    events = Column(JSON, default=list, nullable=False)
    # NULL = todas as tabelas do workspace. Lista = só essas.
    table_names = Column(JSON, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow,
                        server_default=func.now(), nullable=False)

    owner = relationship("User", foreign_keys=[owner_id])


class WebhookDelivery(Base):
    """M9 F3: a OUTBOX — a entrega nasce na MESMA transação da mutação.

    É isso que torna a promessa de durabilidade real: se o INSERT do dado
    commitou, a entrega existe; se deu rollback, não existe entrega fantasma de
    uma escrita que não aconteceu. Nenhum HTTP acontece dentro da transação.

    `body` é TEXT, não JSON: o corpo é serializado UMA vez no emit e enviado
    **verbatim**. Re-serializar no drain poderia reordenar chaves e quebrar a
    assinatura no receptor — que recusaria uma entrega legítima sem saber por quê.

    `delivery_id` é reusado em todas as tentativas: é o que permite ao receptor
    deduplicar num contrato at-least-once.
    """
    __tablename__ = "_webhook_deliveries"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    endpoint_id = Column(Integer, ForeignKey("_webhook_endpoints.id", ondelete="CASCADE"),
                         nullable=False, index=True)
    delivery_id = Column(String, nullable=False, index=True)
    event = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    # pending | in_flight | delivered | failed | dead
    status = Column(String, nullable=False, default="pending")
    attempts = Column(Integer, nullable=False, default=0)
    next_attempt_at = Column(DateTime, nullable=True)
    last_error = Column(String, nullable=True)
    response_status = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow,
                        server_default=func.now(), nullable=False)
    delivered_at = Column(DateTime, nullable=True)

    endpoint = relationship("WebhookEndpoint")

    # O drenador varre por (status, próxima tentativa) — sem composto isso é
    # seq scan na tabela que mais cresce do banco.
    __table_args__ = (
        Index("ix__webhook_deliveries_status_next", "status", "next_attempt_at"),
    )
