import React, { useState, useEffect } from 'react';
import { UserProfile, FoodRequest, FoodType, MealType } from '../types';
import { Utensils, CheckCircle, Clock, Lock, Send, ShieldAlert, Sparkles, RefreshCw, Coffee, Sun, Moon, Cookie } from 'lucide-react';

interface EmployerPortalProps {
  user: UserProfile;
}

export const EmployerPortal: React.FC<EmployerPortalProps> = ({ user }) => {
  // Form state
  const [name, setName] = useState(user.name || '');
  const [aadharNumber, setAadharNumber] = useState(user.aadharNumber || '');
  const [vegNonVeg, setVegNonVeg] = useState<FoodType>('Veg');
  const [type, setType] = useState<MealType>('Lunch');
  const [requestDate, setRequestDate] = useState<string>(new Date().toISOString().slice(0, 10));

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // My requests history (restricted to only current employer's CPS number)
  const [myRequests, setMyRequests] = useState<FoodRequest[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchMyRequests = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/requests?role=employer&cpsNo=${encodeURIComponent(user.cpsNo)}`);
      const data = await res.json();
      if (data.success) {
        setMyRequests(data.requests);
      }
    } catch (e) {
      console.error('Error fetching personal requests:', e);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchMyRequests();
  }, [user.cpsNo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!name.trim()) {
      setErrorMessage('Please enter beneficiary Name.');
      return;
    }
    if (!aadharNumber.trim() || aadharNumber.trim().length < 4) {
      setErrorMessage('Please enter at least the first 4 digits of Aadhar Number.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        date: requestDate,
        requesterName: user.name,
        requesterCps: user.cpsNo,
        requesterMobile: user.mobileNo,
        name: name.trim(),
        aadharNumber: aadharNumber.trim(),
        vegNonVeg,
        type,
        createdByRole: 'employer',
      };

      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit food request.');
      }

      setSuccessMessage(`Food request for ${name} (${vegNonVeg}, ${type}) submitted successfully!`);
      // Reset form beneficiary name and aadhar for next potential entry, or keep default
      // setAadharNumber(''); // removed because it's disabled now
      fetchMyRequests();
    } catch (err: any) {
      setErrorMessage(err.message || 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Tab Navigation header mimicking Excel tabs */}
      <div className="flex items-center justify-between border-b border-white/50 pb-3 mb-6">
        <div className="flex items-center gap-2">
          <div className="bg-white/60 backdrop-blur-xl text-emerald-800 text-xs font-bold px-4 py-1.5 rounded-2xl border border-white/60 flex items-center gap-2 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Sheet: data in - User site
          </div>
          <span className="text-xs text-slate-500 font-mono hidden sm:inline">
            (Employer Portal: Food Request Form)
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-amber-800 bg-amber-500/10 backdrop-blur-md border border-amber-500/25 px-3 py-1.5 rounded-xl shadow-xs font-medium">
          <Lock className="w-3.5 h-3.5 text-amber-600" />
          <span>Excel View & Download: Restricted to Admin</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Main Request Form matching Screenshot 3 */}
        <div className="lg:col-span-7">
          <div className="bg-white/50 backdrop-blur-2xl rounded-[2.5rem] shadow-xl border border-white/60 overflow-hidden">
            {/* Box Header matching wireframe */}
            <div className="bg-white/40 backdrop-blur-xl py-5 px-6 text-center border-b border-white/40">
              <h2 className="text-xl font-black uppercase tracking-tight text-slate-800">
                Food Requester site
              </h2>
              <p className="text-xs text-slate-500 mt-1 font-medium">
                Requester: <span className="font-bold text-slate-800">{user.name}</span> (CPS: {user.cpsNo})
              </p>
            </div>

            <div className="p-6">
              {/* Feedback banners */}
              {successMessage && (
                <div className="mb-5 p-4 rounded-2xl bg-emerald-500/10 backdrop-blur-md border border-emerald-500/25 text-emerald-800 text-xs flex items-start gap-2.5 shadow-xs animate-fadeIn">
                  <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Request Recorded</p>
                    <p>{successMessage}</p>
                  </div>
                </div>
              )}

              {errorMessage && (
                <div className="mb-5 p-4 rounded-2xl bg-rose-500/10 backdrop-blur-md border border-rose-500/25 text-rose-800 text-xs flex items-start gap-2.5 shadow-xs">
                  <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Submission Error</p>
                    <p>{errorMessage}</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Date selection (prefilled today) */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    * Date
                  </label>
                  <input
                    type="date"
                    id="employer-form-date"
                    required
                    disabled
                    value={requestDate}
                    onChange={(e) => setRequestDate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-white/70 bg-white/40 backdrop-blur-sm text-sm font-medium text-slate-500 shadow-xs transition-all cursor-not-allowed"
                  />
                </div>

                {/* Name field (* Name) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      * Name
                    </label>
                  </div>
                  <input
                    type="text"
                    id="employer-form-name"
                    required
                    disabled
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter Employee / Beneficiary Name"
                    className="w-full px-4 py-2.5 rounded-xl border border-white/70 bg-white/40 backdrop-blur-sm text-sm font-medium text-slate-500 placeholder:text-slate-400 shadow-xs transition-all cursor-not-allowed"
                  />
                </div>

                {/* Aadhar First 4 Number (* Aadhar First 4 Number) */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    * Aadhar First 4 Number
                  </label>
                  <input
                    type="text"
                    id="employer-form-aadhar"
                    required
                    disabled
                    maxLength={12}
                    value={aadharNumber}
                    onChange={(e) => setAadharNumber(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="e.g. 4821 (or full 12-digit Aadhar)"
                    className="w-full px-4 py-2.5 rounded-xl border border-white/70 bg-white/40 backdrop-blur-sm text-sm font-mono font-medium text-slate-500 placeholder:text-slate-400 shadow-xs transition-all cursor-not-allowed"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Auto-selected from your profile.
                  </span>
                </div>

                {/* Food Type dropdown (* Food Type: Select -> Veg / Non-Veg) */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    * Food Type
                  </label>
                  <select
                    id="employer-form-foodtype"
                    value={vegNonVeg}
                    onChange={(e) => setVegNonVeg(e.target.value as FoodType)}
                    className="w-full px-4 py-2.5 rounded-xl border border-white/70 bg-white/70 backdrop-blur-sm text-sm font-semibold text-slate-800 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 shadow-xs transition-all cursor-pointer"
                  >
                    <option value="Veg">Veg (Vegetarian Meal)</option>
                    <option value="Non-Veg">Non-Veg (Non-Vegetarian Meal)</option>
                  </select>
                </div>

                {/* Type dropdown (* Type: Select -> Breakfast / Lunch / Dinner / Snacks) */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    * Type (Meal Time)
                  </label>
                  <select
                    id="employer-form-type"
                    value={type}
                    onChange={(e) => setType(e.target.value as MealType)}
                    className="w-full px-4 py-2.5 rounded-xl border border-white/70 bg-white/70 backdrop-blur-sm text-sm font-semibold text-slate-800 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 shadow-xs transition-all cursor-pointer"
                  >
                    <option value="Breakfast">Breakfast</option>
                    <option value="Lunch">Lunch</option>
                    <option value="Dinner">Dinner</option>
                    <option value="Snacks">Snacks</option>
                  </select>
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Select meal category: Breakfast, Lunch, Dinner, or Snacks.
                  </span>
                </div>

                {/* SUBMIT Button matching Screenshot 3 */}
                <div className="pt-3">
                  <button
                    type="submit"
                    id="btn-employer-submit"
                    disabled={submitting}
                    className="w-full py-3.5 px-4 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-sm uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    {submitting ? (
                      <span>SUBMITTING...</span>
                    ) : (
                      <>
                        <Send className="w-4 h-4 text-white" />
                        <span>SUBMIT</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* Right Side: My Recent Submissions & Strict Permissions Notice */}
        <div className="lg:col-span-5 space-y-6">
          {/* Permission restriction notice */}
          <div className="p-5 rounded-[2rem] bg-white/50 backdrop-blur-xl border border-white/60 text-slate-700 text-xs shadow-lg space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
              <Lock className="w-4 h-4 text-amber-600" />
              <span>Role Access Restriction Policy</span>
            </div>
            <p className="leading-relaxed text-slate-600">
              As an <strong>Employer</strong> account, you have permission to submit food request forms. Access to view the master Excel database, compile attendee files, and download Excel reports is restricted exclusively to Admin staff.
            </p>
          </div>

          {/* My Submitted Requests History */}
          <div className="bg-white/60 backdrop-blur-xl rounded-[2rem] border border-white/60 shadow-lg overflow-hidden">
            <div className="p-4 bg-white/40 backdrop-blur-md border-b border-white/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-600" />
                <h3 className="font-bold text-sm text-slate-800">My Submitted Requests</h3>
              </div>
              <button
                type="button"
                onClick={fetchMyRequests}
                disabled={loadingHistory}
                className="text-xs text-slate-500 hover:text-slate-800 p-1.5 rounded-xl hover:bg-white/60 transition-colors cursor-pointer"
                title="Refresh personal history"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="p-4">
              {loadingHistory ? (
                <div className="py-8 text-center text-xs text-slate-400">Loading your submissions...</div>
              ) : myRequests.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  No requests submitted yet. Fill out the form to register a meal request.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                  {myRequests.map((req) => (
                    <div
                      key={req.id}
                      className="p-3.5 rounded-2xl border border-white/60 bg-white/50 hover:bg-white/80 backdrop-blur-sm transition-all text-xs shadow-xs"
                    >
                      <div className="flex items-center justify-between font-semibold text-slate-800 mb-1.5">
                        <span>{req.name}</span>
                        <span className="font-mono text-[11px] text-slate-500">{req.date}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-600 text-[11px]">
                        <span
                          className={`px-2 py-0.5 rounded-full font-bold ${
                            req.vegNonVeg === 'Veg'
                              ? 'bg-emerald-500/15 text-emerald-800 border border-emerald-500/25'
                              : 'bg-rose-500/15 text-rose-800 border border-rose-500/25'
                          }`}
                        >
                          {req.vegNonVeg}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full font-bold ${
                            req.type === 'Breakfast'
                              ? 'bg-amber-500/15 text-amber-900 border border-amber-500/25'
                              : req.type === 'Lunch'
                              ? 'bg-emerald-500/15 text-emerald-900 border border-emerald-500/25'
                              : req.type === 'Dinner'
                              ? 'bg-indigo-500/15 text-indigo-900 border border-indigo-500/25'
                              : 'bg-purple-500/15 text-purple-900 border border-purple-500/25'
                          }`}
                        >
                          {req.type}
                        </span>
                        <span className="text-slate-400 font-mono">
                          Aadhar: {req.aadharNumber}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
