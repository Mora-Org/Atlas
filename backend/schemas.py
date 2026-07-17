from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import List, Optional
from datetime import datetime

# M8 F1: whitelist de `data_type` na borda (fecha o smell do string-livre).
# Vale só pra CRIAÇÃO de coluna (ColumnCreate) — cobre os dois endpoints
# (POST /tables/ e o add-column da F0). ColumnResponse fica de fora de
# propósito: o import SQL grava tipos refletidos (VARCHAR/TEXT/…) direto no
# ORM e essas colunas legadas precisam continuar serializáveis.
# Grafias canônicas dos tipos de mídia são minúsculas — congelam em snapshot.
MEDIA_TYPES = ("image", "file", "attachment")
ALLOWED_DATA_TYPES = frozenset(
    {"Integer", "String", "Boolean", "DateTime", "Float", "Date", "Text"}
    | set(MEDIA_TYPES)
)

class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict

class UserBase(BaseModel):
    username: str
    role: str = "moderator"

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    parent_id: Optional[int] = None
    workspace_name: Optional[str] = None
    workspace_slug: Optional[str] = None


class WorkspaceUpdate(BaseModel):
    workspace_name: str = Field(min_length=1, max_length=80)
    workspace_slug: str = Field(min_length=3, max_length=32, pattern=r'^[a-z0-9-]+$')

class PasswordReset(BaseModel):
    new_password: str

class QRLoginSessionResponse(BaseModel):
    session_id: str
    expires_at: datetime

class QRLoginStatus(BaseModel):
    is_authorized: bool
    access_token: Optional[str] = None
    token_type: Optional[str] = None
    user: Optional[UserResponse] = None

class QRAuthorizeRequest(BaseModel):
    session_id: str

# Schema for Database Groups
class DatabaseGroupCreate(BaseModel):
    name: str
    description: Optional[str] = None

class DatabaseGroupResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: Optional[str] = None
    admin_id: int
    created_at: datetime

# Schema for Permissions
class PermissionCreate(BaseModel):
    moderator_id: int

class PermissionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    moderator_id: int
    group_id: int = Field(validation_alias='database_group_id')

# Schema for Columns
class ColumnBase(BaseModel):
    name: str
    data_type: str
    is_nullable: bool = True
    is_unique: bool = False
    is_primary: bool = False

class ColumnCreate(ColumnBase):
    fk_table: Optional[str] = None   # logical name of referenced table
    fk_column: Optional[str] = None  # column in referenced table (e.g. "id")

    @field_validator("data_type")
    @classmethod
    def _data_type_whitelist(cls, v: str) -> str:
        if v not in ALLOWED_DATA_TYPES:
            raise ValueError(
                f"data_type '{v}' não suportado. Válidos: {', '.join(sorted(ALLOWED_DATA_TYPES))}"
            )
        return v

