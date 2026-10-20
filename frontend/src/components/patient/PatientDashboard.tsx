import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Plus, XCircle, Send, Bot, User, Calendar, Clock,
  Search, SlidersHorizontal, Building2, Stethoscope,
  ChevronDown, CheckCircle, X, Filter, ArrowUpDown,
} from 'lucide-react';
import ConfirmDialog from '../ConfirmDialog';
import type { AuthUser, Appointment, ChatMessage, Doctor } from '../../types';
import { mockDoctors, mockPatients, mockAppointments as initialAppointments } from '../../data/mockData';
import { HOSPITALS, SPECIALTIES } from '../../data/constants';
import { getDoctors, getGeneralAppointments, getEmergencyAppointments, createAppointment, cancelAppointment as apiCancelAppointment, sendChat as apiSendChat, explainDocument } from '../../api';

interface Props {
  user: AuthUser;
  activeView: string;
}

const SORT_OPTIONS = [
  { id: 'name-asc', label: 'Name (A–Z)' },
  { id: 'name-desc', label: 'Name (Z–A)' },
  { id: 'wait-asc', label: 'Shortest Wait' },
  { id: 'wait-desc', label: 'Longest Wait' },
  { id: 'patients-desc', label: 'Most Experienced' },
];

// Assign mock hospital IDs to doctors for demo purposes
const doctorHospitals: Record<string, string> = {
  d1: 'HLX-001', d2: 'MCH-001', d3: 'HLX-002', d4: 'RVH-001', d5: 'MCH-002',
};

interface Filters {
  search: string;
  hospitals: string[];
  specialties: string[];
  availability: 'all' | 'available' | 'busy';
  sort: string;
}

const defaultFilters: Filters = {
  search: '', hospitals: [], specialties: [], availability: 'all', sort: 'name-asc',
};

const botResponses = (input: string): string => {
  const l = input.toLowerCase();
  if (l.includes('appointment')) return 'You can book an appointment from the Appointments tab. Use the filters to narrow down by hospital or specialty, then pick your preferred doctor and time slot.';
  if (l.includes('cancel')) return 'To cancel an appointment, go to the Appointments tab and click the cancel button next to your booking.';
  if (l.includes('wait') || l.includes('queue')) return 'Waiting times are shown on each doctor card in Find Doctors. Sort by "Shortest Wait" to find the quickest available slot.';
  if (l.includes('doctor') || l.includes('specialist')) return 'Use the Find Doctors tab. You can filter by hospital, specialty, and availability — then sort by wait time or experience.';
  if (l.includes('emergency')) return 'For emergencies, call 911 immediately or contact reception at +1 (555) 000-0000. Helix AI Ambulance: +1 (800) HLX-AMBU.';
  if (l.includes('prescription') || l.includes('medication')) return 'Prescription details are provided by your doctor. Please attend your scheduled appointment to discuss medications.';
  if (l.includes('result') || l.includes('test') || l.includes('lab')) return 'Lab results are typically available within 24–48 hours. Your doctor will review them with you at your next appointment.';
  if (l.includes('insurance') || l.includes('bill')) return 'For billing queries, contact billing@helixhms.com or call +1 (555) 100-2000.';
  if (l.includes('hospital')) return 'Helix HMS serves multiple hospitals. Use the hospital filter in Find Doctors to browse doctors at a specific location near you.';
  if (l.includes('hello') || l.includes('hi')) return "Hello! I'm MediAssist, your personal hospital guide. How can I help you today?";
  if (l.includes('thank')) return "You're welcome! Is there anything else I can help you with?";
  return "I can help with appointments, finding doctors by specialty or hospital, lab results, prescriptions, and general queries. What would you like to know?";
};

function applyFilters(doctors: Doctor[], filters: Filters): Doctor[] {
  let result = [...doctors];

  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(d =>
      d.name.toLowerCase().includes(q) ||
      d.specialty.toLowerCase().includes(q) ||
      (HOSPITALS[doctorHospitals[d.id]] || '').toLowerCase().includes(q)
    );
  }
  if (filters.hospitals.length > 0) {
    result = result.filter(d => filters.hospitals.includes(doctorHospitals[d.id]));
  }
  if (filters.specialties.length > 0) {
    result = result.filter(d => filters.specialties.includes(d.specialty));
  }
  if (filters.availability !== 'all') {
    result = result.filter(d => d.status === filters.availability);
  }

  switch (filters.sort) {
    case 'name-asc': result.sort((a, b) => a.name.localeCompare(b.name)); break;
    case 'name-desc': result.sort((a, b) => b.name.localeCompare(a.name)); break;
    case 'wait-asc': result.sort((a, b) => a.waitingCount - b.waitingCount); break;
    case 'wait-desc': result.sort((a, b) => b.waitingCount - a.waitingCount); break;
    case 'patients-desc': result.sort((a, b) => b.patientsToday - a.patientsToday); break;
  }
  return result;
}

