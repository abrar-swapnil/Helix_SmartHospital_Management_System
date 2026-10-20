import json
from pathlib import Path
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models import User, Patient, MedicalDocument, AmbulanceRequest, Hospital, Appointment
from app.schemas import ChatRequest, ChatResponse
from app.core.deps import get_current_user
from app.core.config import settings
from app.services.gemini_service import gemini

router=APIRouter(prefix="/ai", tags=["ai"])

@router.post("/chat", response_model=ChatResponse)
def chat(data: ChatRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    patient_context = ""
    patient = None
    if data.patient_id:
        patient = db.get(Patient, data.patient_id)
        if not patient: raise HTTPException(404, "Patient not found")
        if user.role == "patient" and patient.user_id != user.id: raise HTTPException(403, "You can only access your own patient context")
        if user.role != "patient" and (not user.hospital_id or not db.query(Appointment).filter(Appointment.patient_id == patient.id, Appointment.hospital_id == user.hospital_id).first()): raise HTTPException(404, "Patient not found in your hospital")
        patient_context = f"Name: {patient.user.name}; age: {patient.age}; blood type: {patient.blood_type}"
    code = user.hospital_id if user.role != "patient" else data.hospital_id
    hospital = db.query(Hospital).filter(Hospital.hospital_code == code, Hospital.is_active.is_(True)).first() if code else None
    if code and not hospital: raise HTTPException(404, "Hospital not found")
    context = f"Hospital: {hospital.name}; code: {hospital.hospital_code}. This assistant provides general information, not a medical diagnosis." if hospital else "This assistant provides general information, not a medical diagnosis."
    reply = gemini.chat(data.message, context, patient_context)
    # Never create an ambulance request silently from chat text; use the explicit ambulance endpoint.
    requested = any(x in data.message.lower() for x in ["book ambulance", "need ambulance", "ambulance please"])
    if requested:
        reply += "\n\nFor safety, submit an explicit ambulance request through the ambulance request form and choose a hospital. If this is a life-threatening emergency, contact local emergency services immediately."
    return ChatResponse(reply=reply, ambulance_requested=False, ambulance_request_id=None)

@router.post("/document/explain")
async def explain_document(patient_id:int=Form(...), question:str=Form("Please describe this prescription in simple language."), file:UploadFile=File(...), db:Session=Depends(get_db), user:User=Depends(get_current_user)):
    allowed={"application/pdf","image/jpeg","image/png","image/webp"}
    if file.content_type not in allowed: raise HTTPException(400,"Only PDF/JPG/PNG/WEBP files are supported")
    patient=db.get(Patient,patient_id)
    if not patient: raise HTTPException(404,"Patient not found")
    if user.role == "patient" and patient.user_id != user.id: raise HTTPException(403,"You can only upload your own documents")
    if user.role != "patient" and (not user.hospital_id or not db.query(Appointment).filter(Appointment.patient_id == patient_id, Appointment.hospital_id == user.hospital_id).first()): raise HTTPException(404,"Patient not found in your hospital")
    safe_name=Path(file.filename or "document").name
    path=Path(settings.upload_dir)/f"{patient_id}_{safe_name}"
    data=await file.read(); path.write_bytes(data)
    summary=gemini.explain_document(str(path), file.content_type, question)
    extracted=gemini.extract_medical_features(str(path))
    doc=MedicalDocument(patient_id=patient_id,hospital_id=user.hospital_id,filename=safe_name,path=str(path),mime_type=file.content_type,gemini_summary=summary,extracted_json=json.dumps(extracted))
    db.add(doc); db.commit(); db.refresh(doc)
    return {"document_id":doc.id,"summary":summary,"extracted_features":extracted}
