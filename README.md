# HELIX Smart Hospital - Integrated Frontend + Backend

## Run backend
1. `cd helix_backend`
2. Create/activate venv.
3. `pip install -r requirements.txt`
4. Create MySQL database `hospital_db`.
5. Copy `.env.example` to `.env` and set MySQL/Gemini values.
6. `python -m app.seed`
7. `python -m app.ml.train_xgboost`
8. `uvicorn app.main:app --reload --port 8000`

## Run frontend
1. `cd frontend`
2. `npm install` (or `pnpm install`)
3. Optional `.env`: `VITE_API_BASE_URL=http://127.0.0.1:8000/api`
4. `npm run dev`

Open http://localhost:5173. API docs: http://127.0.0.1:8000/docs

The frontend now authenticates against FastAPI, loads doctors/patients/rooms/appointments from MySQL APIs, sends patient chat to Gemini, and sends document uploads to the backend AI endpoint. Emergency ordering is performed by the backend.
