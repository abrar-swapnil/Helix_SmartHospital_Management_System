import type { Doctor, Patient, Room, Appointment, WeeklyStat } from '../types';

export const mockDoctors: Doctor[] = [
  { id: 'd1', name: 'Dr. Sarah Chen', email: 'sarah.chen@medicore.com', phone: '+1 (555) 234-5678', specialty: 'Cardiology', status: 'available', department: 'emergency', waitingCount: 4, patientsToday: 12 },
  { id: 'd2', name: 'Dr. Michael Okafor', email: 'm.okafor@medicore.com', phone: '+1 (555) 345-6789', specialty: 'Neurology', status: 'busy', department: 'general', waitingCount: 7, patientsToday: 9 },
  { id: 'd3', name: 'Dr. Emma Larsson', email: 'e.larsson@medicore.com', phone: '+1 (555) 456-7890', specialty: 'Pediatrics', status: 'available', department: 'general', waitingCount: 2, patientsToday: 15 },
  { id: 'd4', name: 'Dr. James Rivera', email: 'j.rivera@medicore.com', phone: '+1 (555) 567-8901', specialty: 'Orthopedics', status: 'unavailable', department: 'general', waitingCount: 0, patientsToday: 6 },
  { id: 'd5', name: 'Dr. Priya Sharma', email: 'p.sharma@medicore.com', phone: '+1 (555) 678-9012', specialty: 'Dermatology', status: 'available', department: 'emergency', waitingCount: 3, patientsToday: 11 },
];

export const mockPatients: Patient[] = [
  { id: 'p1', username: 'rwilliams', name: 'Robert Williams', age: 45, phone: '+1 (555) 111-2222', gender: 'male', address: '123 Oak St, Springfield', bloodType: 'A+', previousDoctorId: 'd1', previousDoctorName: 'Dr. Sarah Chen' },
  { id: 'p2', username: 'mgarcia', name: 'Maria Garcia', age: 32, phone: '+1 (555) 222-3333', gender: 'female', address: '456 Maple Ave, Riverside', bloodType: 'O-', previousDoctorId: 'd3', previousDoctorName: 'Dr. Emma Larsson' },
  { id: 'p3', username: 'jthompson', name: 'James Thompson', age: 67, phone: '+1 (555) 333-4444', gender: 'male', address: '789 Pine Rd, Lakewood', bloodType: 'B+' },
  { id: 'p4', username: 'apatel', name: 'Aisha Patel', age: 28, phone: '+1 (555) 444-5555', gender: 'female', address: '321 Elm Dr, Oakdale', bloodType: 'AB+', previousDoctorId: 'd2', previousDoctorName: 'Dr. Michael Okafor' },
  { id: 'p5', username: 'ldavis', name: 'Lena Davis', age: 54, phone: '+1 (555) 555-6666', gender: 'female', address: '654 Birch Lane, Greenfield', bloodType: 'A-' },
];

export const mockRooms: Room[] = [
  { id: 'r1', number: '101', type: 'general', status: 'available' },
  { id: 'r2', number: '102', type: 'general', status: 'occupied', patientId: 'p1', patientName: 'Robert Williams' },
  { id: 'r3', number: '103', type: 'general', status: 'occupied', patientId: 'p2', patientName: 'Maria Garcia' },
  { id: 'r4', number: '104', type: 'general', status: 'available' },
  { id: 'r5', number: '105', type: 'general', status: 'available' },
  { id: 'r6', number: '201', type: 'emergency', status: 'occupied', patientId: 'p3', patientName: 'James Thompson' },
  { id: 'r7', number: '202', type: 'emergency', status: 'available' },
  { id: 'r8', number: 'OT-1', type: 'ot', status: 'available' },
  { id: 'r9', number: 'OT-2', type: 'ot', status: 'occupied', patientId: 'p4', patientName: 'Aisha Patel' },
  { id: 'r10', number: 'ICU-1', type: 'icu', status: 'available' },
  { id: 'r11', number: 'ICU-2', type: 'icu', status: 'occupied', patientId: 'p5', patientName: 'Lena Davis' },
];

