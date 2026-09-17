"""
BroilerLab — Authentication (JWT + bcrypt).

- Password hashing: passlib[bcrypt] (pinned bcrypt 4.0.1; >=4.1 breaks passlib).
- JWT: python-jose HS256, 24h default expiry
- Dependency: get_current_user (fail-closed — no user => 401)

On first import we ensure a dev admin exists if BROILER_CREATE_ADMIN=1 or DB is empty.
"""
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from config import JWT_SECRET, JWT_ALG, JWT_EXPIRE_MIN
from models import SessionLocal, User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_access_token(data: dict, expires_minutes: Optional[int] = None) -> str:
    to_encode = data.copy()
    exp = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes or JWT_EXPIRE_MIN)
    # tv (token version) lets password changes invalidate outstanding tokens.
    to_encode.setdefault("tv", 0)
    to_encode.update({"exp": exp})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALG)

def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_user_by_email(db: Session, email: str) -> Optional[User]:
    return db.query(User).filter(User.email == email.lower().strip()).first()

def get_user_by_id(db: Session, user_id: int) -> Optional[User]:
    return db.query(User).filter(User.id == user_id).first()

# -------- FastAPI dependency: require auth --------
def _token_version_ok(payload: dict, user: User) -> bool:
    """Reject tokens issued before the last password change."""
    try:
        return int(payload.get("tv", 0)) == int(user.token_version or 0)
    except (TypeError, ValueError):
        return False


async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    # Fail-closed: no token => 401, never return anonymous user for tenant-scoped queries
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated", headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = decode_token(token)
        uid = payload.get("sub")
        if uid is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        uid = int(uid)
    except (JWTError, ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = get_user_by_id(db, uid)
    if not user or not user.is_active or not _token_version_ok(payload, user):
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user

async def get_current_user_optional(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> Optional[User]:
    if not token:
        return None
    try:
        payload = decode_token(token)
        uid = int(payload.get("sub"))
        u = get_user_by_id(db, uid)
        return u if u and u.is_active and _token_version_ok(payload, u) else None
    except Exception:
        return None


def authenticate_token(token: str) -> Optional[User]:
    """Validate a JWT outside a request context (websocket query param).

    Returns the detached User on success, None on any failure (fail-closed).
    """
    if not token:
        return None
    try:
        payload = decode_token(token)
        uid = int(payload.get("sub"))
    except Exception:
        return None
    try:
        with SessionLocal() as s:
            u = s.get(User, uid)
            if not u or not u.is_active or not _token_version_ok(payload, u):
                return None
            s.expunge(u)
            return u
    except Exception:
        return None

def ensure_admin_seed():
    """No default accounts — registration is open, first user can be promoted
    to admin manually via SQL if needed. Kept as no-op for startup hook."""
    return None
