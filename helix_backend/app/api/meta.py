from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from app.db.session import get_db
from app.models import Room, ProblemType, Patient, User, Hospital, Doctor
from app.core.deps import get_current_user, require_roles

router = APIRouter(tags=["metadata"])

@router.get('/rooms')
def rooms(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not user.hospital_id or user.role == "patient": raise HTTPException(403, "Hospital staff access required")
    rows = db.scalars(select(Room).where(Room.hospital_id == user.hospital_id).order_by(Room.number)).all()
    out=[]
    for r in rows:
        patient=db.get(Patient,r.patient_id) if r.patient_id else None
        out.append({'id':r.id,'number':r.number,'type':r.type,'status':r.status,'patient_id':r.patient_id,'patient_name':patient.user.name if patient else None})
    return out

class RoomCreate(BaseModel):
    number: str = Field(min_length=1, max_length=30)
    type: str

class RoomUpdate(BaseModel):
    status: str
    patient_id: int | None = None

@router.post('/rooms', status_code=201)
def create_room(data: RoomCreate, db: Session = Depends(get_db), user: User = Depends(require_roles('admin'))):
    if data.type not in {'general','emergency','ot','icu'}: raise HTTPException(422, 'Invalid room type')
    if db.scalar(select(Room.id).where(Room.hospital_id == user.hospital_id, Room.number == data.number)): raise HTTPException(409, 'Room number already exists in this hospital')
    r=Room(hospital_id=user.hospital_id, number=data.number, type=data.type, status='available'); db.add(r); db.commit(); db.refresh(r)
    return {'id':r.id,'number':r.number,'type':r.type,'status':r.status,'patient_id':None,'patient_name':None}

@router.patch('/rooms/{room_id}')
def update_room(room_id: int, data: RoomUpdate, db: Session = Depends(get_db), user: User = Depends(require_roles('admin','receptionist'))):
    r=db.get(Room, room_id)
    if not r or r.hospital_id != user.hospital_id: raise HTTPException(404, 'Room not found in your hospital')
    if data.status not in {'available','occupied'}: raise HTTPException(422,'Invalid room status')
    if data.status == 'occupied':
        if not data.patient_id: raise HTTPException(422,'patient_id is required for occupied room')
        if not db.get(Patient, data.patient_id): raise HTTPException(404,'Patient not found')
    r.status=data.status; r.patient_id=data.patient_id if data.status=='occupied' else None; db.commit(); return {'ok':True}

@router.get('/problem-types')
def problem_types(db: Session = Depends(get_db), user: User = Depends(get_current_user), hospital_id: str | None = None):
    code = user.hospital_id if user.role != 'patient' else hospital_id
    if not code: raise HTTPException(422,'hospital_id is required for patients')
    h=db.scalar(select(Hospital).where(Hospital.hospital_code==code, Hospital.is_active.is_(True)))
    if not h: raise HTTPException(404,'Hospital not found')
    return [{'id':p.id,'name':p.name,'specialty':p.specialty,'description':p.description} for p in db.scalars(select(ProblemType).where((ProblemType.hospital_id==code)|(ProblemType.hospital_id.is_(None))).order_by(ProblemType.name)).all()]
