export type Role = 'admin' | 'doctor' | 'patient' | 'receptionist';

export type DoctorStatus = 'available' | 'busy' | 'unavailable';
export type DoctorDepartment = 'general' | 'emergency';
export type RoomType = 'general' | 'emergency' | 'ot' | 'icu';
export type RoomStatus = 'available' | 'occupied';
export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled';
export type AppointmentType = 'general' | 'emergency';

export interface AuthUser {
  role: Role;
  username: string;
  name: string;
  hospitalId: string;
  hospitalName: string;
  patientId?: string;
  doctorId?: string;
}

export interface Doctor {
  id: string;
  name: string;
  email: string;
  phone: string;
  specialty: string;
  status: DoctorStatus;
  department: DoctorDepartment;
  waitingCount: number;
  patientsToday: number;
}

export interface Patient {
  id: string;
  username: string;
  name: string;
  age: number;
  phone: string;
  gender: 'male' | 'female' | 'other';
  address: string;
  bloodType: string;
  previousDoctorId?: string;
  previousDoctorName?: string;
}

export interface Room {
  id: string;
  number: string;
  type: RoomType;
  status: RoomStatus;
  patientId?: string;
  patientName?: string;
}

export interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  patientPhone?: string;
  patientAge?: number;
  patientBloodType?: string;
  symptoms?: string;
  doctorId: string;
  doctorName: string;
  doctorSpecialty?: string;
  date: string;
  time: string;
  status: AppointmentStatus;
  type: AppointmentType;
  healthScore?: number;
  waitingMinutes?: number;
}

export interface ChatMessage {
  id: string;
  from: 'user' | 'bot';
  text: string;
  timestamp: Date;
}

export interface WeeklyStat {
  day: string;
  patients: number;
  appointments: number;
}
