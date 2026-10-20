from datetime import date, time, datetime
from pydantic import BaseModel, ConfigDict, Field

class LoginRequest(BaseModel):
    username: str
    password: str

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    role: str
    name: str
    hospital_id: str
    hospital_name: str
    patient_id: int | None = None
    doctor_id: int | None = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut

class DoctorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    specialty: str
    department: str
    status: str
    name: str
    email: str | None = None
    phone: str | None = None
    waiting_count: int = 0

class PatientCreate(BaseModel):
    username: str
    password: str
    name: str
    email: str | None = None
    phone: str
    age: int = Field(ge=0, le=130)
    gender: str
    address: str
    blood_type: str | None = None

class PatientOut(BaseModel):
    id: int
    username: str
    name: str
    age: int
    phone: str
    gender: str
    address: str
    blood_type: str | None = None

class AppointmentCreate(BaseModel):
    patient_id: int
    problem_type_id: int | None = None
    appointment_type: str
    visit_date: date
    visit_time: time
    symptoms: str
    current_condition: str | None = None
    doctor_id: int | None = None
    hospital_id: str | None = None

class AppointmentOut(BaseModel):
    id: int
    patient_id: int
    patient_name: str
    patient_phone: str | None = None
    patient_age: int | None = None
    doctor_id: int | None
    doctor_name: str | None
    doctor_specialty: str | None
    problem_sector: str
    date: date
    time: time
    status: str
    type: str
    health_score: float | None
    waiting_minutes: int
    queue_position: int | None = None
    hospital_id: str | None = None
    hospital_name: str | None = None
    symptoms: str = ""

class AmbulanceRequestCreate(BaseModel):
    patient_id: int
    address: str
    phone: str
    emergency_note: str

class AmbulanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    patient_id: int
    address: str
    phone: str
    emergency_note: str
    status: str
    created_at: datetime

class ChatRequest(BaseModel):
    message: str
    patient_id: int | None = None
    hospital_id: str | None = None

class ChatResponse(BaseModel):
    reply: str
    ambulance_requested: bool = False
    ambulance_request_id: int | None = None

class DoctorStatusUpdate(BaseModel):
    status: str

class ProblemTypeCreate(BaseModel):
    name: str
    specialty: str
    description: str | None = None

class HospitalRegister(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    address: str = ""
    phone: str | None = None
    email: str | None = None
    admin_name: str = Field(min_length=2, max_length=150)
    username: str = Field(min_length=3, max_length=100)
    password: str = Field(min_length=8, max_length=128)

class StaffRegister(BaseModel):
    hospital_id: str = Field(min_length=3, max_length=50)
    username: str = Field(min_length=3, max_length=100)
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=2, max_length=150)
    role: str
    email: str | None = None
    phone: str | None = None
    specialty: str | None = None
    department: str = "general"

class PatientRegister(BaseModel):
    username: str = Field(min_length=3, max_length=100)
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=2, max_length=150)
    email: str | None = None
    phone: str
    age: int = Field(ge=0, le=130)
    gender: str
    address: str
    blood_type: str | None = None

class HospitalOut(BaseModel):
    id: int
    hospital_id: str
    name: str
    address: str
    phone: str | None = None
    email: str | None = None
    doctor_count: int = 0

class AppointmentStatusUpdate(BaseModel):
    status: str
