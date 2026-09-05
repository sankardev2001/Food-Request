import React, { useState, useEffect } from 'react';
import { Database, CheckCircle2, AlertCircle, Copy, Check, ExternalLink, RefreshCw, Zap, ShieldCheck } from 'lucide-react';

export const MongoConnectionCard: React.FC = () => {
  const [mongoUriInput, setMongoUriInput] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string; error?: string; suggestion?: string; pingMs?: number } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectMessage, setConnectMessage] = useState<string | null>(null);
  const [healthData, setHealthData] = useState<{ storage: string; isMongoConnected: boolean; hasMongoUri: boolean; mongoLastError?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<{ success: boolean; details?: string[]; error?: string } | null>(null);

  const [seeding, setSeeding] = useState(false);
  const [seedingResult, setSeedingResult] = useState<{ success: boolean; details?: string[]; error?: string } | null>(null);

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setHealthData(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const handleTestConnection = async () => {
    if (!mongoUriInput.trim()) {
      setTestResult({ success: false, error: 'Please enter a MongoDB connection string first.' });
      return;
    }

    setTesting(true);
    setTestResult(null);
    setConnectMessage(null);

    try {
      const res = await fetch('/api/mongodb/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri: mongoUriInput.trim() }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({
        success: false,
        error: err.message || 'Failed to reach MongoDB server test endpoint.',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleApplyAndConnect = async () => {
    if (!mongoUriInput.trim()) return;
    setConnecting(true);
    setConnectMessage(null);
    try {
      const res = await fetch('/api/mongodb/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri: mongoUriInput.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setConnectMessage(data.message);
        fetchHealth();
      } else {
        alert(data.error || 'Connection failed.');
      }
    } catch (err: any) {
      alert(err.message || 'Error connecting to database.');
    } finally {
      setConnecting(false);
    }
  };

  const handleRunMigration = async () => {
    setMigrating(true);
    setMigrationResult(null);
    try {
      const res = await fetch('/api/db/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri: mongoUriInput.trim() || undefined }),
      });
      const data = await res.json();
      setMigrationResult(data);
      fetchHealth();
    } catch (err: any) {
      setMigrationResult({ success: false, error: err.message || 'Migration failed.' });
    } finally {
      setMigrating(false);
    }
  };

  const handleRunSeeding = async () => {
    setSeeding(true);
    setSeedingResult(null);
    try {
      const res = await fetch('/api/db/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri: mongoUriInput.trim() || undefined }),
      });
      const data = await res.json();
      setSeedingResult(data);
      fetchHealth();
    } catch (err: any) {
      setSeedingResult({ success: false, error: err.message || 'Seeding failed.' });
    } finally {
      setSeeding(false);
    }
  };

  const sampleUri =
    'mongodb+srv://<username>:<password>@cluster0.mongodb.net/food_requester?retryWrites=true&w=majority';

  const copySample = () => {
    navigator.clipboard.writeText(sampleUri);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white/60 backdrop-blur-2xl rounded-[2.5rem] shadow-xl border border-white/60 overflow-hidden space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/50">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-md">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-800">MongoDB Atlas Cloud Connection Assistant</h3>
            <p className="text-xs text-slate-500 font-medium">
              Connect your free MongoDB Atlas database to store users and food requests securely
            </p>
          </div>
        </div>

        {/* Current status pill */}
        <div className="flex items-center gap-2">
          {healthData?.isMongoConnected ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              MongoDB Atlas Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-900 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              Local Storage Active (Ready for Mongo)
            </span>
          )}
          <button
            type="button"
            onClick={fetchHealth}
            className="p-1.5 rounded-xl border border-white/70 bg-white/60 hover:bg-white/90 text-slate-700 cursor-pointer shadow-xs"
            title="Refresh database status"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Interactive Tester & Connect Box */}
      <div className="bg-white/70 backdrop-blur-xl p-5 rounded-2xl border border-white/70 space-y-4 shadow-xs">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Enter or Test MongoDB Connection String (MONGODB_URI)
          </label>
          <div className="relative">
            <input
              type="password"
              value={mongoUriInput}
              onChange={(e) => setMongoUriInput(e.target.value)}
              placeholder="mongodb+srv://<username>:<password>@cluster0.xxx.mongodb.net/food_requester?retryWrites=true&w=majority"
              className="w-full px-4 py-2.5 text-xs font-mono rounded-xl border border-white/80 bg-white/90 backdrop-blur-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 shadow-xs"
            />
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Replace <code className="font-mono bg-white/80 px-1 py-0.5 rounded">&lt;username&gt;</code> and{' '}
            <code className="font-mono bg-white/80 px-1 py-0.5 rounded">&lt;password&gt;</code> with your database credentials.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-60 shadow-xs"
          >
            <Zap className={`w-3.5 h-3.5 text-amber-400 ${testing ? 'animate-bounce' : ''}`} />
            <span>{testing ? 'Testing ping to MongoDB...' : 'Test Connection'}</span>
          </button>

          <button
            type="button"
            onClick={handleApplyAndConnect}
            disabled={connecting || !mongoUriInput.trim()}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-md shadow-emerald-500/20"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{connecting ? 'Connecting...' : 'Connect & Sync Database'}</span>
          </button>
        </div>

        {/* Test Result Feedback */}
        {testResult && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
              testResult.success
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-900'
                : 'bg-rose-500/15 border-rose-500/30 text-rose-900'
            }`}
          >
            {testResult.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-bold">
                {testResult.success ? 'Connection Successful!' : 'Connection Test Failed'}
              </p>
              <p className="mt-0.5">
                {testResult.message || testResult.error}
                {testResult.pingMs && ` (Ping latency: ${testResult.pingMs}ms)`}
              </p>
              {testResult.suggestion && (
                <p className="mt-1 font-semibold text-rose-800">{testResult.suggestion}</p>
              )}
            </div>
          </div>
        )}

        {connectMessage && (
          <div className="p-3.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-900 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{connectMessage}</span>
          </div>
        )}
      </div>

      {/* Step-by-Step MongoDB Guide */}
      <div className="space-y-3">
        <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700">
          How to get your Free MongoDB URI in 3 minutes:
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-600">
          <div className="p-3.5 rounded-2xl bg-white/50 border border-white/60 space-y-1">
            <span className="font-bold text-slate-900">Step 1: Sign up & create cluster</span>
            <p>
              Go to{' '}
              <a
                href="https://www.mongodb.com/cloud/atlas/register"
                target="_blank"
                rel="noreferrer"
                className="text-emerald-700 font-bold underline inline-flex items-center gap-0.5"
              >
                MongoDB Atlas <ExternalLink className="w-3 h-3" />
              </a>{' '}
              and create a free account. Choose the free <strong>M0 Shared Cluster</strong> (512MB free forever).
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/50 border border-white/60 space-y-1">
            <span className="font-bold text-slate-900">Step 2: Add Database User</span>
            <p>
              Under <strong>Database Access</strong>, add a user (e.g. <code className="font-mono font-bold">food_admin</code>) and password. Keep note of this password.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/50 border border-white/60 space-y-1">
            <span className="font-bold text-slate-900">Step 3: Whitelist Network IP</span>
            <p>
              Under <strong>Network Access</strong>, click <strong>Add IP Address</strong> and add{' '}
              <code className="font-mono font-bold bg-amber-100 text-amber-900 px-1 py-0.5 rounded">0.0.0.0/0</code>{' '}
              (Allow Access from Anywhere). This enables cloud servers and Vercel to connect!
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/50 border border-white/60 space-y-1">
            <span className="font-bold text-slate-900">Step 4: Copy Connection String</span>
            <p>
              Click <strong>Connect</strong> &gt; <strong>Drivers (Node.js)</strong> and copy the connection string. Paste it in the input above or add to your Vercel Environment Variables!
            </p>
          </div>
        </div>

        {/* Template code */}
        <div className="bg-slate-900/90 text-emerald-400 p-3 rounded-xl font-mono text-xs relative flex items-center justify-between">
          <span className="truncate pr-8">{sampleUri}</span>
          <button
            type="button"
            onClick={copySample}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] flex items-center gap-1 cursor-pointer shrink-0 font-sans font-bold"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* Deployment & Database Migration Tools Section */}
      <div className="p-5 rounded-2xl bg-white/70 border border-white/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              Deployment Migration & Seeding Tools
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Execute database migrations and seed the super admin (<code className="font-bold text-slate-700">subash</code> / CPS: <code className="font-bold text-slate-700">1234</code>) with 1-click or via CLI.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              id="btn-run-migration"
              onClick={handleRunMigration}
              disabled={migrating}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${migrating ? 'animate-spin' : ''}`} />
              <span>{migrating ? 'Migrating...' : 'Run Migration'}</span>
            </button>

            <button
              type="button"
              id="btn-run-seeding"
              onClick={handleRunSeeding}
              disabled={seeding}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <ShieldCheck className={`w-3.5 h-3.5 ${seeding ? 'animate-spin' : ''}`} />
              <span>{seeding ? 'Seeding...' : 'Run Seeding'}</span>
            </button>
          </div>
        </div>

        {/* Migration Result Banner */}
        {migrationResult && (
          <div
            className={`p-3.5 rounded-xl border text-xs ${
              migrationResult.success
                ? 'bg-indigo-50 border-indigo-200 text-indigo-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <div className="font-bold flex items-center gap-1.5 mb-1">
              {migrationResult.success ? <CheckCircle2 className="w-4 h-4 text-indigo-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
              <span>{migrationResult.success ? 'Migration Completed Successfully' : 'Migration Failed'}</span>
            </div>
            {migrationResult.error && <p className="text-rose-700">{migrationResult.error}</p>}
            {migrationResult.details && migrationResult.details.length > 0 && (
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-indigo-800">
                {migrationResult.details.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Seeding Result Banner */}
        {seedingResult && (
          <div
            className={`p-3.5 rounded-xl border text-xs ${
              seedingResult.success
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <div className="font-bold flex items-center gap-1.5 mb-1">
              {seedingResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
              <span>{seedingResult.success ? 'Seeding Completed Successfully' : 'Seeding Failed'}</span>
            </div>
            {seedingResult.error && <p className="text-rose-700">{seedingResult.error}</p>}
            {seedingResult.details && seedingResult.details.length > 0 && (
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-emerald-800">
                {seedingResult.details.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* CLI Deployment Commands reference */}
        <div className="pt-2 border-t border-slate-200/60">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
            CLI Commands (For Terminal & CI/CD Deployment):
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-[11px]">
            <div className="bg-slate-900 text-slate-200 p-2 rounded-xl flex items-center justify-between">
              <span className="text-emerald-400">npm run db:setup</span>
              <span className="text-[10px] text-slate-400 font-sans">Full Setup</span>
            </div>
            <div className="bg-slate-900 text-slate-200 p-2 rounded-xl flex items-center justify-between">
              <span className="text-indigo-300">npm run migrate</span>
              <span className="text-[10px] text-slate-400 font-sans">Indexes</span>
            </div>
            <div className="bg-slate-900 text-slate-200 p-2 rounded-xl flex items-center justify-between">
              <span className="text-amber-300">npm run seed</span>
              <span className="text-[10px] text-slate-400 font-sans">Subash User</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
