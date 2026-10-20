# HELIX multi-hospital backend update

This backend adds hospital tenancy to HELIX while keeping the existing React API paths where practical.

## Important behavior

- `POST /api/hospitals/register-admin` registers a hospital and its first admin. The response includes a generated `hospital_id` (hospital code).
- `POST /api/hospitals/register-staff` accepts `hospital_id`, role (`doctor` or `receptionist`) and account details. Staff are pending approval until the same-hospital admin approves them.
- `GET /api/hospitals` is a public hospital directory; `GET /api/hospitals/{hospital_code}/doctors` lists active doctors at a selected hospital.
- `POST /api/auth/register-patient` creates a global patient account. Patients can book at different hospitals by including `hospital_id` in `POST /api/appointments`.
- Staff APIs scope doctors, patients, appointments, rooms, problem types and ambulance requests to the authenticated staff member's hospital. The backend does not trust a staff-provided hospital ID to select a tenant.
- Patients can only create appointments for their own patient profile, view their own appointments, and request their own ambulance.
- Admin endpoints: `GET /api/hospitals/staff/pending`, `POST /api/hospitals/staff/{user_id}/approve`, and `POST /api/hospitals/staff/{user_id}/reject`.

## Local setup

1. Use Python 3.12 and install `requirements.txt` in a virtual environment.
2. Create a **fresh database** for this updated schema. Do not point the updated model at an old pre-multihospital database: `create_all()` creates missing tables but does not migrate old tables. Back up any old data before changing databases.
3. Configure `.env` with `DATABASE_URL`, a long random `SECRET_KEY`, and optional Gemini/model settings.
4. Run `python -m app.seed` to create the local demo hospital and demo accounts.
5. Run `uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`.
6. Open `http://127.0.0.1:8000/docs` to explore and test the endpoints.

Local demo accounts (development only): `admin` / `Admin@123`, `receptionist` / `Reception@123`, `doctor` / `Doctor@123`, `patient` / `Patient@123`. Never use these in a public deployment.

## Registration examples

Create hospital + admin:

```json
{
  "name": "North Medical Center",
  "address": "Dhaka, Bangladesh",
  "phone": "+8801000000000",
  "email": "admin@north.example",
  "admin_name": "North Admin",
  "username": "northadmin",
  "password": "replace-with-a-long-password"
}
```

Register staff using returned `hospital_id`:

```json
{
  "hospital_id": "NORTHM-AB12",
  "username": "northdoctor",
  "password": "replace-with-a-long-password",
  "name": "Dr North",
  "role": "doctor",
  "email": "doctor@north.example",
  "phone": "+8801000000001",
  "specialty": "Cardiology",
  "department": "general"
}
```

The hospital admin must approve the pending staff account before it can log in.

## Limitations to understand

- The existing frontend registration and appointment forms have not been fully wired to all new endpoints. Use Swagger `/docs` to test backend functionality, or update frontend forms to call the new APIs and pass `hospital_id` for patient bookings.
- Production deployment should use Alembic migrations, database backups, HTTPS, strict secret management, private medical-document storage, and security review. This is not a clinically validated medical triage product.
- Existing tables are not automatically migrated. Use a fresh development database or write and test a data migration before carrying existing records forward.
