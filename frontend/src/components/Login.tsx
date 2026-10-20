import { useState, useRef, useEffect } from 'react';
import {
  Shield, UserRound, Stethoscope, ClipboardList, ArrowLeft,
  Eye, EyeOff, CheckCircle, Building2, Phone, Mail,
  Bot, Send, X, Ambulance, Heart, HelpCircle,
  Activity, Users, BedDouble, Globe, ChevronRight,
} from 'lucide-react';
import type { Role, AuthUser } from '../types';
import { login as apiLogin, sendChat } from '../api';

interface Props {
  onLogin: (user: AuthUser) => void;
}

type Step = 'landing' | 'select' | 'login' | 'register' | 'otp' | 'profile';

// Mock hospital registry
const HOSPITALS: Record<string, string> = {
  'HLX-001': 'Helix Central Hospital',
  'HLX-002': 'Helix North Medical Center',
  'MCH-001': 'Springfield General Hospital',
  'MCH-002': 'Riverside Medical Center',
  'RVH-001': 'Riverside Valley Hospital',
  'LKW-001': 'Lakewood Health System',
};

const SPECIALTIES = [
  'Cardiology', 'Neurology', 'Pediatrics', 'Orthopedics',
  'Dermatology', 'Oncology', 'General Medicine', 'Surgery',
  'Psychiatry', 'Radiology', 'Anesthesiology', 'Emergency Medicine',
];

const roles = [
  { id: 'admin' as Role, label: 'Administrator', desc: 'Hospital admin & system management', icon: Shield, color: '#3B82F6', bg: '#EEF4FF' },
  { id: 'receptionist' as Role, label: 'Receptionist', desc: 'Patient & room management', icon: ClipboardList, color: '#06A4A8', bg: '#E0F5F5' },
  { id: 'doctor' as Role, label: 'Doctor', desc: 'Patient care & appointments', icon: Stethoscope, color: '#10B981', bg: '#D1FAE5' },
  { id: 'patient' as Role, label: 'Patient', desc: 'Book appointments & view records', icon: UserRound, color: '#F59E0B', bg: '#FEF3C7' },
];

interface ChatMsg { id: string; from: 'user' | 'bot'; text: string; }

function helixBotReply(input: string): string {
  const l = input.toLowerCase();
  if (l.includes('ambulance') || l.includes('emergency') || l.includes('urgent')) {
    return '🚑 Emergency Ambulance\n\nFor immediate ambulance dispatch:\n• Emergency: 911\n• Helix Ambulance Hotline: +1 (800) HLX-AMBU\n• WhatsApp: +1 (800) 459-2628\n\nStay on the line. Give your location clearly. Help is on the way.';
  }
  if (l.includes('book') || l.includes('appointment')) {
    return '📅 To book an appointment, log in as a Patient from the portal. You can browse available doctors, check waiting times, and select a time slot. Need help registering?';
  }
  if (l.includes('fever') || l.includes('temperature')) {
    return '🌡️ Fever Guide\n\nAdult: Temp ≥ 38°C (100.4°F) is a fever.\n• Drink plenty of fluids\n• Rest and monitor temperature\n• Take paracetamol if needed\n• Seek care if fever exceeds 39.5°C or lasts >3 days';
  }
  if (l.includes('chest') || l.includes('heart attack') || l.includes('pain')) {
    return '❤️ Chest Pain — Act Immediately\n\nCall 911 now if you have chest pain, pressure, or tightness. While waiting:\n• Sit or lie down\n• Loosen tight clothing\n• Chew aspirin if not allergic\n• Do NOT drive yourself to hospital';
  }
  if (l.includes('covid') || l.includes('corona')) {
    return '🦠 COVID-19 Guidance\n\nIf you have symptoms (fever, cough, loss of smell):\n• Isolate immediately\n• Test as soon as possible\n• Stay hydrated and rest\n• Contact your doctor if symptoms worsen\n• Wear a mask around others';
  }
  if (l.includes('blood pressure') || l.includes('hypertension') || l.includes('bp')) {
    return '💉 Blood Pressure Tips\n\nNormal BP: below 120/80 mmHg\nHigh (Hypertension): 130/80 or above\n\nTo manage:\n• Reduce salt intake\n• Exercise 30 min daily\n• Limit alcohol\n• Take prescribed medication consistently\n• Monitor BP at home';
  }
  if (l.includes('diabetes') || l.includes('sugar') || l.includes('insulin')) {
    return '🩸 Diabetes Guide\n\nNormal fasting blood sugar: 70–99 mg/dL\n\nManagement tips:\n• Follow a low-GI diet\n• Exercise regularly\n• Monitor blood glucose daily\n• Never skip meals\n• Take medications as prescribed';
  }
  if (l.includes('hospital') || l.includes('helix') || l.includes('about')) {
    return '🏥 About Helix HMS\n\nHelix is a Smart Hospital Management System serving multiple hospitals. Features include real-time room management, doctor scheduling, patient records, and AI-assisted care.\n\nContact us:\n📞 +1 (800) 4-HELIX\n📧 support@helixhms.com';
  }
  if (l.includes('register') || l.includes('sign up') || l.includes('account')) {
    return '✅ To register, click "Access Portal" on this page and choose your role (Admin, Doctor, Receptionist, or Patient). Each role has a tailored registration form. You\'ll need your Hospital ID issued by your hospital admin.';
  }
  if (l.includes('contact') || l.includes('phone') || l.includes('call')) {
    return '📞 Helix Support\n\n• 24/7 Helpline: +1 (800) 4-HELIX\n• Emergency: 911\n• Email: support@helixhms.com\n• Live Chat: helixhms.com/chat\n• Ambulance: +1 (800) HLX-AMBU';
  }
  if (l.match(/^(hi|hello|hey|good\s)/)) {
    return '👋 Hello! I\'m Helix AI, your smart health assistant.\n\nI can help you with:\n• 🚑 Emergency ambulance dispatch\n• 💊 Medical & health guidance\n• 📅 Appointment information\n• 🏥 Hospital portal navigation\n\nHow can I assist you today?';
  }
  return '🤖 I\'m Helix AI, here to help with health guidance and hospital navigation.\n\nTry asking about:\n• Ambulance booking\n• Symptoms & health tips\n• How to register or log in\n• Hospital contact info\n\nFor life-threatening emergencies, always call 911 first.';
}

