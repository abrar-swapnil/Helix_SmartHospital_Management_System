from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from app.db.session import get_db
from app.models import AmbulanceRequest, User, Patient, Hospital
from app.schemas import AmbulanceOut
from app.core.deps import get_current_user, require_roles

router=APIRouter(prefix="/ambulance", tags=["ambulance"])
class AmbulanceRequestIn(BaseModel):
    patient_id: int
    address: str = Field(min_length=3, max_length=500)
    phone: str = Field(min_length=3, max_length=50)
    emergency_note: str = Field(min_length=3)
    hospital_id: str | None = None

@router.post("/request", response_model=AmbulanceOut)
def request_ambulance(data: AmbulanceRequestIn, db: Session = Depends(get_db), user: User = Depends(require_roles("patient","receptionist","admin"))):
    patient=db.get(Patient,data.patient_id)
    if not patient: raise HTTPException(404,"Patient not found")
    if user.role == "patient" and patient.user_id != user.id: raise HTTPException(403,"You can only request an ambulance for yourself")
    code = user.hospital_id if user.role in {"admin","receptionist"} else data.hospital_id
    if not code: raise HTTPException(422,"hospital_id is required")
    h=db.scalar(select(Hospital).where(Hospital.hospital_code==code, Hospital.is_active.is_(True)))
    if not h: raise HTTPException(404,"Hospital not found")
    req=AmbulanceRequest(hospital_id=code, patient_id=patient.id, address=data.address, phone=data.phone, emergency_note=data.emergency_note)
    db.add(req); db.commit(); db.refresh(req); return req

@router.get("/requests", response_model=list[AmbulanceOut])
def list_requests(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role == 'patient':
        p=db.scalar(select(Patient).where(Patient.user_id==user.id))
        if not p: return []
        stmt=select(AmbulanceRequest).where(AmbulanceRequest.patient_id==p.id)
    elif user.role in {'admin','receptionist'}:
        stmt=select(AmbulanceRequest).where(AmbulanceRequest.hospital_id==user.hospital_id)
    else: raise HTTPException(403,'Insufficient permissions')
    return db.scalars(stmt.order_by(AmbulanceRequest.created_at.desc())).all()
