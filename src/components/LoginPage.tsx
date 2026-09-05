import React, { useState } from 'react';
import { UserProfile, UserRole } from '../types';
import { Shield, User, Lock, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';

interface LoginPageProps {
  onLoginSuccess: (user: UserProfile) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [role, setRole] = useState<UserRole>('employer');
  const [name, setName] = useState('');
  const [cpsNo, setCpsNo] = useState('');
  const [mobileNo, setMobileNo] = useState('');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Please enter your full Name.');
      return;
    }
    if (!cpsNo.trim()) {
      setError('Please enter your CPS Number.');
      return;
    }
    if (!mobileNo.trim() || mobileNo.trim().length < 8) {
      setError('Please enter a valid Mobile Number (at least 8-10 digits).');
      return;
    }

    if (role === 'admin' && !passcode.trim()) {
      setError('Please enter Admin Passcode (Default: admin123).');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          cpsNo: cpsNo.trim().toUpperCase(),
          mobileNo: mobileNo.trim(),
          role,
          passcode: passcode.trim(),
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to authenticate.');
      }

      onLoginSuccess(data.user);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFill = (type: UserRole) => {
    setError(null);
    if (type === 'admin') {
      setRole('admin');
      setName('subash');
      setCpsNo('1234');
      setMobileNo('9500466927');
      setPasscode('admin123');
    } else {
      setRole('employer');
      setName('subash');
      setCpsNo('1234');
      setMobileNo('9500466927');
      setPasscode('');
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 py-8 relative overflow-hidden">
      {/* Decorative blurred frosted glass ambient background lights */}
      <div className="absolute -top-16 -left-16 w-80 h-80 bg-emerald-300/30 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -right-16 w-80 h-80 bg-indigo-300/30 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-sky-200/30 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Excel Tab Pill Visual */}
        <div className="flex items-center gap-1.5 mb-2 px-3">
          <div className="bg-white/60 backdrop-blur-xl text-emerald-800 text-xs font-bold px-4 py-1.5 rounded-t-2xl border-t border-x border-white/60 shadow-sm flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
            Sheet: Log in
          </div>
          <div className="text-[11px] text-slate-500 font-mono">
            data in - User site | data collect - admin site
          </div>
        </div>

        {/* Login Box - styled with Frosted Glass aesthetic */}
        <div className="bg-white/50 backdrop-blur-2xl rounded-[2.5rem] shadow-2xl border border-white/60 overflow-hidden">
          {/* Box Header */}
          <div className="bg-white/40 backdrop-blur-xl p-6 text-center border-b border-white/40 relative">
            <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-200/80 mx-auto mb-3">
              <Shield className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-800 uppercase">
              Food Requester Site
            </h1>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Employee Portal & Admin Master Console
            </p>
          </div>

          <div className="p-6">
            {/* Role Switcher */}
            <div className="mb-6">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                Select Login Type / Role
              </label>
              <div className="grid grid-cols-2 gap-2 p-1.5 bg-white/50 backdrop-blur-md rounded-2xl border border-white/60 shadow-inner">
                <button
                  type="button"
                  id="role-btn-employer"
                  onClick={() => {
                    setRole('employer');
                    setError(null);
                  }}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    role === 'employer'
                      ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  <User className="w-4 h-4" />
                  <span>Employer</span>
                </button>

                <button
                  type="button"
                  id="role-btn-admin"
                  onClick={() => {
                    setRole('admin');
                    setError(null);
                  }}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    role === 'admin'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  <span>Admin</span>
                </button>
              </div>

              <div className="mt-2 text-[11px] text-slate-600 flex items-center gap-1.5 px-1">
                {role === 'employer' ? (
                  <span className="text-emerald-700 font-semibold">
                    ✓ Employer access: Can submit Food Requests only (no Excel view/download).
                  </span>
                ) : (
                  <span className="text-indigo-700 font-semibold">
                    ★ Admin access: Can add requests, view master Excel sheet & download.
                  </span>
                )}
              </div>
            </div>

            {/* Error banner */}
            {error && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/10 backdrop-blur-md border border-rose-200 text-rose-700 text-xs flex items-start gap-2 shadow-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Form Fields matching Screenshot 2 */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name field */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Name <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    id="login-name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full px-4 py-2.5 rounded-xl border border-white/70 bg-white/70 backdrop-blur-sm text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 shadow-xs transition-all"
                  />
                </div>
              </div>

              {/* CPS No field */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  CPS No <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    id="login-cps"
                    required
                    value={cpsNo}
                    onChange={(e) => setCpsNo(e.target.value.toUpperCase())}
                    placeholder="e.g. CPS10992"
                    className="w-full px-4 py-2.5 rounded-xl border border-white/70 bg-white/70 backdrop-blur-sm text-sm font-medium font-mono uppercase text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 shadow-xs transition-all"
                  />
                </div>
              </div>

              {/* Mobile No field */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Mobile No <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    id="login-mobile"
                    required
                    value={mobileNo}
                    onChange={(e) => setMobileNo(e.target.value)}
                    placeholder="e.g. 9845012345"
                    className="w-full px-4 py-2.5 rounded-xl border border-white/70 bg-white/70 backdrop-blur-sm text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 shadow-xs transition-all"
                  />
                </div>
              </div>

              {/* Admin Passcode (only shown if admin role selected) */}
              {role === 'admin' && (
                <div className="p-3.5 rounded-2xl bg-amber-500/10 backdrop-blur-md border border-amber-500/25 space-y-1.5 shadow-xs">
                  <label className="block text-xs font-bold uppercase tracking-wider text-amber-900">
                    Admin Passcode <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      id="login-passcode"
                      value={passcode}
                      onChange={(e) => setPasscode(e.target.value)}
                      placeholder="Enter Admin Passcode"
                      className="w-full px-4 py-2 rounded-xl border border-white/80 bg-white/90 backdrop-blur-sm text-sm font-medium focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/15 text-slate-800 placeholder:text-slate-400 shadow-xs transition-all"
                    />
                  </div>
                  <p className="text-[11px] text-amber-900 font-medium">
                    Default demo passcode is: <span className="font-mono font-bold bg-amber-100 px-1.5 py-0.5 rounded">admin123</span>
                  </p>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                id="btn-login-submit"
                disabled={loading}
                className="w-full py-3.5 px-4 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-sm uppercase tracking-wider rounded-2xl transition-all shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 mt-3"
              >
                {loading ? (
                  <span>Logging in...</span>
                ) : (
                  <>
                    <span>Enter {role === 'admin' ? 'Admin Site' : 'Food Requester Form'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Demo Quick Fills for ease of testing */}
            <div className="mt-6 pt-4 border-t border-white/40">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider text-center mb-2.5">
                Seeded Super Admin Credentials
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  id="btn-quick-fill-admin"
                  onClick={() => handleQuickFill('admin')}
                  className="w-full py-2.5 px-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 backdrop-blur-md text-xs font-bold text-emerald-900 transition-all text-center cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
                >
                  <span>⚡ Fill Super Admin (subash • CPS: 1234 • 9500466927)</span>
                </button>
              </div>
              <p className="text-[10px] text-slate-500 text-center mt-2.5 leading-relaxed">
                Admins can create new employee accounts in the <strong>Employees & Users</strong> console.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
