from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models import ProblemType, User
from app.schemas import ProblemTypeCreate
from app.core.deps import require_roles

router=APIRouter(prefix="/admin", tags=["admin"])

@router.post("/problem-types", status_code=201)
def add_problem_type(data: ProblemTypeCreate, db: Session = Depends(get_db), user: User = Depends(require_roles("admin"))):
    if db.scalar(select(ProblemType.id).where(ProblemType.hospital_id == user.hospital_id, ProblemType.name == data.name)): raise HTTPException(409, "Problem type already exists in this hospital")
    p=ProblemType(hospital_id=user.hospital_id, **data.model_dump()); db.add(p); db.commit(); db.refresh(p); return p

@router.get("/problem-types")
def list_problem_types(db: Session = Depends(get_db), user: User = Depends(require_roles("admin","receptionist","doctor","patient"))):
    if not user.hospital_id: raise HTTPException(422,"Select a hospital")
    return db.scalars(select(ProblemType).where((ProblemType.hospital_id == user.hospital_id)|(ProblemType.hospital_id.is_(None))).order_by(ProblemType.name)).all()
