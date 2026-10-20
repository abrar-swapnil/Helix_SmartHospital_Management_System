import { useState, useMemo, useEffect } from 'react';
import {
  Plus, X, BedDouble, Users, CalendarCheck, AlertTriangle,
  CheckCircle, XCircle, Search, Stethoscope, Clock, Activity,
  Brain, Filter,
} from 'lucide-react';
import type { AuthUser, Room, Patient, Appointment, Doctor } from '../../types';
import { mockRooms as initialRooms, mockPatients as initialPatients, mockAppointments as initialAppointments, mockDoctors } from '../../data/mockData';
import ConfirmDialog from '../ConfirmDialog';
import { getRooms, getPatients, getDoctors, getGeneralAppointments, getEmergencyAppointments, createPatient, createAppointment, cancelAppointment as apiCancelAppointment, updateRoom } from '../../api';

interface Props {
  user: AuthUser;
  activeView: string;
}

const TODAY = new Date().toISOString().split('T')[0];

// ── AI health score generator ──────────────────────────────────────────────
const SYMPTOM_SCORES: [RegExp, number][] = [
  [/chest pain|heart attack|cardiac|stroke|unconscious|not breathing|seizure/i, 95],
  [/chest tightness|difficulty breathing|shortness of breath|radiating/i, 85],
  [/severe.*pain|intense pain|unbearable|trauma|fracture|broken/i, 78],
  [/high fever|39[^0-9]|40[^0-9]|severe fever/i, 72],
  [/fever|vomiting blood|blood in|heavy bleeding/i, 65],
  [/dizziness|fainting|fainted|confusion|disoriented/i, 60],
  [/nausea|vomiting|diarrhea|abdominal pain/i, 50],
  [/headache|migraine|joint pain|body pain|back pain/i, 42],
  [/rash|skin|itching|allergy/i, 35],
  [/cough|cold|sore throat|runny nose/i, 28],
  [/follow.?up|checkup|routine|prescription|refill/i, 18],
];

function generateHealthScore(symptoms: string, age?: number, bloodType?: string): number {
  const s = symptoms.toLowerCase();
  let score = 30;
  for (const [re, val] of SYMPTOM_SCORES) {
    if (re.test(s)) { score = val; break; }
  }
  // Age adjustment
  if (age && age >= 65) score = Math.min(100, score + 10);
  else if (age && age <= 12) score = Math.min(100, score + 8);
  // Rare blood type slight bump
  if (bloodType === 'AB-' || bloodType === 'B-') score = Math.min(100, score + 3);
  return Math.round(score);
}

function autoWaitingMinutes(doc: Doctor): number {
  return Math.max(5, doc.waitingCount * 7);
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-danger bg-danger-bg border-danger/30';
  if (score >= 60) return 'text-warning bg-warning-bg border-warning/30';
  if (score >= 40) return 'text-amber-600 bg-amber-50 border-amber-200';
  return 'text-success bg-success-bg border-success/30';
}
function scoreLabel(score: number): string {
  if (score >= 80) return 'Critical';
  if (score >= 60) return 'Urgent';
  if (score >= 40) return 'Moderate';
  return 'Routine';
}