export default function Login({ onLogin }: Props) {
  const [step, setStep] = useState<Step>('landing');
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [hospitalLookup, setHospitalLookup] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([
    { id: 'm0', from: 'bot', text: '👋 Hi! I\'m Helix AI. I can help with ambulance dispatch, health guidance, and portal navigation. How can I help?' },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [botTyping, setBotTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    username: '', password: '', phone: '', hospitalId: '', email: '',
    fullName: '', specialty: '', hospitalName: '', gender: 'male', age: '', address: '',
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMsgs, botTyping]);

  const setField = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const lookupHospital = (id: string) => {
    setField('hospitalId', id);
    setHospitalLookup(HOSPITALS[id.toUpperCase()] || '');
  };

  const sendChat = async () => {
    if (!chatInput.trim()) return;
    const userMsg: ChatMsg = { id: `m${Date.now()}`, from: 'user', text: chatInput };
    setChatMsgs(prev => [...prev, userMsg]); setChatInput(''); setBotTyping(true);
    try { const result = await sendChat(userMsg.text); setChatMsgs(prev => [...prev, { id: `m${Date.now()+1}`, from:'bot', text: result.reply }]); }
    catch (e:any) { setChatMsgs(prev => [...prev, { id:`m${Date.now()+1}`, from:'bot', text:`AI assistant error: ${e.message}` }]); }
    finally { setBotTyping(false); }
  };

  const handleOtpChange = (i: number, val: string) => {
    if (val.length > 1) return;
    const next = [...otp];
    next[i] = val;
    setOtp(next);
    if (val && i < 5) (document.getElementById(`otp-${i + 1}`) as HTMLInputElement)?.focus();
  };

  const finishLogin = () => {
    const resolvedHospital = HOSPITALS[form.hospitalId.toUpperCase()] || form.hospitalName || 'Helix Hospital';
    const nameMap: Record<Role, string> = {
      admin: form.username || 'Admin',
      receptionist: form.username || 'Receptionist',
      doctor: form.fullName ? (form.fullName.startsWith('Dr.') ? form.fullName : `Dr. ${form.fullName}`) : 'Dr. User',
      patient: form.fullName || form.username || 'Patient',
    };
    onLogin({
      role: selectedRole!,
      username: form.username,
      name: nameMap[selectedRole!],
      hospitalId: form.hospitalId.toUpperCase() || 'HLX-001',
      hospitalName: resolvedHospital,
    });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await apiLogin(form.username, form.password);
      localStorage.setItem('helix_token', result.access_token);
      const u:any = result.user;
      onLogin({ role:u.role, username:u.username, name:u.name, hospitalId:u.hospital_id, hospitalName:u.hospital_name, patientId:u.patient_id ? String(u.patient_id) : undefined, doctorId:u.doctor_id ? String(u.doctor_id) : undefined });
    } catch (err:any) { alert(err.message || 'Login failed'); }
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedRole === 'admin' || selectedRole === 'patient') {
      setStep('otp');
    } else if (selectedRole === 'doctor') {
      setStep('profile');
    } else {
      finishLogin();
    }
  };

  const roleInfo = roles.find(r => r.id === selectedRole);

  // OTP step
  if (step === 'otp') {
    return (
      <AuthShell onBack={() => setStep('login')} role={roleInfo}>
        <h2 className="text-2xl font-bold text-navy mb-1" style={{ fontFamily: 'var(--font-display)' }}>Verify Identity</h2>
        <p className="text-ink-muted text-sm mb-8">
          Enter the 6-digit OTP sent to {form.phone || 'your phone'}
        </p>
        <form onSubmit={(e) => { e.preventDefault(); selectedRole === 'doctor' ? setStep('profile') : finishLogin(); }} className="space-y-6">
          <div className="flex gap-2 justify-between">
            {otp.map((val, i) => (
              <input key={i} id={`otp-${i}`} type="text" inputMode="numeric" maxLength={1} value={val}
                onChange={e => handleOtpChange(i, e.target.value)}
                className="w-12 h-14 text-center text-xl font-bold bg-surface border-2 border-rule rounded-xl text-ink focus:border-teal transition-colors"
              />
            ))}
          </div>
          <p className="text-ink-faint text-xs text-center">
            Demo: any 6 digits work ·{' '}
            <button type="button" className="text-teal hover:underline" onClick={() => setOtp(['1','2','3','4','5','6'])}>Auto-fill</button>
          </p>
          <button type="submit" className="w-full bg-teal hover:bg-teal-light text-white font-semibold py-3 rounded-xl transition-colors" style={{ fontFamily: 'var(--font-display)' }}>
            Verify & Continue
          </button>
        </form>
      </AuthShell>
    );
  }

  // Doctor profile completion
  if (step === 'profile' && selectedRole === 'doctor') {
    return (
      <AuthShell onBack={() => setStep('register')} role={roleInfo}>
        <h2 className="text-2xl font-bold text-navy mb-1" style={{ fontFamily: 'var(--font-display)' }}>Doctor Profile</h2>
        <p className="text-ink-muted text-sm mb-6">Complete your professional details</p>
        <form onSubmit={(e) => { e.preventDefault(); finishLogin(); }} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5 uppercase tracking-wide">Full Name</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-teal font-semibold text-sm">Dr.</span>
              <input
                type="text" value={form.fullName} onChange={e => setField('fullName', e.target.value)}
                placeholder="Your full name" required
                className="w-full bg-surface border border-rule rounded-xl pl-12 pr-4 py-3 text-ink text-sm placeholder:text-ink-faint focus:border-teal transition-colors"
              />
            </div>
          </div>
          <FormField label="Email" type="email" value={form.email} onChange={v => setField('email', v)} placeholder="doctor@hospital.com" required />
          <FormField label="Phone Number" value={form.phone} onChange={v => setField('phone', v)} placeholder="+1 (555) 000-0000" required />
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5 uppercase tracking-wide">Specialty</label>
            <select value={form.specialty} onChange={e => setField('specialty', e.target.value)} required
              className="w-full bg-surface border border-rule rounded-xl px-4 py-3 text-ink text-sm focus:border-teal transition-colors">
              <option value="">Select specialty</option>
              {SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <HospitalIdField value={form.hospitalId} onChange={lookupHospital} resolvedName={hospitalLookup} required />
          <FormField label="Password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={v => setField('password', v)} placeholder="Create a password" required
            suffix={<button type="button" onClick={() => setShowPassword(s => !s)} className="text-ink-faint hover:text-ink transition-colors">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>}
          />
          <button type="submit" className="w-full bg-teal hover:bg-teal-light text-white font-semibold py-3 rounded-xl transition-colors" style={{ fontFamily: 'var(--font-display)' }}>
            Complete Registration
          </button>
        </form>
      </AuthShell>
    );
  }

  // Role selection
  if (step === 'select') {
    return (
      <div className="min-h-full bg-surface flex flex-col">
        <HelixHeader />
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
          <div className="max-w-2xl w-full">
            <button onClick={() => setStep('landing')} className="flex items-center gap-1.5 text-ink-muted hover:text-ink text-sm mb-8 transition-colors">
              <ArrowLeft size={14} /> Back to home
            </button>
            <h2 className="text-3xl font-bold text-navy mb-2" style={{ fontFamily: 'var(--font-display)' }}>Access Portal</h2>
            <p className="text-ink-muted mb-8">Select your role to sign in or register</p>
            <div className="grid grid-cols-2 gap-4">
              {roles.map(role => {
                const Icon = role.icon;
                return (
                  <button key={role.id} onClick={() => { setSelectedRole(role.id); setStep('login'); }}
                    className="group bg-card rounded-2xl p-6 border border-rule text-left hover:border-teal hover:shadow-lg transition-all duration-200 flex flex-col gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110" style={{ backgroundColor: role.bg }}>
                      <Icon size={22} style={{ color: role.color }} />
                    </div>
                    <div>
                      <div className="font-semibold text-ink text-sm mb-1" style={{ fontFamily: 'var(--font-display)' }}>{role.label}</div>
                      <div className="text-ink-faint text-xs leading-relaxed">{role.desc}</div>
                    </div>
                    <div className="text-teal text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">Sign in →</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <LandingChatbot open={chatOpen} setOpen={setChatOpen} msgs={chatMsgs} input={chatInput} setInput={setChatInput} onSend={sendChat} botTyping={botTyping} chatEndRef={chatEndRef} />
      </div>
    );
  }

  // Login / Register forms per role
  if (step === 'login' || step === 'register') {
    const isReg = step === 'register';
    return (
      <AuthShell onBack={() => setStep('select')} role={roleInfo}>
        <h2 className="text-2xl font-bold text-navy mb-1" style={{ fontFamily: 'var(--font-display)' }}>
          {isReg ? 'Create Account' : 'Sign In'}
        </h2>
        <p className="text-ink-muted text-sm mb-6">{isReg ? `Register as ${roleInfo?.label}` : `Welcome back, ${roleInfo?.label}`}</p>

        <form onSubmit={isReg ? handleRegister : handleLogin} className="space-y-4">
          {/* ADMIN */}
          {selectedRole === 'admin' && isReg && (
            <>
              <FormField label="Hospital Name" value={form.hospitalName} onChange={v => setField('hospitalName', v)} placeholder="Your hospital's full name" required />
              <HospitalIdField value={form.hospitalId} onChange={lookupHospital} resolvedName={hospitalLookup} required />
              <FormField label="Admin Username" value={form.username} onChange={v => setField('username', v)} placeholder="Choose a username" required />
              <FormField label="Email" type="email" value={form.email} onChange={v => setField('email', v)} placeholder="admin@hospital.com" required />
              <FormField label="Phone Number" value={form.phone} onChange={v => setField('phone', v)} placeholder="+1 (555) 000-0000" required />
              <FormField label="Password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={v => setField('password', v)} placeholder="Create a strong password" required
                suffix={<button type="button" onClick={() => setShowPassword(s => !s)} className="text-ink-faint hover:text-ink transition-colors">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>}
              />
              <OtpNotice phone={form.phone} />
            </>
          )}
          {selectedRole === 'admin' && !isReg && (
            <>
              <HospitalIdField value={form.hospitalId} onChange={lookupHospital} resolvedName={hospitalLookup} required />
              <FormField label="Admin Username" value={form.username} onChange={v => setField('username', v)} placeholder="Your username" required />
              <FormField label="Phone Number" value={form.phone} onChange={v => setField('phone', v)} placeholder="+1 (555) 000-0000" required />
              <FormField label="Password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={v => setField('password', v)} placeholder="Your password" required
                suffix={<button type="button" onClick={() => setShowPassword(s => !s)} className="text-ink-faint hover:text-ink transition-colors">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>}
              />
              <OtpNotice phone={form.phone} />
            </>
          )}

          {/* DOCTOR */}
          {selectedRole === 'doctor' && isReg && (
            <>
              <FormField label="Username" value={form.username} onChange={v => setField('username', v)} placeholder="Choose a username" required />
              <div>
                <label className="block text-xs font-medium text-ink-muted mb-1.5 uppercase tracking-wide">Full Name</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-teal font-semibold text-sm select-none">Dr.</span>
                  <input type="text" value={form.fullName} onChange={e => setField('fullName', e.target.value)} placeholder="Your full name" required
                    className="w-full bg-surface border border-rule rounded-xl pl-12 pr-4 py-3 text-ink text-sm placeholder:text-ink-faint focus:border-teal transition-colors" />
                </div>
              </div>
              <FormField label="Email" type="email" value={form.email} onChange={v => setField('email', v)} placeholder="doctor@hospital.com" required />
              <FormField label="Phone Number" value={form.phone} onChange={v => setField('phone', v)} placeholder="+1 (555) 000-0000" required />
              <div>
                <label className="block text-xs font-medium text-ink-muted mb-1.5 uppercase tracking-wide">Specialty</label>
                <select value={form.specialty} onChange={e => setField('specialty', e.target.value)} required
                  className="w-full bg-surface border border-rule rounded-xl px-4 py-3 text-ink text-sm focus:border-teal transition-colors">
                  <option value="">Select your specialty</option>
                  {SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <HospitalIdField value={form.hospitalId} onChange={lookupHospital} resolvedName={hospitalLookup} required />
              <FormField label="Password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={v => setField('password', v)} placeholder="Create a password" required
                suffix={<button type="button" onClick={() => setShowPassword(s => !s)} className="text-ink-faint hover:text-ink transition-colors">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>}
              />
            </>
          )}
          {selectedRole === 'doctor' && !isReg && (
            <>
              <FormField label="Username" value={form.username} onChange={v => setField('username', v)} placeholder="Your username" required />
              <FormField label="Password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={v => setField('password', v)} placeholder="Your password" required
                suffix={<button type="button" onClick={() => setShowPassword(s => !s)} className="text-ink-faint hover:text-ink transition-colors">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>}
              />
              <div>
                <label className="block text-xs font-medium text-ink-muted mb-1.5 uppercase tracking-wide">Specialty</label>
                <select value={form.specialty} onChange={e => setField('specialty', e.target.value)} required
                  className="w-full bg-surface border border-rule rounded-xl px-4 py-3 text-ink text-sm focus:border-teal transition-colors">
                  <option value="">Select your specialty</option>
                  {SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <HospitalIdField value={form.hospitalId} onChange={lookupHospital} resolvedName={hospitalLookup} required />
            </>
          )}

          {/* RECEPTIONIST */}
          {selectedRole === 'receptionist' && isReg && (
            <>
              <FormField label="Username" value={form.username} onChange={v => setField('username', v)} placeholder="Choose a username" required />
              <FormField label="Email" type="email" value={form.email} onChange={v => setField('email', v)} placeholder="reception@hospital.com" required />
              <FormField label="Phone Number" value={form.phone} onChange={v => setField('phone', v)} placeholder="+1 (555) 000-0000" required />
              <HospitalIdField value={form.hospitalId} onChange={lookupHospital} resolvedName={hospitalLookup} required />
              <FormField label="Password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={v => setField('password', v)} placeholder="Create a password" required
                suffix={<button type="button" onClick={() => setShowPassword(s => !s)} className="text-ink-faint hover:text-ink transition-colors">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>}
              />
            </>
          )}
          {selectedRole === 'receptionist' && !isReg && (
            <>
              <HospitalIdField value={form.hospitalId} onChange={lookupHospital} resolvedName={hospitalLookup} required />
              <FormField label="Username" value={form.username} onChange={v => setField('username', v)} placeholder="Your username" required />
              <FormField label="Password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={v => setField('password', v)} placeholder="Your password" required
                suffix={<button type="button" onClick={() => setShowPassword(s => !s)} className="text-ink-faint hover:text-ink transition-colors">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>}
              />
            </>
          )}

          {/* PATIENT */}
          {selectedRole === 'patient' && (
            <>
              <FormField label="Username" value={form.username} onChange={v => setField('username', v)} placeholder="Your username" required />
              <FormField label="Phone Number" value={form.phone} onChange={v => setField('phone', v)} placeholder="+1 (555) 000-0000" required />
              <FormField label="Password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={v => setField('password', v)} placeholder={isReg ? 'Create a password' : 'Your password'} required
                suffix={<button type="button" onClick={() => setShowPassword(s => !s)} className="text-ink-faint hover:text-ink transition-colors">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>}
              />
              {selectedRole === 'patient' && <OtpNotice phone={form.phone} />}
            </>
          )}

          <button type="submit" className="w-full bg-teal hover:bg-teal-light text-white font-semibold py-3 rounded-xl transition-colors" style={{ fontFamily: 'var(--font-display)' }}>
            {isReg
              ? (selectedRole === 'doctor' ? 'Next — Complete Profile' : 'Create Account')
              : (selectedRole === 'admin' || selectedRole === 'patient' ? 'Send OTP & Continue' : 'Sign In')}
          </button>
        </form>

        <div className="mt-5 text-center">
          <span className="text-ink-muted text-sm">{isReg ? 'Already have an account? ' : "Don't have an account? "}</span>
          <button onClick={() => setStep(isReg ? 'login' : 'register')} className="text-teal text-sm font-medium hover:underline">
            {isReg ? 'Sign In' : 'Register'}
          </button>
        </div>
        <div className="mt-4 pt-4 border-t border-rule text-center">
          <p className="text-xs text-ink-faint">Demo: any credentials work · Try Hospital ID: HLX-001</p>
        </div>
      </AuthShell>
    );
  }

  // Landing page
  return (
    <div className="min-h-full bg-navy flex flex-col overflow-y-auto">
      {/* Header */}
      <header className="px-8 py-4 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-teal rounded-xl flex items-center justify-center">
            <Activity size={18} className="text-white" />
          </div>
          <div>
            <div className="text-white font-bold text-base" style={{ fontFamily: 'var(--font-display)' }}>Helix HMS</div>
            <div className="text-white/40 text-xs">Smart Hospital Management</div>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <a href="tel:+18004435490" className="flex items-center gap-2 text-white/60 hover:text-white text-sm transition-colors">
            <Phone size={14} />
            +1 (800) 4-HELIX
          </a>
          <button
            onClick={() => setStep('select')}
            className="flex items-center gap-2 bg-teal hover:bg-teal-light text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Access Portal <ChevronRight size={14} />
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-20">
        <div className="inline-flex items-center gap-2 bg-teal/10 border border-teal/30 text-teal text-xs font-medium px-4 py-1.5 rounded-full mb-6">
          <Activity size={12} />
          Smart Hospital Management System
        </div>
        <h1 className="text-5xl md:text-6xl font-bold text-white leading-tight mb-5 max-w-3xl" style={{ fontFamily: 'var(--font-display)' }}>
          Helix — Where Care Meets{' '}
          <span className="text-teal">Intelligence</span>
        </h1>
        <p className="text-white/60 text-lg max-w-xl leading-relaxed mb-10">
          A unified platform for hospitals, doctors, staff, and patients. Real-time room management, smart scheduling, AI-assisted care — all in one place.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <button
            onClick={() => setStep('select')}
            className="flex items-center gap-2 bg-teal hover:bg-teal-light text-white font-semibold px-7 py-3.5 rounded-xl transition-colors text-base"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Get Started <ChevronRight size={16} />
          </button>
          <button
            onClick={() => setChatOpen(true)}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold px-7 py-3.5 rounded-xl transition-colors text-base border border-white/20"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            <Bot size={16} /> Talk to Helix AI
          </button>
        </div>
      </section>

      {/* Stats */}
      <section className="border-t border-white/10 px-8 py-8">
        <div className="max-w-4xl mx-auto grid grid-cols-2 gap-6 md:grid-cols-4">
          {[
            { icon: Building2, label: 'Hospitals', value: '120+' },
            { icon: Users, label: 'Doctors', value: '4,800+' },
            { icon: BedDouble, label: 'Beds Managed', value: '28,000+' },
            { icon: Heart, label: 'Patients Served', value: '1.2M+' },
          ].map(s => (
            <div key={s.label} className="text-center">
              <div className="w-10 h-10 bg-teal/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                <s.icon size={18} className="text-teal" />
              </div>
              <div className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>{s.value}</div>
              <div className="text-white/50 text-sm">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-white/10 px-8 py-12">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-white text-center mb-8" style={{ fontFamily: 'var(--font-display)' }}>
            Built for Every Role
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {roles.map(role => {
              const Icon = role.icon;
              return (
                <div key={role.id} className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:bg-white/8 transition-colors">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: role.bg + '22' }}>
                    <Icon size={18} style={{ color: role.color }} />
                  </div>
                  <div className="text-white font-semibold text-sm mb-1" style={{ fontFamily: 'var(--font-display)' }}>{role.label}</div>
                  <div className="text-white/40 text-xs leading-relaxed">{role.desc}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="border-t border-white/10 px-8 py-10">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-6">
          <div>
            <h3 className="text-white font-bold text-lg mb-1" style={{ fontFamily: 'var(--font-display)' }}>Need Help?</h3>
            <p className="text-white/50 text-sm">Our support team is available 24 / 7</p>
          </div>
          <div className="flex flex-wrap gap-4">
            {[
              { icon: Phone, label: '+1 (800) 4-HELIX', sub: '24/7 Helpline' },
              { icon: Ambulance, label: '+1 (800) HLX-AMBU', sub: 'Emergency' },
              { icon: Mail, label: 'support@helixhms.com', sub: 'Email Support' },
              { icon: Globe, label: 'helixhms.com', sub: 'Website' },
            ].map(c => (
              <div key={c.label} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                <c.icon size={16} className="text-teal shrink-0" />
                <div>
                  <div className="text-white text-sm font-medium">{c.label}</div>
                  <div className="text-white/40 text-xs">{c.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 px-8 py-4 text-center text-white/30 text-xs">
        © 2026 Helix HMS · Smart Hospital Management System · All rights reserved
      </footer>

      <LandingChatbot open={chatOpen} setOpen={setChatOpen} msgs={chatMsgs} input={chatInput} setInput={setChatInput} onSend={sendChat} botTyping={botTyping} chatEndRef={chatEndRef} />
    </div>
  );
}

// ---- Sub-components ----

function HospitalIdField({ value, onChange, resolvedName, required }: {
  value: string; onChange: (v: string) => void; resolvedName: string; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-muted mb-1.5 uppercase tracking-wide">Hospital ID</label>
      <div className="relative">
        <Building2 size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
        <input
          type="text" value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="e.g. HLX-001"
          required={required}
          className={`w-full bg-surface border rounded-xl pl-10 pr-4 py-3 text-ink text-sm placeholder:text-ink-faint focus:border-teal transition-colors ${resolvedName ? 'border-success' : 'border-rule'}`}
        />
        {resolvedName && <CheckCircle size={15} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-success" />}
      </div>
      {resolvedName && (
        <p className="text-success text-xs mt-1.5 flex items-center gap-1.5">
          <Building2 size={11} /> {resolvedName}
        </p>
      )}
      {value && !resolvedName && (
        <p className="text-ink-faint text-xs mt-1.5">Try: HLX-001, MCH-001, RVH-001 …</p>
      )}
    </div>
  );
}

function OtpNotice({ phone }: { phone: string }) {
  return (
    <div className="flex items-start gap-2 bg-info-bg rounded-xl p-3">
      <Phone size={14} className="text-info mt-0.5 shrink-0" />
      <p className="text-xs text-ink-muted">
        An OTP will be sent to <span className="font-medium text-ink">{phone || 'your phone number'}</span> for verification.
      </p>
    </div>
  );
}

function AuthShell({ children, onBack, role }: {
  children: React.ReactNode;
  onBack: () => void;
  role: typeof roles[0] | undefined;
}) {
  return (
    <div className="min-h-full bg-surface flex flex-col">
      <HelixHeader />
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="bg-card rounded-2xl border border-rule shadow-sm w-full max-w-md p-8">
          <button onClick={onBack} className="flex items-center gap-1.5 text-ink-muted hover:text-ink text-sm mb-6 transition-colors">
            <ArrowLeft size={14} /> Back
          </button>
          {role && (
            <div className="flex items-center gap-3 mb-6 pb-6 border-b border-rule">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: role.bg }}>
                <role.icon size={18} style={{ color: role.color }} />
              </div>
              <div>
                <div className="font-semibold text-ink text-sm" style={{ fontFamily: 'var(--font-display)' }}>{role.label}</div>
                <div className="text-ink-faint text-xs">{role.desc}</div>
              </div>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

function HelixHeader() {
  return (
    <div className="bg-navy px-8 py-4 flex items-center gap-3">
      <div className="w-8 h-8 bg-teal rounded-lg flex items-center justify-center">
        <Activity size={16} className="text-white" />
      </div>
      <div>
        <span className="text-white font-bold text-base" style={{ fontFamily: 'var(--font-display)' }}>Helix HMS</span>
        <span className="text-white/40 text-xs ml-2">Smart Hospital Management</span>
      </div>
    </div>
  );
}

function FormField({ label, value, onChange, placeholder, type = 'text', required, suffix }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; required?: boolean; suffix?: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-muted mb-1.5 uppercase tracking-wide">{label}</label>
      <div className="relative">
        <input
          type={type} value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} required={required}
          className="w-full bg-surface border border-rule rounded-xl px-4 py-3 text-ink text-sm placeholder:text-ink-faint focus:border-teal transition-colors pr-10"
        />
        {suffix && <div className="absolute right-3 top-1/2 -translate-y-1/2">{suffix}</div>}
      </div>
    </div>
  );
}

interface ChatbotProps {
  open: boolean; setOpen: (v: boolean) => void;
  msgs: ChatMsg[]; input: string; setInput: (v: string) => void;
  onSend: () => void; botTyping: boolean;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
}

function LandingChatbot({ open, setOpen, msgs, input, setInput, onSend, botTyping, chatEndRef }: ChatbotProps) {
  const quickReplies = ['🚑 Book ambulance', '💊 Health advice', '📅 Book appointment', '📞 Contact info'];

  return (
    <>
      {open && (
        <div className="fixed bottom-20 right-6 w-80 bg-card border border-rule rounded-2xl shadow-2xl flex flex-col overflow-hidden z-50" style={{ height: '440px' }}>
          <div className="bg-navy px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 bg-teal rounded-xl flex items-center justify-center shrink-0">
              <Bot size={16} className="text-white" />
            </div>
            <div className="flex-1">
              <div className="text-white text-sm font-semibold" style={{ fontFamily: 'var(--font-display)' }}>Helix AI</div>
              <div className="text-white/50 text-xs flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-success rounded-full inline-block" />
                Online · Ambulance & Health Guide
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/50 hover:text-white transition-colors">
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {msgs.map(msg => (
              <div key={msg.id} className={`flex gap-2 ${msg.from === 'user' ? 'flex-row-reverse' : ''}`}>
                {msg.from === 'bot' && (
                  <div className="w-6 h-6 bg-teal-muted rounded-full flex items-center justify-center shrink-0 mt-0.5">
                    <Bot size={12} className="text-teal" />
                  </div>
                )}
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed whitespace-pre-line ${
                  msg.from === 'bot' ? 'bg-surface text-ink rounded-tl-sm' : 'bg-navy text-white rounded-tr-sm'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {botTyping && (
              <div className="flex gap-2">
                <div className="w-6 h-6 bg-teal-muted rounded-full flex items-center justify-center shrink-0">
                  <Bot size={12} className="text-teal" />
                </div>
                <div className="bg-surface rounded-2xl rounded-tl-sm px-3 py-2 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-ink-faint rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-ink-faint rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-ink-faint rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="px-3 pb-1 flex gap-1.5 overflow-x-auto">
            {quickReplies.map(q => (
              <button key={q} onClick={() => { setInput(q.replace(/^[^\s]+\s/, '')); }}
                className="text-xs text-teal bg-teal-muted hover:bg-teal hover:text-white px-2.5 py-1 rounded-full whitespace-nowrap transition-all shrink-0 font-medium"
                style={{ fontFamily: 'var(--font-display)' }}>
                {q}
              </button>
            ))}
          </div>

          <div className="px-3 py-3 border-t border-rule flex gap-2">
            <input
              type="text" value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && onSend()}
              placeholder="Ask Helix AI..."
              className="flex-1 bg-surface border border-rule rounded-xl px-3 py-2 text-xs text-ink placeholder:text-ink-faint focus:border-teal transition-colors"
            />
            <button onClick={onSend} disabled={!input.trim() || botTyping}
              className="w-8 h-8 bg-teal hover:bg-teal-light disabled:opacity-40 text-white rounded-xl flex items-center justify-center transition-all shrink-0">
              <Send size={13} />
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-teal hover:bg-teal-light text-white rounded-2xl shadow-lg flex items-center justify-center transition-all hover:scale-105 z-50"
      >
        {open ? <X size={22} /> : <Bot size={22} />}
        {!open && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-danger rounded-full flex items-center justify-center">
            <HelpCircle size={10} className="text-white" />
          </span>
        )}
      </button>
    </>
  );
}
