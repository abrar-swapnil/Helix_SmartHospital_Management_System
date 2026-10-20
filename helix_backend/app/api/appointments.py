from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models import Appointment, Patient, ProblemType, Doctor, User, Hospital
from app.schemas import AppointmentCreate, AppointmentOut
from app.core.deps import get_current_user, require_roles
from app.services.queue_service import assign_general_doctor, assign_emergency_doctor, create_emergency_score, emergency_queue, general_queue, waiting_minutes

router = APIRouter(prefix="/appointments", tags=["appointments"])

def out(a, position=None, db=None):
    h = db.scalar(select(Hospital).where(Hospital.hospital_code == a.hospital_id)) if db else None
    return AppointmentOut(id=a.id, patient_id=a.patient_id, patient_name=a.patient.user.name, patient_phone=a.patient.user.phone, patient_age=a.patient.age, doctor_id=a.doctor_id, doctor_name=a.doctor.user.name if a.doctor else None, doctor_specialty=a.doctor.specialty if a.doctor else None, problem_sector=a.problem_type.name, date=a.visit_date, time=a.visit_time, status=a.status, type=a.appointment_type, health_score=a.health_score, waiting_minutes=waiting_minutes(a), queue_position=position, hospital_id=a.hospital_id, hospital_name=h.name if h else None, symptoms=a.symptoms)

def ensure_appointment_access(a, user):
    if user.role == "patient":
        if not user_patient_id(user): raise HTTPException(403, "Patient profile missing")
        if a.patient.user_id != user.id: raise HTTPException(404, "Appointment not found")
    elif a.hospital_id != user.hospital_id:
        raise HTTPException(404, "Appointment not found in your hospital")

def user_patient_id(user):
    return getattr(user, "patient_profile_id", None)

@router.post("", response_model=AppointmentOut)
def create_appointment(data: AppointmentCreate, db: Session = Depends(get_db), user: User = Depends(require_roles("admin","receptionist","patient"))):
    patient = db.get(Patient, data.patient_id)
    if not patient: raise HTTPException(404, "Patient not found")
    if user.role == "patient" and patient.user_id != user.id: raise HTTPException(403, "You can only book for your own patient account")
    hospital_code = user.hospital_id if user.role in {"admin", "receptionist"} else data.hospital_id
    if not hospital_code: raise HTTPException(422, "Select a hospital for this appointment")
    hospital = db.scalar(select(Hospital).where(Hospital.hospital_code == hospital_code, Hospital.is_active.is_(True)))
    if not hospital: raise HTTPException(404, "Hospital not found or inactive")
    if data.appointment_type not in {"general", "emergency"}: raise HTTPException(400, "Invalid appointment type")
    doctor = db.get(Doctor, data.doctor_id) if data.doctor_id else None
    if data.doctor_id and (not doctor or doctor.user.hospital_id != hospital_code or doctor.status == "unavailable"):
        raise HTTPException(400, "Selected doctor is unavailable or belongs to another hospital")
    problem = db.get(ProblemType, data.problem_type_id) if data.problem_type_id else None
    if problem and problem.hospital_id not in (None, hospital_code): raise HTTPException(400, "Problem type belongs to another hospital")
    if not problem:
        specialty = doctor.specialty if doctor else None
        stmt = select(ProblemType).where(ProblemType.hospital_id == hospital_code)
        if specialty: stmt = stmt.where(ProblemType.specialty == specialty)
        problem = db.scalar(stmt.order_by(ProblemType.id))
    if not problem: raise HTTPException(400, "Problem type could not be determined for this hospital")
    appt = Appointment(hospital_id=hospital_code, patient_id=patient.id, problem_type_id=problem.id, appointment_type=data.appointment_type, visit_date=data.visit_date, visit_time=data.visit_time, symptoms=data.symptoms, current_condition=data.current_condition, waiting_started_at=datetime.utcnow())
    db.add(appt); db.flush()
    try:
        if doctor:
            if doctor.specialty != problem.specialty: raise HTTPException(400, "Selected doctor specialty does not match the problem type")
            appt.doctor_id = doctor.id
        elif data.appointment_type == "general": assign_general_doctor(db, appt)
        else:
            try: create_emergency_score(db, appt)
            except (RuntimeError, ValueError, OSError): appt.health_score = None; appt.model_version = "unavailable"
            assign_emergency_doctor(db, appt)
    except ValueError as e:
        db.rollback(); raise HTTPException(409, str(e))
    db.commit(); db.refresh(appt); return out(appt, db=db)

