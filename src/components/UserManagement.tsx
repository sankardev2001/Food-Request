import React, { useState, useEffect } from 'react';
import { AppUser, UserRole } from '../types';
import { apiFetch } from '../apiFetch';
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
  KeyRound,
  Pencil,
} from 'lucide-react';

export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [team, setTeam] = useState('');
  const [mobileNo, setMobileNo] = useState('');
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [editName, setEditName] = useState('');
  const [editTeam, setEditTeam] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [password, setPassword] = useState('');
  const [userType, setUserType] = useState<UserRole>('employer');
  const [submitting, setSubmitting] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/users');
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

    if (!name.trim() || !mobileNo.trim() || !password.trim()) {
      setErrorMessage('Please fill in Name, Mobile Number, and Password.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          team: team.trim(),
          mobileNo: mobileNo.trim(),
          password: password.trim(),
          userType,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create user.');
      }

      setActionMessage(
        `Successfully added ${userType === 'admin' ? 'Admin' : 'Employee'} "${name}" (Mobile: ${mobileNo.trim()}).`
      );
      setName('');
      setTeam('');
      setMobileNo('');
      setPassword('');
      setUserType('employer');
      fetchUsers();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error adding user.';
      setErrorMessage(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (id: string, userName: string, isSuper: boolean) => {
    if (isSuper) {
      alert('Cannot delete the primary Super Admin (subash).');
      return;
    }

    if (!confirm(`Are you sure you want to remove ${userName} from the user table?`)) {
      return;
    }

    try {
      const res = await apiFetch(`/api/users/${id}`, { method: 'DELETE' });
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

  const openEditUser = (u: AppUser) => {
    setEditingUser(u);
    setEditName(u.name);
    setEditTeam(u.team || '');
    setEditMobile(u.mobileNo);
  };

  const handleSaveEditUser = async () => {
    if (!editingUser) return;
    try {
      const res = await apiFetch(`/api/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          team: editTeam.trim(),
          mobileNo: editMobile.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Update failed.');
      setActionMessage(`Updated user "${editName}".`);
      setEditingUser(null);
      fetchUsers();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Update failed.');
    }
  };

  const handleResetPassword = async (id: string, userName: string) => {
    const newPassword = window.prompt(`Enter new password for ${userName}:`);
    if (!newPassword || !newPassword.trim()) {
      return;
    }

    try {
      const res = await apiFetch(`/api/users/${id}/password`, {
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
      (u.team || '').toLowerCase().includes(q) ||
      u.mobileNo.includes(q) ||
      u.userType.toLowerCase().includes(q)
    );
  });

  const employeeCount = users.filter((u) => u.userType === 'employer').length;
  const adminCount = users.filter((u) => u.userType === 'admin').length;

  return (
    <div className="space-y-6">
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
        <div className="lg:col-span-5">
          <div className="bg-white/60 backdrop-blur-2xl rounded-[2.5rem] shadow-xl border border-white/60 overflow-hidden">
            <div className="bg-white/40 backdrop-blur-xl px-6 py-5 border-b border-white/40 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center text-white shadow-xs">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-800">Add New User</h3>
                  <p className="text-[11px] text-slate-500">Name, mobile, and password</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleAddUser} className="p-6 space-y-4">
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

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Team
                </label>
                <input
                  type="text"
                  value={team}
                  onChange={(e) => setTeam(e.target.value)}
                  placeholder="e.g. Operations"
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-white/70 bg-white/70 backdrop-blur-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 shadow-xs"
                />
              </div>

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

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  * Password
                </label>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Set initial password"
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-white/70 bg-white/70 backdrop-blur-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 shadow-xs"
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

        <div className="lg:col-span-7">
          <div className="bg-white/60 backdrop-blur-2xl rounded-[2.5rem] shadow-xl border border-white/60 overflow-hidden flex flex-col h-full">
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

            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-white/50 text-slate-600 font-bold uppercase tracking-wider border-b border-white/60">
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Team</th>
                    <th className="px-4 py-3">Mobile No</th>
                    <th className="px-4 py-3">User Type</th>
                    <th className="px-4 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/40">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                        No users found matching your search.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const isSuper = !!u.isSuperAdmin || u.id === 'usr-subash-superadmin';
                      return (
                        <tr key={u.id} className="hover:bg-white/70 transition-colors">
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            {u.name}
                            {isSuper && (
                              <span className="ml-1.5 text-[9px] bg-amber-500/20 text-amber-900 border border-amber-500/30 px-1.5 py-0.2 rounded font-sans">
                                Super
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-700">{u.team || '—'}</td>
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
                          <td className="px-4 py-3 text-center">
                            {isSuper ? (
                              <span className="text-[10px] text-slate-400 italic">Protected</span>
                            ) : (
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => openEditUser(u)}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-500/10 transition-colors cursor-pointer"
                                  title={`Edit ${u.name}`}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
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
                                  onClick={() => handleDeleteUser(u.id, u.name, isSuper)}
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
              <span>Users log in with Mobile Number and Password.</span>
              <span className="font-mono text-slate-600">Table: users</span>
            </div>
          </div>
        </div>
      </div>

      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl border border-white/80 p-6 w-full max-w-md space-y-4">
            <h4 className="font-bold text-slate-800">Edit user</h4>
            <div>
              <label className="text-xs font-bold uppercase text-slate-600">Full Name</label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl border text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-slate-600">Team</label>
              <input
                value={editTeam}
                onChange={(e) => setEditTeam(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl border text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-slate-600">Mobile</label>
              <input
                value={editMobile}
                onChange={(e) => setEditMobile(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl border text-sm font-mono"
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 text-xs font-bold rounded-xl border cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEditUser}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-500 text-white cursor-pointer"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
