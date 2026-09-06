import React, { useState, useEffect } from 'react';
import { AppUser, UserRole } from '../types';
import {
  Users,
  UserPlus,
  Trash2,
  Search,
  Shield,
  User,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Phone,
  CreditCard,
  Hash,
  KeyRound,
} from 'lucide-react';

interface UserManagementProps {
  currentCps: string;
}

export const UserManagement: React.FC<UserManagementProps> = ({ currentCps }) => {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // New User Form State
  const [name, setName] = useState('');
  const [cpsNo, setCpsNo] = useState('');
  const [mobileNo, setMobileNo] = useState('');
  const [password, setPassword] = useState('');
  const [userType, setUserType] = useState<UserRole>('employer');
  const [aadharNumber, setAadharNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      if (data.success) {
        setUsers(data.users);
      }
    } catch (e) {
      console.error('Failed to fetch users:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setActionMessage(null);

    if (!name.trim() || !cpsNo.trim() || !mobileNo.trim() || !password.trim() || !aadharNumber.trim()) {
      setErrorMessage('Please fill in all required fields (Name, CPS No, Mobile No, Password, Aadhar).');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          cpsNo: cpsNo.trim().toUpperCase(),
          mobileNo: mobileNo.trim(),
          password: password.trim(),
          userType,
          aadharNumber: aadharNumber.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create user.');
      }

      setActionMessage(
        `Successfully added ${userType === 'admin' ? 'Admin' : 'Employee'} "${name}" (CPS: ${cpsNo.toUpperCase()}) to the User Table!`
      );
      // Reset form
      setName('');
      setCpsNo('');
      setMobileNo('');
      setPassword('');
      setAadharNumber('');
      setUserType('employer');
      fetchUsers();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error adding user.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (id: string, userName: string, userCps: string) => {
    if (userCps === '1234') {
      alert('Cannot delete the primary Super Admin (subash - CPS: 1234).');
      return;
    }

    if (!confirm(`Are you sure you want to remove ${userName} (CPS: ${userCps}) from the user table?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setActionMessage(`User "${userName}" removed from user table.`);
        fetchUsers();
      } else {
        alert(data.error || 'Failed to delete user.');
      }
    } catch (e) {
      console.error('Delete error:', e);
    }
  };

  const handleResetPassword = async (id: string, userName: string) => {
    const newPassword = window.prompt(`Enter new password for ${userName}:`);
    if (!newPassword || !newPassword.trim()) {
      return;
    }

    try {
      const res = await fetch(`/api/users/${id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: newPassword.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage(`Password updated successfully for ${userName}.`);
        fetchUsers();
      } else {
        alert(data.error || 'Failed to update password.');
      }
    } catch (e) {
      console.error('Update password error:', e);
    }
  };

  const filteredUsers = users.filter((u) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      u.cpsNo.toLowerCase().includes(q) ||
      u.mobileNo.includes(q) ||
      u.aadharNumber.includes(q) ||
      u.userType.toLowerCase().includes(q)
    );
  });

  const employeeCount = users.filter((u) => u.userType === 'employer').length;
  const adminCount = users.filter((u) => u.userType === 'admin').length;

  return (
    <div className="space-y-6">
      {/* Top Banner & KPI Counts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white/60 backdrop-blur-xl p-5 rounded-[2rem] border border-white/60 shadow-lg flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Total Registered Users
            </span>
            <div className="text-3xl font-black text-slate-900 mt-1 font-mono">{users.length}</div>
            <p className="text-[10px] text-slate-400 mt-0.5">Stored in `users` table</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-slate-800 text-white flex items-center justify-center shadow-md">
            <Users className="w-6 h-6 text-emerald-400" />
          </div>
        </div>

        <div className="bg-white/60 backdrop-blur-xl p-5 rounded-[2rem] border border-white/60 shadow-lg flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
              Employees (Employers)
            </span>
            <div className="text-3xl font-black text-emerald-700 mt-1 font-mono">{employeeCount}</div>
            <p className="text-[10px] text-emerald-600 mt-0.5">Can submit food requests</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-md">
            <User className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white/60 backdrop-blur-xl p-5 rounded-[2rem] border border-white/60 shadow-lg flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">
              Administrators
            </span>
            <div className="text-3xl font-black text-indigo-700 mt-1 font-mono">{adminCount}</div>
            <p className="text-[10px] text-indigo-600 mt-0.5">Full console & Excel view</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
            <Shield className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Messages */}
      {actionMessage && (
        <div className="p-4 rounded-2xl bg-emerald-500/15 backdrop-blur-md border border-emerald-500/30 text-emerald-900 text-xs flex items-center gap-2.5 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold">{actionMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-2xl bg-rose-500/15 backdrop-blur-md border border-rose-500/30 text-rose-900 text-xs flex items-center gap-2.5 shadow-xs">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span className="font-semibold">{errorMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form: Add New Employee / Admin */}
        <div className="lg:col-span-5">
          <div className="bg-white/60 backdrop-blur-2xl rounded-[2.5rem] shadow-xl border border-white/60 overflow-hidden">
            <div className="bg-white/40 backdrop-blur-xl px-6 py-5 border-b border-white/40 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center text-white shadow-xs">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-800">Add New User</h3>
                  <p className="text-[11px] text-slate-500">Insert record into `users` table</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleAddUser} className="p-6 space-y-4">
              {/* User Type Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  * User Type (Role)
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-white/50 rounded-xl border border-white/60">
                  <button
                    type="button"
                    onClick={() => setUserType('employer')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      userType === 'employer'
                        ? 'bg-emerald-500 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <User className="w-3.5 h-3.5" />
                    <span>Employee (Employer)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setUserType('admin')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      userType === 'admin'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span>Admin</span>
                  </button>
                </div>
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  * Full Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-white/70 bg-white/70 backdrop-blur-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 shadow-xs"
                />
              </div>

              {/* CPS No */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  * CPS No
                </label>
                <input
                  type="text"
                  required
                  value={cpsNo}
                  onChange={(e) => setCpsNo(e.target.value.toUpperCase())}
                  placeholder="e.g. 1234 or CPS10992"
                  className="w-full px-3.5 py-2.5 text-xs font-mono uppercase rounded-xl border border-white/70 bg-white/70 backdrop-blur-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 shadow-xs"
                />
              </div>

              {/* Mobile Number */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  * Mobile Number
                </label>
                <input
                  type="tel"
                  required
                  value={mobileNo}
                  onChange={(e) => setMobileNo(e.target.value)}
                  placeholder="e.g. 9500466927"
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-white/70 bg-white/70 backdrop-blur-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 shadow-xs"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  * Password
                </label>
                <input
                  type="text"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Set initial password"
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-white/70 bg-white/70 backdrop-blur-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 shadow-xs"
                />
              </div>

              {/* Aadhar Number */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  * Aadhar Number (or First 4)
                </label>
                <input
                  type="text"
                  required
                  maxLength={12}
                  value={aadharNumber}
                  onChange={(e) => setAadharNumber(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="e.g. 4821 or 12-digit number"
                  className="w-full px-3.5 py-2.5 text-xs font-mono rounded-xl border border-white/70 bg-white/70 backdrop-blur-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 shadow-xs"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{submitting ? 'Saving to User Table...' : 'Save User to Database'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* List of Users in User Table */}
        <div className="lg:col-span-7">
          <div className="bg-white/60 backdrop-blur-2xl rounded-[2.5rem] shadow-xl border border-white/60 overflow-hidden flex flex-col h-full">
            {/* Header with Search and Refresh */}
            <div className="bg-white/40 backdrop-blur-xl px-6 py-4 border-b border-white/40 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-600" />
                <h3 className="font-bold text-sm text-slate-800">
                  User Table Directory ({filteredUsers.length})
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search users..."
                    className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-white/70 bg-white/70 backdrop-blur-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white shadow-xs"
                  />
                </div>

                <button
                  type="button"
                  onClick={fetchUsers}
                  disabled={loading}
                  className="p-2 rounded-xl border border-white/70 bg-white/60 hover:bg-white/90 text-slate-700 transition-all cursor-pointer shadow-xs"
                  title="Refresh users list"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Users Table */}
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-white/50 text-slate-600 font-bold uppercase tracking-wider border-b border-white/60">
                    <th className="px-4 py-3">CPS No</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Mobile No</th>
                    <th className="px-4 py-3">User Type</th>
                    <th className="px-4 py-3">Aadhar</th>
                    <th className="px-4 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/40">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                        No users found matching your search.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const isSuper = u.cpsNo === '1234' || u.isSuperAdmin;
                      return (
                        <tr key={u.id} className="hover:bg-white/70 transition-colors">
                          <td className="px-4 py-3 font-mono font-bold text-slate-800">
                            {u.cpsNo}
                            {isSuper && (
                              <span className="ml-1.5 text-[9px] bg-amber-500/20 text-amber-900 border border-amber-500/30 px-1.5 py-0.2 rounded font-sans">
                                Super
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-900">{u.name}</td>
                          <td className="px-4 py-3 font-mono text-slate-600">{u.mobileNo}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                u.userType === 'admin'
                                  ? 'bg-indigo-500/15 text-indigo-900 border border-indigo-500/25'
                                  : 'bg-emerald-500/15 text-emerald-900 border border-emerald-500/25'
                              }`}
                            >
                              {u.userType === 'admin' ? (
                                <Shield className="w-3 h-3" />
                              ) : (
                                <User className="w-3 h-3" />
                              )}
                              <span>{u.userType === 'admin' ? 'Admin' : 'Employer'}</span>
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-600">{u.aadharNumber}</td>
                          <td className="px-4 py-3 text-center">
                            {isSuper ? (
                              <span className="text-[10px] text-slate-400 italic">Protected</span>
                            ) : (
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleResetPassword(u.id, u.name)}
                                  className="p-1.5 rounded-lg text-indigo-500 hover:text-indigo-700 hover:bg-indigo-500/10 transition-colors cursor-pointer"
                                  title={`Change Password for ${u.name}`}
                                >
                                  <KeyRound className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUser(u.id, u.name, u.cpsNo)}
                                  className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                  title={`Delete ${u.name}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-white/40 px-6 py-3 border-t border-white/40 text-[11px] text-slate-500 flex items-center justify-between">
              <span>
                Employees added here can immediately log in on the Login Page using their CPS No & Mobile.
              </span>
              <span className="font-mono text-slate-600">Table: users</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
