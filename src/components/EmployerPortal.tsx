import React from 'react';
import { UserProfile } from '../types';
import { Lock } from 'lucide-react';
import { FoodRequestEntryPanel } from './FoodRequestEntryPanel';

interface EmployerPortalProps {
  user: UserProfile;
}

export const EmployerPortal: React.FC<EmployerPortalProps> = ({ user }) => {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between border-b border-white/50 pb-3 mb-6">
        <div className="flex items-center gap-2">
          <div className="bg-white/60 backdrop-blur-xl text-emerald-800 text-xs font-bold px-4 py-1.5 rounded-2xl border border-white/60 flex items-center gap-2 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Sheet: data in - User site
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-amber-800 bg-amber-500/10 border border-amber-500/25 px-3 py-1.5 rounded-xl">
          <Lock className="w-3.5 h-3.5" />
          Excel download: Admin only
        </div>
      </div>
      <FoodRequestEntryPanel user={user} entryContext="employer" />
    </div>
  );
};
