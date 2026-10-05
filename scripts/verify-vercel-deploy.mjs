/**
 * Pre-push checks mirroring Vercel: one API entry (api/index.ts), bundled handler in dist/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`✓ ${msg}`);
}

const apiDir = path.join(root, 'api');
const entries = fs.readdirSync(apiDir).filter((f) => !f.startsWith('.'));
if (!entries.includes('index.ts')) {
  fail('Missing api/index.ts (Vercel serverless entry).');
}
if (entries.includes('index.js')) {
  fail(
    'Remove api/index.js — Vercel conflicts index.ts + index.js (same route). Bundle is dist/api-server.js only.'
  );
}
ok('Single API entry: api/index.ts only');

const vercelPath = path.join(root, 'vercel.json');
let vercel;
try {
  vercel = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));
} catch (e) {
  fail(`Invalid vercel.json: ${e.message}`);
}
if (!vercel.functions?.['api/index.ts']) {
  fail('vercel.json must configure functions["api/index.ts"].');
}
if (vercel.rewrites?.some((r) => r.source?.startsWith('/api') && r.destination !== '/api')) {
  fail('API rewrite destination must be "/api", not "/api/index.ts".');
}
ok('vercel.json: api/index.ts + /api rewrite');

console.log('\nRunning npm run build…');
const build = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: true });
if (build.status !== 0) fail('npm run build failed');

const bundle = path.join(root, 'dist', 'api-server.js');
if (!fs.existsSync(bundle)) {
  fail('dist/api-server.js missing after build (esbuild api bundle step).');
}
ok('dist/api-server.js created');

if (fs.existsSync(path.join(apiDir, 'index.js'))) {
  fail('Build must not write api/index.js — output belongs in dist/api-server.js only.');
}
ok('Build did not create api/index.js');

console.log('\nLoading api/index.ts…');
const load = spawnSync(
  'node',
  ['--import', 'tsx', '-e', "import('./api/index.ts').then(m => { if (typeof m.default !== 'function') throw new Error('default export must be Express app'); console.log('API entry load OK'); })"],
  { cwd: root, stdio: 'inherit' }
);
if (load.status !== 0) fail('api/index.ts failed to load dist/api-server.js');

console.log('\nAll Vercel deploy checks passed.\n');
