import { useState, useEffect } from 'react';
import { CheckCircle, Clock, Users, TrendingUp } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { AuthUser, DoctorStatus } from '../../types';
import { mockPatients, doctorPatientHistory } from '../../data/mockData';
import { getEmergencyAppointments, getGeneralAppointments, updateDoctorStatus, getDoctors, getPatients } from '../../api';

interface WaitingPatient {
  id: string;
  name: string;
  age: number;
  type: 'general' | 'emergency';
  waitSince: string;
}

const initialWaiting: WaitingPatient[] = [
  { id: 'p3', name: 'James Thompson', age: 67, type: 'emergency', waitSince: '09:00 AM' },
  { id: 'p1', name: 'Robert Williams', age: 45, type: 'general', waitSince: '08:45 AM' },
  { id: 'p5', name: 'Lena Davis', age: 54, type: 'general', waitSince: '09:15 AM' },
  { id: 'w1', name: 'Carlos Mendes', age: 38, type: 'general', waitSince: '09:30 AM' },
];

const statusConfig: Record<DoctorStatus, { label: string; color: string; bg: string; ring: string }> = {
  available: { label: 'Available', color: 'text-success', bg: 'bg-success-bg', ring: 'ring-success/30' },
  busy: { label: 'Busy', color: 'text-warning', bg: 'bg-warning-bg', ring: 'ring-warning/30' },
  unavailable: { label: 'Not Available', color: 'text-danger', bg: 'bg-danger-bg', ring: 'ring-danger/30' },
};

interface Props {
  user: AuthUser;
  activeView: string;
}

