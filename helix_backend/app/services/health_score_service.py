from pathlib import Path
import json
import joblib
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models import Appointment, MedicalDocument

_model_cache = None

def load_model():
    global _model_cache
    if _model_cache is None and Path(settings.model_path).exists():
        _model_cache = joblib.load(settings.model_path)
    return _model_cache

def _text_features(text: str):
    t=(text or '').lower()
    severe=95 if any(k in t for k in ['chest pain','difficulty breathing','shortness of breath','unconscious','seizure','heavy bleeding','stroke']) else 75 if any(k in t for k in ['severe','intense','high fever','fainting','confusion']) else 50 if any(k in t for k in ['pain','fever','vomiting','dizziness']) else 25
    return severe, {'breathing_difficulty': int(any(k in t for k in ['difficulty breathing','shortness of breath'])), 'chest_pain': int('chest pain' in t), 'consciousness_change': int(any(k in t for k in ['unconscious','fainting','confusion','disoriented']))}

def _features(appt: Appointment, extracted: dict | None):
    e = extracted or {}
    flags = e.get("flags", {}) if isinstance(e, dict) else {}
    text_severity, text_flags = _text_features((appt.symptoms or '') + ' ' + (appt.current_condition or ''))
    flags = {**text_flags, **flags}
    age = appt.patient.age
    return [[
        age,
        max(0, int((__import__('datetime').datetime.utcnow() - appt.waiting_started_at).total_seconds() // 60)),
        max(float(e.get("symptom_severity", 0)), text_severity),
        max(float(e.get("current_condition_severity", 0)), text_severity),
        float(e.get("history_condition_count", 0)),
        int(e.get("history_high_risk", 0)),
        int(flags.get("breathing_difficulty", 0)), int(flags.get("chest_pain", 0)),
        int(flags.get("consciousness_change", 0)), float(e.get("fever_c", 37)), float(e.get("pain_score", 0))
    ]]

def score_emergency(db: Session, appt: Appointment):
    model_pack = load_model()
    extracted = None
    latest = db.query(MedicalDocument).filter(MedicalDocument.patient_id == appt.patient_id, MedicalDocument.hospital_id == appt.hospital_id).order_by(MedicalDocument.created_at.desc()).first()
    if latest and latest.extracted_json:
        try: extracted = json.loads(latest.extracted_json)
        except json.JSONDecodeError: extracted = None
    if not model_pack:
        raise RuntimeError("XGBoost model not found. Run: python -m app.ml.train_xgboost")
    score = float(model_pack["model"].predict(_features(appt, extracted))[0])
    return round(max(0, min(100, score)), 2), model_pack.get("version", "unknown")