@router.get("/mine", response_model=list[AppointmentOut])
def my_appointments(db: Session = Depends(get_db), user: User = Depends(require_roles("patient"))):
    patient = db.scalar(select(Patient).where(Patient.user_id == user.id))
    if not patient: return []
    rows = db.scalars(select(Appointment).where(Appointment.patient_id == patient.id).order_by(Appointment.visit_date.desc(), Appointment.visit_time.desc())).all()
    return [out(a, db=db) for a in rows]

@router.get("/emergency", response_model=list[AppointmentOut])
def emergency(db: Session = Depends(get_db), user: User = Depends(get_current_user), doctor_id: int | None = None, specialty: str | None = None, hospital_id: str | None = None):
    if user.role == "patient":
        p = db.scalar(select(Patient).where(Patient.user_id == user.id))
        rows = db.scalars(select(Appointment).where(Appointment.patient_id == p.id if p else False, Appointment.appointment_type == "emergency", Appointment.status == "scheduled")).all()
    else:
        if not user.hospital_id: raise HTTPException(403, "No hospital assigned")
        if hospital_id and hospital_id != user.hospital_id: raise HTTPException(403, "Cross-hospital access denied")
        rows = emergency_queue(db, doctor_id, specialty)
        rows = [a for a in rows if a.hospital_id == user.hospital_id]
    return [out(a, i, db) for i, a in enumerate(rows, start=1)]

@router.get("/general", response_model=list[AppointmentOut])
def general(db: Session = Depends(get_db), user: User = Depends(get_current_user), doctor_id: int | None = None, specialty: str | None = None, visit_date=None, hospital_id: str | None = None):
    if user.role == "patient":
        p = db.scalar(select(Patient).where(Patient.user_id == user.id))
        stmt = select(Appointment).where(Appointment.patient_id == p.id if p else False, Appointment.appointment_type == "general", Appointment.status == "scheduled")
        rows = db.scalars(stmt).all()
    else:
        if not user.hospital_id: raise HTTPException(403, "No hospital assigned")
        if hospital_id and hospital_id != user.hospital_id: raise HTTPException(403, "Cross-hospital access denied")
        rows = [a for a in general_queue(db, doctor_id, specialty, visit_date) if a.hospital_id == user.hospital_id]
    return [out(a, i, db) for i, a in enumerate(rows, start=1)]

@router.patch("/{appointment_id}/cancel", response_model=AppointmentOut)
def cancel(appointment_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles("admin","receptionist","doctor","patient"))):
    a = db.get(Appointment, appointment_id)
    if not a: raise HTTPException(404, "Appointment not found")
    if user.role == "patient":
        p = db.scalar(select(Patient).where(Patient.user_id == user.id))
        if not p or a.patient_id != p.id: raise HTTPException(404, "Appointment not found")
    elif a.hospital_id != user.hospital_id: raise HTTPException(404, "Appointment not found in your hospital")
    if a.status != "scheduled": raise HTTPException(409, "Only scheduled appointments can be cancelled")
    a.status = "cancelled"; db.commit(); db.refresh(a); return out(a, db=db)

@router.patch("/{appointment_id}/status", response_model=AppointmentOut)
def update_status(appointment_id: int, status: str, db: Session = Depends(get_db), user: User = Depends(require_roles("admin", "receptionist", "doctor"))):
    a = db.get(Appointment, appointment_id)
    if not a or a.hospital_id != user.hospital_id: raise HTTPException(404, "Appointment not found in your hospital")
    if status not in {"scheduled", "completed", "cancelled"}: raise HTTPException(422, "Invalid status")
    a.status = status; db.commit(); db.refresh(a); return out(a, db=db)