export default function DoctorDashboard({ user, activeView }: Props) {
  const [status, setStatus] = useState<DoctorStatus>('available');
  const [waiting, setWaiting] = useState<WaitingPatient[]>([]);
  useEffect(() => { Promise.all([getDoctors(),getEmergencyAppointments(),getGeneralAppointments()]).then(([ds,e,g]) => { const me=ds.find(d=>d.name===user.name || d.name.replace(/^Dr\. /,'')===user.name); if(me) setStatus(me.status); const mine=[...e,...g].filter(a=>a.doctorId===String(me?.id) && a.status==='scheduled'); setWaiting(mine.map(a=>({id:a.patientId,name:a.patientName,age:a.patientAge||0,type:a.type,waitSince:`${a.time}`}))); }).catch(console.error); }, [user.name]);
  const [donePatientsCount, setDonePatientsCount] = useState(3);
  const [historyData, setHistoryData] = useState(doctorPatientHistory);

  const markDone = (id: string) => {
    setWaiting(prev =>
      prev
        .filter(p => p.id !== id)
        .sort((a, b) => (a.type === b.type ? 0 : a.type === 'emergency' ? -1 : 1))
    );
    setDonePatientsCount(c => c + 1);
  };

  const cfg = statusConfig[status];

  if (activeView === 'waiting') {
    return (
      <div className="flex-1 overflow-y-auto">
        <PageHeader title="Waiting List" subtitle={`${waiting.length} patient${waiting.length !== 1 ? 's' : ''} waiting`} />
        <div className="px-8 py-6 space-y-3">
          {waiting.length === 0 && (
            <div className="bg-card rounded-2xl border border-rule p-12 text-center">
              <CheckCircle size={40} className="text-success mx-auto mb-3" />
              <p className="font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>All clear!</p>
              <p className="text-ink-muted text-sm mt-1">No patients in the waiting list</p>
            </div>
          )}
          {waiting.map((patient, idx) => (
            <div key={patient.id} className={`bg-card rounded-2xl border p-5 flex items-center gap-4 ${patient.type === 'emergency' ? 'border-danger/40' : 'border-rule'}`}>
              <div className="w-8 h-8 bg-surface rounded-full flex items-center justify-center text-ink-muted font-semibold text-sm shrink-0" style={{ fontFamily: 'var(--font-display)' }}>
                {idx + 1}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink text-sm" style={{ fontFamily: 'var(--font-display)' }}>{patient.name}</span>
                  {patient.type === 'emergency' && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full text-danger bg-danger-bg">EMERGENCY</span>
                  )}
                </div>
                <div className="text-xs text-ink-muted mt-0.5">Age {patient.age} · Waiting since {patient.waitSince}</div>
              </div>
              <button
                onClick={() => markDone(patient.id)}
                className="flex items-center gap-2 bg-success-bg hover:bg-success text-success hover:text-white text-xs font-medium px-3 py-2 rounded-xl transition-all"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                <CheckCircle size={14} />
                Done
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (activeView === 'analytics') {
    return (
      <div className="flex-1 overflow-y-auto">
        <PageHeader title="My Analytics" subtitle="Your patient care statistics this week" />
        <div className="px-8 py-6 space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Seen Today" value={donePatientsCount} icon={<CheckCircle size={20} className="text-success" />} bg="bg-success-bg" />
            <StatCard label="Waiting Now" value={waiting.length} icon={<Clock size={20} className="text-warning" />} bg="bg-warning-bg" />
            <StatCard label="This Week" value={historyData.reduce((a, b) => a + b.count, 0)} icon={<TrendingUp size={20} className="text-teal" />} bg="bg-teal-muted" />
          </div>

          <div className="bg-card rounded-2xl border border-rule p-6">
            <h3 className="font-semibold text-ink mb-5" style={{ fontFamily: 'var(--font-display)' }}>Patients Seen — This Week</h3>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={historyData}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }} />
                <Area type="monotone" dataKey="count" stroke="#10B981" strokeWidth={2.5} fill="url(#colorCount)" name="Patients" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card rounded-2xl border border-rule p-6">
            <h3 className="font-semibold text-ink mb-4" style={{ fontFamily: 'var(--font-display)' }}>Recent Patients</h3>
            <div className="space-y-3">
              {mockPatients.map(p => (
                <div key={p.id} className="flex items-center gap-3 p-3 bg-surface rounded-xl">
                  <div className="w-8 h-8 bg-teal-muted rounded-full flex items-center justify-center text-teal font-semibold text-sm shrink-0" style={{ fontFamily: 'var(--font-display)' }}>
                    {p.name[0]}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-ink">{p.name}</div>
                    <div className="text-xs text-ink-muted">{p.gender === 'male' ? 'Male' : p.gender === 'female' ? 'Female' : 'Other'} · Age {p.age} · {p.bloodType}</div>
                  </div>
                  <span className="text-xs text-success bg-success-bg px-2 py-1 rounded-full">Visited</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <PageHeader title="My Dashboard" subtitle={`Welcome back, ${user.name}`} />

      <div className="px-8 py-6 space-y-6">
        <div className="bg-card rounded-2xl border border-rule p-6">
          <h3 className="font-semibold text-ink mb-4" style={{ fontFamily: 'var(--font-display)' }}>Availability Status</h3>
          <div className="flex gap-3">
            {(Object.keys(statusConfig) as DoctorStatus[]).map(s => {
              const c = statusConfig[s];
              const isActive = status === s;
              return (
                <button
                  key={s}
                  onClick={() => { setStatus(s); getDoctors().then(ds=>{const me=ds.find(d=>d.name===user.name); if(me) updateDoctorStatus(me.id,s).catch(console.error);}); }}
                  className={`flex items-center gap-2 px-5 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                    isActive ? `${c.bg} ${c.color} border-current ring-2 ${c.ring}` : 'bg-surface text-ink-muted border-rule hover:border-ink-muted'
                  }`}
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${isActive ? (s === 'available' ? 'bg-success' : s === 'busy' ? 'bg-warning' : 'bg-danger') : 'bg-ink-faint'}`} />
                  {c.label}
                </button>
              );
            })}
          </div>
          {status === 'available' && (
            <p className="text-xs text-success mt-3 bg-success-bg rounded-lg px-3 py-2">
              ● You are visible to receptionists and patients. New appointments may be assigned.
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Seen Today" value={donePatientsCount} icon={<CheckCircle size={20} className="text-success" />} bg="bg-success-bg" />
          <StatCard label="Waiting Now" value={waiting.length} icon={<Users size={20} className="text-warning" />} bg="bg-warning-bg" />
          <StatCard label="This Week" value={historyData.reduce((a, b) => a + b.count, 0)} icon={<TrendingUp size={20} className="text-teal" />} bg="bg-teal-muted" />
        </div>

        <div className="bg-card rounded-2xl border border-rule p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>Next Up — Waiting List</h3>
            <span className="text-xs text-ink-muted bg-surface px-3 py-1 rounded-full">{waiting.length} patients</span>
          </div>
          {waiting.slice(0, 3).map((patient, idx) => (
            <div key={patient.id} className={`flex items-center gap-4 py-3 ${idx < 2 ? 'border-b border-rule' : ''}`}>
              <div className="w-7 h-7 bg-navy text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ fontFamily: 'var(--font-display)' }}>{idx + 1}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-ink">{patient.name}</span>
                  {patient.type === 'emergency' && <span className="text-xs text-danger bg-danger-bg px-1.5 py-0.5 rounded-full">EMRG</span>}
                </div>
                <span className="text-xs text-ink-muted">Waiting since {patient.waitSince}</span>
              </div>
              <button onClick={() => markDone(patient.id)} className="text-xs text-success bg-success-bg hover:bg-success hover:text-white px-3 py-1.5 rounded-lg transition-all font-medium" style={{ fontFamily: 'var(--font-display)' }}>Done</button>
            </div>
          ))}
          {waiting.length > 3 && (
            <p className="text-xs text-ink-muted text-center mt-3">+{waiting.length - 3} more in queue</p>
          )}
        </div>
      </div>
    </div>
  );
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="bg-card border-b border-rule px-8 py-5">
      <h1 className="text-xl font-bold text-ink" style={{ fontFamily: 'var(--font-display)' }}>{title}</h1>
      <p className="text-ink-muted text-sm mt-0.5">{subtitle}</p>
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