class ColumnResponse(ColumnBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    table_id: int
    fk_table: Optional[str] = None
    fk_column: Optional[str] = None

# Schema for Tables
class TableBase(BaseModel):
    name: str
    description: Optional[str] = None

class TableCreate(TableBase):
    columns: List[ColumnCreate] = []
    is_public: bool = False
    group_id: Optional[int] = None

class TableMeta(BaseModel):
    row_count: int = 0
    column_count: int = 0
    relation_count: int = 0

class TableResponse(TableBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    owner_id: Optional[int] = None
    group_id: Optional[int] = None
    is_public: bool = False
    created_at: datetime
    columns: List[ColumnResponse] = []
    meta: Optional[TableMeta] = None

# Schema for Relations
class RelationBase(BaseModel):
    name: str
    from_table_id: int
    to_table_id: int
    relation_type: str
    from_column_name: Optional[str] = None
    to_column_name: Optional[str] = None

class RelationCreate(RelationBase):
    pass

class RelationResponse(RelationBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    junction_table_name: Optional[str] = None

class RelationInfo(BaseModel):
    """Lightweight relation info returned alongside table data in the DataViewer."""
    id: int
    name: str
    from_table: str
    from_column_name: str
    to_table: str
    to_column_name: str
    relation_type: str


class WorkspaceRelationInfo(BaseModel):
    """Relação agregada do workspace pro Schema Visualizer (M7 PR2b).

    Diferente de RelationInfo, column names são Optional: relações lógicas
    criadas via POST /api/relations podem ter from/to_column_name NULL no
    banco — o visualizer as exibe sem âncora de coluna em vez de descartá-las
    (o per-table /api/relations/table/{name} descarta; este endpoint não).
    """
    id: int
    name: str
    from_table: str
    from_column_name: Optional[str] = None
    to_table: str
    to_column_name: Optional[str] = None
    relation_type: str


# Schema for Publication Versions (M6 Fase 1)
class TableSelectionItem(BaseModel):
    """Uma tabela curada no snapshot: id local + ordem + layout."""
    table_id: int
    order: int
    layout: str = Field(default="list", pattern=r"^(list|grid|essay)$")


class PublicationVersionCreate(BaseModel):
    """Body do POST /api/publications/me/versions."""
    description: Optional[str] = None
    theme_config: dict = Field(default_factory=dict)
    table_selection: List[TableSelectionItem] = Field(default_factory=list)


class PublicationPreview(BaseModel):
    """Body do POST /api/publications/me/preview (PR4b/M8 F3): só a seleção de
    tabelas — o preview monta o MESMO blob do publish (via _build_snapshot_payload)
    sem persistir. Tema é aplicado client-side, não precisa ir no body."""
    table_selection: List[TableSelectionItem] = Field(default_factory=list)


class PublicationVersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    owner_id: int
    version_number: int
    created_at: datetime
    created_by: Optional[int] = None
    is_active: bool
    activated_at: Optional[datetime] = None  # última ativação (publish/rollback)
    description: Optional[str] = None
    theme_config: dict = Field(default_factory=dict)
    table_selection: List[dict] = Field(default_factory=list)
    # `storage_path` é intencionalmente omitido — implementação interna.


# ==========================================
# Views & Agregação (M8.5 F1)
# ==========================================

class ViewSlice(BaseModel):
    """Um recorte nomeado do "A vs B".

    Reusa os 7 operadores de filtro que já existem na rota de dados
    (main.py:1406) — a F1 não inventa linguagem de filtro nova.
    """
    model_config = ConfigDict(extra="forbid")
    label: str = Field(min_length=1, max_length=60)
    filter_col: Optional[str] = None
    filter_val: Optional[str] = None
    filter_op: str = Field(default="eq", pattern=r"^(eq|contains|gt|lt|gte|lte|neq)$")


class ViewConfig(BaseModel):
    """Pacote flexível da view (decisão 11: híbrido).

    Mora na coluna JSON `_views.config`, mas é ESTRITAMENTE validado aqui na
    porta — `extra="forbid"`. O medo comum de que "JSON = sem validação" não se
    aplica: o `table_selection` do M6 já é JSON validado assim. O ganho do
    híbrido é que a F2 cresce mudando ESTE schema (código) em vez de migrar o
    banco de produção.

    `slices` tem teto 4 e `top_n` teto DURO 50 — os mesmos do motor
    (aggregation.MAX_SLICES / MAX_TOP_N). Duplicados de propósito: a porta
    barra antes, o motor barra de novo (defesa em profundidade — o publish
    chama o motor sem passar por esta porta).
    """
    model_config = ConfigDict(extra="forbid")
    slices: List[ViewSlice] = Field(default_factory=list, max_length=4)
    top_n: int = Field(default=20, ge=1, le=50)
    search: Optional[str] = None


class ViewBase(BaseModel):
    """Campos PRÓPRIOS da view — o que o backend procura sem abrir o pacote."""
    name: str = Field(min_length=1, max_length=120)
    group_by: str = Field(min_length=1)
    operation: str = Field(pattern=r"^(count|count_distinct|sum|avg)$")
    metric_column: Optional[str] = None
    config: ViewConfig = Field(default_factory=ViewConfig)

    @field_validator("metric_column")
    @classmethod
    def _metric_matches_operation(cls, v, info):
        """`count` não usa métrica; o resto exige. A prova de TIPO (numérico)
        não cabe aqui — depende da tabela física refletida, então roda no motor
        (aggregation.validate_spec) e vira 400 no endpoint."""
        op = info.data.get("operation")
        if op == "count" and v:
            raise ValueError("Operação 'count' não usa coluna-métrica.")
        if op and op != "count" and not v:
            raise ValueError(f"Operação '{op}' exige coluna-métrica.")
        return v


class ViewCreate(ViewBase):
    """Body do POST /api/views/me."""
    table_id: int


class ViewUpdate(ViewBase):
    """Body do PUT /api/views/me/{view_id}. `table_id` é imutável: trocar a
    tabela de uma view salva mudaria o significado do artefato sem mudar o id.
    """


class ViewResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    owner_id: int
    table_id: int
    name: str
    group_by: str
    operation: str
    metric_column: Optional[str] = None
    config: dict = Field(default_factory=dict)
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: datetime


class AggregationRequest(BaseModel):
    """Body do POST /api/views/me/preview — agregado ad-hoc, sem salvar.

    Espelha `POST /api/publications/me/preview` (main.py:2205): o chart builder
    da F2 desenha enquanto o usuário monta, usando o MESMO motor do publish.
    Preview == publicado, zero drift.
    """
    model_config = ConfigDict(extra="forbid")
    table_id: int
    group_by: str = Field(min_length=1)
    operation: str = Field(pattern=r"^(count|count_distinct|sum|avg)$")
    metric_column: Optional[str] = None
    config: ViewConfig = Field(default_factory=ViewConfig)
