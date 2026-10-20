from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models import Hospital, User, Doctor, Patient, Appointment, ProblemType
from app.schemas.common import HospitalRegister, StaffRegister, PatientRegister, HospitalOut
from app.core.security import hash_password
from app.core.deps import get_current_user, require_roles
import re, secrets

router = APIRouter(prefix="/hospitals", tags=["hospitals"])

def make_code(db: Session, name: str) -> str:
    base = re.sub(r"[^A-Z0-9]", "", name.upper())[:6] or "HELIX"
    while True:
        code = f"{base}-{secrets.token_hex(2).upper()}"
        if not db.scalar(select(Hospital.id).where(Hospital.hospital_code == code)):
            return code

def hospital_out(db, h):
    count = db.scalar(select(func.count(Doctor.id)).join(User, Doctor.user_id == User.id).where(User.hospital_id == h.hospital_code)) or 0
    return {"id": h.id, "hospital_id": h.hospital_code, "name": h.name, "address": h.address, "phone": h.phone, "email": h.email, "doctor_count": count}

@router.get("", response_model=list[HospitalOut])
def list_hospitals(db: Session = Depends(get_db), q: str | None = Query(default=None, max_length=100)):
    stmt = select(Hospital).where(Hospital.is_active.is_(True)).order_by(Hospital.name)
    if q:
        stmt = stmt.where(Hospital.name.ilike(f"%{q}%"))
    return [hospital_out(db, h) for h in db.scalars(stmt).all()]

@router.get("/{hospital_code}", response_model=HospitalOut)
def get_hospital(hospital_code: str, db: Session = Depends(get_db)):
    h = db.scalar(select(Hospital).where(Hospital.hospital_code == hospital_code, Hospital.is_active.is_(True)))
    if not h: raise HTTPException(404, "Hospital not found")
    return hospital_out(db, h)

@router.get("/{hospital_code}/doctors")
def public_hospital_doctors(hospital_code: str, db: Session = Depends(get_db)):
    h = db.scalar(select(Hospital).where(Hospital.hospital_code == hospital_code, Hospital.is_active.is_(True)))
    if not h: raise HTTPException(404, "Hospital not found")
    rows = db.scalars(select(Doctor).join(User, Doctor.user_id == User.id).where(User.hospital_id == hospital_code, User.is_active.is_(True)).order_by(User.name)).all()
    return [{"id": d.id, "name": d.user.name, "specialty": d.specialty, "department": d.department, "status": d.status} for d in rows]

@router.post("/register-admin", status_code=201)
def register_hospital(data: HospitalRegister, db: Session = Depends(get_db)):
    if db.scalar(select(User.id).where(User.username == data.username)): raise HTTPException(409, "Username already exists")
    if data.email and db.scalar(select(User.id).where(User.email == data.email)): raise HTTPException(409, "Email already exists")
    code = make_code(db, data.name)
    h = Hospital(hospital_code=code, name=data.name.strip(), address=data.address, phone=data.phone, email=data.email)
    db.add(h); db.flush()
    admin = User(username=data.username, password_hash=hash_password(data.password), role="admin", name=data.admin_name, email=data.email, phone=data.phone, hospital_id=code)
    db.add(admin)
    defaults = [("Chest/Cardiac", "Cardiology"), ("Neurological", "Neurology"), ("Pediatric", "Pediatrics"), ("Bone/Joint", "Orthopedics"), ("Skin", "Dermatology"), ("General", "General Medicine"), ("Surgery", "Surgery"), ("Mental Health", "Psychiatry"), ("Emergency", "Emergency Medicine")]
    for name, specialty in defaults: db.add(ProblemType(hospital_id=code, name=name, specialty=specialty))
    db.commit()
    return {"hospital_id": code, "hospital_name": h.name, "admin_username": admin.username, "message": "Hospital and administrator registered. Keep the Hospital ID for staff registration."}

@router.post("/register-staff", status_code=201)
def register_staff(data: StaffRegister, db: Session = Depends(get_db)):
    if data.role not in {"doctor", "receptionist"}: raise HTTPException(400, "Staff role must be doctor or receptionist")
    h = db.scalar(select(Hospital).where(Hospital.hospital_code == data.hospital_id, Hospital.is_active.is_(True)))
    if not h: raise HTTPException(404, "Invalid or inactive Hospital ID")
    if db.scalar(select(User.id).where(User.username == data.username)): raise HTTPException(409, "Username already exists")
    if data.email and db.scalar(select(User.id).where(User.email == data.email)): raise HTTPException(409, "Email already exists")
    if data.role == "doctor" and not data.specialty: raise HTTPException(422, "Doctor specialty is required")
    if data.department not in {"general", "emergency"}: raise HTTPException(422, "Invalid department")
    user = User(username=data.username, password_hash=hash_password(data.password), role=data.role, name=data.name, email=data.email, phone=data.phone, hospital_id=h.hospital_code, is_active=False)
    db.add(user); db.flush()
    if data.role == "doctor": db.add(Doctor(user_id=user.id, specialty=data.specialty.strip(), department=data.department, status="available"))
    db.commit()
    return {"message": "Staff registration submitted. A hospital administrator must approve the account before login.", "username": user.username, "role": user.role, "hospital_id": h.hospital_code, "hospital_name": h.name, "approval_required": True}

@router.get("/me/summary")
def hospital_summary(db: Session = Depends(get_db), user: User = Depends(require_roles("admin", "receptionist", "doctor"))):
    h = db.scalar(select(Hospital).where(Hospital.hospital_code == user.hospital_id))
    if not h: raise HTTPException(404, "Hospital not found")
    return hospital_out(db, h)


@router.get("/staff/pending")
def pending_staff(db: Session = Depends(get_db), user: User = Depends(require_roles("admin"))):
    rows = db.scalars(select(User).where(User.hospital_id == user.hospital_id, User.is_active.is_(False), User.role.in_(["doctor", "receptionist"])).order_by(User.created_at)).all()
    return [{"id": u.id, "username": u.username, "name": u.name, "role": u.role, "email": u.email, "phone": u.phone, "created_at": u.created_at} for u in rows]

@router.post("/staff/{user_id}/approve")
def approve_staff(user_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles("admin"))):
    target = db.get(User, user_id)
    if not target or target.hospital_id != user.hospital_id or target.role not in {"doctor", "receptionist"}:
        raise HTTPException(404, "Pending staff member not found in your hospital")
    target.is_active = True
    db.commit()
    return {"message": "Staff account approved", "username": target.username, "role": target.role}

@router.post("/staff/{user_id}/reject")
def reject_staff(user_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles("admin"))):
    target = db.get(User, user_id)
    if not target or target.hospital_id != user.hospital_id or target.role not in {"doctor", "receptionist"}:
        raise HTTPException(404, "Staff member not found in your hospital")
    db.delete(target)
    db.commit()
    return {"message": "Staff registration rejected"}
