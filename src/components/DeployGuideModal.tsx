import React, { useState } from 'react';
import { X, Copy, Check, ExternalLink, Cloud, Database, Server, CheckCircle2 } from 'lucide-react';

interface DeployGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DeployGuideModal: React.FC<DeployGuideModalProps> = ({ isOpen, onClose }) => {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(id);
    setTimeout(() => setCopiedSection(null), 2500);
  };

  const mongoEnvExample = `MONGODB_URI="mongodb+srv://<username>:<password>@cluster0.mongodb.net/food_requester?retryWrites=true&w=majority"
ADMIN_PASSCODE="admin123"`;

  const vercelJsonExample = `{
  "version": 2,
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "/api/index.ts"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-md">
      <div className="bg-white/70 backdrop-blur-2xl w-full max-w-3xl rounded-[2.5rem] shadow-2xl border border-white/60 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-5 bg-white/40 backdrop-blur-xl text-slate-900 border-b border-white/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/80 backdrop-blur-md flex items-center justify-center text-white shadow-xs">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-800">Free Vercel Deployment & Cloud Database Guide</h3>
              <p className="text-xs text-slate-500 font-medium">
                Setup guide for 100% Free MongoDB Atlas / Firebase + Vercel Full-Stack Hosting
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-white/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm text-slate-700">
          {/* Current Status banner */}
          <div className="p-4 rounded-2xl bg-emerald-500/15 backdrop-blur-md border border-emerald-500/25 flex items-start gap-3 shadow-xs">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-emerald-900 text-sm">Ready Out-of-the-Box</h4>
              <p className="text-xs text-emerald-800 mt-0.5 leading-relaxed font-medium">
                The application currently runs a full-stack Express server with durable JSON file storage in this sandbox. Both <code className="font-mono bg-white/70 px-1.5 py-0.5 rounded-md border border-emerald-500/30">vercel.json</code> and <code className="font-mono bg-white/70 px-1.5 py-0.5 rounded-md border border-emerald-500/30">api/index.ts</code> are already included in the root of your project!
              </p>
            </div>
          </div>

          {/* Section 1: Free MongoDB Atlas */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-600" />
                Step 1: Setup Free MongoDB Atlas (M0 Free Tier - 512MB)
              </h4>
              <span className="text-[11px] font-bold bg-emerald-500/15 text-emerald-800 border border-emerald-500/25 px-2.5 py-0.5 rounded-full">
                100% Free Forever
              </span>
            </div>
            <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-600 pl-1 font-medium">
              <li>
                Visit{' '}
                <a
                  href="https://www.mongodb.com/cloud/atlas/register"
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-700 font-bold underline"
                >
                  MongoDB Atlas
                </a>{' '}
                and create a free account.
              </li>
              <li>Deploy a free <strong>M0 Shared Cluster</strong> (select your closest region).</li>
              <li>Under <strong>Database Access</strong>, create a database user (e.g. <code className="font-mono bg-white/60 px-1 py-0.5 rounded border border-white/60">food_admin</code>) and password.</li>
              <li>Under <strong>Network Access</strong>, add IP Address <code className="font-mono bg-white/60 px-1 py-0.5 rounded border border-white/60">0.0.0.0/0</code> (Allow Access from Anywhere).</li>
              <li>Click <strong>Connect</strong> &gt; <strong>Drivers (Node.js)</strong> and copy your connection string.</li>
            </ol>

            {/* Code Snippet for Environment Variables */}
            <div className="mt-2 bg-slate-900/90 backdrop-blur-md rounded-2xl p-4 relative font-mono text-xs text-emerald-400 border border-white/10 shadow-md">
              <button
                type="button"
                onClick={() => copyToClipboard(mongoEnvExample, 'mongo')}
                className="absolute top-3 right-3 px-2.5 py-1 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-[11px] font-sans font-bold flex items-center gap-1.5 cursor-pointer transition-all border border-white/10 shadow-xs"
              >
                {copiedSection === 'mongo' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSection === 'mongo' ? 'Copied' : 'Copy'}</span>
              </button>
              <div className="text-slate-400 text-[10px] mb-1 font-sans"># Environment Variables (.env / Vercel Settings)</div>
              <pre className="overflow-x-auto">{mongoEnvExample}</pre>
            </div>
          </div>

          {/* Section 2: Deploy to Vercel */}
          <div className="space-y-3 pt-4 border-t border-white/60">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Server className="w-4 h-4 text-blue-600" />
                Step 2: Deploy to Vercel for Free (Frontend + Serverless API)
              </h4>
              <span className="text-[11px] font-bold bg-blue-500/15 text-blue-800 border border-blue-500/25 px-2.5 py-0.5 rounded-full">
                Free Hobby Plan
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              We have already pre-configured the project with <code className="font-mono bg-white/70 px-1.5 py-0.5 rounded-md border border-white/80">vercel.json</code> which routes all frontend routes to Vite SPA and <code className="font-mono bg-white/70 px-1.5 py-0.5 rounded-md border border-white/80">/api/*</code> to <code className="font-mono bg-white/70 px-1.5 py-0.5 rounded-md border border-white/80">api/index.ts</code> serverless function.
            </p>

            <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-600 pl-1 font-medium">
              <li>
                Export or push this codebase to a <strong>GitHub repository</strong> (via the export menu or git push).
              </li>
              <li>
                Go to{' '}
                <a
                  href="https://vercel.com/new"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-700 font-bold underline"
                >
                  Vercel.com
                </a>{' '}
                and click <strong>Add New Project</strong>.
              </li>
              <li>Select your GitHub repository.</li>
              <li>
                In the <strong>Environment Variables</strong> section, paste:
                <ul className="list-disc list-inside pl-4 mt-1 text-slate-500 font-mono text-[11px]">
                  <li><code className="text-slate-800 font-semibold">MONGODB_URI</code> = your MongoDB connection string</li>
                  <li><code className="text-slate-800 font-semibold">ADMIN_PASSCODE</code> = your desired admin passcode (default: <code className="text-slate-800">admin123</code>)</li>
                </ul>
              </li>
              <li>Click <strong>Deploy</strong>. Vercel will build and assign you a free <code className="font-mono bg-white/60 px-1 py-0.5 rounded">https://your-app.vercel.app</code> domain!</li>
            </ol>
          </div>

          {/* Section 3: Summary of Features */}
          <div className="p-5 rounded-2xl bg-white/50 backdrop-blur-md border border-white/60 text-xs space-y-2 shadow-xs">
            <h5 className="font-bold text-slate-900 text-sm">Summary of Built Features:</h5>
            <ul className="list-disc list-inside text-slate-600 space-y-1 font-medium leading-relaxed">
              <li><strong>Employer (Employee) Portal:</strong> Food request submission form (* Name, * Aadhar First 4, * Veg/Non-Veg, * Type: Detaction/Non-Detaction) with personal submission history.</li>
              <li><strong>Strict Access Control:</strong> Employers cannot view the master Excel sheet or download files.</li>
              <li><strong>Admin Portal:</strong> Live interactive Excel spreadsheet view matching user wireframe, statistics, row deletion, and 1-click formatted Excel (.xlsx) download.</li>
              <li><strong>Full-Stack Architecture:</strong> Express REST backend + Vite React frontend + Vercel serverless integration ready.</li>
            </ul>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-white/40 backdrop-blur-xl border-t border-white/40 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
};
