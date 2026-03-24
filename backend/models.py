from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
import datetime
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="moderator", nullable=False) # 'admin' or 'moderator'
    parent_id = Column(Integer, ForeignKey("users.id"), nullable=True) # If moderator, who created it

    tables = relationship("DynamicTable", back_populates="owner")

class DynamicTable(Base):
    __tablename__ = "_tables"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False) # Cannot be unique globally anymore, only per owner
    description = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_public = Column(Boolean, default=False)

    owner = relationship("User", back_populates="tables")
    columns = relationship("DynamicColumn", back_populates="table", cascade="all, delete-orphan")


class DynamicColumn(Base):
    __tablename__ = "_columns"

    id = Column(Integer, primary_key=True, index=True)
    table_id = Column(Integer, ForeignKey("_tables.id"), nullable=False)
    name = Column(String, nullable=False)
    data_type = Column(String, nullable=False) # e.g. 'String', 'Integer', 'Boolean', 'DateTime'
    is_nullable = Column(Boolean, default=True)
    is_unique = Column(Boolean, default=False)
    is_primary = Column(Boolean, default=False)

    table = relationship("DynamicTable", back_populates="columns")


class DynamicRelation(Base):
    __tablename__ = "_relations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    from_table_id = Column(Integer, ForeignKey("_tables.id"), nullable=False)
    to_table_id = Column(Integer, ForeignKey("_tables.id"), nullable=False)
    relation_type = Column(String, nullable=False) # e.g. 'one-to-many', 'many-to-many'
    junction_table_name = Column(String, nullable=True) # filled if many-to-many

    from_table = relationship("DynamicTable", foreign_keys=[from_table_id])
    to_table = relationship("DynamicTable", foreign_keys=[to_table_id])
