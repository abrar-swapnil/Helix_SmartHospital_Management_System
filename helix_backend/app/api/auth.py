from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models import User, Patient, Doctor, Hospital
from app.schemas import LoginRequest, TokenResponse, UserOut
from app.schemas.common import PatientRegister
from app.core.security import verify_password, create_access_token, hash_password
from app.core.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])

def user_out(db, user):
    patient = db.scalar(select(Patient).where(Patient.user_id == user.id))
    doctor = db.scalar(select(Doctor).where(Doctor.user_id == user.id))
    hospital = db.scalar(select(Hospital).where(Hospital.hospital_code == user.hospital_id)) if user.hospital_id else None
    return UserOut(id=user.id, username=user.username, role=user.role, name=user.name, hospital_id=user.hospital_id or "", hospital_name=hospital.name if hospital else "", patient_id=patient.id if patient else None, doctor_id=doctor.id if doctor else None)

@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.username == data.username))
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    if user.hospital_id:
        hospital = db.scalar(select(Hospital).where(Hospital.hospital_code == user.hospital_id))
        if not hospital or not hospital.is_active: raise HTTPException(403, "This hospital is inactive")
    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenResponse(access_token=token, user=user_out(db, user))

@router.post("/register-patient", status_code=201)
def register_patient(data: PatientRegister, db: Session = Depends(get_db)):
    if db.scalar(select(User.id).where(User.username == data.username)): raise HTTPException(409, "Username already exists")
    if data.email and db.scalar(select(User.id).where(User.email == data.email)): raise HTTPException(409, "Email already exists")
    if data.gender not in {"male", "female", "other"}: raise HTTPException(422, "Gender must be male, female, or other")
    user = User(username=data.username, password_hash=hash_password(data.password), role="patient", name=data.name, email=data.email, phone=data.phone, hospital_id=None)
    db.add(user); db.flush()
    patient = Patient(user_id=user.id, age=data.age, gender=data.gender, address=data.address, blood_type=data.blood_type)
    db.add(patient); db.commit(); db.refresh(patient)
    return {"message": "Patient account created", "patient_id": patient.id, "username": user.username}

@router.get('/me', response_model=UserOut)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return user_out(db, user)
