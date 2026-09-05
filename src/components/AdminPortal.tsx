import React, { useState, useEffect } from 'react';
import { UserProfile, FoodRequest, FoodStats, FoodType, MealType } from '../types';
import { ExcelGridViewer } from './ExcelGridViewer';
import { UserManagement } from './UserManagement';
import { MongoConnectionCard } from './MongoConnectionCard';
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
} from 'lucide-react';

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

  // Admin Food Request Form state
  const [formDate, setFormDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [requesterName, setRequesterName] = useState(user.name);
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [aadharNumber, setAadharNumber] = useState('');
  const [vegNonVeg, setVegNonVeg] = useState<FoodType>('Veg');
  // Updated Meal Type: Breakfast, Lunch, Dinner, Snacks
  const [type, setType] = useState<MealType>('Lunch');
  const [submittingForm, setSubmittingForm] = useState(false);

  const fetchRequestsAndStats = async () => {
    setLoading(true);
    try {
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/50 backdrop-blur-2xl p-6 rounded-[2.5rem] border border-white/60 shadow-xl">
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

            <button
              type="button"
              id="admin-tab-mongodb"
              onClick={() => setActiveTab('mongodb')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold transition-all cursor-pointer ${
                activeTab === 'mongodb'
                  ? 'bg-emerald-700 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Database className="w-4 h-4 text-emerald-300" />
              <span>MongoDB URI</span>
            </button>
          </div>

          <button
            type="button"
            onClick={fetchRequestsAndStats}
            disabled={loading}
            className="p-2.5 rounded-xl border border-white/70 bg-white/60 hover:bg-white/90 text-slate-700 transition-all cursor-pointer backdrop-blur-md shadow-xs"
            title="Refresh database records"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

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

      {activeTab === 'mongodb' && (
        <MongoConnectionCard />
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

      {/* Cloud & Vercel deployment teaser footer with Frosted Glass styling */}
      <div className="p-5 rounded-[2.5rem] bg-gradient-to-r from-slate-900/85 via-indigo-950/85 to-slate-900/85 backdrop-blur-xl text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl border border-white/20">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/80 backdrop-blur-md flex items-center justify-center text-white shrink-0 shadow-md">
            <Cloud className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-sm">Need to deploy to Vercel with free MongoDB / Firebase?</h4>
            <p className="text-xs text-slate-300 mt-0.5">
              The project is pre-configured with `vercel.json` and serverless API endpoints.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenDeployGuide}
          className="px-4 py-2.5 bg-white/90 hover:bg-white text-slate-900 font-bold text-xs rounded-xl transition-all shrink-0 shadow-md cursor-pointer backdrop-blur-md"
        >
          View Free Deployment Guide →
        </button>
      </div>
    </div>
  );
};
