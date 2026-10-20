# Helix Smart Hospital Backend

Local FastAPI + MySQL backend for the Figma frontend.

## What is implemented
- JWT authentication for admin, receptionist, doctor, patient
- Patient/doctor/room management
- General appointments sorted by visit date/time
- Emergency appointments automatically assigned by specialty and sorted by health score + waiting time
- Waiting time calculated from appointment/queue creation time
- Doctor absence transfer to another available doctor with the same specialty
- Receptionist filters: doctor, problem sector, date for general appointments
- Gemini patient assistant for hospital information and ambulance requests
- Gemini prescription/document explanation
- Gemini structured extraction of medical-history features
- XGBoost emergency health-score service
- Ambulance request storage with patient address and phone
- CORS for the Vite frontend

## Important AI design
XGBoost does not read PDFs/images itself. Gemini extracts structured clinical features from the uploaded document and the current appointment. XGBoost then consumes those numerical/categorical features and produces a configurable 0-100 emergency health score. Replace the bootstrap training data with clinically validated labelled data before real-world use.

## Run
1. Create MySQL database: `CREATE DATABASE hospital_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
2. Copy `.env.example` to `.env` and set MySQL + Gemini values.
3. `python -m venv venv`
4. Windows PowerShell: `venv\\Scripts\\Activate.ps1`
5. `pip install -r requirements.txt`
6. `python -m app.ml.train_xgboost`
7. `python -m app.seed`
8. `uvicorn app.main:app --reload`
9. Open `http://127.0.0.1:8000/docs`

## Demo credentials after seeding
- admin / Admin@123
- receptionist / Reception@123
- doctor / Doctor@123
- patient / Patient@123

Change these before any real deployment.
