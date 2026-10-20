import { useState } from 'react';
import type { AuthUser, Role } from './types';
import Login from './components/Login';
import Sidebar from './components/Sidebar';
import AdminDashboard from './components/admin/AdminDashboard';
import DoctorDashboard from './components/doctor/DoctorDashboard';
import ReceptionistDashboard from './components/receptionist/ReceptionistDashboard';
import PatientDashboard from './components/patient/PatientDashboard';

const defaultViews: Record<Role, string> = {
  admin: 'overview',
  receptionist: 'dashboard',
  doctor: 'dashboard',
  patient: 'dashboard',
};

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activeView, setActiveView] = useState('');

  const handleLogin = (authUser: AuthUser) => {
    setUser(authUser);
    setActiveView(defaultViews[authUser.role]);
  };

  const handleLogout = () => {
    localStorage.removeItem('helix_token');
    setUser(null);
    setActiveView('');
  };

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="h-full flex overflow-hidden">
      <Sidebar user={user} activeView={activeView} onNavigate={setActiveView} onLogout={handleLogout} />

      <main className="flex-1 flex flex-col overflow-hidden bg-surface">
        {user.role === 'admin' && <AdminDashboard user={user} activeView={activeView} />}
        {user.role === 'doctor' && <DoctorDashboard user={user} activeView={activeView} />}
        {user.role === 'receptionist' && <ReceptionistDashboard user={user} activeView={activeView} />}
        {user.role === 'patient' && <PatientDashboard user={user} activeView={activeView} />}
      </main>
    </div>
  );
}
