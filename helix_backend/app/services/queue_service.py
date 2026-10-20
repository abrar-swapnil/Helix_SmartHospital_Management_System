from datetime import datetime
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models import Appointment, Doctor, ProblemType
from app.services.health_score_service import score_emergency

def waiting_minutes(appt: Appointment) -> int:
    return max(0, int((datetime.utcnow() - appt.waiting_started_at).total_seconds() // 60))

def assign_general_doctor(db: Session, appt: Appointment):
    if appt.doctor_id:
        return
    doctors = db.scalars(select(Doctor).join(__import__("app.models", fromlist=["User"]).User, Doctor.user_id == __import__("app.models", fromlist=["User"]).User.id).where(__import__("app.models", fromlist=["User"]).User.hospital_id == appt.hospital_id, Doctor.specialty == appt.problem_type.specialty, Doctor.status != "unavailable")).all()
    if not doctors:
        raise ValueError("No doctor with the required specialty is available")
    appt.doctor_id = doctors[0].id
    appt.assigned_reason = "General appointment assigned by specialty; visit date/time controls order."

def create_emergency_score(db: Session, appt: Appointment):
    score, version = score_emergency(db, appt)
    appt.health_score = score
    appt.model_version = version

def assign_emergency_doctor(db: Session, appt: Appointment):
    doctors = db.scalars(select(Doctor).join(__import__("app.models", fromlist=["User"]).User, Doctor.user_id == __import__("app.models", fromlist=["User"]).User.id).where(__import__("app.models", fromlist=["User"]).User.hospital_id == appt.hospital_id, Doctor.specialty == appt.problem_type.specialty, Doctor.status != "unavailable")).all()
    if not doctors:
        raise ValueError("No available doctor with the required specialty")
    # Prefer available doctors; if multiple, use the smallest current emergency queue.
    counts = {d.id: db.scalar(select(Appointment).where(Appointment.hospital_id == appt.hospital_id, Appointment.doctor_id == d.id, Appointment.appointment_type == "emergency", Appointment.status == "scheduled").count()) if False else 0 for d in doctors}
    for d in doctors:
        counts[d.id] = len(db.scalars(select(Appointment).where(Appointment.hospital_id == appt.hospital_id, Appointment.doctor_id == d.id, Appointment.appointment_type == "emergency", Appointment.status == "scheduled")).all())
    chosen = min(doctors, key=lambda d: counts[d.id])
    appt.doctor_id = chosen.id
    appt.assigned_reason = "Emergency appointment assigned by specialty; queue order uses health score and waiting time."

def emergency_queue(db: Session, doctor_id: int | None = None, specialty: str | None = None):
    stmt = select(Appointment).where(Appointment.hospital_id == (db.get(Doctor, doctor_id).user.hospital_id if doctor_id and db.get(Doctor, doctor_id) else ""), Appointment.appointment_type == "emergency", Appointment.status == "scheduled") if doctor_id else select(Appointment).where(Appointment.appointment_type == "emergency", Appointment.status == "scheduled")
    if doctor_id:
        stmt = stmt.where(Appointment.doctor_id == doctor_id)
    appts = db.scalars(stmt).all()
    if specialty:
        appts = [a for a in appts if a.problem_type.specialty == specialty]
    # Emergency priority combines model health score and waiting time.
    # Health score carries 70%; waiting time contributes up to 30% after 60 minutes.
    def priority(a):
        wait_component = min(waiting_minutes(a) / 60.0, 1.0) * 100.0
        return 0.70 * (a.health_score or 0.0) + 0.30 * wait_component
    return sorted(appts, key=lambda a: (-priority(a), -waiting_minutes(a), a.waiting_started_at))

def general_queue(db: Session, doctor_id: int | None = None, specialty: str | None = None, visit_date=None):
    stmt = select(Appointment).where(Appointment.hospital_id == (db.get(Doctor, doctor_id).user.hospital_id if doctor_id and db.get(Doctor, doctor_id) else ""), Appointment.appointment_type == "general", Appointment.status == "scheduled") if doctor_id else select(Appointment).where(Appointment.appointment_type == "general", Appointment.status == "scheduled")
    if doctor_id: stmt = stmt.where(Appointment.doctor_id == doctor_id)
    if visit_date: stmt = stmt.where(Appointment.visit_date == visit_date)
    appts = db.scalars(stmt).all()
    if specialty: appts = [a for a in appts if a.problem_type.specialty == specialty]
    return sorted(appts, key=lambda a: (a.visit_date, a.visit_time))

def transfer_doctor_patients(db: Session, absent_doctor_id: int):
    absent = db.get(Doctor, absent_doctor_id)
    if not absent: raise ValueError("Doctor not found")
    replacement = db.scalars(select(Doctor).join(__import__("app.models", fromlist=["User"]).User, Doctor.user_id == __import__("app.models", fromlist=["User"]).User.id).where(__import__("app.models", fromlist=["User"]).User.hospital_id == absent.user.hospital_id, Doctor.specialty == absent.specialty, Doctor.id != absent.id, Doctor.status != "unavailable")).first()
    if not replacement: raise ValueError("No same-specialty replacement doctor available")
    appts = db.scalars(select(Appointment).where(Appointment.hospital_id == absent.user.hospital_id, Appointment.doctor_id == absent.id, Appointment.status == "scheduled")).all()
    for a in appts:
        a.doctor_id = replacement.id
        a.assigned_reason = f"Transferred from unavailable doctor {absent.id} to same-specialty doctor {replacement.id}."
    return replacement, len(appts)
