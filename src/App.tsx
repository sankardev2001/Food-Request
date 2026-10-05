import React, { useState, useEffect } from 'react';
import { UserProfile } from './types';
import { Navbar } from './components/Navbar';
import { LoginPage } from './components/LoginPage';
import { EmployerPortal } from './components/EmployerPortal';
import { AdminPortal } from './components/AdminPortal';
import { DeployGuideModal } from './components/DeployGuideModal';
import { apiFetch } from './apiFetch';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [isDeployGuideOpen, setIsDeployGuideOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/auth/me');
        const data = await res.json();
        if (!cancelled && res.ok && data.success && data.user) {
          setUser(data.user);
        }
      } catch {
        /* not logged in */
      } finally {
        if (!cancelled) setSessionLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLoginSuccess = (newUser: UserProfile) => {
    setUser(newUser);
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    setUser(null);
  };

  if (sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#e0f2fe] via-[#f0fdf4] to-[#fdf4ff] text-slate-600 text-sm">
        Loading session…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#e0f2fe] via-[#f0fdf4] to-[#fdf4ff] flex flex-col font-sans text-slate-800 antialiased selection:bg-emerald-500 selection:text-white relative">
      <Navbar
        user={user}
        onLogout={handleLogout}
        onOpenDeployGuide={() => setIsDeployGuideOpen(true)}
      />

      <main className="flex-1">
        {!user ? (
          <LoginPage onLoginSuccess={handleLoginSuccess} />
        ) : user.role === 'admin' ? (
          <AdminPortal
            user={user}
            onOpenDeployGuide={() => setIsDeployGuideOpen(true)}
          />
        ) : (
          <EmployerPortal user={user} />
        )}
      </main>

      <DeployGuideModal
        isOpen={isDeployGuideOpen}
        onClose={() => setIsDeployGuideOpen(false)}
      />
    </div>
  );
}