// ── Main component ────────────────────────────────────────────────────────
export default function ReceptionistDashboard({ user, activeView }: Props) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  useEffect(() => { Promise.all([getRooms(),getPatients(),getDoctors(),getGeneralAppointments(),getEmergencyAppointments()]).then(([r,p,d,g,e])=>{setRooms(r);setPatients(p);setDoctors(d);setAppointments([...g,...e]);}).catch(console.error); }, []);

  const [showBookRoom, setShowBookRoom] = useState(false);
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [showAddAppt, setShowAddAppt] = useState(false);
  const [apptTab, setApptTab] = useState<'general' | 'emergency'>('general');

  const [bookForm, setBookForm] = useState({ patientId: '', roomId: '' });
  const [patientForm, setPatientForm] = useState({ name: '', age: '', phone: '', gender: 'male', address: '', bloodType: 'A+' });

  // Appointment form — rich fields matching patient self-booking
  const [genForm, setGenForm] = useState({
    patientName: '', patientPhone: '', patientAge: '', patientBloodType: 'A+',
    symptoms: '', specialtyFilter: '', doctorId: '', date: '',
  });
  const [emgForm, setEmgForm] = useState({
    patientName: '', patientPhone: '', patientAge: '', patientBloodType: 'A+',
    symptoms: '', specialtyFilter: '', doctorId: '',
  });

  // Appointment list filters
  const [apptFilter, setApptFilter] = useState({ specialty: '', doctorId: '', date: '' });

  const [formError, setFormError] = useState('');

  type ConfirmType = 'bookRoom' | 'emptyRoom' | 'addPatient' | 'addAppt' | 'cancelAppt' | 'upgradeEmergency';
  const [confirm, setConfirm] = useState<{ open: boolean; type: ConfirmType; targetId?: string; meta?: string }>({ open: false, type: 'bookRoom' });
  const closeConfirm = () => setConfirm(prev => ({ ...prev, open: false }));

  // ── Confirm triggers ────────────────────────────────────────────────────
  const pendingBookRoom = () => {
    const patient = patients.find(p => p.id === bookForm.patientId);
    const room = rooms.find(r => r.id === bookForm.roomId);
    if (!patient || !room) { setFormError('Please select both a patient and a room.'); return; }
    setFormError('');
    setConfirm({ open: true, type: 'bookRoom', meta: `${patient.name} → Room ${room.number}` });
  };
  const emptyRoom = (roomId: string) => {
    const room = rooms.find(r => r.id === roomId);
    setConfirm({ open: true, type: 'emptyRoom', targetId: roomId, meta: `Room ${room?.number} (${room?.patientName || 'occupied'})` });
  };
  const pendingAddPatient = () => {
    if (!patientForm.name.trim()) { setFormError('Patient name is required.'); return; }
    setFormError('');
    setConfirm({ open: true, type: 'addPatient', meta: patientForm.name });
  };
  const pendingAddAppt = () => {
    if (apptTab === 'general') {
      const doc = doctors.find(d => d.id === genForm.doctorId);
      if (!genForm.patientName.trim() || !genForm.doctorId || !genForm.date) {
        setFormError('Patient name, doctor, and date are required.'); return;
      }
      setFormError('');
      setConfirm({ open: true, type: 'addAppt', meta: `${genForm.patientName} with ${doc?.name} on ${genForm.date}` });
    } else {
      const doc = doctors.find(d => d.id === emgForm.doctorId);
      if (!emgForm.patientName.trim() || !emgForm.doctorId) {
        setFormError('Patient name and doctor are required.'); return;
      }
      setFormError('');
      setConfirm({ open: true, type: 'addAppt', meta: `EMERGENCY — ${emgForm.patientName} with ${doc?.name}` });
    }
  };
  const cancelAppointment = (id: string) => {
    const appt = appointments.find(a => a.id === id);
    setConfirm({ open: true, type: 'cancelAppt', targetId: id, meta: `${appt?.patientName} → ${appt?.doctorName}` });
  };
  const upgradeToEmergency = (apptId: string) => {
    const appt = appointments.find(a => a.id === apptId);
    setConfirm({ open: true, type: 'upgradeEmergency', targetId: apptId, meta: `${appt?.patientName}'s appointment` });
  };

  // ── Execute confirmed actions ────────────────────────────────────────────
  const handleConfirm = () => {
    if (confirm.type === 'bookRoom') {
      const patient = patients.find(p => p.id === bookForm.patientId);
      if (patient) {
        updateRoom(bookForm.roomId,'occupied',patient.id).then(()=>setRooms(prev => prev.map(r => r.id === bookForm.roomId ? { ...r, status:'occupied', patientId:patient.id, patientName:patient.name } : r))).catch(e=>setFormError(e.message));
        setBookForm({ patientId: '', roomId: '' });
        setShowBookRoom(false);
      }
    } else if (confirm.type === 'emptyRoom') {
      updateRoom(confirm.targetId!,'available').then(()=>setRooms(prev => prev.map(r => r.id === confirm.targetId ? { ...r, status:'available', patientId:undefined, patientName:undefined } : r))).catch(e=>setFormError(e.message));
    } else if (confirm.type === 'addPatient') {
      const username = `${patientForm.name.toLowerCase().replace(/\s+/g,'')}${Date.now().toString().slice(-4)}`;
      createPatient({username,password:'Patient@123',name:patientForm.name,phone:patientForm.phone,age:parseInt(patientForm.age)||30,gender:patientForm.gender,address:patientForm.address,blood_type:patientForm.bloodType})
        .then(newP=>setPatients(prev=>[...prev,newP])).catch(e=>setFormError(e.message));
      setPatientForm({ name: '', age: '', phone: '', gender: 'male', address: '', bloodType: 'A+' });
      setShowAddPatient(false);
    } else if (confirm.type === 'addAppt') {
      if (apptTab === 'general') {
        const doc = doctors.find(d => d.id === genForm.doctorId)!;
        const age = parseInt(genForm.patientAge) || undefined;
        const score = generateHealthScore(genForm.symptoms, age, genForm.patientBloodType);
        const wait = autoWaitingMinutes(doc);
        // auto-assign next available time slot
        const times = ['09:00','09:30','10:00','10:30','11:00','11:30','14:00','14:30','15:00','15:30'];
        const used = appointments.filter(a => a.doctorId === doc.id && a.date === genForm.date).map(a => a.time);
        const slot = times.find(t => !used.includes(t)) || '16:00';
        const patient = patients.find(p=>p.name.toLowerCase()===genForm.patientName.toLowerCase());
        if (!patient) { setFormError('Register this patient first from Patient Registry.'); return; }
        createAppointment({patient_id:Number(patient.id),problem_type_id:undefined,appointment_type:'general',visit_date:genForm.date,visit_time:slot,symptoms:genForm.symptoms,doctor_id:Number(doc.id)})
          .then(a=>setAppointments(prev=>[...prev,a])).catch(e=>setFormError(e.message));
        setGenForm({ patientName: '', patientPhone: '', patientAge: '', patientBloodType: 'A+', symptoms: '', specialtyFilter: '', doctorId: '', date: '' });
      } else {
        const doc = doctors.find(d => d.id === emgForm.doctorId)!;
        const age = parseInt(emgForm.patientAge) || undefined;
        const score = generateHealthScore(emgForm.symptoms, age, emgForm.patientBloodType);
        const wait = autoWaitingMinutes(doc);
        const now = new Date();
        const arrTime = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        const patient = patients.find(p=>p.name.toLowerCase()===emgForm.patientName.toLowerCase());
        if (!patient) { setFormError('Register this patient first from Patient Registry.'); return; }
        createAppointment({patient_id:Number(patient.id),problem_type_id:undefined,appointment_type:'emergency',visit_date:TODAY,visit_time:arrTime,symptoms:emgForm.symptoms,current_condition:emgForm.symptoms,doctor_id:emgForm.doctorId?Number(doc.id):undefined})
          .then(a=>setAppointments(prev=>[...prev,a])).catch(e=>setFormError(e.message));
        setEmgForm({ patientName: '', patientPhone: '', patientAge: '', patientBloodType: 'A+', symptoms: '', specialtyFilter: '', doctorId: '' });
      }
      setShowAddAppt(false);
    } else if (confirm.type === 'cancelAppt') {
      apiCancelAppointment(confirm.targetId!).then(()=>setAppointments(prev => prev.map(a => a.id === confirm.targetId ? { ...a, status:'cancelled' } : a))).catch(e=>setFormError(e.message));
    } else if (confirm.type === 'upgradeEmergency') {
      setAppointments(prev => prev.map(a => a.id === confirm.targetId ? { ...a, type: 'emergency', healthScore: Math.max(a.healthScore ?? 50, 80) } : a));
    }
    closeConfirm();
  };

  const confirmDialogProps: Record<ConfirmType, { variant: 'danger' | 'warning' | 'info'; title: string; message: string; confirmLabel: string }> = {
    bookRoom:         { variant: 'info',    title: 'Book Room',            message: `Confirm booking: ${confirm.meta}?`, confirmLabel: 'Yes, Book Room' },
    emptyRoom:        { variant: 'warning', title: 'Empty Room',           message: `Mark ${confirm.meta} as available? Patient will be discharged.`, confirmLabel: 'Yes, Empty Room' },
    addPatient:       { variant: 'info',    title: 'Register Patient',     message: `Add ${confirm.meta} to the patient registry?`, confirmLabel: 'Yes, Register' },
    addAppt:          { variant: 'info',    title: 'Book Appointment',     message: `Confirm appointment: ${confirm.meta}?`, confirmLabel: 'Yes, Book' },
    cancelAppt:       { variant: 'danger',  title: 'Cancel Appointment',   message: `Cancel the appointment for ${confirm.meta}? This cannot be undone.`, confirmLabel: 'Yes, Cancel' },
    upgradeEmergency: { variant: 'warning', title: 'Upgrade to Emergency', message: `Upgrade ${confirm.meta} to EMERGENCY? Health score will be escalated.`, confirmLabel: 'Yes, Upgrade' },
  };

  const cdp = confirmDialogProps[confirm.type];
  const confirmDialogEl = (
    <ConfirmDialog open={confirm.open} variant={cdp.variant} title={cdp.title} message={cdp.message} confirmLabel={cdp.confirmLabel} onConfirm={handleConfirm} onCancel={closeConfirm} />
  );

  const availableRooms = rooms.filter(r => r.status === 'available');
  const occupiedRooms = rooms.filter(r => r.status === 'occupied').length;
  const scheduledToday = appointments.filter(a => a.date === TODAY && a.status === 'scheduled').length;

  // ── Doctors filtered for form selects ────────────────────────────────────
  const generalDoctors = doctors.filter(d => d.department === 'general' && d.status !== 'unavailable');
  const emergencyDoctors = doctors.filter(d => d.department === 'emergency' && d.status !== 'unavailable');

  const filteredGenDoctors = genForm.specialtyFilter
    ? generalDoctors.filter(d => d.specialty === genForm.specialtyFilter)
    : generalDoctors;
  const filteredEmgDoctors = emgForm.specialtyFilter
    ? emergencyDoctors.filter(d => d.specialty === emgForm.specialtyFilter)
    : emergencyDoctors;

  const allSpecialties = [...new Set(doctors.map(d => d.specialty))].sort();
  const generalSpecialties = [...new Set(generalDoctors.map(d => d.specialty))].sort();
  const emergencySpecialties = [...new Set(emergencyDoctors.map(d => d.specialty))].sort();

  // ── Appointments split & sorted ───────────────────────────────────────────
  const filteredAppts = useMemo(() => {
    let list = appointments;
    if (apptFilter.specialty) list = list.filter(a => a.doctorSpecialty === apptFilter.specialty);
    if (apptFilter.doctorId) list = list.filter(a => a.doctorId === apptFilter.doctorId);
    if (apptFilter.date) list = list.filter(a => a.date === apptFilter.date);
    return list;
  }, [appointments, apptFilter]);

  const emergencyAppts = useMemo(() =>
    filteredAppts
      .filter(a => a.type === 'emergency' && a.status !== 'cancelled')
      .sort((a, b) => (b.healthScore ?? 0) - (a.healthScore ?? 0)),
    [filteredAppts]);

  const generalAppts = useMemo(() =>
    filteredAppts
      .filter(a => a.type === 'general')
      .sort((a, b) => {
        if (a.status === 'scheduled' && b.status !== 'scheduled') return -1;
        if (b.status === 'scheduled' && a.status !== 'scheduled') return 1;
        if (a.status === 'scheduled') return (b.healthScore ?? 0) - (a.healthScore ?? 0);
        return `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);
      }),
    [filteredAppts]);

  // ── Views ─────────────────────────────────────────────────────────────────
  if (activeView === 'rooms') {
    return (
      <div className="flex-1 overflow-y-auto">
        <PageHeader title="Room Management" subtitle="Book, empty and monitor hospital rooms">
          <button onClick={() => { setFormError(''); setShowBookRoom(true); }} className="flex items-center gap-2 bg-teal hover:bg-teal-light text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors" style={{ fontFamily: 'var(--font-display)' }}>
            <Plus size={16} /> Book Room
          </button>
        </PageHeader>
        <div className="px-8 py-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {rooms.map(room => {
              const typeColor: Record<string, string> = { general: 'text-info bg-info-bg', emergency: 'text-danger bg-danger-bg', ot: 'text-warning bg-warning-bg', icu: 'text-purple-600 bg-purple-50' };
              return (
                <div key={room.id} className={`bg-card rounded-2xl border p-4 ${room.status === 'occupied' ? 'border-warning/50' : 'border-rule'}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-bold text-xl text-ink" style={{ fontFamily: 'var(--font-display)' }}>{room.number}</div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${typeColor[room.type]}`}>{room.type.toUpperCase()}</span>
                    </div>
                    {room.status === 'occupied' && (
                      <button onClick={() => emptyRoom(room.id)} className="text-xs text-warning bg-warning-bg hover:bg-warning hover:text-white px-2 py-1 rounded-lg transition-all font-medium">Empty</button>
                    )}
                  </div>
                  <div className={`text-xs font-medium ${room.status === 'available' ? 'text-success' : 'text-warning'}`}>
                    {room.status === 'available' ? '● Available' : '● Occupied'}
                  </div>
                  {room.patientName && <div className="text-xs text-ink-muted mt-1 truncate">{room.patientName}</div>}
                </div>
              );
            })}
          </div>
        </div>
        {showBookRoom && (
          <Modal title="Book a Room" onClose={() => { setShowBookRoom(false); setFormError(''); }} onSave={pendingBookRoom}>
            <SelectRow label="Patient" value={bookForm.patientId} onChange={v => setBookForm(f => ({ ...f, patientId: v }))}>
              <option value="">Select patient</option>
              {patients.map(p => <option key={p.id} value={p.id}>{p.name} ({p.id})</option>)}
            </SelectRow>
            <SelectRow label="Available Room" value={bookForm.roomId} onChange={v => setBookForm(f => ({ ...f, roomId: v }))}>
              <option value="">Select room</option>
              {availableRooms.map(r => <option key={r.id} value={r.id}>Room {r.number} ({r.type.toUpperCase()})</option>)}
            </SelectRow>
            {formError && <ErrorMsg>{formError}</ErrorMsg>}
          </Modal>
        )}
        {confirmDialogEl}
      </div>
    );
  }

  if (activeView === 'patients') {
    return (
      <div className="flex-1 overflow-y-auto">
        <PageHeader title="Patient Registry" subtitle="Manage patient records">
          <button onClick={() => { setFormError(''); setShowAddPatient(true); }} className="flex items-center gap-2 bg-teal hover:bg-teal-light text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors" style={{ fontFamily: 'var(--font-display)' }}>
            <Plus size={16} /> Add Patient
          </button>
        </PageHeader>
        <div className="px-8 py-6">
          <div className="bg-card rounded-2xl border border-rule overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-rule bg-surface">
                  {['Patient ID', 'Name', 'Age', 'Gender', 'Phone', 'Blood Type', 'Address'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-ink-muted uppercase tracking-wide px-5 py-3.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {patients.map(patient => (
                  <tr key={patient.id} className="border-b border-rule last:border-0 hover:bg-surface/50 transition-colors">
                    <td className="px-5 py-3.5 text-xs font-mono text-ink-muted">{patient.id}</td>
                    <td className="px-5 py-3.5"><div className="font-medium text-ink text-sm">{patient.name}</div></td>
                    <td className="px-5 py-3.5 text-sm text-ink-muted">{patient.age}</td>
                    <td className="px-5 py-3.5 text-sm text-ink-muted capitalize">{patient.gender}</td>
                    <td className="px-5 py-3.5 text-sm text-ink-muted">{patient.phone}</td>
                    <td className="px-5 py-3.5"><span className="text-xs font-medium text-info bg-info-bg px-2 py-0.5 rounded-full">{patient.bloodType}</span></td>
                    <td className="px-5 py-3.5 text-sm text-ink-muted truncate max-w-[160px]">{patient.address}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {showAddPatient && (
          <Modal title="Add Patient" onClose={() => { setShowAddPatient(false); setFormError(''); }} onSave={pendingAddPatient}>
            <FormRow label="Full Name" value={patientForm.name} onChange={v => setPatientForm(f => ({ ...f, name: v }))} placeholder="Patient full name" />
            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Age" value={patientForm.age} onChange={v => setPatientForm(f => ({ ...f, age: v }))} placeholder="35" type="number" />
              <SelectRow label="Gender" value={patientForm.gender} onChange={v => setPatientForm(f => ({ ...f, gender: v }))}>
                <option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
              </SelectRow>
            </div>
            <FormRow label="Phone" value={patientForm.phone} onChange={v => setPatientForm(f => ({ ...f, phone: v }))} placeholder="+1 (555) 000-0000" />
            <div className="grid grid-cols-2 gap-3">
              <SelectRow label="Blood Type" value={patientForm.bloodType} onChange={v => setPatientForm(f => ({ ...f, bloodType: v }))}>
                {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(b => <option key={b} value={b}>{b}</option>)}
              </SelectRow>
              <FormRow label="Address" value={patientForm.address} onChange={v => setPatientForm(f => ({ ...f, address: v }))} placeholder="Home address" />
            </div>
            {formError && <ErrorMsg>{formError}</ErrorMsg>}
          </Modal>
        )}
        {confirmDialogEl}
      </div>
    );
  }

  if (activeView === 'appointments') {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <PageHeader title="Appointment Management" subtitle="Book and manage general & emergency appointments">
          <button onClick={() => { setFormError(''); setShowAddAppt(true); }} className="flex items-center gap-2 bg-teal hover:bg-teal-light text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors" style={{ fontFamily: 'var(--font-display)' }}>
            <Plus size={16} /> Book Appointment
          </button>
        </PageHeader>

        {/* Filter bar */}
        <div className="bg-card border-b border-rule px-6 py-3 flex flex-wrap gap-3 items-center shrink-0">
          <Filter size={14} className="text-ink-muted" />
          <select value={apptFilter.specialty} onChange={e => setApptFilter(f => ({ ...f, specialty: e.target.value }))}
            className="bg-surface border border-rule rounded-xl px-3 py-2 text-xs text-ink focus:border-teal transition-colors">
            <option value="">All Specialties</option>
            {allSpecialties.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={apptFilter.doctorId} onChange={e => setApptFilter(f => ({ ...f, doctorId: e.target.value }))}
            className="bg-surface border border-rule rounded-xl px-3 py-2 text-xs text-ink focus:border-teal transition-colors">
            <option value="">All Doctors</option>
            {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-muted">Date (general):</span>
            <input type="date" value={apptFilter.date} onChange={e => setApptFilter(f => ({ ...f, date: e.target.value }))}
              className="bg-surface border border-rule rounded-xl px-3 py-2 text-xs text-ink focus:border-teal transition-colors" />
          </div>
          {(apptFilter.specialty || apptFilter.doctorId || apptFilter.date) && (
            <button onClick={() => setApptFilter({ specialty: '', doctorId: '', date: '' })} className="text-xs text-danger hover:underline flex items-center gap-1">
              <X size={11} /> Clear
            </button>
          )}
          <div className="ml-auto flex items-center gap-3 text-xs text-ink-muted">
            <span className="flex items-center gap-1"><Brain size={12} className="text-teal" /> AI Health Score</span>
            <span className="flex items-center gap-1"><Clock size={12} className="text-warning" /> Auto Wait Time</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">
          {/* Emergency Queue */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-danger" />
                <h3 className="font-bold text-sm text-ink" style={{ fontFamily: 'var(--font-display)' }}>Emergency Queue</h3>
              </div>
              <span className="text-xs font-medium text-danger bg-danger-bg px-2.5 py-0.5 rounded-full">{emergencyAppts.length} active</span>
              <span className="text-xs text-ink-faint ml-auto">Sorted by AI Health Score ↓ (highest priority first)</span>
            </div>

            {emergencyAppts.length === 0 ? (
              <div className="bg-card rounded-2xl border border-rule p-8 text-center">
                <CheckCircle size={32} className="text-success mx-auto mb-2" />
                <p className="text-sm text-ink-muted">No active emergency appointments</p>
              </div>
            ) : (
              <div className="space-y-2">
                {emergencyAppts.map((appt, idx) => (
                  <ApptRow key={appt.id} appt={appt} rank={idx + 1} onCancel={cancelAppointment} onUpgrade={upgradeToEmergency} />
                ))}
              </div>
            )}
          </div>

          {/* General Queue */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center gap-2">
                <CalendarCheck size={16} className="text-teal" />
                <h3 className="font-bold text-sm text-ink" style={{ fontFamily: 'var(--font-display)' }}>General Appointments</h3>
              </div>
              <span className="text-xs font-medium text-teal bg-teal-muted px-2.5 py-0.5 rounded-full">{generalAppts.filter(a => a.status === 'scheduled').length} scheduled</span>
              <span className="text-xs text-ink-faint ml-auto">Sorted by Health Score, then by Date & Time</span>
            </div>

            {generalAppts.length === 0 ? (
              <div className="bg-card rounded-2xl border border-rule p-8 text-center">
                <CalendarCheck size={32} className="text-ink-faint mx-auto mb-2" />
                <p className="text-sm text-ink-muted">No general appointments found</p>
              </div>
            ) : (
              <div className="space-y-2">
                {generalAppts.map((appt, idx) => (
                  <ApptRow key={appt.id} appt={appt} rank={idx + 1} onCancel={cancelAppointment} onUpgrade={upgradeToEmergency} showDate />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Book Appointment Modal */}
        {showAddAppt && (
          <ApptBookingModal
            tab={apptTab} setTab={setApptTab}
            genForm={genForm} setGenForm={setGenForm}
            emgForm={emgForm} setEmgForm={setEmgForm}
            generalSpecialties={generalSpecialties}
            emergencySpecialties={emergencySpecialties}
            filteredGenDoctors={filteredGenDoctors}
            filteredEmgDoctors={filteredEmgDoctors}
            doctors={doctors}
            formError={formError}
            onClose={() => { setShowAddAppt(false); setFormError(''); }}
            onSave={pendingAddAppt}
          />
        )}
        {confirmDialogEl}
      </div>
    );
  }

  if (activeView === 'doctors') {
    return (
      <div className="flex-1 overflow-y-auto">
        <PageHeader title="Doctor Directory" subtitle="View doctor availability and specialties" />
        <div className="px-8 py-6 space-y-3">
          {doctors.map(doc => (
            <div key={doc.id} className="bg-card rounded-2xl border border-rule p-5 flex items-center gap-5">
              <div className="w-11 h-11 bg-teal-muted rounded-xl flex items-center justify-center text-teal font-bold text-sm shrink-0" style={{ fontFamily: 'var(--font-display)' }}>
                {doc.name.split(' ')[1]?.[0] || doc.name[0]}
              </div>
              <div className="flex-1">
                <div className="font-medium text-ink text-sm" style={{ fontFamily: 'var(--font-display)' }}>{doc.name}</div>
                <div className="text-xs text-ink-muted mt-0.5">{doc.specialty} · {doc.phone}</div>
              </div>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${doc.department === 'emergency' ? 'text-danger bg-danger-bg' : 'text-info bg-info-bg'}`}>
                {doc.department === 'emergency' ? '🚨 Emergency' : '📋 General'}
              </span>
              <StatusBadge status={doc.status} />
              <div className="text-xs text-ink-faint">{doc.waitingCount} waiting · ~{autoWaitingMinutes(doc)} min</div>
            </div>
          ))}
        </div>
        {confirmDialogEl}
      </div>
    );
  }

  // ── Overview ──────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-y-auto">
      <PageHeader title="Receptionist Dashboard" subtitle={`Welcome, ${user.name}. Here's today at a glance.`} />
      <div className="px-8 py-6 space-y-6">
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="Available Rooms" value={availableRooms.length} icon={<BedDouble size={20} className="text-success" />} bg="bg-success-bg" />
          <StatCard label="Occupied Rooms" value={occupiedRooms} icon={<BedDouble size={20} className="text-warning" />} bg="bg-warning-bg" />
          <StatCard label="Scheduled Today" value={scheduledToday} icon={<CalendarCheck size={20} className="text-teal" />} bg="bg-teal-muted" />
          <StatCard label="Total Patients" value={patients.length} icon={<Users size={20} className="text-info" />} bg="bg-info-bg" />
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="bg-card rounded-2xl border border-rule p-6">
            <h3 className="font-semibold text-ink mb-4" style={{ fontFamily: 'var(--font-display)' }}>Emergency Queue Today</h3>
            {emergencyAppts.filter(a => a.date === TODAY).length === 0 ? (
              <p className="text-sm text-ink-muted text-center py-4">No emergency appointments today</p>
            ) : (
              <div className="space-y-2">
                {emergencyAppts.filter(a => a.date === TODAY).slice(0, 4).map(appt => (
                  <div key={appt.id} className="flex items-center gap-3 p-2.5 bg-danger-bg/40 rounded-xl border border-danger/20">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold border ${scoreColor(appt.healthScore ?? 50)}`} style={{ fontFamily: 'var(--font-display)' }}>{appt.healthScore ?? '—'}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-ink truncate">{appt.patientName}</div>
                      <div className="text-xs text-ink-muted">{appt.doctorName} · ~{appt.waitingMinutes} min wait</div>
                    </div>
                    <button onClick={() => cancelAppointment(appt.id)} className="p-1.5 hover:bg-danger-bg rounded-lg transition-colors shrink-0">
                      <XCircle size={13} className="text-danger" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-card rounded-2xl border border-rule p-6">
            <h3 className="font-semibold text-ink mb-4" style={{ fontFamily: 'var(--font-display)' }}>Doctor Availability</h3>
            <div className="space-y-3">
              {doctors.map(doc => (
                <div key={doc.id} className="flex items-center gap-3">
                  <StatusDot status={doc.status} />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-ink">{doc.name}</div>
                    <div className="text-xs text-ink-muted">{doc.specialty}</div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${doc.department === 'emergency' ? 'text-danger bg-danger-bg' : 'text-info bg-info-bg'}`}>{doc.department}</span>
                  <span className="text-xs text-ink-faint">{doc.waitingCount} waiting</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <ActionButton icon={<Plus size={16} />} label="Book Room" onClick={() => { setFormError(''); setShowBookRoom(true); }} />
          <ActionButton icon={<CheckCircle size={16} />} label="Add Patient" onClick={() => { setFormError(''); setShowAddPatient(true); }} />
          <ActionButton icon={<CalendarCheck size={16} />} label="Book Appointment" onClick={() => { setFormError(''); setShowAddAppt(true); }} />
        </div>
      </div>

      {showBookRoom && (
        <Modal title="Book a Room" onClose={() => { setShowBookRoom(false); setFormError(''); }} onSave={pendingBookRoom}>
          <SelectRow label="Patient" value={bookForm.patientId} onChange={v => setBookForm(f => ({ ...f, patientId: v }))}>
            <option value="">Select patient</option>
            {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </SelectRow>
          <SelectRow label="Available Room" value={bookForm.roomId} onChange={v => setBookForm(f => ({ ...f, roomId: v }))}>
            <option value="">Select room</option>
            {availableRooms.map(r => <option key={r.id} value={r.id}>Room {r.number} ({r.type.toUpperCase()})</option>)}
          </SelectRow>
          {formError && <ErrorMsg>{formError}</ErrorMsg>}
        </Modal>
      )}
      {showAddPatient && (
        <Modal title="Add Patient" onClose={() => { setShowAddPatient(false); setFormError(''); }} onSave={pendingAddPatient}>
          <FormRow label="Full Name" value={patientForm.name} onChange={v => setPatientForm(f => ({ ...f, name: v }))} placeholder="Patient full name" />
          <div className="grid grid-cols-2 gap-3">
            <FormRow label="Age" value={patientForm.age} onChange={v => setPatientForm(f => ({ ...f, age: v }))} placeholder="35" type="number" />
            <SelectRow label="Gender" value={patientForm.gender} onChange={v => setPatientForm(f => ({ ...f, gender: v }))}>
              <option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
            </SelectRow>
          </div>
          <FormRow label="Phone" value={patientForm.phone} onChange={v => setPatientForm(f => ({ ...f, phone: v }))} placeholder="+1 (555) 000-0000" />
          <SelectRow label="Blood Type" value={patientForm.bloodType} onChange={v => setPatientForm(f => ({ ...f, bloodType: v }))}>
            {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(b => <option key={b} value={b}>{b}</option>)}
          </SelectRow>
          {formError && <ErrorMsg>{formError}</ErrorMsg>}
        </Modal>
      )}
      {showAddAppt && (
        <ApptBookingModal
          tab={apptTab} setTab={setApptTab}
          genForm={genForm} setGenForm={setGenForm}
          emgForm={emgForm} setEmgForm={setEmgForm}
          generalSpecialties={generalSpecialties}
          emergencySpecialties={emergencySpecialties}
          filteredGenDoctors={filteredGenDoctors}
          filteredEmgDoctors={filteredEmgDoctors}
          doctors={doctors}
          formError={formError}
          onClose={() => { setShowAddAppt(false); setFormError(''); }}
          onSave={pendingAddAppt}
        />
      )}
      {confirmDialogEl}
    </div>
  );
}

// ── Appointment booking modal ─────────────────────────────────────────────
interface ApptBookingModalProps {
  tab: 'general' | 'emergency';
  setTab: (t: 'general' | 'emergency') => void;
  genForm: { patientName: string; patientPhone: string; patientAge: string; patientBloodType: string; symptoms: string; specialtyFilter: string; doctorId: string; date: string };
  setGenForm: React.Dispatch<React.SetStateAction<ApptBookingModalProps['genForm']>>;
  emgForm: { patientName: string; patientPhone: string; patientAge: string; patientBloodType: string; symptoms: string; specialtyFilter: string; doctorId: string };
  setEmgForm: React.Dispatch<React.SetStateAction<ApptBookingModalProps['emgForm']>>;
  generalSpecialties: string[];
  emergencySpecialties: string[];
  filteredGenDoctors: Doctor[];
  filteredEmgDoctors: Doctor[];
  doctors: Doctor[];
  formError: string;
  onClose: () => void;
  onSave: () => void;
}

function ApptBookingModal({
  tab, setTab, genForm, setGenForm, emgForm, setEmgForm,
  generalSpecialties, emergencySpecialties,
  filteredGenDoctors, filteredEmgDoctors, doctors,
  formError, onClose, onSave,
}: ApptBookingModalProps) {
  // Live preview score
  const previewGenScore = genForm.symptoms
    ? generateHealthScore(genForm.symptoms, parseInt(genForm.patientAge) || undefined, genForm.patientBloodType)
    : null;
  const previewEmgScore = emgForm.symptoms
    ? generateHealthScore(emgForm.symptoms, parseInt(emgForm.patientAge) || undefined, emgForm.patientBloodType)
    : null;

  const genDoc = doctors.find(d => d.id === genForm.doctorId);
  const emgDoc = doctors.find(d => d.id === emgForm.doctorId);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-2xl border border-rule shadow-2xl w-full max-w-lg flex flex-col" style={{ maxHeight: '92vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-rule shrink-0">
          <h3 className="font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>Book Appointment</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface transition-colors"><X size={16} className="text-ink-muted" /></button>
        </div>

        {/* Tab switcher */}
        <div className="flex px-6 pt-4 gap-2 shrink-0">
          <button onClick={() => setTab('general')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all ${tab === 'general' ? 'bg-teal-muted text-teal border-teal/40' : 'bg-surface text-ink-muted border-rule hover:border-ink-muted'}`}
            style={{ fontFamily: 'var(--font-display)' }}>
            <CalendarCheck size={15} /> General
          </button>
          <button onClick={() => setTab('emergency')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all ${tab === 'emergency' ? 'bg-danger-bg text-danger border-danger/40' : 'bg-surface text-ink-muted border-rule hover:border-ink-muted'}`}
            style={{ fontFamily: 'var(--font-display)' }}>
            <AlertTriangle size={15} /> Emergency
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {tab === 'general' ? (
            <>
              <SectionLabel>Patient Information</SectionLabel>
              <FormRow label="Patient Name" value={genForm.patientName} onChange={v => setGenForm(f => ({ ...f, patientName: v }))} placeholder="Full name" />
              <div className="grid grid-cols-2 gap-3">
                <FormRow label="Phone" value={genForm.patientPhone} onChange={v => setGenForm(f => ({ ...f, patientPhone: v }))} placeholder="+1 (555) …" />
                <FormRow label="Age" value={genForm.patientAge} onChange={v => setGenForm(f => ({ ...f, patientAge: v }))} placeholder="Age" type="number" />
              </div>
              <SelectRow label="Blood Type" value={genForm.patientBloodType} onChange={v => setGenForm(f => ({ ...f, patientBloodType: v }))}>
                {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(b => <option key={b} value={b}>{b}</option>)}
              </SelectRow>
              <TextareaRow label="Chief Complaint / Symptoms" value={genForm.symptoms} onChange={v => setGenForm(f => ({ ...f, symptoms: v }))} placeholder="Describe the patient's main symptoms or reason for visit…" />

              {previewGenScore !== null && (
                <div className={`flex items-center gap-3 rounded-xl px-4 py-2.5 border ${scoreColor(previewGenScore)}`}>
                  <Brain size={15} className="shrink-0" />
                  <div className="flex-1">
                    <div className="text-xs font-semibold">AI Health Score: {previewGenScore}/100 — {scoreLabel(previewGenScore)}</div>
                    {genDoc && <div className="text-xs opacity-70">Est. wait with {genDoc.name}: ~{autoWaitingMinutes(genDoc)} min</div>}
                  </div>
                </div>
              )}

              <SectionLabel>Doctor & Schedule</SectionLabel>
              <SelectRow label="Specialty Filter" value={genForm.specialtyFilter} onChange={v => setGenForm(f => ({ ...f, specialtyFilter: v, doctorId: '' }))}>
                <option value="">All Specialties</option>
                {generalSpecialties.map(s => <option key={s} value={s}>{s}</option>)}
              </SelectRow>
              <SelectRow label="Doctor (General Dept)" value={genForm.doctorId} onChange={v => setGenForm(f => ({ ...f, doctorId: v }))}>
                <option value="">Select doctor</option>
                {filteredGenDoctors.map(d => <option key={d.id} value={d.id}>{d.name} — {d.specialty} · {d.waitingCount} waiting</option>)}
              </SelectRow>
              <FormRow label="Appointment Date" value={genForm.date} onChange={v => setGenForm(f => ({ ...f, date: v }))} type="date" />
              <div className="flex items-center gap-2 bg-info-bg rounded-xl px-3 py-2 text-xs text-info">
                <Clock size={12} className="shrink-0" />
                Time slot will be auto-assigned based on doctor availability for the selected date.
              </div>
            </>
          ) : (
            <>
              <div className="bg-danger-bg border border-danger/30 rounded-xl px-4 py-2.5 flex items-center gap-2">
                <AlertTriangle size={14} className="text-danger shrink-0" />
                <p className="text-xs text-danger font-medium">Emergency appointment — no date/time required. System records current arrival time automatically.</p>
              </div>

              <SectionLabel>Patient Information</SectionLabel>
              <FormRow label="Patient Name" value={emgForm.patientName} onChange={v => setEmgForm(f => ({ ...f, patientName: v }))} placeholder="Full name" />
              <div className="grid grid-cols-2 gap-3">
                <FormRow label="Phone" value={emgForm.patientPhone} onChange={v => setEmgForm(f => ({ ...f, patientPhone: v }))} placeholder="+1 (555) …" />
                <FormRow label="Age" value={emgForm.patientAge} onChange={v => setEmgForm(f => ({ ...f, patientAge: v }))} placeholder="Age" type="number" />
              </div>
              <SelectRow label="Blood Type" value={emgForm.patientBloodType} onChange={v => setEmgForm(f => ({ ...f, patientBloodType: v }))}>
                {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(b => <option key={b} value={b}>{b}</option>)}
              </SelectRow>
              <TextareaRow label="Presenting Complaint / Symptoms" value={emgForm.symptoms} onChange={v => setEmgForm(f => ({ ...f, symptoms: v }))} placeholder="Describe the emergency — symptoms, severity, onset…" />

              {previewEmgScore !== null && (
                <div className={`flex items-center gap-3 rounded-xl px-4 py-2.5 border ${scoreColor(previewEmgScore)}`}>
                  <Brain size={15} className="shrink-0" />
                  <div className="flex-1">
                    <div className="text-xs font-semibold">AI Health Score: {previewEmgScore}/100 — {scoreLabel(previewEmgScore)}</div>
                    {emgDoc && <div className="text-xs opacity-70">Est. wait with {emgDoc.name}: ~{autoWaitingMinutes(emgDoc)} min</div>}
                  </div>
                </div>
              )}

              <SectionLabel>Emergency Doctor</SectionLabel>
              <SelectRow label="Specialty Filter" value={emgForm.specialtyFilter} onChange={v => setEmgForm(f => ({ ...f, specialtyFilter: v, doctorId: '' }))}>
                <option value="">All Emergency Specialties</option>
                {emergencySpecialties.map(s => <option key={s} value={s}>{s}</option>)}
              </SelectRow>
              <SelectRow label="Doctor (Emergency Dept)" value={emgForm.doctorId} onChange={v => setEmgForm(f => ({ ...f, doctorId: v }))}>
                <option value="">Select doctor</option>
                {filteredEmgDoctors.map(d => <option key={d.id} value={d.id}>{d.name} — {d.specialty} · {d.waitingCount} waiting</option>)}
              </SelectRow>
              {filteredEmgDoctors.length === 0 && (
                <div className="text-xs text-warning bg-warning-bg rounded-xl px-3 py-2">No emergency doctors available for this specialty. Check doctor assignments in Admin.</div>
              )}
            </>
          )}

          {formError && <ErrorMsg>{formError}</ErrorMsg>}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-rule shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-rule text-sm text-ink-muted hover:bg-surface transition-colors">Cancel</button>
          <button onClick={onSave} className={`flex-1 py-2.5 rounded-xl text-white text-sm font-medium transition-colors ${tab === 'emergency' ? 'bg-danger hover:bg-red-600' : 'bg-teal hover:bg-teal-light'}`} style={{ fontFamily: 'var(--font-display)' }}>
            {tab === 'emergency' ? '🚨 Register Emergency' : 'Book Appointment'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Appointment row ────────────────────────────────────────────────────────
function ApptRow({ appt, rank, onCancel, onUpgrade, showDate }: {
  appt: Appointment; rank: number;
  onCancel: (id: string) => void;
  onUpgrade: (id: string) => void;
  showDate?: boolean;
}) {
  const score = appt.healthScore ?? 30;
  const isEmergency = appt.type === 'emergency';
  return (
    <div className={`bg-card rounded-2xl border p-4 flex items-center gap-4 ${isEmergency ? 'border-danger/30' : 'border-rule'} ${appt.status === 'cancelled' ? 'opacity-50' : ''}`}>
      {/* Rank badge */}
      <div className="w-8 h-8 bg-surface rounded-lg flex items-center justify-center text-xs font-bold text-ink-muted shrink-0" style={{ fontFamily: 'var(--font-display)' }}>
        {rank}
      </div>

      {/* Health score */}
      <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center text-center border shrink-0 ${scoreColor(score)}`}>
        <div className="text-lg font-bold leading-none" style={{ fontFamily: 'var(--font-display)' }}>{score}</div>
        <div className="text-[9px] font-medium uppercase leading-none mt-0.5 opacity-80">score</div>
      </div>

      {/* Patient & doctor info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-ink text-sm" style={{ fontFamily: 'var(--font-display)' }}>{appt.patientName}</span>
          {appt.patientAge && <span className="text-xs text-ink-faint">Age {appt.patientAge}</span>}
          {appt.patientBloodType && <span className="text-xs text-info bg-info-bg px-1.5 py-0.5 rounded-full">{appt.patientBloodType}</span>}
        </div>
        {appt.symptoms && <div className="text-xs text-ink-muted mt-0.5 truncate max-w-xs">{appt.symptoms}</div>}
        <div className="flex items-center gap-3 mt-1 text-xs text-ink-muted">
          <span className="flex items-center gap-1"><Stethoscope size={11} /> {appt.doctorName}</span>
          {appt.doctorSpecialty && <span className="text-ink-faint">{appt.doctorSpecialty}</span>}
          {appt.waitingMinutes !== undefined && (
            <span className="flex items-center gap-1 text-warning"><Clock size={11} /> ~{appt.waitingMinutes} min wait</span>
          )}
          {showDate && <span>{appt.date} · {appt.time}</span>}
          {!showDate && <span className="text-ink-faint">Arrived {appt.time}</span>}
        </div>
      </div>

      {/* Status + actions */}
      <div className="flex items-center gap-2 shrink-0">
        <StatusBadge status={appt.status} />
        {appt.status === 'scheduled' && !isEmergency && (
          <button onClick={() => onUpgrade(appt.id)} title="Upgrade to Emergency" className="p-1.5 rounded-xl hover:bg-warning-bg transition-colors">
            <AlertTriangle size={13} className="text-warning" />
          </button>
        )}
        {appt.status === 'scheduled' && (
          <button onClick={() => onCancel(appt.id)} className="p-1.5 rounded-xl hover:bg-danger-bg transition-colors">
            <XCircle size={13} className="text-danger" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Primitive helpers ─────────────────────────────────────────────────────
function PageHeader({ title, subtitle, children }: { title: string; subtitle: string; children?: React.ReactNode }) {
  return (
    <div className="bg-card border-b border-rule px-8 py-5 flex items-center justify-between shrink-0">
      <div>
        <h1 className="text-xl font-bold text-ink" style={{ fontFamily: 'var(--font-display)' }}>{title}</h1>
        <p className="text-ink-muted text-sm mt-0.5">{subtitle}</p>
      </div>
      {children && <div>{children}</div>}
    </div>
  );
}

function StatCard({ label, value, icon, bg }: { label: string; value: number; icon: React.ReactNode; bg: string }) {
  return (
    <div className="bg-card rounded-2xl border border-rule p-5 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bg} shrink-0`}>{icon}</div>
      <div>
        <div className="text-2xl font-bold text-ink" style={{ fontFamily: 'var(--font-display)' }}>{value}</div>
        <div className="text-xs text-ink-muted">{label}</div>
      </div>
    </div>
  );
}

function ActionButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2 bg-navy hover:bg-navy-light text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors" style={{ fontFamily: 'var(--font-display)' }}>
      {icon}{label}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    available: 'text-success bg-success-bg', busy: 'text-warning bg-warning-bg',
    unavailable: 'text-danger bg-danger-bg', scheduled: 'text-teal bg-teal-muted',
    completed: 'text-success bg-success-bg', cancelled: 'text-ink-muted bg-surface',
  };
  return <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${map[status] || ''}`}>{status}</span>;
}

function StatusDot({ status }: { status: string }) {
  const map: Record<string, string> = { available: 'bg-success', busy: 'bg-warning', unavailable: 'bg-danger' };
  return <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${map[status] || 'bg-ink-faint'}`} />;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-bold text-ink-muted uppercase tracking-widest pt-1">{children}</div>;
}

function ErrorMsg({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-danger bg-danger-bg rounded-xl px-3 py-2">{children}</p>;
}

function Modal({ title, onClose, onSave, children }: { title: string; onClose: () => void; onSave: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-2xl border border-rule shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-rule">
          <h3 className="font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface transition-colors"><X size={16} className="text-ink-muted" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">{children}</div>
        <div className="flex gap-3 px-6 py-4 border-t border-rule">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-rule text-sm text-ink-muted hover:bg-surface transition-colors">Cancel</button>
          <button onClick={onSave} className="flex-1 py-2.5 rounded-xl bg-teal hover:bg-teal-light text-white text-sm font-medium transition-colors" style={{ fontFamily: 'var(--font-display)' }}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

function FormRow({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-muted mb-1.5 uppercase tracking-wide">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-surface border border-rule rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-teal transition-colors" />
    </div>
  );
}

function SelectRow({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-muted mb-1.5 uppercase tracking-wide">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-surface border border-rule rounded-xl px-4 py-2.5 text-sm text-ink focus:border-teal transition-colors">
        {children}
      </select>
    </div>
  );
}

function TextareaRow({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-muted mb-1.5 uppercase tracking-wide">{label}</label>
      <textarea rows={3} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-surface border border-rule rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-teal transition-colors resize-none" />
    </div>
  );
}
