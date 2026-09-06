import React, { useState, useEffect } from 'react';
import { UserProfile, FoodRequest, FoodStats, FoodType, MealType } from '../types';
import { ExcelGridViewer } from './ExcelGridViewer';
import { UserManagement } from './UserManagement';
import {
  FileSpreadsheet,
  PlusCircle,
  BarChart3,
  RefreshCw,
  Utensils,
  CheckCircle2,
  AlertCircle,
  Send,
  Cloud,
  Users,
  Database,
  Coffee,
  Sun,
  Moon,
  Cookie,
  Bell,
  X,
} from 'lucide-react';
import { database } from '../firebase';
import { ref, onChildAdded, off } from 'firebase/database';

interface NotificationItem {
  id: string;
  createdAt: string;
  type: string;
  beneficiaryName: string;
  requesterName: string;
  requesterMobile?: string;
}

interface AdminPortalProps {
  user: UserProfile;
  onOpenDeployGuide: () => void;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({ user, onOpenDeployGuide }) => {
  const [activeTab, setActiveTab] = useState<'excel' | 'add-form' | 'users' | 'mongodb'>('excel');
  const [requests, setRequests] = useState<FoodRequest[]>([]);
  const [stats, setStats] = useState<FoodStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  // Initialize adminLastViewed on first mount if not present
  useEffect(() => {
    if (!localStorage.getItem('adminLastViewed')) {
      localStorage.setItem('adminLastViewed', new Date().toISOString());
    }
  }, []);

  // Admin Food Request Form state
  const [formDate, setFormDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [requesterName, setRequesterName] = useState(user.name);
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [aadharNumber, setAadharNumber] = useState('');
  const [vegNonVeg, setVegNonVeg] = useState<FoodType>('Veg');
  // Updated Meal Type: Breakfast, Lunch, Dinner, Snacks
  const [type, setType] = useState<MealType>('Lunch');
  const [submittingForm, setSubmittingForm] = useState(false);

  const fetchRequestsAndStats = async (artificialDelay = false) => {
    setLoading(true);
    try {
      if (artificialDelay) {
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
      // 1. Fetch all requests
      const res = await fetch(`/api/requests?role=admin`);
      const data = await res.json();
      if (data.success) {
        setRequests(data.requests);
      }

      // 2. Fetch stats
      const statsRes = await fetch(`/api/stats?role=admin`);
      const statsData = await statsRes.json();
      if (statsData.success) {
        setStats(statsData.stats);
      }
    } catch (e) {
      console.error('Error fetching admin data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequestsAndStats();
  }, []);

  // Real-time Firebase Listener for new requests
  useEffect(() => {
    if (!database) {
      console.warn('Firebase database not configured, real-time notifications disabled.');
      return;
    }

    const notificationsRef = ref(database, '/admin_notifications');
    
    const unsubscribe = onChildAdded(notificationsRef, (snapshot) => {
      const data = snapshot.val();
      console.log('Firebase new notification received:', data);
      if (data) {
        const lastViewed = localStorage.getItem('adminLastViewed') || new Date().toISOString();
        console.log('Comparing times - Request:', data.createdAt, 'LastViewed:', lastViewed);
        if (data.createdAt > lastViewed) {
          console.log('Request is newer! Incrementing badge.');
          setUnreadCount((prev) => prev + 1);
          setNotifications((prev) => [data, ...prev]);
          // Optional: only fetch the table if we are on the excel tab or just silently refresh
          fetchRequestsAndStats();
        } else {
          console.log('Request is older than last viewed time. Ignoring.');
        }
      }
    });

    return () => {
      off(notificationsRef, 'child_added', unsubscribe);
    };
  }, []);

  const markAsRead = () => {
    if (unreadCount === 0) {
      setActionMessage('No new notifications.');
      setTimeout(() => setActionMessage(null), 2000);
      return;
    }
    localStorage.setItem('adminLastViewed', new Date().toISOString());
    setUnreadCount(0);
    setNotifications([]);
    setShowDropdown(false);
    setActionMessage('Notifications marked as read.');
    setTimeout(() => setActionMessage(null), 2000);
  };

  const handleDeleteRequest = async (id: string) => {
    try {
      const res = await fetch(`/api/requests/${id}?role=admin`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage('Record deleted successfully.');
        setTimeout(() => setActionMessage(null), 3000);
        fetchRequestsAndStats();
      }
    } catch (e) {
      console.error('Failed to delete request:', e);
    }
  };

  const handleAdminFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!beneficiaryName.trim() || !aadharNumber.trim()) {
      alert('Please fill in Beneficiary Name and Aadhar Number.');
      return;
    }

    setSubmittingForm(true);
    try {
      const payload = {
        date: formDate,
        requesterName: requesterName.trim() || user.name,
        requesterCps: user.cpsNo,
        requesterMobile: user.mobileNo,
        name: beneficiaryName.trim(),
        aadharNumber: aadharNumber.trim(),
        vegNonVeg,
        type,
        createdByRole: 'admin',
      };

      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to add request.');
      }

      setActionMessage(`Food request for ${beneficiaryName} (${type}) registered successfully!`);
      setTimeout(() => setActionMessage(null), 3000);

      // Reset form
      setBeneficiaryName('');
      setAadharNumber('');

      // Refresh list & switch back to excel view
      await fetchRequestsAndStats();
      setActiveTab('excel');
    } catch (err: any) {
      alert(err.message || 'Error creating request.');
    } finally {
      setSubmittingForm(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Banner / Role Summary with Frosted Glass */}
      <div className="relative z-50 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/50 backdrop-blur-2xl p-6 rounded-[2.5rem] border border-white/60 shadow-xl">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-black text-slate-800 tracking-tight">
              Administrator Master Console
            </h1>
            <span className="bg-amber-500/15 text-amber-900 text-xs font-bold px-3 py-1 rounded-full border border-amber-500/30 uppercase tracking-wider">
              {user.cpsNo === '1234' ? 'Super Admin' : 'Admin'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1.5 font-medium">
            Logged in as <strong className="text-slate-800">{user.name}</strong> (CPS: {user.cpsNo}) • Mobile: {user.mobileNo}
          </p>
        </div>

        {/* Tab switcher buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex flex-wrap bg-white/50 backdrop-blur-md p-1.5 rounded-2xl border border-white/60 text-xs shadow-inner gap-1">
            <button
              type="button"
              id="admin-tab-excel"
              onClick={() => setActiveTab('excel')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold transition-all cursor-pointer ${
                activeTab === 'excel'
                  ? 'bg-slate-800 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Full Excel Sheet</span>
            </button>

            <button
              type="button"
              id="admin-tab-add"
              onClick={() => setActiveTab('add-form')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold transition-all cursor-pointer ${
                activeTab === 'add-form'
                  ? 'bg-slate-800 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <PlusCircle className="w-4 h-4 text-emerald-400" />
              <span>Add Request</span>
            </button>

            <button
              type="button"
              id="admin-tab-users"
              onClick={() => setActiveTab('users')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold transition-all cursor-pointer ${
                activeTab === 'users'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Users className="w-4 h-4 text-amber-300" />
              <span>Employees & Users</span>
            </button>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowDropdown(!showDropdown)}
              className={`relative p-2.5 rounded-xl border border-white/70 transition-all cursor-pointer backdrop-blur-md shadow-xs active:scale-95 ${
                unreadCount > 0 ? 'bg-indigo-100 hover:bg-indigo-200 text-indigo-700' : 'bg-white/60 hover:bg-white/90 text-slate-700'
              }`}
              title="Notifications"
            >
              <Bell className={`w-4 h-4 ${unreadCount > 0 ? 'animate-bounce' : ''}`} />
              {unreadCount > 0 && (
                <span className="absolute -top-2 -right-2 flex h-5 w-5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative flex rounded-full h-5 w-5 bg-rose-500 border-2 border-white text-[10px] font-bold text-white items-center justify-center">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                </span>
              )}
            </button>

            {/* Notifications Dropdown */}
            {showDropdown && (
              <div className="absolute right-0 mt-2 w-80 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50 animate-in slide-in-from-top-2 fade-in duration-200">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <Bell className="w-4 h-4 text-indigo-500" />
                    New Requests
                  </h3>
                  <button 
                    onClick={() => setShowDropdown(false)}
                    className="p-1 hover:bg-slate-200 rounded-full text-slate-500 transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-slate-500 text-sm">
                      <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                      You're all caught up!
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      {notifications.map((notif, idx) => (
                        <div key={idx} className="p-4 border-b border-slate-50 hover:bg-indigo-50/50 transition-colors">
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-semibold text-slate-800 text-sm">{notif.type} Request</span>
                            <span className="text-[10px] text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                              {new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 mt-1">
                            <span className="font-medium text-slate-800">{notif.requesterName}</span> requested for <span className="font-medium">{notif.beneficiaryName}</span>.
                          </p>
                          {notif.requesterMobile && notif.requesterMobile !== 'N/A' && (
                            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                              📞 {notif.requesterMobile}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                {notifications.length > 0 && (
                  <div className="p-3 bg-slate-50/80 border-t border-slate-100">
                    <button
                      onClick={markAsRead}
                      className="w-full py-2 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 rounded-xl text-sm font-semibold text-indigo-600 transition-all cursor-pointer"
                    >
                      Mark all as read
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => fetchRequestsAndStats(true)}
            disabled={loading}
            className="p-2.5 rounded-xl border border-white/70 bg-white/60 hover:bg-white/90 text-slate-700 transition-all cursor-pointer backdrop-blur-md shadow-xs active:scale-95"
            title="Refresh database records"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Notification Banner */}
      {unreadCount > 0 && (
        <div className="mb-4 p-4 rounded-2xl bg-indigo-500/15 backdrop-blur-md border border-indigo-500/30 text-indigo-900 text-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl animate-pulse">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-indigo-600 animate-bounce" />
            <span className="font-bold">
              You have {unreadCount} new food request(s) since your last check!
            </span>
          </div>
          <button
            onClick={markAsRead}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-md transition-colors cursor-pointer shrink-0"
          >
            Mark as Read
          </button>
        </div>
      )}

      {/* Action toast message */}
      {actionMessage && (
        <div className="p-4 rounded-2xl bg-emerald-500/15 backdrop-blur-md border border-emerald-500/30 text-emerald-900 text-xs flex items-center gap-2.5 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold">{actionMessage}</span>
        </div>
      )}

      {/* KPI Stats Bar with Frosted Glass Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div className="bg-white/60 backdrop-blur-xl p-4 rounded-[2rem] border border-white/60 shadow-lg hover:bg-white/80 transition-all flex flex-col justify-between">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Requests</div>
          <div className="text-2xl font-black text-slate-900 mt-2 font-mono">
            {stats ? stats.total : requests.length}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 font-medium">food_requests table</div>
        </div>

        <div className="bg-white/60 backdrop-blur-xl p-4 rounded-[2rem] border border-white/60 shadow-lg hover:bg-white/80 transition-all flex flex-col justify-between">
          <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1">
            <Coffee className="w-3.5 h-3.5" />
            <span>Breakfast</span>
          </div>
          <div className="text-2xl font-black text-amber-700 mt-2 font-mono">
            {stats ? stats.breakfastCount : requests.filter((r) => r.type === 'Breakfast').length}
          </div>
          <div className="text-[10px] text-amber-600 mt-1 font-medium">Morning meal</div>
        </div>

        <div className="bg-white/60 backdrop-blur-xl p-4 rounded-[2rem] border border-white/60 shadow-lg hover:bg-white/80 transition-all flex flex-col justify-between">
          <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1">
            <Sun className="w-3.5 h-3.5" />
            <span>Lunch</span>
          </div>
          <div className="text-2xl font-black text-emerald-700 mt-2 font-mono">
            {stats ? stats.lunchCount : requests.filter((r) => r.type === 'Lunch').length}
          </div>
          <div className="text-[10px] text-emerald-600 mt-1 font-medium">Afternoon meal</div>
        </div>

        <div className="bg-white/60 backdrop-blur-xl p-4 rounded-[2rem] border border-white/60 shadow-lg hover:bg-white/80 transition-all flex flex-col justify-between">
          <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 flex items-center gap-1">
            <Moon className="w-3.5 h-3.5" />
            <span>Dinner</span>
          </div>
          <div className="text-2xl font-black text-indigo-700 mt-2 font-mono">
            {stats ? stats.dinnerCount : requests.filter((r) => r.type === 'Dinner').length}
          </div>
          <div className="text-[10px] text-indigo-600 mt-1 font-medium">Evening meal</div>
        </div>

        <div className="bg-white/60 backdrop-blur-xl p-4 rounded-[2rem] border border-white/60 shadow-lg hover:bg-white/80 transition-all flex flex-col justify-between">
          <div className="text-[11px] font-bold uppercase tracking-wider text-purple-700 flex items-center gap-1">
            <Cookie className="w-3.5 h-3.5" />
            <span>Snacks</span>
          </div>
          <div className="text-2xl font-black text-purple-700 mt-2 font-mono">
            {stats ? stats.snacksCount : requests.filter((r) => r.type === 'Snacks').length}
          </div>
          <div className="text-[10px] text-purple-600 mt-1 font-medium">Refreshments</div>
        </div>

        <div className="bg-gradient-to-br from-indigo-600/90 to-purple-600/90 backdrop-blur-xl p-4 rounded-[2rem] border border-white/40 shadow-lg shadow-indigo-500/20 text-white flex flex-col justify-between">
          <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-100">Today's Orders</div>
          <div className="text-2xl font-black text-white mt-2 font-mono">
            {stats ? stats.todayCount : requests.filter((r) => r.date === new Date().toISOString().slice(0, 10)).length}
          </div>
          <div className="text-[10px] text-indigo-200 mt-1 font-medium">Active date</div>
        </div>
      </div>

      {/* Main View Area based on Active Tab */}
      {activeTab === 'excel' && (
        <ExcelGridViewer
          requests={requests}
          onDeleteRequest={handleDeleteRequest}
          onRefresh={fetchRequestsAndStats}
          isAdmin={true}
        />
      )}

      {activeTab === 'users' && (
        <UserManagement currentCps={user.cpsNo} />
      )}

      {activeTab === 'add-form' && (
        /* Admin Add Food Request Form matching Wireframe */
        <div className="max-w-2xl mx-auto bg-white/50 backdrop-blur-2xl rounded-[2.5rem] shadow-2xl border border-white/60 overflow-hidden">
          <div className="bg-white/40 backdrop-blur-xl p-6 text-center border-b border-white/40">
            <h2 className="text-xl font-black uppercase tracking-tight text-slate-800">
              Food Requester site (Admin Entry)
            </h2>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Submit food requests directly to the master Excel sheet (`food_requests` table)
            </p>
          </div>

          <form onSubmit={handleAdminFormSubmit} className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  * Date
                </label>
                <input
                  type="date"
                  required
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-white/70 bg-white/70 backdrop-blur-sm text-sm font-medium text-slate-800 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 shadow-xs transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  * Requester Name
                </label>
                <input
                  type="text"
                  required
                  value={requesterName}
                  onChange={(e) => setRequesterName(e.target.value)}
                  placeholder="Requester Name"
                  className="w-full px-4 py-2.5 rounded-xl border border-white/70 bg-white/70 backdrop-blur-sm text-sm font-medium text-slate-800 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 shadow-xs transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                * Name (Beneficiary)
              </label>
              <input
                type="text"
                required
                value={beneficiaryName}
                onChange={(e) => setBeneficiaryName(e.target.value)}
                placeholder="Enter Beneficiary Name"
                className="w-full px-4 py-2.5 rounded-xl border border-white/70 bg-white/70 backdrop-blur-sm text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 shadow-xs transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                * Aadhar First 4 Number
              </label>
              <input
                type="text"
                required
                maxLength={12}
                value={aadharNumber}
                onChange={(e) => setAadharNumber(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="e.g. 4821 or full Aadhar"
                className="w-full px-4 py-2.5 rounded-xl border border-white/70 bg-white/70 backdrop-blur-sm text-sm font-mono font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 shadow-xs transition-all"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  * Food Type
                </label>
                <select
                  value={vegNonVeg}
                  onChange={(e) => setVegNonVeg(e.target.value as FoodType)}
                  className="w-full px-4 py-2.5 rounded-xl border border-white/70 bg-white/70 backdrop-blur-sm text-sm font-bold text-slate-800 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 shadow-xs transition-all cursor-pointer"
                >
                  <option value="Veg">Veg (Vegetarian)</option>
                  <option value="Non-Veg">Non-Veg (Non-Vegetarian)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  * Type (Meal Time)
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as MealType)}
                  className="w-full px-4 py-2.5 rounded-xl border border-white/70 bg-white/70 backdrop-blur-sm text-sm font-bold text-slate-800 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 shadow-xs transition-all cursor-pointer"
                >
                  <option value="Breakfast">Breakfast</option>
                  <option value="Lunch">Lunch</option>
                  <option value="Dinner">Dinner</option>
                  <option value="Snacks">Snacks</option>
                </select>
              </div>
            </div>

            <div className="pt-4 flex items-center gap-3">
              <button
                type="submit"
                disabled={submittingForm}
                className="flex-1 py-3.5 px-4 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-sm uppercase tracking-wider rounded-2xl transition-all shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <Send className="w-4 h-4 text-white" />
                <span>{submittingForm ? 'Adding...' : 'SUBMIT REQUEST TO EXCEL SHEET'}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('excel')}
                className="px-5 py-3.5 rounded-2xl border border-white/70 bg-white/60 hover:bg-white/90 text-xs font-bold text-slate-700 transition-all cursor-pointer backdrop-blur-md"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
};
