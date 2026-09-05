import React, { useState, useEffect } from 'react';
import { UserProfile } from './types';
import { Navbar } from './components/Navbar';
import { LoginPage } from './components/LoginPage';
import { EmployerPortal } from './components/EmployerPortal';
import { AdminPortal } from './components/AdminPortal';
import { DeployGuideModal } from './components/DeployGuideModal';

const USER_SESSION_KEY = 'food_requester_user_session';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem(USER_SESSION_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  const [isDeployGuideOpen, setIsDeployGuideOpen] = useState(false);

  const handleLoginSuccess = (newUser: UserProfile) => {
    setUser(newUser);
    try {
      localStorage.setItem(USER_SESSION_KEY, JSON.stringify(newUser));
    } catch (e) {
      console.warn('Failed to persist user in localStorage:', e);
    }
  };

  const handleLogout = () => {
    setUser(null);
    try {
      localStorage.removeItem(USER_SESSION_KEY);
    } catch (e) {
      console.warn('Failed to remove user from localStorage:', e);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#e0f2fe] via-[#f0fdf4] to-[#fdf4ff] flex flex-col font-sans text-slate-800 antialiased selection:bg-emerald-500 selection:text-white relative">
      {/* Top Navbar */}
      <Navbar
        user={user}
        onLogout={handleLogout}
        onOpenDeployGuide={() => setIsDeployGuideOpen(true)}
      />

      {/* Main Body */}
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

      {/* Deployment & Cloud Storage Guide Modal */}
      <DeployGuideModal
        isOpen={isDeployGuideOpen}
        onClose={() => setIsDeployGuideOpen(false)}
      />
    </div>
  );
}