export const mockAppointments: Appointment[] = [
  { id: 'a1', patientId: 'p1', patientName: 'Robert Williams', patientPhone: '+1 (555) 111-2222', patientAge: 45, patientBloodType: 'A+', symptoms: 'Chest tightness and mild shortness of breath', doctorId: 'd1', doctorName: 'Dr. Sarah Chen', doctorSpecialty: 'Cardiology', date: '2026-09-10', time: '09:00', status: 'scheduled', type: 'general', healthScore: 72, waitingMinutes: 28 },
  { id: 'a2', patientId: 'p2', patientName: 'Maria Garcia', patientPhone: '+1 (555) 222-3333', patientAge: 32, patientBloodType: 'O-', symptoms: 'Recurring headache for 3 days', doctorId: 'd3', doctorName: 'Dr. Emma Larsson', doctorSpecialty: 'Pediatrics', date: '2026-09-10', time: '10:30', status: 'scheduled', type: 'general', healthScore: 45, waitingMinutes: 15 },
  { id: 'a3', patientId: 'p4', patientName: 'Aisha Patel', patientPhone: '+1 (555) 444-5555', patientAge: 28, patientBloodType: 'AB+', symptoms: 'Follow-up checkup', doctorId: 'd2', doctorName: 'Dr. Michael Okafor', doctorSpecialty: 'Neurology', date: '2026-09-10', time: '11:00', status: 'completed', type: 'general', healthScore: 22, waitingMinutes: 0 },
  { id: 'a4', patientId: 'p3', patientName: 'James Thompson', patientPhone: '+1 (555) 333-4444', patientAge: 67, patientBloodType: 'B+', symptoms: 'Severe chest pain radiating to left arm, difficulty breathing', doctorId: 'd1', doctorName: 'Dr. Sarah Chen', doctorSpecialty: 'Cardiology', date: '2026-09-15', time: '08:12', status: 'scheduled', type: 'emergency', healthScore: 94, waitingMinutes: 5 },
  { id: 'a5', patientId: 'p5', patientName: 'Lena Davis', patientPhone: '+1 (555) 555-6666', patientAge: 54, patientBloodType: 'A-', symptoms: 'High fever 39.8°C and severe body pain', doctorId: 'd5', doctorName: 'Dr. Priya Sharma', doctorSpecialty: 'Dermatology', date: '2026-09-15', time: '08:45', status: 'scheduled', type: 'emergency', healthScore: 78, waitingMinutes: 12 },
  { id: 'a6', patientId: 'p1', patientName: 'Robert Williams', patientPhone: '+1 (555) 111-2222', patientAge: 45, patientBloodType: 'A+', symptoms: 'Routine cardiac follow-up', doctorId: 'd1', doctorName: 'Dr. Sarah Chen', doctorSpecialty: 'Cardiology', date: '2026-09-16', time: '09:30', status: 'scheduled', type: 'general', healthScore: 38, waitingMinutes: 20 },
];

export const weeklyStats: WeeklyStat[] = [
  { day: 'Mon', patients: 42, appointments: 38 },
  { day: 'Tue', patients: 58, appointments: 51 },
  { day: 'Wed', patients: 45, appointments: 40 },
  { day: 'Thu', patients: 63, appointments: 55 },
  { day: 'Fri', patients: 71, appointments: 65 },
  { day: 'Sat', patients: 34, appointments: 28 },
  { day: 'Sun', patients: 19, appointments: 15 },
];

export const doctorPatientHistory = [
  { day: 'Mon', count: 8 },
  { day: 'Tue', count: 12 },
  { day: 'Wed', count: 9 },
  { day: 'Thu', count: 15 },
  { day: 'Fri', count: 11 },
  { day: 'Sat', count: 6 },
  { day: 'Sun', count: 3 },
];
