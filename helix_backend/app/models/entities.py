from datetime import datetime, date, time
from sqlalchemy import String, Integer, DateTime, Date, Time, Text, Boolean, Float, ForeignKey, Enum, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.session import Base

class Hospital(Base):
    __tablename__ = "hospitals"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    hospital_code: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    address: Mapped[str] = mapped_column(String(500), default="")
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(Enum("admin","receptionist","doctor","patient"))
    name: Mapped[str] = mapped_column(String(150))
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    hospital_id: Mapped[str | None] = mapped_column(String(50), index=True, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class Doctor(Base):
    __tablename__ = "doctors"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    specialty: Mapped[str] = mapped_column(String(100), index=True)
    department: Mapped[str] = mapped_column(Enum("general","emergency"), default="general")
    status: Mapped[str] = mapped_column(Enum("available","busy","unavailable"), default="available")
    user: Mapped[User] = relationship()

class Patient(Base):
    __tablename__ = "patients"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    age: Mapped[int] = mapped_column(Integer)
    gender: Mapped[str] = mapped_column(Enum("male","female","other"))
    address: Mapped[str] = mapped_column(String(500))
    blood_type: Mapped[str | None] = mapped_column(String(5), nullable=True)
    user: Mapped[User] = relationship()

class ProblemType(Base):
    __tablename__ = "problem_types"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    hospital_id: Mapped[str | None] = mapped_column(String(50), index=True, nullable=True)
    name: Mapped[str] = mapped_column(String(120))
    specialty: Mapped[str] = mapped_column(String(100), index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    __table_args__ = (UniqueConstraint("hospital_id", "name", name="uq_problem_hospital_name"),)

class MedicalDocument(Base):
    __tablename__ = "medical_documents"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    hospital_id: Mapped[str | None] = mapped_column(String(50), index=True, nullable=True)
    filename: Mapped[str] = mapped_column(String(255))
    path: Mapped[str] = mapped_column(String(500))
    mime_type: Mapped[str] = mapped_column(String(100))
    gemini_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    extracted_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class Appointment(Base):
    __tablename__ = "appointments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    hospital_id: Mapped[str] = mapped_column(String(50), index=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    doctor_id: Mapped[int | None] = mapped_column(ForeignKey("doctors.id"), nullable=True, index=True)
    problem_type_id: Mapped[int] = mapped_column(ForeignKey("problem_types.id"), index=True)
    appointment_type: Mapped[str] = mapped_column(Enum("general","emergency"), index=True)
    visit_date: Mapped[date] = mapped_column(Date, index=True)
    visit_time: Mapped[time] = mapped_column(Time)
    symptoms: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Enum("scheduled","completed","cancelled"), default="scheduled")
    waiting_started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    health_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    model_version: Mapped[str | None] = mapped_column(String(100), nullable=True)
    current_condition: Mapped[str | None] = mapped_column(Text, nullable=True)
    assigned_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    patient: Mapped[Patient] = relationship()
    doctor: Mapped[Doctor | None] = relationship()
    problem_type: Mapped[ProblemType] = relationship()

class Room(Base):
    __tablename__ = "rooms"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    hospital_id: Mapped[str] = mapped_column(String(50), index=True)
    number: Mapped[str] = mapped_column(String(30))
    type: Mapped[str] = mapped_column(Enum("general","emergency","ot","icu"))
    status: Mapped[str] = mapped_column(Enum("available","occupied"), default="available")
    patient_id: Mapped[int | None] = mapped_column(ForeignKey("patients.id"), nullable=True)
    __table_args__ = (UniqueConstraint("hospital_id", "number", name="uq_room_hospital_number"),)

class AmbulanceRequest(Base):
    __tablename__ = "ambulance_requests"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    hospital_id: Mapped[str] = mapped_column(String(50), index=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    address: Mapped[str] = mapped_column(String(500))
    phone: Mapped[str] = mapped_column(String(50))
    emergency_note: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Enum("requested","dispatched","completed","cancelled"), default="requested")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int | None] = mapped_column(ForeignKey("patients.id"), nullable=True)
    hospital_id: Mapped[str | None] = mapped_column(String(50), index=True, nullable=True)
    role: Mapped[str] = mapped_column(Enum("user","model"))
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
