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

# Schema for Columns
class ColumnBase(BaseModel):
    name: str
    data_type: str
    is_nullable: bool = True
    is_unique: bool = False
    is_primary: bool = False

class ColumnCreate(ColumnBase):
    pass

class ColumnResponse(ColumnBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    table_id: int

# Schema for Tables
class TableBase(BaseModel):
    name: str
    description: Optional[str] = None

class TableCreate(TableBase):
    columns: List[ColumnCreate] = []
    is_public: bool = False

class TableResponse(TableBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    owner_id: int
    is_public: bool = False
    created_at: datetime
    columns: List[ColumnResponse] = []

# Schema for Relations
class RelationBase(BaseModel):
    name: str
    from_table_id: int
    to_table_id: int
    relation_type: str

class RelationCreate(RelationBase):
    pass

class RelationResponse(RelationBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    junction_table_name: Optional[str] = None
