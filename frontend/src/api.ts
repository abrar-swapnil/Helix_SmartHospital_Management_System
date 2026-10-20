import type { Appointment, AuthUser, Doctor, Patient, Room } from './types';

export const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';

function token() { return localStorage.getItem('helix_token') || ''; }

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (token()) headers.set('Authorization', `Bearer ${token()}`);
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try { const body = await res.json(); detail = body.detail || detail; } catch {}
    throw new Error(detail);
  }
  return res.json();
}

export async function login(username: string, password: string) {
  return request<{access_token:string; token_type:string; user: any}>('/auth/login', {method:'POST', body:JSON.stringify({username,password})});
}
export async function getMe() { return request<any>('/auth/me'); }
export async function getDoctors(): Promise<Doctor[]> {
  const rows:any[] = await request('/doctors');
  return rows.map(d => ({...d, id:String(d.id), waitingCount:d.waiting_count, patientsToday:0, department:d.department}));
}
export async function getPatients(): Promise<Patient[]> {
  const rows:any[] = await request('/patients');
  return rows.map(p => ({...p, id:String(p.id), bloodType:p.blood_type}));
}
export async function getRooms(): Promise<Room[]> {
  const rows:any[] = await request('/rooms');
  return rows.map(r => ({...r, id:String(r.id), number:r.number, patientId:r.patient_id ? String(r.patient_id) : undefined, patientName:r.patient_name}));
}
function mapAppointment(a:any): Appointment { return {id:String(a.id), patientId:String(a.patient_id), patientName:a.patient_name, patientPhone:a.patient_phone, patientAge:a.patient_age, doctorId:a.doctor_id ? String(a.doctor_id):'', doctorName:a.doctor_name || '', doctorSpecialty:a.doctor_specialty || '', symptoms:a.symptoms, date:a.date, time:a.time, status:a.status, type:a.type, healthScore:a.health_score ?? undefined, waitingMinutes:a.waiting_minutes}; }
export async function getEmergencyAppointments(params=''): Promise<Appointment[]> { const rows:any[]=await request(`/appointments/emergency${params}`); return rows.map(mapAppointment); }
export async function getGeneralAppointments(params=''): Promise<Appointment[]> { const rows:any[]=await request(`/appointments/general${params}`); return rows.map(mapAppointment); }
export async function createAppointment(data:any) { const a=await request<any>('/appointments',{method:'POST',body:JSON.stringify(data)}); return mapAppointment(a); }
export async function cancelAppointment(id:string) { return request(`/appointments/${id}/cancel`,{method:'PATCH'}); }
export async function createPatient(data:any): Promise<Patient> { const p:any=await request('/patients',{method:'POST',body:JSON.stringify(data)}); return {...p,id:String(p.id),bloodType:p.blood_type}; }
export async function updateDoctorStatus(id:string,status:string) { const d:any=await request(`/doctors/${id}/status`,{method:'PATCH',body:JSON.stringify({status})}); return {...d,id:String(d.id),waitingCount:d.waiting_count,patientsToday:0}; }
export async function getProblems(): Promise<any[]> { return request('/problem-types'); }
export async function sendChat(message:string, patientId?:string) { return request<any>('/ai/chat',{method:'POST',body:JSON.stringify({message,patient_id:patientId?Number(patientId):undefined})}); }
export async function explainDocument(patientId:string,file:File,question='Please describe this prescription in simple language.') { const fd=new FormData(); fd.append('patient_id',patientId); fd.append('question',question); fd.append('file',file); return request<any>('/ai/document/explain',{method:'POST',body:fd}); }
export async function requestAmbulance(patientId:string,address:string,phone:string,emergencyNote:string) { return request<any>('/ambulance/request',{method:'POST',body:JSON.stringify({patient_id:Number(patientId),address,phone,emergency_note:emergencyNote})}); }
export async function updateRoom(id:string,status:'available'|'occupied',patientId?:string) { return request(`/rooms/${id}`,{method:'PATCH',body:JSON.stringify({status,patient_id:patientId?Number(patientId):null})}); }
