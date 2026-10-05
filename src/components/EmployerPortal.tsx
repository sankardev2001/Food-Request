import React, { useState, useEffect } from 'react';
import { UserProfile, FoodRequest, FoodType, MealType, BeneficiaryRole } from '../types';
import { CheckCircle, Clock, Lock, Send, ShieldAlert, RefreshCw, Plus, Pencil, Save } from 'lucide-react';
import { apiFetch } from '../apiFetch';
import {
  EmployerFieldErrors,
  employerRowHasInput,
  getEmployerFieldErrors,
  isEmployerRowComplete,
} from '../foodRequestHelpers';

interface EmployerPortalProps {
  user: UserProfile;
}

type FormMode = 'bulk-add' | 'single-add' | 'edit';

interface BulkRow {
  key: string;
  name: string;
  aadharNumber: string;
  beneficiaryRole: BeneficiaryRole;
  vegNonVeg: FoodType;
  remarks: string;
}

function createEmptyBulkRow(): BulkRow {
  return {
    key: `bulk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    aadharNumber: '',
    beneficiaryRole: 'CPS',
    vegNonVeg: 'Veg',
    remarks: '',
  };
}

function roleSelectOptions() {
  return (
    <>
      <option value="CPS">CPS</option>
      <option value="Contractor">Contractor</option>
    </>
  );
}

function emptyBulkRows(): BulkRow[] {
  return [createEmptyBulkRow()];
}

function fieldInputClass(invalid?: boolean, large = false) {
  const size = large
    ? 'mt-1 w-full px-3 py-2 rounded-xl border bg-white/80'
    : 'w-full px-2 py-1.5 rounded-lg border bg-white/80';
  return `${size} ${invalid ? 'border-rose-500 ring-2 ring-rose-400/70' : 'border-white/70'}`;
}

function sanitizeAadharInput(value: string) {
  return value.replace(/\D/g, '').slice(0, 4);
}

export const EmployerPortal: React.FC<EmployerPortalProps> = ({ user }) => {
  const requestDate = new Date().toISOString().slice(0, 10);
  const [mode, setMode] = useState<FormMode>('bulk-add');
  const [mealType, setMealType] = useState<MealType>('Lunch');
  const [bulkRows, setBulkRows] = useState<BulkRow[]>(emptyBulkRows);
  const [singleName, setSingleName] = useState('');
  const [singleAadhar, setSingleAadhar] = useState('');
  const [singleRole, setSingleRole] = useState<BeneficiaryRole>('CPS');
  const [singleVeg, setSingleVeg] = useState<FoodType>('Veg');
  const [singleRemarks, setSingleRemarks] = useState('');
  const [editRows, setEditRows] = useState<FoodRequest[]>([]);
  const [bulkFieldErrors, setBulkFieldErrors] = useState<Record<string, EmployerFieldErrors>>({});
  const [singleFieldErrors, setSingleFieldErrors] = useState<EmployerFieldErrors>({});
  const [editFieldErrors, setEditFieldErrors] = useState<Record<string, EmployerFieldErrors>>({});

  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [myRequests, setMyRequests] = useState<FoodRequest[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);


  const fetchMyRequests = async () => {
    setLoadingHistory(true);
    try {
      const res = await apiFetch(
        `/api/requests?role=employer&mobileNo=${encodeURIComponent(user.mobileNo)}`
      );
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
  }, [user.mobileNo]);

  useEffect(() => {
    if (mode === 'edit') {
      setEditRows(
        myRequests.filter((r) => r.date === requestDate).map((r) => ({ ...r }))
      );
    }
  }, [mode, myRequests, requestDate]);

  const updateBulkRow = (key: string, patch: Partial<BulkRow>) => {
    setBulkRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setBulkFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const addBulkRow = () => {
    setBulkRows((rows) => [...rows, createEmptyBulkRow()]);
  };

  const validateBulkRows = () => {
    const nextErrors: Record<string, EmployerFieldErrors> = {};
    const completeRows: BulkRow[] = [];
    let hasPartialRow = false;

    for (const row of bulkRows) {
      const slice = {
        name: row.name,
        aadharNumber: row.aadharNumber,
        remarks: row.remarks,
      };
      if (!employerRowHasInput(slice)) continue;
      const err = getEmployerFieldErrors(slice);
      if (!isEmployerRowComplete(slice)) {
        hasPartialRow = true;
        nextErrors[row.key] = err;
      } else {
        completeRows.push(row);
      }
    }

    setBulkFieldErrors(nextErrors);

    if (completeRows.length === 0) {
      setErrorMessage(
        hasPartialRow
          ? 'Complete all mandatory fields in highlighted rows (name and Aadhar first 4).'
          : 'Enter at least one complete row in the table.'
      );
      return null;
    }
    if (hasPartialRow) {
      setErrorMessage('Fix highlighted rows before submit — every started row must have all mandatory fields.');
      return null;
    }
    return completeRows;
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    const items = validateBulkRows();
    if (!items) return;
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/requests/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: requestDate,
          type: mealType,
          items: items.map((r) => ({
            name: r.name.trim(),
            aadharNumber: r.aadharNumber.trim(),
            beneficiaryRole: r.beneficiaryRole,
            vegNonVeg: r.vegNonVeg,
            remarks: r.remarks.trim(),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Bulk submit failed.');
      setSuccessMessage(`Submitted ${data.count} request(s) to the Excel sheet.`);
      setBulkRows(emptyBulkRows());
      setBulkFieldErrors({});
      fetchMyRequests();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    const err = getEmployerFieldErrors({
      name: singleName,
      aadharNumber: singleAadhar,
      remarks: singleRemarks,
    });
    if (err.name || err.aadharNumber) {
      setSingleFieldErrors(err);
      setErrorMessage('Fill all mandatory fields highlighted in red.');
      return;
    }
    setSingleFieldErrors({});
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: requestDate,
          name: singleName.trim(),
          aadharNumber: singleAadhar.trim(),
          beneficiaryRole: singleRole,
          vegNonVeg: singleVeg,
          type: mealType,
          remarks: singleRemarks.trim(),
          createdByRole: 'employer',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Submit failed.');
      setSuccessMessage(`Request for ${singleName.trim()} submitted.`);
      setSingleName('');
      setSingleAadhar('');
      setSingleRole('CPS');
      setSingleRemarks('');
      fetchMyRequests();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const updateEditRow = (id: string, patch: Partial<FoodRequest>) => {
    setEditRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setEditFieldErrors((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const validateEditRows = (rows: FoodRequest[]) => {
    const nextErrors: Record<string, EmployerFieldErrors> = {};
    let invalid = false;
    for (const row of rows) {
      const err = getEmployerFieldErrors({
        name: row.name,
        aadharNumber: row.aadharNumber || '',
        remarks: row.remarks || '',
      });
      if (err.name || err.aadharNumber) {
        invalid = true;
        nextErrors[row.id] = err;
      }
    }
    setEditFieldErrors(nextErrors);
    if (invalid) {
      setErrorMessage('Complete all mandatory fields highlighted in red before saving.');
      return false;
    }
    return true;
  };

  const handleBulkEditSave = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    if (editRows.length === 0) {
      setErrorMessage('No requests for today to edit.');
      return;
    }
    if (!validateEditRows(editRows)) return;
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/requests/bulk', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: editRows.map((r) => ({
            id: r.id,
            name: r.name,
            aadharNumber: r.aadharNumber || '',
            beneficiaryRole: r.beneficiaryRole || 'CPS',
            vegNonVeg: r.vegNonVeg,
            type: r.type,
            remarks: r.remarks || '',
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Bulk update failed.');
      setSuccessMessage(`Updated ${data.count} request(s).`);
      fetchMyRequests();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSingleEditSave = async (req: FoodRequest) => {
    setErrorMessage(null);
    const err = getEmployerFieldErrors({
      name: req.name,
      aadharNumber: req.aadharNumber || '',
      remarks: req.remarks || '',
    });
    if (err.name || err.aadharNumber) {
      setEditFieldErrors((prev) => ({ ...prev, [req.id]: err }));
      setErrorMessage('Complete all mandatory fields highlighted in red.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/requests/${req.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: req.name,
          aadharNumber: req.aadharNumber || '',
          beneficiaryRole: req.beneficiaryRole || 'CPS',
          vegNonVeg: req.vegNonVeg,
          type: req.type,
          remarks: req.remarks || '',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Update failed.');
      setSuccessMessage(`Updated request for ${req.name}.`);
      fetchMyRequests();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const modeBtn = (id: FormMode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(id)}
      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
        mode === id
          ? 'bg-emerald-500 text-white shadow-xs'
          : 'bg-white/60 text-slate-600 hover:bg-white/90'
      }`}
    >
      {label}
    </button>
  );

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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8">
          <div className="bg-white/50 backdrop-blur-2xl rounded-[2.5rem] shadow-xl border border-white/60 overflow-hidden">
            <div className="bg-white/40 backdrop-blur-xl py-5 px-6 text-center border-b border-white/40">
              <h2 className="text-xl font-black uppercase tracking-tight text-slate-800">Food Requester site</h2>
              <p className="text-xs text-slate-500 mt-1">
                Requester: <strong>{user.name}</strong>
                {user.team ? ` • Team: ${user.team}` : ''} • {user.mobileNo}
              </p>
              <p className="text-xs text-slate-400 mt-1 font-mono">Date: {requestDate} (fixed)</p>
            </div>

            <div className="px-6 pt-4 flex flex-wrap gap-2">
              {modeBtn('bulk-add', 'Bulk Add')}
              {modeBtn('single-add', 'Single Add')}
              {modeBtn('edit', 'Edit Requests')}
            </div>

            <div className="p-6">
              {successMessage && (
                <div className="mb-4 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-800 text-xs flex gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  {successMessage}
                </div>
              )}
              {errorMessage && (
                <div className="mb-4 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-800 text-xs flex gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  {errorMessage}
                </div>
              )}

              {mode === 'bulk-add' && (
                <form onSubmit={handleBulkSubmit} className="space-y-4">
                  <div className="overflow-x-auto border border-white/60 rounded-2xl">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-white/70 text-slate-700 font-bold uppercase">
                          <th className="px-3 py-2 text-left border-b border-white/50">* Name (Beneficiary)</th>
                          <th className="px-3 py-2 text-left border-b border-white/50 w-28">* Aadhar First 4</th>
                          <th className="px-3 py-2 text-left border-b border-white/50 w-28">* Roles</th>
                          <th className="px-3 py-2 text-left border-b border-white/50 w-32">* Food Type</th>
                          <th className="px-3 py-2 text-left border-b border-white/50">Remark</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkRows.map((row) => {
                          const rowErr = bulkFieldErrors[row.key];
                          return (
                          <tr key={row.key} className="border-b border-white/40">
                            <td className="p-2">
                              <input
                                value={row.name}
                                onChange={(e) => updateBulkRow(row.key, { name: e.target.value })}
                                className={fieldInputClass(rowErr?.name)}
                                placeholder="Beneficiary name"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                value={row.aadharNumber}
                                inputMode="numeric"
                                maxLength={4}
                                onChange={(e) =>
                                  updateBulkRow(row.key, {
                                    aadharNumber: sanitizeAadharInput(e.target.value),
                                  })
                                }
                                className={fieldInputClass(rowErr?.aadharNumber)}
                                placeholder="4 digits"
                              />
                            </td>
                            <td className="p-2">
                              <select
                                value={row.beneficiaryRole}
                                onChange={(e) =>
                                  updateBulkRow(row.key, {
                                    beneficiaryRole: e.target.value as BeneficiaryRole,
                                  })
                                }
                                className={fieldInputClass(false)}
                              >
                                {roleSelectOptions()}
                              </select>
                            </td>
                            <td className="p-2">
                              <select
                                value={row.vegNonVeg}
                                onChange={(e) =>
                                  updateBulkRow(row.key, { vegNonVeg: e.target.value as FoodType })
                                }
                                className={fieldInputClass(false)}
                              >
                                <option value="Veg">Veg</option>
                                <option value="Non-Veg">Non-Veg</option>
                              </select>
                            </td>
                            <td className="p-2">
                              <input
                                value={row.remarks}
                                onChange={(e) => updateBulkRow(row.key, { remarks: e.target.value })}
                                className={fieldInputClass(false)}
                                placeholder="Optional"
                              />
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <button
                    type="button"
                    onClick={addBulkRow}
                    className="text-xs font-bold text-emerald-700 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add another row
                  </button>
                  <div className="flex flex-wrap items-end gap-4 justify-between pt-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                        * Type (Meal Time)
                      </label>
                      <select
                        value={mealType}
                        onChange={(e) => setMealType(e.target.value as MealType)}
                        className="px-3 py-2 rounded-xl border border-white/70 bg-white/80 text-sm font-semibold"
                      >
                        <option value="Breakfast">Breakfast</option>
                        <option value="Lunch">Lunch</option>
                        <option value="Dinner">Dinner</option>
                        <option value="Snacks">Snacks</option>
                      </select>
                    </div>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="py-3 px-6 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs uppercase rounded-2xl flex items-center gap-2 cursor-pointer disabled:opacity-60"
                    >
                      <Send className="w-4 h-4" />
                      Submit request to Excel sheet
                    </button>
                  </div>
                </form>
              )}

              {mode === 'single-add' && (
                <form onSubmit={handleSingleSubmit} className="space-y-4 max-w-md">
                  <div>
                    <label className="text-xs font-bold uppercase text-slate-700">* Name (Beneficiary)</label>
                    <input
                      value={singleName}
                      onChange={(e) => {
                        setSingleName(e.target.value);
                        setSingleFieldErrors((p) => ({ ...p, name: false }));
                      }}
                      className={fieldInputClass(singleFieldErrors.name, true)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase text-slate-700">* Aadhar First 4 Number</label>
                    <input
                      value={singleAadhar}
                      inputMode="numeric"
                      maxLength={4}
                      onChange={(e) => {
                        setSingleAadhar(sanitizeAadharInput(e.target.value));
                        setSingleFieldErrors((p) => ({ ...p, aadharNumber: false }));
                      }}
                      className={fieldInputClass(singleFieldErrors.aadharNumber, true)}
                      placeholder="4 digits"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase text-slate-700">* Roles</label>
                    <select
                      value={singleRole}
                      onChange={(e) => setSingleRole(e.target.value as BeneficiaryRole)}
                      className={fieldInputClass(false, true)}
                    >
                      {roleSelectOptions()}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase text-slate-700">* Food Type</label>
                    <select
                      value={singleVeg}
                      onChange={(e) => setSingleVeg(e.target.value as FoodType)}
                      className={fieldInputClass(false, true)}
                    >
                      <option value="Veg">Veg</option>
                      <option value="Non-Veg">Non-Veg</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase text-slate-700">Remark</label>
                    <input
                      value={singleRemarks}
                      onChange={(e) => setSingleRemarks(e.target.value)}
                      className={fieldInputClass(false, true)}
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase text-slate-700">* Type (Meal Time)</label>
                    <select
                      value={mealType}
                      onChange={(e) => setMealType(e.target.value as MealType)}
                      className="mt-1 w-full px-3 py-2 rounded-xl border border-white/70 bg-white/80"
                    >
                      <option value="Breakfast">Breakfast</option>
                      <option value="Lunch">Lunch</option>
                      <option value="Dinner">Dinner</option>
                      <option value="Snacks">Snacks</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 bg-emerald-500 text-white font-black text-xs uppercase rounded-2xl cursor-pointer disabled:opacity-60"
                  >
                    Submit single request
                  </button>
                </form>
              )}

              {mode === 'edit' && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-500">
                    Edit today&apos;s requests ({requestDate}). Use bulk save or save one row at a time.
                  </p>
                  {editRows.length === 0 ? (
                    <p className="text-sm text-slate-400 py-6 text-center">No requests for today to edit.</p>
                  ) : (
                    <>
                      <div className="overflow-x-auto border border-white/60 rounded-2xl">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-white/70 font-bold uppercase text-slate-700">
                              <th className="px-2 py-2 text-left">* Name</th>
                              <th className="px-2 py-2 text-left">* Aadhar 4</th>
                              <th className="px-2 py-2 text-left">* Roles</th>
                              <th className="px-2 py-2 text-left">* Food</th>
                              <th className="px-2 py-2 text-left">* Meal</th>
                              <th className="px-2 py-2 text-left">Remark</th>
                              <th className="px-2 py-2" />
                            </tr>
                          </thead>
                          <tbody>
                            {editRows.map((row) => {
                              const rowErr = editFieldErrors[row.id];
                              return (
                              <tr key={row.id} className="border-t border-white/40">
                                <td className="p-2">
                                  <input
                                    value={row.name}
                                    onChange={(e) => updateEditRow(row.id, { name: e.target.value })}
                                    className={fieldInputClass(rowErr?.name)}
                                  />
                                </td>
                                <td className="p-2">
                                  <input
                                    value={row.aadharNumber || ''}
                                    inputMode="numeric"
                                    maxLength={4}
                                    onChange={(e) =>
                                      updateEditRow(row.id, {
                                        aadharNumber: sanitizeAadharInput(e.target.value),
                                      })
                                    }
                                    className={fieldInputClass(rowErr?.aadharNumber)}
                                  />
                                </td>
                                <td className="p-2">
                                  <select
                                    value={row.beneficiaryRole || 'CPS'}
                                    onChange={(e) =>
                                      updateEditRow(row.id, {
                                        beneficiaryRole: e.target.value as BeneficiaryRole,
                                      })
                                    }
                                    className={fieldInputClass(false)}
                                  >
                                    {roleSelectOptions()}
                                  </select>
                                </td>
                                <td className="p-2">
                                  <select
                                    value={row.vegNonVeg}
                                    onChange={(e) =>
                                      updateEditRow(row.id, { vegNonVeg: e.target.value as FoodType })
                                    }
                                    className={fieldInputClass(false)}
                                  >
                                    <option value="Veg">Veg</option>
                                    <option value="Non-Veg">Non-Veg</option>
                                  </select>
                                </td>
                                <td className="p-2">
                                  <select
                                    value={row.type}
                                    onChange={(e) =>
                                      updateEditRow(row.id, { type: e.target.value as MealType })
                                    }
                                    className={fieldInputClass(false)}
                                  >
                                    <option value="Breakfast">Breakfast</option>
                                    <option value="Lunch">Lunch</option>
                                    <option value="Dinner">Dinner</option>
                                    <option value="Snacks">Snacks</option>
                                  </select>
                                </td>
                                <td className="p-2">
                                  <input
                                    value={row.remarks || ''}
                                    onChange={(e) => updateEditRow(row.id, { remarks: e.target.value })}
                                    className={fieldInputClass(false)}
                                    placeholder="Optional"
                                  />
                                </td>
                                <td className="p-2">
                                  <button
                                    type="button"
                                    title="Save this row"
                                    onClick={() => handleSingleEditSave(row)}
                                    className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-500/10 cursor-pointer"
                                  >
                                    <Save className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={handleBulkEditSave}
                        className="py-3 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase rounded-2xl flex items-center gap-2 cursor-pointer disabled:opacity-60"
                      >
                        <Pencil className="w-4 h-4" />
                        Bulk save all changes
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-4">
          <div className="bg-white/60 backdrop-blur-xl rounded-[2rem] border border-white/60 shadow-lg overflow-hidden">
            <div className="p-4 border-b border-white/40 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-600" />
                <h3 className="font-bold text-sm">My Submissions</h3>
              </div>
              <button type="button" onClick={fetchMyRequests} className="p-1.5 cursor-pointer">
                <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="p-4 max-h-[480px] overflow-y-auto space-y-2">
              {myRequests.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">No submissions yet.</p>
              ) : (
                myRequests.map((req) => (
                  <div key={req.id} className="p-3 rounded-xl border border-white/60 bg-white/50 text-xs">
                    <div className="flex justify-between font-semibold">
                      <span>{req.name}</span>
                      <span className="text-slate-500 font-mono">{req.date}</span>
                    </div>
                    <div className="mt-1 text-slate-600">
                      {req.aadharNumber ? `Aadhar: ${req.aadharNumber} • ` : ''}
                      {req.beneficiaryRole || 'CPS'} • {req.vegNonVeg} • {req.type}
                      {req.remarks ? ` • ${req.remarks}` : ''}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
