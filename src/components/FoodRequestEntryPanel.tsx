import React, { useState, useEffect, useMemo } from 'react';
import { UserProfile, FoodRequest, FoodType, MealType, BeneficiaryRole } from '../types';
import { CheckCircle, Clock, Send, ShieldAlert, RefreshCw, Plus } from 'lucide-react';
import { apiFetch } from '../apiFetch';
import { MEAL_TYPE_OPTIONS } from '../mealTypes';
import {
  EmployerFieldErrors,
  ContractorFieldErrors,
  employerRowHasInput,
  getEmployerFieldErrors,
  isEmployerRowComplete,
  contractorRowHasInput,
  getContractorFieldErrors,
  isContractorRowComplete,
  isFoodRequestEditable,
  getFoodRequestEditRemainingMs,
  FOOD_REQUEST_EDIT_WINDOW_MS,
} from '../foodRequestHelpers';

type FormMode = 'csp' | 'contractor' | 'edit';

interface CspRow {
  key: string;
  name: string;
  aadharNumber: string;
  vegNonVeg: FoodType;
  remarks: string;
}

interface ContractorRow {
  key: string;
  teamName: string;
  foodCount: string;
  vegNonVeg: FoodType;
  remarks: string;
}

function createCspRow(): CspRow {
  return {
    key: `csp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    aadharNumber: '',
    vegNonVeg: 'Veg',
    remarks: '',
  };
}

function createContractorRow(): ContractorRow {
  return {
    key: `ctr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    teamName: '',
    foodCount: '',
    vegNonVeg: 'Veg',
    remarks: '',
  };
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

function formatRemaining(ms: number) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface FoodRequestEntryPanelProps {
  user: UserProfile;
  /** Admin entries are tagged createdByRole admin but use same CPS / Contractor tabs */
  entryContext?: 'employer' | 'admin';
  showHistorySidebar?: boolean;
}

export const FoodRequestEntryPanel: React.FC<FoodRequestEntryPanelProps> = ({
  user,
  entryContext = 'employer',
  showHistorySidebar = true,
}) => {
  const requestDate = new Date().toISOString().slice(0, 10);
  const [mode, setMode] = useState<FormMode>('csp');
  const [mealType, setMealType] = useState<MealType>('Lunch');
  const [cspRows, setCspRows] = useState<CspRow[]>(() => [createCspRow()]);
  const [contractorRows, setContractorRows] = useState<ContractorRow[]>(() => [createContractorRow()]);
  const [cspFieldErrors, setCspFieldErrors] = useState<Record<string, EmployerFieldErrors>>({});
  const [contractorFieldErrors, setContractorFieldErrors] = useState<Record<string, ContractorFieldErrors>>({});
  const [editCspRows, setEditCspRows] = useState<FoodRequest[]>([]);
  const [editContractorRows, setEditContractorRows] = useState<FoodRequest[]>([]);
  const [editCspErrors, setEditCspErrors] = useState<Record<string, EmployerFieldErrors>>({});
  const [editContractorErrors, setEditContractorErrors] = useState<Record<string, ContractorFieldErrors>>({});
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [myRequests, setMyRequests] = useState<FoodRequest[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [tick, setTick] = useState(0);

  const mobileQuery = encodeURIComponent(user.mobileNo);
  const listUrl =
    entryContext === 'admin'
      ? `/api/requests?role=admin`
      : `/api/requests?role=employer&mobileNo=${mobileQuery}`;

  const fetchMyRequests = async () => {
    setLoadingHistory(true);
    try {
      const res = await apiFetch(listUrl);
      const data = await res.json();
      if (data.success) {
        let rows: FoodRequest[] = data.requests;
        if (entryContext === 'admin') {
          rows = rows.filter((r) => r.requesterMobile.trim() === user.mobileNo.trim());
        }
        setMyRequests(rows);
      }
    } catch (e) {
      console.error('Error fetching requests:', e);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchMyRequests();
  }, [user.mobileNo, entryContext]);

  useEffect(() => {
    if (mode !== 'edit') return;
    const today = myRequests.filter((r) => r.date === requestDate && isFoodRequestEditable(r.createdAt));
    setEditCspRows(today.filter((r) => r.beneficiaryRole !== 'Contractor').map((r) => ({ ...r })));
    setEditContractorRows(today.filter((r) => r.beneficiaryRole === 'Contractor').map((r) => ({ ...r })));
  }, [mode, myRequests, requestDate]);

  useEffect(() => {
    if (mode !== 'edit') return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [mode]);

  const validateCspRows = () => {
    const nextErrors: Record<string, EmployerFieldErrors> = {};
    const complete: CspRow[] = [];
    let hasPartial = false;
    for (const row of cspRows) {
      const slice = { name: row.name, aadharNumber: row.aadharNumber, remarks: row.remarks };
      if (!employerRowHasInput(slice)) continue;
      const err = getEmployerFieldErrors(slice);
      if (!isEmployerRowComplete(slice)) {
        hasPartial = true;
        nextErrors[row.key] = err;
      } else complete.push(row);
    }
    setCspFieldErrors(nextErrors);
    if (complete.length === 0) {
      setErrorMessage(
        hasPartial
          ? 'Complete mandatory fields (name and Aadhar first 4) in highlighted rows.'
          : 'Enter at least one complete CPS row.'
      );
      return null;
    }
    if (hasPartial) {
      setErrorMessage('Fix highlighted rows before submit.');
      return null;
    }
    return complete;
  };

  const validateContractorRows = () => {
    const nextErrors: Record<string, ContractorFieldErrors> = {};
    const complete: ContractorRow[] = [];
    let hasPartial = false;
    for (const row of contractorRows) {
      const slice = { teamName: row.teamName, foodCount: row.foodCount, remarks: row.remarks };
      if (!contractorRowHasInput(slice)) continue;
      const err = getContractorFieldErrors(slice);
      if (!isContractorRowComplete(slice)) {
        hasPartial = true;
        nextErrors[row.key] = err;
      } else complete.push(row);
    }
    setContractorFieldErrors(nextErrors);
    if (complete.length === 0) {
      setErrorMessage(
        hasPartial
          ? 'Complete mandatory fields (team name and no of food) in highlighted rows.'
          : 'Enter at least one complete contractor row.'
      );
      return null;
    }
    if (hasPartial) {
      setErrorMessage('Fix highlighted rows before submit.');
      return null;
    }
    return complete;
  };

  const submitBulk = async (beneficiaryRole: BeneficiaryRole, items: Record<string, unknown>[]) => {
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/requests/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: requestDate,
          type: mealType,
          beneficiaryRole,
          createdByRole: entryContext === 'admin' ? 'admin' : 'employer',
          items,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Submit failed.');
      setSuccessMessage(`Submitted ${data.count} row(s) to the Excel sheet.`);
      if (beneficiaryRole === 'CPS') {
        setCspRows([createCspRow()]);
        setCspFieldErrors({});
      } else {
        setContractorRows([createContractorRow()]);
        setContractorFieldErrors({});
      }
      fetchMyRequests();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCspSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    const rows = validateCspRows();
    if (!rows) return;
    submitBulk(
      'CPS',
      rows.map((r) => ({
        name: r.name.trim(),
        aadharNumber: r.aadharNumber.trim(),
        vegNonVeg: r.vegNonVeg,
        remarks: r.remarks.trim(),
      }))
    );
  };

  const handleContractorSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    const rows = validateContractorRows();
    if (!rows) return;
    submitBulk(
      'Contractor',
      rows.map((r) => ({
        name: r.teamName.trim(),
        foodCount: parseInt(r.foodCount.trim(), 10),
        vegNonVeg: r.vegNonVeg,
        remarks: r.remarks.trim(),
      }))
    );
  };

  const saveEditBulk = async (rows: FoodRequest[]) => {
    if (rows.length === 0) return;
    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await apiFetch('/api/requests/bulk', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: rows.map((r) => ({
            id: r.id,
            name: r.name,
            aadharNumber: r.aadharNumber || '',
            foodCount: r.foodCount,
            beneficiaryRole: r.beneficiaryRole,
            vegNonVeg: r.vegNonVeg,
            type: r.type,
            remarks: r.remarks || '',
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Update failed.');
      setSuccessMessage(`Updated ${data.count} request(s).`);
      fetchMyRequests();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const validateEditCsp = () => {
    const next: Record<string, EmployerFieldErrors> = {};
    let bad = false;
    for (const row of editCspRows) {
      const err = getEmployerFieldErrors({
        name: row.name,
        aadharNumber: row.aadharNumber || '',
        remarks: row.remarks || '',
      });
      if (err.name || err.aadharNumber) {
        bad = true;
        next[row.id] = err;
      }
    }
    setEditCspErrors(next);
    return !bad;
  };

  const validateEditContractor = () => {
    const next: Record<string, ContractorFieldErrors> = {};
    let bad = false;
    for (const row of editContractorRows) {
      const err = getContractorFieldErrors({
        teamName: row.name,
        foodCount: String(row.foodCount ?? ''),
        remarks: row.remarks || '',
      });
      if (err.teamName || err.foodCount) {
        bad = true;
        next[row.id] = err;
      }
    }
    setEditContractorErrors(next);
    return !bad;
  };

  const modeBtn = (id: FormMode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(id)}
      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
        mode === id ? 'bg-emerald-500 text-white shadow-xs' : 'bg-white/60 text-slate-600 hover:bg-white/90'
      }`}
    >
      {label}
    </button>
  );

  const mealSelect = (
    <select
      value={mealType}
      onChange={(e) => setMealType(e.target.value as MealType)}
      className="px-3 py-2 rounded-xl border border-white/70 bg-white/80 text-sm font-semibold"
    >
      {MEAL_TYPE_OPTIONS.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
    </select>
  );

  const editHint = useMemo(() => {
    void tick;
    const sample = editCspRows[0] || editContractorRows[0];
    if (!sample) return null;
    const rem = getFoodRequestEditRemainingMs(sample.createdAt);
    if (rem <= 0) return 'Edit window closed for today’s submissions.';
    return `Edits allowed for ${formatRemaining(rem)} more (30 min from submit).`;
  }, [tick, editCspRows, editContractorRows]);

  const formBlock = (
    <div className="bg-white/50 backdrop-blur-2xl rounded-[2.5rem] shadow-xl border border-white/60 overflow-hidden">
      <div className="bg-white/40 backdrop-blur-xl py-5 px-6 text-center border-b border-white/40">
        <h2 className="text-xl font-black uppercase tracking-tight text-slate-800">Food Requester site</h2>
        <p className="text-xs text-slate-500 mt-1">
          Requester: <strong>{user.name}</strong>
          {user.team ? ` • Team: ${user.team}` : ''} • {user.mobileNo}
        </p>
        <p className="text-xs text-slate-400 mt-1 font-mono">Date: {requestDate}</p>
      </div>

      <div className="px-6 pt-4 flex flex-wrap gap-2">
        {modeBtn('csp', 'CSP Request')}
        {modeBtn('contractor', 'Contractor Request')}
        {modeBtn('edit', 'Edit')}
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

        {mode === 'csp' && (
          <form onSubmit={handleCspSubmit} className="space-y-4">
            <div className="overflow-x-auto border border-white/60 rounded-2xl">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/70 text-slate-700 font-bold uppercase">
                    <th className="px-3 py-2 text-left">* Name (Beneficiary)</th>
                    <th className="px-3 py-2 text-left w-28">* Aadhar First 4</th>
                    <th className="px-3 py-2 text-left w-32">* Food Type</th>
                    <th className="px-3 py-2 text-left">Remark</th>
                  </tr>
                </thead>
                <tbody>
                  {cspRows.map((row) => {
                    const rowErr = cspFieldErrors[row.key];
                    return (
                      <tr key={row.key} className="border-b border-white/40">
                        <td className="p-2">
                          <input
                            value={row.name}
                            onChange={(e) =>
                              setCspRows((rows) =>
                                rows.map((r) => (r.key === row.key ? { ...r, name: e.target.value } : r))
                              )
                            }
                            className={fieldInputClass(rowErr?.name)}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            value={row.aadharNumber}
                            inputMode="numeric"
                            maxLength={4}
                            onChange={(e) =>
                              setCspRows((rows) =>
                                rows.map((r) =>
                                  r.key === row.key
                                    ? { ...r, aadharNumber: sanitizeAadharInput(e.target.value) }
                                    : r
                                )
                              )
                            }
                            className={fieldInputClass(rowErr?.aadharNumber)}
                            placeholder="4 digits"
                          />
                        </td>
                        <td className="p-2">
                          <select
                            value={row.vegNonVeg}
                            onChange={(e) =>
                              setCspRows((rows) =>
                                rows.map((r) =>
                                  r.key === row.key ? { ...r, vegNonVeg: e.target.value as FoodType } : r
                                )
                              )
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
                            onChange={(e) =>
                              setCspRows((rows) =>
                                rows.map((r) => (r.key === row.key ? { ...r, remarks: e.target.value } : r))
                              )
                            }
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
              onClick={() => setCspRows((r) => [...r, createCspRow()])}
              className="text-xs font-bold text-emerald-700 flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add another row
            </button>
            <div className="flex flex-wrap items-end gap-4 justify-between pt-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">* Type (Meal Time)</label>
                {mealSelect}
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

        {mode === 'contractor' && (
          <form onSubmit={handleContractorSubmit} className="space-y-4">
            <div className="overflow-x-auto border border-white/60 rounded-2xl">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/70 text-slate-700 font-bold uppercase">
                    <th className="px-3 py-2 text-left">* Team Name</th>
                    <th className="px-3 py-2 text-left w-28">* No of Food</th>
                    <th className="px-3 py-2 text-left w-32">* Food Type</th>
                    <th className="px-3 py-2 text-left">Remark</th>
                  </tr>
                </thead>
                <tbody>
                  {contractorRows.map((row) => {
                    const rowErr = contractorFieldErrors[row.key];
                    return (
                      <tr key={row.key} className="border-b border-white/40">
                        <td className="p-2">
                          <input
                            value={row.teamName}
                            onChange={(e) =>
                              setContractorRows((rows) =>
                                rows.map((r) => (r.key === row.key ? { ...r, teamName: e.target.value } : r))
                              )
                            }
                            className={fieldInputClass(rowErr?.teamName)}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            value={row.foodCount}
                            inputMode="numeric"
                            onChange={(e) =>
                              setContractorRows((rows) =>
                                rows.map((r) =>
                                  r.key === row.key
                                    ? { ...r, foodCount: e.target.value.replace(/\D/g, '').slice(0, 4) }
                                    : r
                                )
                              )
                            }
                            className={fieldInputClass(rowErr?.foodCount)}
                          />
                        </td>
                        <td className="p-2">
                          <select
                            value={row.vegNonVeg}
                            onChange={(e) =>
                              setContractorRows((rows) =>
                                rows.map((r) =>
                                  r.key === row.key ? { ...r, vegNonVeg: e.target.value as FoodType } : r
                                )
                              )
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
                            onChange={(e) =>
                              setContractorRows((rows) =>
                                rows.map((r) => (r.key === row.key ? { ...r, remarks: e.target.value } : r))
                              )
                            }
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
              onClick={() => setContractorRows((r) => [...r, createContractorRow()])}
              className="text-xs font-bold text-emerald-700 flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add another row
            </button>
            <div className="flex flex-wrap items-end gap-4 justify-between pt-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">* Type (Meal Time)</label>
                {mealSelect}
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

        {mode === 'edit' && (
          <div className="space-y-6">
            <p className="text-xs text-slate-600">
              Edit today&apos;s submissions within{' '}
              <strong>{Math.round(FOOD_REQUEST_EDIT_WINDOW_MS / 60000)} minutes</strong> of submit. {editHint}
              After that, rows stay in the admin Excel sheet — they are only removed from this Edit screen, not
              deleted from the database.
            </p>
            {editCspRows.length === 0 && editContractorRows.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">
                No editable requests for today (or edit window expired).
              </p>
            ) : (
              <>
                {editCspRows.length > 0 && (
                  <div>
                    <h3 className="text-xs font-black uppercase text-slate-700 mb-2">CSP requests</h3>
                    <div className="overflow-x-auto border border-white/60 rounded-2xl mb-2">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-white/70 font-bold uppercase text-slate-700">
                            <th className="px-2 py-2 text-left">* Name</th>
                            <th className="px-2 py-2 text-left">* Aadhar 4</th>
                            <th className="px-2 py-2 text-left">* Food</th>
                            <th className="px-2 py-2 text-left">* Meal</th>
                            <th className="px-2 py-2 text-left">Remark</th>
                          </tr>
                        </thead>
                        <tbody>
                          {editCspRows.map((row) => {
                            const rowErr = editCspErrors[row.id];
                            return (
                              <tr key={row.id} className="border-t border-white/40">
                                <td className="p-2">
                                  <input
                                    value={row.name}
                                    onChange={(e) =>
                                      setEditCspRows((rows) =>
                                        rows.map((r) => (r.id === row.id ? { ...r, name: e.target.value } : r))
                                      )
                                    }
                                    className={fieldInputClass(rowErr?.name)}
                                  />
                                </td>
                                <td className="p-2">
                                  <input
                                    value={row.aadharNumber || ''}
                                    maxLength={4}
                                    inputMode="numeric"
                                    onChange={(e) =>
                                      setEditCspRows((rows) =>
                                        rows.map((r) =>
                                          r.id === row.id
                                            ? { ...r, aadharNumber: sanitizeAadharInput(e.target.value) }
                                            : r
                                        )
                                      )
                                    }
                                    className={fieldInputClass(rowErr?.aadharNumber)}
                                  />
                                </td>
                                <td className="p-2">
                                  <select
                                    value={row.vegNonVeg}
                                    onChange={(e) =>
                                      setEditCspRows((rows) =>
                                        rows.map((r) =>
                                          r.id === row.id ? { ...r, vegNonVeg: e.target.value as FoodType } : r
                                        )
                                      )
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
                                      setEditCspRows((rows) =>
                                        rows.map((r) =>
                                          r.id === row.id ? { ...r, type: e.target.value as MealType } : r
                                        )
                                      )
                                    }
                                    className={fieldInputClass(false)}
                                  >
                                    {MEAL_TYPE_OPTIONS.map((m) => (
                                      <option key={m} value={m}>
                                        {m}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="p-2">
                                  <input
                                    value={row.remarks || ''}
                                    onChange={(e) =>
                                      setEditCspRows((rows) =>
                                        rows.map((r) => (r.id === row.id ? { ...r, remarks: e.target.value } : r))
                                      )
                                    }
                                    className={fieldInputClass(false)}
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
                      disabled={submitting}
                      onClick={() => {
                        if (validateEditCsp()) saveEditBulk(editCspRows);
                        else setErrorMessage('Fix highlighted CSP rows.');
                      }}
                      className="py-2 px-4 bg-indigo-600 text-white font-black text-xs uppercase rounded-xl cursor-pointer disabled:opacity-60"
                    >
                      Save CSP changes
                    </button>
                  </div>
                )}

                {editContractorRows.length > 0 && (
                  <div>
                    <h3 className="text-xs font-black uppercase text-slate-700 mb-2">Contractor requests</h3>
                    <div className="overflow-x-auto border border-white/60 rounded-2xl mb-2">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-white/70 font-bold uppercase text-slate-700">
                            <th className="px-2 py-2 text-left">* Team</th>
                            <th className="px-2 py-2 text-left">* No of Food</th>
                            <th className="px-2 py-2 text-left">* Food</th>
                            <th className="px-2 py-2 text-left">* Meal</th>
                            <th className="px-2 py-2 text-left">Remark</th>
                          </tr>
                        </thead>
                        <tbody>
                          {editContractorRows.map((row) => {
                            const rowErr = editContractorErrors[row.id];
                            return (
                              <tr key={row.id} className="border-t border-white/40">
                                <td className="p-2">
                                  <input
                                    value={row.name}
                                    onChange={(e) =>
                                      setEditContractorRows((rows) =>
                                        rows.map((r) => (r.id === row.id ? { ...r, name: e.target.value } : r))
                                      )
                                    }
                                    className={fieldInputClass(rowErr?.teamName)}
                                  />
                                </td>
                                <td className="p-2">
                                  <input
                                    value={row.foodCount ?? ''}
                                    inputMode="numeric"
                                    onChange={(e) =>
                                      setEditContractorRows((rows) =>
                                        rows.map((r) =>
                                          r.id === row.id
                                            ? {
                                                ...r,
                                                foodCount: parseInt(e.target.value.replace(/\D/g, ''), 10) || 0,
                                              }
                                            : r
                                        )
                                      )
                                    }
                                    className={fieldInputClass(rowErr?.foodCount)}
                                  />
                                </td>
                                <td className="p-2">
                                  <select
                                    value={row.vegNonVeg}
                                    onChange={(e) =>
                                      setEditContractorRows((rows) =>
                                        rows.map((r) =>
                                          r.id === row.id ? { ...r, vegNonVeg: e.target.value as FoodType } : r
                                        )
                                      )
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
                                      setEditContractorRows((rows) =>
                                        rows.map((r) =>
                                          r.id === row.id ? { ...r, type: e.target.value as MealType } : r
                                        )
                                      )
                                    }
                                    className={fieldInputClass(false)}
                                  >
                                    {MEAL_TYPE_OPTIONS.map((m) => (
                                      <option key={m} value={m}>
                                        {m}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="p-2">
                                  <input
                                    value={row.remarks || ''}
                                    onChange={(e) =>
                                      setEditContractorRows((rows) =>
                                        rows.map((r) => (r.id === row.id ? { ...r, remarks: e.target.value } : r))
                                      )
                                    }
                                    className={fieldInputClass(false)}
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
                      disabled={submitting}
                      onClick={() => {
                        if (validateEditContractor()) saveEditBulk(editContractorRows);
                        else setErrorMessage('Fix highlighted contractor rows.');
                      }}
                      className="py-2 px-4 bg-indigo-600 text-white font-black text-xs uppercase rounded-xl cursor-pointer disabled:opacity-60"
                    >
                      Save contractor changes
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (!showHistorySidebar) {
    return <div className="max-w-4xl mx-auto">{formBlock}</div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      <div className="lg:col-span-8">{formBlock}</div>
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
                    {req.beneficiaryRole === 'Contractor' ? (
                      <>
                        Contractor • Qty {req.foodCount ?? '-'} • {req.vegNonVeg} • {req.type}
                      </>
                    ) : (
                      <>
                        CSP • Aadhar {req.aadharNumber || '-'} • {req.vegNonVeg} • {req.type}
                      </>
                    )}
                    {req.remarks ? ` • ${req.remarks}` : ''}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
