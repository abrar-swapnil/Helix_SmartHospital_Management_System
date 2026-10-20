from sqlalchemy import select
from app.db.session import Base, engine, SessionLocal
from app.models import Hospital, User, Doctor, Patient, ProblemType, Room
from app.core.security import hash_password
from app.core.config import settings

Base.metadata.create_all(bind=engine)
db=SessionLocal()
try:
    code=settings.hospital_code
    hospital=db.scalar(select(Hospital).where(Hospital.hospital_code==code))
    if not hospital:
        hospital=Hospital(hospital_code=code,name=settings.hospital_name,address="Dhaka, Bangladesh",is_active=True)
        db.add(hospital); db.flush()
    # Local development demo accounts only. Do not use these passwords in production.
    if not db.scalar(select(User.id).where(User.username=="admin")):
        users=[
            User(username="admin",password_hash=hash_password("Admin@123"),role="admin",name="Helix Administrator",email="admin@helix.local",phone="+8801000000001",hospital_id=code),
            User(username="receptionist",password_hash=hash_password("Reception@123"),role="receptionist",name="Helix Receptionist",email="reception@helix.local",phone="+8801000000002",hospital_id=code),
            User(username="doctor",password_hash=hash_password("Doctor@123"),role="doctor",name="Dr. Sarah Chen",email="sarah.chen@helix.local",phone="+8801000000003",hospital_id=code),
            User(username="patient",password_hash=hash_password("Patient@123"),role="patient",name="Robert Williams",email="patient@helix.local",phone="+8801000000004",hospital_id=None),
        ]
        for u in users: db.add(u)
        db.flush()
        db.add(Doctor(user_id=users[2].id,specialty="Cardiology",department="emergency",status="available"))
        db.add(Patient(user_id=users[3].id,age=45,gender="male",address="Dhaka, Bangladesh",blood_type="A+"))
    if not db.scalar(select(ProblemType.id).where(ProblemType.hospital_id==code)):
        problems=[("Chest/Cardiac","Cardiology"),("Neurological","Neurology"),("Pediatric","Pediatrics"),("Bone/Joint","Orthopedics"),("Skin","Dermatology"),("General","General Medicine"),("Surgery","Surgery"),("Mental Health","Psychiatry"),("Emergency","Emergency Medicine")]
        for name,spec in problems: db.add(ProblemType(hospital_id=code,name=name,specialty=spec))
    if not db.scalar(select(Room.id).where(Room.hospital_id==code)):
        for num,typ in [("101","general"),("102","general"),("201","emergency"),("202","emergency"),("OT-1","ot"),("ICU-1","icu")]: db.add(Room(hospital_id=code,number=num,type=typ,status="available"))
    db.commit()
finally: db.close()
print("Seed complete. Demo credentials are for local development only.")
