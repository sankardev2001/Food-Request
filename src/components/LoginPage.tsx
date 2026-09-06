import React, { useState } from 'react';
import { UserProfile, UserRole } from '../types';
import { Shield, User, Lock, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';

interface LoginPageProps {
  onLoginSuccess: (user: UserProfile) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [mobileNo, setMobileNo] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!mobileNo.trim() || mobileNo.trim().length < 8) {
      setError('Please enter a valid Mobile Number (at least 8-10 digits).');
      return;
    }

    if (!password.trim()) {
      setError('Please enter your Password.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mobileNo: mobileNo.trim(),
          password: password.trim(),
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
      setMobileNo('9500466927');
      setPassword('1234');
    } else {
      setMobileNo('9500466927');
      setPassword('1234');
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
          {/* <div className="bg-white/60 backdrop-blur-xl text-emerald-800 text-xs font-bold px-4 py-1.5 rounded-t-2xl border-t border-x border-white/60 shadow-sm flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
            Sheet: Log in
          </div>
          <div className="text-[11px] text-slate-500 font-mono">
            data in - User site | data collect - admin site
          </div> */}
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
            {/* Form Fields */}
            <form onSubmit={handleSubmit} className="space-y-4">
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

              {/* Password */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Password <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="password"
                    id="login-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter Password"
                    className="w-full px-4 py-2.5 rounded-xl border border-white/70 bg-white/70 backdrop-blur-sm text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 shadow-xs transition-all"
                  />
                </div>
              </div>

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
                    <span>Login securely</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Demo Quick Fills for ease of testing */}

          </div>
        </div>
      </div>
    </div>
  );
};
