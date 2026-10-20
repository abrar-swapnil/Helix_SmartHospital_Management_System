from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, exists
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models import Patient, User, Appointment
from app.schemas import PatientCreate, PatientOut
from app.core.deps import get_current_user, require_roles
from app.core.security import hash_password

router = APIRouter(prefix="/patients", tags=["patients"])

def patient_out(p):
    return PatientOut(id=p.id, username=p.user.username, name=p.user.name, age=p.age, phone=p.user.phone or "", gender=p.gender, address=p.address, blood_type=p.blood_type)

@router.post("", response_model=PatientOut)
def create_patient(data: PatientCreate, db: Session = Depends(get_db), user: User = Depends(require_roles("admin","receptionist"))):
    if db.scalar(select(User.id).where(User.username == data.username)): raise HTTPException(409, "Username already exists")
    if data.email and db.scalar(select(User.id).where(User.email == data.email)): raise HTTPException(409, "Email already exists")
    if data.gender not in {"male", "female", "other"}: raise HTTPException(422, "Invalid gender")
    new_user = User(username=data.username, password_hash=hash_password(data.password), role="patient", name=data.name, email=data.email, phone=data.phone, hospital_id=None)
    db.add(new_user); db.flush()
    patient = Patient(user_id=new_user.id, age=data.age, gender=data.gender, address=data.address, blood_type=data.blood_type)
    db.add(patient); db.commit(); db.refresh(patient)
    return patient_out(patient)

@router.get("", response_model=list[PatientOut])
def list_patients(db: Session = Depends(get_db), user: User = Depends(require_roles("admin","receptionist","doctor"))):
    if not user.hospital_id: raise HTTPException(403, "Hospital staff account has no hospital")
    # A hospital may see only patients who have an appointment at that hospital.
    stmt = select(Patient).where(exists(select(Appointment.id).where(Appointment.patient_id == Patient.id, Appointment.hospital_id == user.hospital_id))).order_by(Patient.id)
    return [patient_out(p) for p in db.scalars(stmt).all()]