export default function PatientDashboard({ user, activeView }: Props) {
  const myPatient = mockPatients.find(p => p.username === user.username) ?? mockPatients[0];
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  useEffect(() => {
    Promise.all([getDoctors(), getGeneralAppointments(), getEmergencyAppointments()]).then(([ds,gs,es]) => { setDoctors(ds); setAppointments([...gs,...es].filter(a => a.patientId === (user.patientId || myPatient.id))); }).catch(console.error);
  }, [user.patientId, myPatient.id]);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'm0', from: 'bot', text: "Hi! I'm MediAssist 👋 I can help you book appointments, find doctors by hospital or specialty, or answer any hospital questions.", timestamp: new Date() }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isBotTyping, setIsBotTyping] = useState(false);
  const [documentBusy, setDocumentBusy] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Doctor filter state
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  // Booking modal state
  const [showAddAppt, setShowAddAppt] = useState(false);
  const [preselectedDoctor, setPreselectedDoctor] = useState<Doctor | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<{ open: boolean; apptId: string; meta: string }>({ open: false, apptId: '', meta: '' });
  const [confirmBook, setConfirmBook] = useState(false);
  const [apptForm, setApptForm] = useState({ doctorId: '', date: '', time: '' });
  const [bookingFilters, setBookingFilters] = useState<Filters>(defaultFilters);
  const [bookingStep, setBookingStep] = useState<'select-doctor' | 'pick-time'>('select-doctor');

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isBotTyping]);

  const sendMessage = async () => {
    if (!chatInput.trim()) return;
    const userMsg: ChatMessage = { id: `m${Date.now()}`, from: 'user', text: chatInput, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]); setChatInput(''); setIsBotTyping(true);
    try { const r=await apiSendChat(userMsg.text,user.patientId || myPatient.id); setMessages(prev=>[...prev,{id:`m${Date.now()+1}`,from:'bot',text:r.reply,timestamp:new Date()}]); }
    catch(e:any){ setMessages(prev=>[...prev,{id:`m${Date.now()+1}`,from:'bot',text:`AI assistant error: ${e.message}`,timestamp:new Date()}]); }
    finally{setIsBotTyping(false);}
  };

  const handlePrescriptionUpload = async (file: File) => {
    setDocumentBusy(true);
    try {
      const result = await explainDocument(user.patientId || myPatient.id, file);
      setMessages(prev => [...prev, { id:`doc-${Date.now()}`, from:'bot', text: result.summary || 'I could not generate a summary.', timestamp:new Date() }]);
    } catch (e:any) {
      setMessages(prev => [...prev, { id:`doc-${Date.now()}`, from:'bot', text:`Document analysis failed: ${e.message}`, timestamp:new Date() }]);
    } finally { setDocumentBusy(false); }
  };

  const cancelAppointment = (id: string) => {
    const appt = appointments.find(a => a.id === id);
    setConfirmCancel({ open: true, apptId: id, meta: `${appt?.doctorName} on ${appt?.date} at ${appt?.time}` });
  };

  const confirmCancelAppt = () => {
    apiCancelAppointment(confirmCancel.apptId).then(() => setAppointments(prev => prev.map(a => a.id === confirmCancel.apptId ? { ...a, status: 'cancelled' } : a))).catch(e => alert(e.message));
    setConfirmCancel({ open: false, apptId: '', meta: '' });
  };

  const openBooking = (doctor?: Doctor) => {
    setPreselectedDoctor(doctor || null);
    setApptForm({ doctorId: doctor?.id || '', date: '', time: '' });
    setBookingFilters(defaultFilters);
    setBookingStep(doctor ? 'pick-time' : 'select-doctor');
    setShowAddAppt(true);
  };

  const requestConfirmAppointment = () => {
    const doctor = doctors.find(d => d.id === apptForm.doctorId);
    if (!doctor || !apptForm.date || !apptForm.time) return;
    setConfirmBook(true);
  };

  const confirmAppointment = () => {
    const doctor = doctors.find(d => d.id === apptForm.doctorId);
    if (!doctor) return;
    const problem_type_id = 1;
    createAppointment({patient_id:Number(user.patientId || myPatient.id), problem_type_id, appointment_type:'general', visit_date:apptForm.date, visit_time:apptForm.time, symptoms:'General appointment', doctor_id:Number(doctor.id)})
      .then(a=>setAppointments(prev=>[...prev,a])).catch(e=>alert(e.message));
    setConfirmBook(false);
    setShowAddAppt(false);
    setPreselectedDoctor(null);
  };

  const filteredDoctors = applyFilters(doctors, filters);
  const bookingDoctors = applyFilters(doctors.filter(d => d.status !== 'unavailable'), bookingFilters);
  const activeFilterCount = [
    filters.hospitals.length > 0,
    filters.specialties.length > 0,
    filters.availability !== 'all',
    filters.sort !== 'name-asc',
  ].filter(Boolean).length;

  // ── Find Doctors ──────────────────────────────────────────
  if (activeView === 'doctors') {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <PageHeader title="Find Doctors" subtitle="Search across all hospitals and specialties">
          <button onClick={() => openBooking()} className="flex items-center gap-2 bg-teal hover:bg-teal-light text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors" style={{ fontFamily: 'var(--font-display)' }}>
            <Plus size={15} /> Book Appointment
          </button>
        </PageHeader>

        {/* Search + filter bar */}
        <div className="bg-card border-b border-rule px-6 py-3 flex gap-3 items-center">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input
              type="text" placeholder="Search name, specialty, or hospital…"
              value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
              className="w-full bg-surface border border-rule rounded-xl pl-10 pr-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-teal transition-colors"
            />
          </div>
          <button
            onClick={() => setFilterPanelOpen(o => !o)}
            className={`flex items-center gap-2 border rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${filterPanelOpen || activeFilterCount > 0 ? 'bg-teal text-white border-teal' : 'bg-surface border-rule text-ink-muted hover:border-teal hover:text-teal'}`}
            style={{ fontFamily: 'var(--font-display)' }}
          >
            <SlidersHorizontal size={14} />
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-white text-teal text-xs font-bold w-4 h-4 rounded-full flex items-center justify-center">{activeFilterCount}</span>
            )}
          </button>
          <SortDropdown value={filters.sort} onChange={v => setFilters(f => ({ ...f, sort: v }))} />
        </div>

        {/* Filter panel */}
        {filterPanelOpen && (
          <div className="bg-card border-b border-rule px-6 py-4">
            <div className="flex gap-6 flex-wrap">
              <MultiSelect
                label="Hospital"
                icon={<Building2 size={13} />}
                options={Object.entries(HOSPITALS).map(([id, name]) => ({ value: id, label: name }))}
                selected={filters.hospitals}
                onChange={v => setFilters(f => ({ ...f, hospitals: v }))}
              />
              <MultiSelect
                label="Specialty"
                icon={<Stethoscope size={13} />}
                options={SPECIALTIES.map(s => ({ value: s, label: s }))}
                selected={filters.specialties}
                onChange={v => setFilters(f => ({ ...f, specialties: v }))}
              />
              <div>
                <div className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">Availability</div>
                <div className="flex gap-2">
                  {(['all', 'available', 'busy'] as const).map(opt => (
                    <button key={opt} onClick={() => setFilters(f => ({ ...f, availability: opt }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${filters.availability === opt ? 'bg-teal text-white' : 'bg-surface text-ink-muted hover:bg-rule'}`}
                      style={{ fontFamily: 'var(--font-display)' }}>
                      {opt === 'all' ? 'All' : opt}
                    </button>
                  ))}
                </div>
              </div>
              {activeFilterCount > 0 && (
                <button onClick={() => setFilters(defaultFilters)} className="self-end flex items-center gap-1.5 text-xs text-danger hover:underline ml-auto">
                  <X size={12} /> Clear all filters
                </button>
              )}
            </div>
          </div>
        )}

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {filteredDoctors.length === 0 ? (
            <div className="bg-card rounded-2xl border border-rule p-12 text-center">
              <Search size={36} className="text-ink-faint mx-auto mb-3" />
              <p className="font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>No doctors match</p>
              <p className="text-ink-muted text-sm mt-1">Try adjusting your filters or search query</p>
              <button onClick={() => setFilters(defaultFilters)} className="mt-4 text-teal text-sm font-medium hover:underline">Clear filters</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {filteredDoctors.map(doc => (
                <DoctorCard
                  key={doc.id}
                  doc={doc}
                  hospitalName={HOSPITALS[doctorHospitals[doc.id]] || 'Helix Hospital'}
                  onBook={() => openBooking(doc)}
                />
              ))}
            </div>
          )}
        </div>

        {showAddAppt && (
          <BookingModal
            doctors={doctors}
            bookingDoctors={bookingDoctors}
            bookingFilters={bookingFilters}
            setBookingFilters={setBookingFilters}
            bookingStep={bookingStep}
            setBookingStep={setBookingStep}
            apptForm={apptForm}
            setApptForm={setApptForm}
            preselectedDoctor={preselectedDoctor}
            myPatient={myPatient}
            onClose={() => { setShowAddAppt(false); setPreselectedDoctor(null); }}
            onConfirm={requestConfirmAppointment}
          />
        )}
        <SharedConfirms confirmCancel={confirmCancel} onCancelConfirm={() => setConfirmCancel({ open: false, apptId: '', meta: '' })} onConfirmCancel={confirmCancelAppt} confirmBook={confirmBook} apptForm={apptForm} doctors={doctors} onCancelBook={() => setConfirmBook(false)} onConfirmBook={confirmAppointment} />
      </div>
    );
  }

  // ── Appointments ─────────────────────────────────────────
  if (activeView === 'appointments') {
    const upcoming = appointments.filter(a => a.status === 'scheduled');
    const past = appointments.filter(a => a.status !== 'scheduled');
    return (
      <div className="flex-1 overflow-y-auto">
        <PageHeader title="My Appointments" subtitle="Manage your scheduled consultations">
          <button onClick={() => openBooking()} className="flex items-center gap-2 bg-teal hover:bg-teal-light text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors" style={{ fontFamily: 'var(--font-display)' }}>
            <Plus size={15} /> Book Appointment
          </button>
        </PageHeader>
        <div className="px-8 py-6 space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-ink mb-3" style={{ fontFamily: 'var(--font-display)' }}>Upcoming ({upcoming.length})</h3>
            {upcoming.length === 0 ? (
              <div className="bg-card rounded-2xl border border-rule p-8 text-center">
                <Calendar size={36} className="text-ink-faint mx-auto mb-3" />
                <p className="text-sm text-ink-muted">No upcoming appointments</p>
                <button onClick={() => openBooking()} className="mt-3 text-teal text-sm font-medium hover:underline" style={{ fontFamily: 'var(--font-display)' }}>Book one now →</button>
              </div>
            ) : (
              <div className="space-y-3">
                {upcoming.map(appt => <ApptCard key={appt.id} appt={appt} onCancel={cancelAppointment} />)}
              </div>
            )}
          </div>
          {past.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-ink mb-3" style={{ fontFamily: 'var(--font-display)' }}>Past & Cancelled ({past.length})</h3>
              <div className="space-y-3 opacity-60">
                {past.map(appt => <ApptCard key={appt.id} appt={appt} />)}
              </div>
            </div>
          )}
        </div>

        {showAddAppt && (
          <BookingModal
            doctors={doctors}
            bookingDoctors={bookingDoctors}
            bookingFilters={bookingFilters}
            setBookingFilters={setBookingFilters}
            bookingStep={bookingStep}
            setBookingStep={setBookingStep}
            apptForm={apptForm}
            setApptForm={setApptForm}
            preselectedDoctor={preselectedDoctor}
            myPatient={myPatient}
            onClose={() => { setShowAddAppt(false); setPreselectedDoctor(null); }}
            onConfirm={requestConfirmAppointment}
          />
        )}
        <SharedConfirms confirmCancel={confirmCancel} onCancelConfirm={() => setConfirmCancel({ open: false, apptId: '', meta: '' })} onConfirmCancel={confirmCancelAppt} confirmBook={confirmBook} apptForm={apptForm} doctors={doctors} onCancelBook={() => setConfirmBook(false)} onConfirmBook={confirmAppointment} />
      </div>
    );
  }

  // ── Chatbot ───────────────────────────────────────────────
  if (activeView === 'chatbot') {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <PageHeader title="MediAssist" subtitle="Your personal hospital AI assistant" />
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4">
          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-3 ${msg.from === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.from === 'bot' ? 'bg-teal-muted' : 'bg-navy'}`}>
                {msg.from === 'bot' ? <Bot size={16} className="text-teal" /> : <User size={16} className="text-white" />}
              </div>
              <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.from === 'bot' ? 'bg-card border border-rule text-ink rounded-tl-sm' : 'bg-navy text-white rounded-tr-sm'}`}>
                {msg.text}
                <div className={`text-xs mt-1.5 ${msg.from === 'bot' ? 'text-ink-faint' : 'text-white/50'}`}>
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}
          {isBotTyping && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-teal-muted flex items-center justify-center shrink-0"><Bot size={16} className="text-teal" /></div>
              <div className="bg-card border border-rule rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-ink-faint rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-ink-faint rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-ink-faint rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
        <div className="bg-card border-t border-rule px-8 py-4">
          <div className="flex gap-2 mb-3 flex-wrap">
            {['Find a specialist', 'Book appointment', 'Doctor availability', 'Waiting times', 'Emergency'].map(q => (
              <button key={q} onClick={() => setChatInput(q)} className="text-xs text-teal bg-teal-muted hover:bg-teal hover:text-white px-3 py-1.5 rounded-full transition-all whitespace-nowrap font-medium" style={{ fontFamily: 'var(--font-display)' }}>
                {q}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <label className="w-11 h-11 border border-rule bg-surface hover:bg-teal-muted text-teal rounded-xl flex items-center justify-center cursor-pointer" title="Explain prescription">
              <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" disabled={documentBusy} onChange={e => { const f=e.target.files?.[0]; if(f) void handlePrescriptionUpload(f); e.currentTarget.value=''; }} />
              {documentBusy ? <Clock size={16} className="animate-spin" /> : <Plus size={16} />}
            </label>
            <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()}
              placeholder="Type your question…"
              className="flex-1 bg-surface border border-rule rounded-xl px-4 py-3 text-sm text-ink placeholder:text-ink-faint focus:border-teal transition-colors"
            />
            <button onClick={sendMessage} disabled={!chatInput.trim() || isBotTyping}
              className="w-11 h-11 bg-teal hover:bg-teal-light disabled:opacity-40 text-white rounded-xl flex items-center justify-center transition-all">
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Dashboard (default) ───────────────────────────────────
  const upcomingAppts = appointments.filter(a => a.status === 'scheduled');
  const availDoctors = doctors.filter(d => d.status === 'available');

  return (
    <div className="flex-1 overflow-y-auto">
      <PageHeader title="My Dashboard" subtitle={`Welcome back, ${myPatient.name}`} />
      <div className="px-8 py-6 space-y-6">
        {/* Patient card */}
        <div className="bg-card rounded-2xl border border-rule p-6 flex items-start gap-5">
          <div className="w-14 h-14 bg-teal-muted rounded-2xl flex items-center justify-center text-teal font-bold text-2xl shrink-0" style={{ fontFamily: 'var(--font-display)' }}>
            {myPatient.name[0]}
          </div>
          <div className="flex-1 flex-wrap">
            <div className="font-bold text-ink text-lg" style={{ fontFamily: 'var(--font-display)' }}>{myPatient.name}</div>
            <div className="flex flex-wrap gap-5 mt-2">
              {[
                { label: 'Age', value: myPatient.age },
                { label: 'Gender', value: myPatient.gender.charAt(0).toUpperCase() + myPatient.gender.slice(1) },
                { label: 'Blood Type', value: myPatient.bloodType },
                { label: 'Phone', value: myPatient.phone },
              ].map(item => (
                <div key={item.label}>
                  <div className="text-xs text-ink-muted">{item.label}</div>
                  <div className="text-sm font-medium text-ink">{item.value}</div>
                </div>
              ))}
            </div>
            {myPatient.previousDoctorName && (
              <div className="mt-2 text-xs text-ink-muted">Previous doctor: <span className="text-teal font-medium">{myPatient.previousDoctorName}</span></div>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="Upcoming" value={upcomingAppts.length} sub="appointments" color="text-teal" bg="bg-teal-muted" />
          <StatCard label="Available" value={availDoctors.length} sub="doctors now" color="text-success" bg="bg-success-bg" />
          <StatCard label="Avg Wait" value={Math.round(doctors.reduce((s, d) => s + d.waitingCount, 0) / doctors.length)} sub="patients/doctor" color="text-warning" bg="bg-warning-bg" />
          <StatCard label="Specialists" value={doctors.length} sub="on roster" color="text-info" bg="bg-info-bg" />
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Upcoming appointments */}
          <div className="bg-card rounded-2xl border border-rule p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>Upcoming Appointments</h3>
              <button onClick={() => openBooking()} className="text-xs text-teal font-medium hover:underline" style={{ fontFamily: 'var(--font-display)' }}>+ Book</button>
            </div>
            {upcomingAppts.length === 0 ? (
              <p className="text-sm text-ink-muted text-center py-4">No upcoming appointments</p>
            ) : (
              <div className="space-y-3">
                {upcomingAppts.map(appt => <ApptCard key={appt.id} appt={appt} onCancel={cancelAppointment} compact />)}
              </div>
            )}
          </div>

          {/* Quick doctor availability */}
          <div className="bg-card rounded-2xl border border-rule p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>Doctors Available Now</h3>
              <span className="text-xs text-ink-faint">{availDoctors.length} of {doctors.length}</span>
            </div>
            <div className="space-y-3">
              {doctors.map(doc => (
                <div key={doc.id} className="flex items-center gap-3">
                  <StatusDot status={doc.status} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink truncate">{doc.name}</div>
                    <div className="text-xs text-ink-muted">{doc.specialty}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-ink-faint">{doc.waitingCount} waiting</div>
                    {doc.status === 'available' && (
                      <button onClick={() => openBooking(doc)} className="text-xs text-teal hover:underline font-medium" style={{ fontFamily: 'var(--font-display)' }}>Book →</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showAddAppt && (
        <BookingModal
          doctors={doctors}
          bookingDoctors={bookingDoctors}
          bookingFilters={bookingFilters}
          setBookingFilters={setBookingFilters}
          bookingStep={bookingStep}
          setBookingStep={setBookingStep}
          apptForm={apptForm}
          setApptForm={setApptForm}
          preselectedDoctor={preselectedDoctor}
          myPatient={myPatient}
          onClose={() => { setShowAddAppt(false); setPreselectedDoctor(null); }}
          onConfirm={requestConfirmAppointment}
        />
      )}
      <SharedConfirms confirmCancel={confirmCancel} onCancelConfirm={() => setConfirmCancel({ open: false, apptId: '', meta: '' })} onConfirmCancel={confirmCancelAppt} confirmBook={confirmBook} apptForm={apptForm} doctors={doctors} onCancelBook={() => setConfirmBook(false)} onConfirmBook={confirmAppointment} />
    </div>
  );
}

// ── SharedConfirms helper ─────────────────────────────────────

interface SharedConfirmsProps {
  confirmCancel: { open: boolean; apptId: string; meta: string };
  onCancelConfirm: () => void;
  onConfirmCancel: () => void;
  confirmBook: boolean;
  apptForm: { doctorId: string; date: string; time: string };
  doctors: Doctor[];
  onCancelBook: () => void;
  onConfirmBook: () => void;
}

function SharedConfirms({ confirmCancel, onCancelConfirm, onConfirmCancel, confirmBook, apptForm, doctors, onCancelBook, onConfirmBook }: SharedConfirmsProps) {
  const doc = doctors.find(d => d.id === apptForm.doctorId);
  return (
    <>
      <ConfirmDialog
        open={confirmCancel.open}
        variant="danger"
        title="Cancel Appointment"
        message={`Are you sure you want to cancel your appointment with ${confirmCancel.meta}? This action cannot be undone.`}
        confirmLabel="Yes, Cancel Appointment"
        cancelLabel="Keep Appointment"
        onConfirm={onConfirmCancel}
        onCancel={onCancelConfirm}
      />
      <ConfirmDialog
        open={confirmBook}
        variant="info"
        title="Confirm Booking"
        message={`Book a general appointment with ${doc?.name || 'the selected doctor'} on ${apptForm.date} at ${apptForm.time}? The doctor will be notified.`}
        confirmLabel="Yes, Book Appointment"
        cancelLabel="Go Back"
        onConfirm={onConfirmBook}
        onCancel={onCancelBook}
      />
    </>
  );
}

// ── BookingModal (2-step: filter + pick doctor → pick time) ──

interface BookingModalProps {
  doctors: Doctor[];
  bookingDoctors: Doctor[];
  bookingFilters: Filters;
  setBookingFilters: React.Dispatch<React.SetStateAction<Filters>>;
  bookingStep: 'select-doctor' | 'pick-time';
  setBookingStep: (s: 'select-doctor' | 'pick-time') => void;
  apptForm: { doctorId: string; date: string; time: string };
  setApptForm: React.Dispatch<React.SetStateAction<{ doctorId: string; date: string; time: string }>>;
  preselectedDoctor: Doctor | null;
  myPatient: typeof mockPatients[0];
  onClose: () => void;
  onConfirm: () => void;
}

function BookingModal({
  doctors, bookingDoctors, bookingFilters, setBookingFilters,
  bookingStep, setBookingStep, apptForm, setApptForm,
  preselectedDoctor, myPatient, onClose, onConfirm,
}: BookingModalProps) {
  const selectedDoc = doctors.find(d => d.id === apptForm.doctorId);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-2xl border border-rule shadow-2xl w-full max-w-lg flex flex-col" style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-rule shrink-0">
          <div>
            <h3 className="font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>
              {bookingStep === 'select-doctor' ? 'Choose a Doctor' : 'Confirm Appointment'}
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${bookingStep === 'select-doctor' ? 'bg-teal text-white' : 'bg-success-bg text-success'}`}>
                1. Select Doctor
              </span>
              <span className="text-ink-faint text-xs">→</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${bookingStep === 'pick-time' ? 'bg-teal text-white' : 'bg-surface text-ink-muted'}`}>
                2. Pick Time
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface transition-colors"><X size={16} className="text-ink-muted" /></button>
        </div>

        {/* Patient info strip */}
        <div className="px-6 py-3 bg-surface border-b border-rule flex items-center gap-3 shrink-0">
          <div className="w-7 h-7 bg-teal-muted rounded-full flex items-center justify-center text-teal font-bold text-xs">{myPatient.name[0]}</div>
          <div className="text-xs text-ink-muted">
            Booking for <span className="font-medium text-ink">{myPatient.name}</span> · Age {myPatient.age} · {myPatient.phone}
            {myPatient.previousDoctorName && <span className="ml-2 text-ink-faint">· Prev: {myPatient.previousDoctorName}</span>}
          </div>
        </div>

        {/* Step 1: Select Doctor */}
        {bookingStep === 'select-doctor' && (
          <>
            {/* Filter bar */}
            <div className="px-4 py-3 border-b border-rule space-y-3 shrink-0">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
                <input type="text" placeholder="Search name or specialty…"
                  value={bookingFilters.search} onChange={e => setBookingFilters(f => ({ ...f, search: e.target.value }))}
                  className="w-full bg-surface border border-rule rounded-xl pl-9 pr-4 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-teal transition-colors"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                <InlineMultiSelect
                  label="Hospital"
                  options={Object.entries(HOSPITALS).map(([id, name]) => ({ value: id, label: name.split(' ').slice(0, 2).join(' ') }))}
                  selected={bookingFilters.hospitals}
                  onChange={v => setBookingFilters(f => ({ ...f, hospitals: v }))}
                />
                <InlineMultiSelect
                  label="Specialty"
                  options={SPECIALTIES.map(s => ({ value: s, label: s }))}
                  selected={bookingFilters.specialties}
                  onChange={v => setBookingFilters(f => ({ ...f, specialties: v }))}
                />
                <SortDropdown value={bookingFilters.sort} onChange={v => setBookingFilters(f => ({ ...f, sort: v }))} small />
                {(bookingFilters.hospitals.length > 0 || bookingFilters.specialties.length > 0 || bookingFilters.sort !== 'name-asc') && (
                  <button onClick={() => setBookingFilters(defaultFilters)} className="text-xs text-danger hover:underline flex items-center gap-1">
                    <X size={11} /> Clear
                  </button>
                )}
              </div>
            </div>

            {/* Doctor list */}
            <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
              {bookingDoctors.length === 0 && (
                <div className="text-center py-8 text-ink-muted text-sm">No doctors match your filters</div>
              )}
              {bookingDoctors.map(doc => {
                const isSelected = apptForm.doctorId === doc.id;
                return (
                  <button key={doc.id} onClick={() => setApptForm(f => ({ ...f, doctorId: doc.id }))}
                    className={`w-full text-left rounded-xl border p-4 transition-all flex items-center gap-4 ${isSelected ? 'border-teal bg-teal-muted' : 'border-rule bg-surface hover:border-teal/50'}`}>
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-teal font-bold shrink-0 border border-rule" style={{ fontFamily: 'var(--font-display)' }}>
                      {doc.name.split(' ')[1]?.[0] || doc.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-ink text-sm truncate" style={{ fontFamily: 'var(--font-display)' }}>{doc.name}</div>
                      <div className="text-xs text-teal">{doc.specialty}</div>
                      <div className="text-xs text-ink-faint mt-0.5">{HOSPITALS[doctorHospitals[doc.id]] || 'Helix Hospital'}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <StatusBadge status={doc.status} />
                      <div className="text-xs text-ink-faint mt-1">{doc.waitingCount} waiting</div>
                    </div>
                    {isSelected && <CheckCircle size={16} className="text-teal shrink-0" />}
                  </button>
                );
              })}
            </div>

            <div className="px-4 py-4 border-t border-rule flex gap-3 shrink-0">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-rule text-sm text-ink-muted hover:bg-surface transition-colors">Cancel</button>
              <button onClick={() => setBookingStep('pick-time')} disabled={!apptForm.doctorId}
                className="flex-1 py-2.5 rounded-xl bg-teal hover:bg-teal-light disabled:opacity-40 text-white text-sm font-medium transition-colors"
                style={{ fontFamily: 'var(--font-display)' }}>
                Next: Pick Time →
              </button>
            </div>
          </>
        )}

        {/* Step 2: Pick time */}
        {bookingStep === 'pick-time' && selectedDoc && (
          <>
            <div className="px-6 py-4 border-b border-rule bg-surface shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-card rounded-xl flex items-center justify-center text-teal font-bold border border-rule shrink-0" style={{ fontFamily: 'var(--font-display)' }}>
                  {selectedDoc.name.split(' ')[1]?.[0] || selectedDoc.name[0]}
                </div>
                <div>
                  <div className="font-semibold text-ink text-sm" style={{ fontFamily: 'var(--font-display)' }}>{selectedDoc.name}</div>
                  <div className="text-xs text-teal">{selectedDoc.specialty} · {HOSPITALS[doctorHospitals[selectedDoc.id]]}</div>
                </div>
                {!preselectedDoctor && (
                  <button onClick={() => setBookingStep('select-doctor')} className="ml-auto text-xs text-ink-muted hover:text-teal transition-colors">Change →</button>
                )}
              </div>
            </div>

            <div className="px-6 py-5 space-y-4 flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-ink-muted mb-1.5 uppercase tracking-wide">Date</label>
                  <input type="date" value={apptForm.date} onChange={e => setApptForm(f => ({ ...f, date: e.target.value }))} required
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full bg-surface border border-rule rounded-xl px-4 py-3 text-sm text-ink focus:border-teal transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-muted mb-1.5 uppercase tracking-wide">Time</label>
                  <input type="time" value={apptForm.time} onChange={e => setApptForm(f => ({ ...f, time: e.target.value }))} required
                    className="w-full bg-surface border border-rule rounded-xl px-4 py-3 text-sm text-ink focus:border-teal transition-colors"
                  />
                </div>
              </div>

              <div className="flex items-start gap-2 bg-info-bg rounded-xl px-3 py-2.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-info mt-0.5 shrink-0"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                <p className="text-xs text-ink-muted leading-relaxed">
                  Patients can only book <strong className="text-ink">general appointments</strong>. For emergencies, please visit the reception desk or call <strong className="text-ink">+1 (800) HLX-AMBU</strong>.
                </p>
              </div>

              <div className="bg-surface rounded-xl p-4 space-y-1.5">
                <div className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">Appointment Summary</div>
                <div className="flex justify-between text-sm">
                  <span className="text-ink-muted">Doctor</span>
                  <span className="text-ink font-medium">{selectedDoc.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-ink-muted">Hospital</span>
                  <span className="text-ink">{HOSPITALS[doctorHospitals[selectedDoc.id]]}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-ink-muted">Date & Time</span>
                  <span className="text-ink">{apptForm.date || '—'} {apptForm.time || ''}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-ink-muted">Type</span>
                  <span className="font-medium text-teal capitalize">General</span>
                </div>
                {selectedDoc.waitingCount > 0 && (
                  <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-rule">
                    <Clock size={12} className="text-warning" />
                    <span className="text-xs text-warning">{selectedDoc.waitingCount} patients ahead of you in queue</span>
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-rule flex gap-3 shrink-0">
              {!preselectedDoctor && (
                <button onClick={() => setBookingStep('select-doctor')} className="py-2.5 px-4 rounded-xl border border-rule text-sm text-ink-muted hover:bg-surface transition-colors">← Back</button>
              )}
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-rule text-sm text-ink-muted hover:bg-surface transition-colors">Cancel</button>
              <button onClick={onConfirm} disabled={!apptForm.date || !apptForm.time}
                className="flex-1 py-2.5 rounded-xl bg-teal hover:bg-teal-light disabled:opacity-40 text-white text-sm font-medium transition-colors"
                style={{ fontFamily: 'var(--font-display)' }}>
                Confirm Booking
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Shared sub-components ────────────────────────────────────

function DoctorCard({ doc, hospitalName, onBook }: { doc: Doctor; hospitalName: string; onBook: () => void }) {
  return (
    <div className="bg-card rounded-2xl border border-rule p-5 hover:border-teal/40 transition-all">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-teal-muted rounded-xl flex items-center justify-center text-teal font-bold text-lg shrink-0" style={{ fontFamily: 'var(--font-display)' }}>
          {doc.name.split(' ')[1]?.[0] || doc.name[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-ink text-sm" style={{ fontFamily: 'var(--font-display)' }}>{doc.name}</span>
            <StatusBadge status={doc.status} />
          </div>
          <div className="text-xs text-teal font-medium mt-0.5">{doc.specialty}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Building2 size={11} className="text-ink-faint" />
            <span className="text-xs text-ink-faint truncate">{hospitalName}</span>
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-4 pt-3 border-t border-rule">
        <div className="flex items-center gap-1.5">
          <Clock size={13} className="text-ink-faint" />
          <span className="text-xs text-ink-muted">{doc.waitingCount} in queue</span>
        </div>
        <div className="flex items-center gap-1.5">
          <User size={13} className="text-ink-faint" />
          <span className="text-xs text-ink-muted">{doc.patientsToday} seen today</span>
        </div>
        {doc.status !== 'unavailable' && (
          <button onClick={onBook} className="ml-auto text-xs bg-teal-muted hover:bg-teal text-teal hover:text-white px-3 py-1.5 rounded-lg font-medium transition-all" style={{ fontFamily: 'var(--font-display)' }}>
            Book
          </button>
        )}
      </div>
    </div>
  );
}

function ApptCard({ appt, onCancel, compact }: { appt: Appointment; onCancel?: (id: string) => void; compact?: boolean }) {
  const isEmergency = appt.type === 'emergency';
  return (
    <div className={`rounded-xl border flex items-center gap-4 ${isEmergency ? 'border-danger/30' : 'border-rule'} ${compact ? 'bg-surface p-3' : 'bg-card p-5'}`}>
      <div className={`rounded-xl flex items-center justify-center shrink-0 ${isEmergency ? 'bg-danger-bg' : 'bg-teal-muted'} ${compact ? 'w-8 h-8' : 'w-10 h-10'}`}>
        <Calendar size={compact ? 14 : 18} className={isEmergency ? 'text-danger' : 'text-teal'} />
      </div>
      <div className="flex-1 min-w-0">
        <div className={`font-medium text-ink truncate ${compact ? 'text-xs' : 'text-sm'}`} style={{ fontFamily: 'var(--font-display)' }}>{appt.doctorName}</div>
        <div className="text-xs text-ink-muted mt-0.5">{appt.date} · {appt.time}</div>
        {isEmergency && <span className="text-xs text-danger bg-danger-bg px-2 py-0.5 rounded-full font-medium">EMERGENCY</span>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <StatusBadge status={appt.status} />
        {appt.status === 'scheduled' && onCancel && (
          <button onClick={() => onCancel(appt.id)} className="p-1.5 rounded-lg hover:bg-danger-bg transition-colors">
            <XCircle size={14} className="text-danger" />
          </button>
        )}
      </div>
    </div>
  );
}

function useOutsideClick(ref: React.RefObject<HTMLElement | null>, cb: () => void) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) cb();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, cb]);
}

function MultiSelect({ label, icon, options, selected, onChange }: {
  label: string; icon: React.ReactNode;
  options: { value: string; label: string }[];
  selected: string[]; onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useOutsideClick(ref, close);
  const toggle = (val: string) => onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  return (
    <div className="relative" ref={ref}>
      <div className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2 flex items-center gap-1">
        {icon} {label}
        {selected.length > 0 && <span className="bg-teal text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">{selected.length}</span>}
      </div>
      <button onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 border rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${selected.length > 0 ? 'border-teal text-teal bg-teal-muted' : 'border-rule text-ink-muted hover:border-teal bg-surface'}`}
        style={{ fontFamily: 'var(--font-display)' }}>
        {selected.length > 0 ? `${selected.length} selected` : `All ${label}s`}
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-card border border-rule rounded-xl shadow-xl z-20 py-1 min-w-48 max-h-52 overflow-y-auto">
          {options.map(opt => (
            <label key={opt.value} className="flex items-center gap-2.5 px-3 py-2 hover:bg-surface cursor-pointer">
              <div className={`w-4 h-4 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${selected.includes(opt.value) ? 'bg-teal border-teal' : 'border-rule'}`}>
                {selected.includes(opt.value) && <CheckCircle size={10} className="text-white" />}
              </div>
              <input type="checkbox" checked={selected.includes(opt.value)} onChange={() => toggle(opt.value)} className="sr-only" />
              <span className="text-xs text-ink truncate">{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function InlineMultiSelect({ label, options, selected, onChange }: {
  label: string; options: { value: string; label: string }[];
  selected: string[]; onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useOutsideClick(ref, close);
  const toggle = (val: string) => onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 border rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${selected.length > 0 ? 'border-teal text-teal bg-teal-muted' : 'border-rule text-ink-muted hover:border-teal bg-surface'}`}
        style={{ fontFamily: 'var(--font-display)' }}>
        <Filter size={11} />
        {selected.length > 0 ? `${label}: ${selected.length}` : label}
        <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-card border border-rule rounded-xl shadow-xl z-20 py-1 min-w-44 max-h-48 overflow-y-auto">
          {options.map(opt => (
            <label key={opt.value} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-surface cursor-pointer">
              <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${selected.includes(opt.value) ? 'bg-teal border-teal' : 'border-rule'}`}>
                {selected.includes(opt.value) && <CheckCircle size={9} className="text-white" />}
              </div>
              <input type="checkbox" checked={selected.includes(opt.value)} onChange={() => toggle(opt.value)} className="sr-only" />
              <span className="text-xs text-ink truncate">{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function SortDropdown({ value, onChange, small }: { value: string; onChange: (v: string) => void; small?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useOutsideClick(ref, close);
  const current = SORT_OPTIONS.find(o => o.id === value);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 border rounded-${small ? 'lg' : 'xl'} px-${small ? '3' : '4'} py-${small ? '1.5' : '2.5'} text-xs font-medium transition-all border-rule text-ink-muted hover:border-teal bg-surface`}
        style={{ fontFamily: 'var(--font-display)' }}>
        <ArrowUpDown size={12} />
        {small ? 'Sort' : current?.label || 'Sort'}
        <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 bg-card border border-rule rounded-xl shadow-xl z-20 py-1 min-w-40">
          {SORT_OPTIONS.map(opt => (
            <button key={opt.id} onClick={() => { onChange(opt.id); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-surface transition-colors flex items-center justify-between ${value === opt.id ? 'text-teal font-medium' : 'text-ink'}`}>
              {opt.label}
              {value === opt.id && <CheckCircle size={12} className="text-teal" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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

function StatCard({ label, value, sub, color, bg }: { label: string; value: number; sub: string; color: string; bg: string }) {
  return (
    <div className="bg-card rounded-2xl border border-rule p-5 text-center">
      <div className={`text-3xl font-bold mb-1 ${color}`} style={{ fontFamily: 'var(--font-display)' }}>{value}</div>
      <div className="text-xs font-semibold text-ink">{label}</div>
      <div className="text-xs text-ink-faint mt-0.5">{sub}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    available: 'text-success bg-success-bg',
    busy: 'text-warning bg-warning-bg',
    unavailable: 'text-danger bg-danger-bg',
    scheduled: 'text-teal bg-teal-muted',
    completed: 'text-success bg-success-bg',
    cancelled: 'text-ink-muted bg-surface',
  };
  return <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${map[status] || ''}`}>{status}</span>;
}

function StatusDot({ status }: { status: string }) {
  const map: Record<string, string> = { available: 'bg-success', busy: 'bg-warning', unavailable: 'bg-danger' };
  return <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${map[status] || 'bg-ink-faint'}`} />;
}
