import React from 'react';
import { UserProfile } from '../types';
import { Utensils, LogOut, Shield, User, Cloud, FileSpreadsheet } from 'lucide-react';

interface NavbarProps {
  user: UserProfile | null;
  onLogout: () => void;
  onOpenDeployGuide: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ user, onLogout, onOpenDeployGuide }) => {
  return (
    <header className="bg-white/40 backdrop-blur-xl border-b border-white/50 sticky top-0 z-30 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center text-white shadow-lg shadow-emerald-200/80">
              <Utensils className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight text-slate-800">
                  Food Requester Site
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
                  Portal
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                Meal requests, tracking & Excel master data collect
              </p>
            </div>
          </div>

          {/* User Info & Actions */}
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <div className="flex items-center gap-3 bg-white/60 backdrop-blur-md py-1.5 px-3.5 rounded-2xl border border-white/60 text-sm shadow-xs">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 border border-white flex items-center justify-center text-white font-semibold text-xs shadow-xs">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="text-left hidden md:block">
                    <div className="font-semibold text-slate-800 text-xs flex items-center gap-1.5">
                      <span>{user.name}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                          user.role === 'admin'
                            ? 'bg-amber-500/15 text-amber-800 border border-amber-500/30'
                            : 'bg-indigo-500/15 text-indigo-700 border border-indigo-500/30'
                        }`}
                      >
                        {user.role}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium">
                      CPS: <span className="font-mono font-semibold text-slate-700">{user.cpsNo}</span> | Mob: {user.mobileNo}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  id="btn-open-deploy-guide"
                  onClick={onOpenDeployGuide}
                  className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white/60 hover:bg-white/90 backdrop-blur-md border border-white/60 rounded-xl shadow-xs transition-all cursor-pointer"
                  title="Deployment instructions for Vercel and MongoDB/Firebase"
                >
                  <Cloud className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Deploy & DB Guide</span>
                </button>

                <button
                  type="button"
                  id="btn-logout"
                  onClick={onLogout}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-rose-700 bg-rose-500/10 hover:bg-rose-500/20 backdrop-blur-md border border-rose-200/70 rounded-xl transition-all cursor-pointer"
                  title="Sign out of session"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                id="btn-open-deploy-guide-loggedout"
                onClick={onOpenDeployGuide}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white/60 hover:bg-white/90 backdrop-blur-md border border-white/60 rounded-xl shadow-xs transition-all cursor-pointer"
              >
                <Cloud className="w-3.5 h-3.5 text-emerald-600" />
                <span>Vercel / DB Guide</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
