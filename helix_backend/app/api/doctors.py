from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models import Doctor, User, Appointment
from app.schemas import DoctorOut, DoctorStatusUpdate
from app.core.deps import get_current_user, require_roles
from app.services.queue_service import transfer_doctor_patients

router = APIRouter(prefix="/doctors", tags=["doctors"])

def to_out(db, d):
    waiting = db.scalars(select(Appointment).where(Appointment.doctor_id == d.id, Appointment.hospital_id == d.user.hospital_id, Appointment.status == 'scheduled')).all()
    return DoctorOut(id=d.id, specialty=d.specialty, department=d.department, status=d.status, name=d.user.name, email=d.user.email, phone=d.user.phone, waiting_count=len(waiting))

@router.get("", response_model=list[DoctorOut])
def list_doctors(db: Session = Depends(get_db), user: User = Depends(get_current_user), hospital_id: str | None = None):
    # Patients may discover doctors at any active hospital only through the public hospital directory.
    if user.role == "patient":
        if not hospital_id: raise HTTPException(400, "Pass hospital_id to list doctors at a selected hospital")
        from app.models import Hospital
        h = db.scalar(select(Hospital).where(Hospital.hospital_code == hospital_id, Hospital.is_active.is_(True)))
        if not h: raise HTTPException(404, "Hospital not found")
        stmt = select(Doctor).join(User, Doctor.user_id == User.id).where(User.hospital_id == hospital_id, User.is_active.is_(True))
    else:
        if not user.hospital_id: raise HTTPException(403, "Hospital staff account has no hospital")
        stmt = select(Doctor).join(User, Doctor.user_id == User.id).where(User.hospital_id == user.hospital_id)
    return [to_out(db,d) for d in db.scalars(stmt.order_by(Doctor.id)).all()]

@router.patch("/{doctor_id}/status", response_model=DoctorOut)
def update_status(doctor_id: int, data: DoctorStatusUpdate, db: Session = Depends(get_db), user: User = Depends(require_roles("admin","doctor"))):
    doctor = db.get(Doctor, doctor_id)
    if not doctor or doctor.user.hospital_id != user.hospital_id: raise HTTPException(404, "Doctor not found in your hospital")
    if user.role == "doctor" and doctor.user_id != user.id: raise HTTPException(403, "Doctors may only update their own status")
    if data.status not in {"available","busy","unavailable"}: raise HTTPException(400, "Invalid status")
    doctor.status = data.status
    if data.status == "unavailable":
        try: transfer_doctor_patients(db, doctor_id)
        except ValueError: pass
    db.commit(); db.refresh(doctor)
    return to_out(db, doctor)
