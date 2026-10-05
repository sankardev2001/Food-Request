/** True when Node was started with this script as the entry (npm run seed / tsx), not when imported from server.cjs. */
export function isDirectScriptRun(scriptFileName: string): boolean {
  const entry = (process.argv[1] ?? '').replace(/\\/g, '/');
  return entry.endsWith(`/${scriptFileName}`) || entry.endsWith(scriptFileName);
}
