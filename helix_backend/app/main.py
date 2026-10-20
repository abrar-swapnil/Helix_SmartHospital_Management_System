from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.db.session import Base, engine
from app.api import auth, doctors, patients, appointments, ambulance, ai, admin, meta, hospitals
import app.models

app=FastAPI(title="Helix Smart Hospital API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=settings.origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)

app.include_router(hospitals.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(doctors.router, prefix="/api")
app.include_router(patients.router, prefix="/api")
app.include_router(appointments.router, prefix="/api")
app.include_router(ambulance.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(meta.router, prefix="/api")

@app.get("/api/health")
def health(): return {"status":"ok","service":"helix-backend"}
