from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime

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
    database_group_id: int

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

class TableResponse(TableBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    owner_id: Optional[int] = None
    group_id: Optional[int] = None
    is_public: bool = False
    created_at: datetime
    columns: List[ColumnResponse] = []

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
    from_table_name: str
    from_column_name: str
    to_table_name: str
    to_column_name: str
    relation_type: str
