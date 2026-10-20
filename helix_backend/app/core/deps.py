from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models import User, Hospital
from app.core.config import settings

bearer = HTTPBearer(auto_error=False)

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer), db: Session = Depends(get_db)) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    try:
        payload = jwt.decode(credentials.credentials, settings.secret_key, algorithms=["HS256"])
        user_id = int(payload.get("sub"))
    except (JWTError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    if user.hospital_id:
        hospital = db.query(Hospital).filter(Hospital.hospital_code == user.hospital_id).first()
        if not hospital or not hospital.is_active:
            raise HTTPException(status_code=403, detail="Hospital is inactive")
    return user

def require_roles(*roles):
    def checker(user: User = Depends(get_current_user)):
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return checker

def require_hospital_user(user: User = Depends(get_current_user)) -> User:
    if not user.hospital_id or user.role == "patient":
        raise HTTPException(status_code=403, detail="This action requires a hospital staff account")
    return user
