import os
import re
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
import models, schemas
from database import get_db


def _slugify(s: str) -> str:
    s = s.lower().strip()
    s = re.sub(r'[^a-z0-9\s-]', '', s)
    s = re.sub(r'[\s_]+', '-', s)
    s = re.sub(r'-+', '-', s).strip('-')
    return s[:32] or 'workspace'


def _user_dict(user: models.User) -> dict:
    """Build user dict with workspace fallbacks for login/me responses."""
    workspace_name = user.workspace_name or user.username
    workspace_slug = user.workspace_slug or _slugify(user.username)
    return {
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "workspace_name": workspace_name,
        "workspace_slug": workspace_slug,
    }

import bcrypt

SECRET_KEY = os.getenv("SECRET_KEY", "super-secret-key-123")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

def verify_password(plain_password: str, hashed_password: str):
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False

def get_password_hash(password: str):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def create_master_account(db: Session):
    """Seed the master account on first startup"""
    user = db.query(models.User).filter(models.User.username == "puczaras").first()
    if not user:
        master_user = models.User(
            username="puczaras",
            password_hash=get_password_hash("Zup Paras"),
            role="master"
        )
        db.add(master_user)
        db.commit()

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        raise credentials_exception
    return user

async def get_current_active_user(current_user: models.User = Depends(get_current_user)):
    return current_user

async def get_current_master(current_user: models.User = Depends(get_current_active_user)):
    """Only master role can access"""
    if current_user.role != "master":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Master access required")
    return current_user

async def get_current_admin(current_user: models.User = Depends(get_current_active_user)):
    """Admin or master can access"""
    if current_user.role not in ("admin", "master"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user

auth_router = APIRouter()

@auth_router.post("/login", response_model=schemas.Token)
async def login_for_access_token(request: Request, db: Session = Depends(get_db)):
    """Accepts both application/x-www-form-urlencoded (OAuth2 standard) and application/json."""
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
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="username and password are required")

    user = db.query(models.User).filter(models.User.username == username).first()
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username, "role": user.role, "id": user.id}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer", "user": _user_dict(user)}

import uuid

@auth_router.post("/qr/session", response_model=schemas.QRLoginSessionResponse)
def create_qr_session(db: Session = Depends(get_db)):
    """Create a new session for QR login"""
    session_id = str(uuid.uuid4())
    expires_at = datetime.utcnow() + timedelta(minutes=5)
    db_session = models.QRLoginSession(
        session_id=session_id,
        expires_at=expires_at
    )
    db.add(db_session)
    db.commit()
    return {"session_id": session_id, "expires_at": expires_at}

@auth_router.get("/qr/status/{session_id}", response_model=schemas.QRLoginStatus)
def get_qr_status(session_id: str, db: Session = Depends(get_db)):
    """Poll the status of a QR login session"""
    session = db.query(models.QRLoginSession).filter(models.QRLoginSession.session_id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Session expired")
    
    if session.is_authorized and session.authorized_user_id:
        user = db.query(models.User).filter(models.User.id == session.authorized_user_id).first()
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user.username, "role": user.role, "id": user.id}, 
            expires_delta=access_token_expires
        )
        return {
            "is_authorized": True,
            "access_token": access_token,
            "token_type": "bearer",
            "user": _user_dict(user),
        }
    
    return {"is_authorized": False}

@auth_router.post("/qr/authorize")
def authorize_qr_session(
    request: schemas.QRAuthorizeRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """Mark a QR session as authorized (called by the phone UI)"""
    session = db.query(models.QRLoginSession).filter(models.QRLoginSession.session_id == request.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Session expired")
    
    session.is_authorized = True
    session.authorized_user_id = current_user.id
    db.commit()
    return {"message": "Session authorized"}
