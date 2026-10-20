import json
from pathlib import Path
from google import genai
from google.genai import types
from pydantic import BaseModel
from app.core.config import settings

class MedicalExtraction(BaseModel):
    symptom_severity: float = 0
    current_condition_severity: float = 0
    history_condition_count: int = 0
    history_high_risk: int = 0
    fever_c: float = 37
    pain_score: float = 0
    flags: dict[str, int] = {}

class GeminiService:
    def __init__(self):
        self.client = genai.Client(api_key=settings.gemini_api_key) if settings.gemini_api_key else None

    def chat(self, message: str, hospital_context: str, patient_context: str = "") -> str:
        if not self.client:
            return "Gemini is not configured. Add GEMINI_API_KEY to .env."
        prompt = f"""You are Helix Hospital's patient information assistant. You may explain hospital services, departments, appointment workflow, visiting information and ambulance-request workflow. Do not diagnose, prescribe, or claim certainty from medical symptoms. If a medical emergency is described, tell the patient to contact emergency services and offer the hospital ambulance request flow.\n\nHospital context:\n{hospital_context}\n\nPatient context:\n{patient_context}\n\nUser:\n{message}"""
        response = self.client.models.generate_content(model=settings.gemini_model, contents=prompt)
        return response.text or "I could not generate a response."

    def explain_document(self, path: str, mime_type: str, question: str) -> str:
        if not self.client:
            return "Gemini is not configured. Add GEMINI_API_KEY to .env."
        uploaded = self.client.files.upload(file=path)
        prompt = f"Explain this prescription/medical document in simple language. Identify medicines, instructions, dates, and warnings only when clearly present. Do not invent missing information and do not change the doctor's instructions. User question: {question}"
        response = self.client.models.generate_content(model=settings.gemini_model, contents=[prompt, uploaded])
        return response.text or "I could not read the document."

    def extract_medical_features(self, path: str) -> dict:
        if not self.client:
            return {}
        uploaded = self.client.files.upload(file=path)
        prompt = "Extract only evidence present in this medical document for emergency risk feature engineering. Return JSON matching the schema. Do not diagnose. Use 0 when not present/unknown."
        response = self.client.models.generate_content(
            model=settings.gemini_model,
            contents=[prompt, uploaded],
            config=types.GenerateContentConfig(response_mime_type="application/json", response_schema=MedicalExtraction),
        )
        try: return json.loads(response.text)
        except Exception: return {}

    def hospital_info(self, question: str, hospital_name: str) -> str:
        return self.chat(question, f"Hospital: {hospital_name}. Services include appointment booking, emergency queue, general appointments, doctor directory, rooms and ambulance request handling.")

gemini = GeminiService()
