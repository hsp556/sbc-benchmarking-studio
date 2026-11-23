// Runner: runs on the PC whose Chrome is logged in to the database. One process serves one database (RUNNER_AGENT).
// Asks the Studio for work, runs the database's script for each task, and reports back.
//   catalyst (default): search.mjs. A task is a search (stops at the company count, no credits) or an approved
//     export (rebuilds the search, then displays and exports the results).
//   prowess: prowess.mjs. One task does the whole search and both CSV exports; it spends Prowess hits, which the
//     person confirmed when starting the search in the Studio.
// Only outgoing connections are made.
//   node runner/runner.mjs        env: STUDIO_URL (default http://127.0.0.1:3000), RUNNER_AGENT, RUNNER_NAME, CHROME_PORT (9222),
//                                      RUNNER_TOKEN (needed when the Studio is on another PC),
//                                      SHAREPOINT_DIR (optional: synced SharePoint folder that gets a copy of each export)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STUDIO = (process.env.STUDIO_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const AGENT = process.env.RUNNER_AGENT ?? 'catalyst';
const DB = { catalyst: { script: 'search.mjs', site: 'bvdinfo.com', label: 'TP Catalyst' }, prowess: { script: 'prowess.mjs', site: 'prowess.cmie.com', label: 'Prowess' } }[AGENT];
if (!DB) { console.error(`RUNNER_AGENT must be catalyst or prowess, not "${AGENT}"`); process.exit(1); }
const NAME = process.env.RUNNER_NAME ?? (AGENT === 'catalyst' ? os.hostname() : `${os.hostname()}-${AGENT}`);
const PORT = process.env.CHROME_PORT ?? '9222';
const AUTH = process.env.RUNNER_TOKEN ? { authorization: `Bearer ${process.env.RUNNER_TOKEN}` } : {};
const SCRIPT = process.env.SEARCH_SCRIPT ?? DB.script; // tests swap in a stand-in that never touches the database
const SHARE = process.env.SHAREPOINT_DIR?.trim(); // a SharePoint library synced to this PC by OneDrive; empty = not used
const say = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// Copies an export into the synced SharePoint folder; OneDrive uploads it. Never overwrites: a second file of the same
// name gets the time added. The folder is not created here: a mistyped path would make a folder that syncs nowhere.
function saveToSharePoint(file) {
  if (!SHARE) return {};
  try {
    if (!fs.existsSync(SHARE)) throw new Error(`the folder "${SHARE}" does not exist on the runner PC`);
    const { name, ext } = path.parse(file);
    let to = path.join(SHARE, name + ext);
    if (fs.existsSync(to)) to = path.join(SHARE, `${name} ${new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')}${ext}`);
    fs.copyFileSync(file, to, fs.constants.COPYFILE_EXCL);
    return { sharedPath: to };
  } catch (e) {
    return { sharedError: `Not saved to SharePoint: ${e.message}`.slice(0, 500) };
  }
}

async function post(url, body) {
  const r = await fetch(STUDIO + url, { method: 'POST', headers: { 'content-type': 'application/json', ...AUTH }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  if (r.status === 204) return null;
  const data = await r.json();
  if (!r.ok) throw new Error(`${url}: ${r.status} ${data.message ?? ''}`);
  return data;
}

// What the browser is doing, read from Chrome's debugging port (no page is touched).
async function browserState() {
  let tabs;
  try { tabs = await (await fetch(`http://127.0.0.1:${PORT}/json`, { signal: AbortSignal.timeout(5000) })).json(); } catch { return { state: 'no_browser', detail: `Chrome is not running with debugging port ${PORT}` }; }
  const tab = tabs.find((t) => t.type === 'page' && t.url.includes(DB.site));
  if (!tab) return { state: 'no_browser', detail: `No ${DB.label} tab is open` };
  if (tab.url.includes('login.bvdinfo.com')) return { state: 'logged_out', detail: 'TP Catalyst is on the login page' };
  return { state: 'idle' };
}

async function runJob(job) {
  const isExport = job.task === 'export';
  say(`${isExport ? 'export' : 'search'} ${job.id} "${job.brief}"`);
  const dir = path.join(root, 'runs', '_queue');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${job.id}.json`);
  fs.writeFileSync(file, JSON.stringify(job.spec));
  const args = [SCRIPT, '--job', file, '--port', PORT, '--events', ...(AGENT === 'prowess' ? ['--go'] : []), ...(isExport ? ['--export', '--view', job.export_view, '--expect', String(job.total)] : [])];
  const child = spawn(process.execPath, args, { cwd: root });
  const beat = setInterval(() => post('/api/runner/heartbeat', { name: NAME, agent: AGENT, state: 'busy', detail: `${isExport ? 'Exporting: ' : ''}${job.brief}`.slice(0, 200) }).catch(() => {}), 20000);
  let end = null, lastLine = '', sending = Promise.resolve();
  const lines = readline.createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    if (!line.startsWith('@@')) { if (line.trim()) lastLine = line.trim(); return; }
    const e = JSON.parse(line.slice(2));
    if (e.type === 'end') { end = e; return; }
    // Steps are sent one after another so they arrive in order.
    sending = sending.then(() => post(`/api/runner/jobs/${job.id}/steps`, { kind: e.kind, text: e.text.slice(0, 2000), stepCount: e.stepCount, running: e.running }))
      .catch((err) => say(`could not report a step: ${err.message}`));
  });
  child.stderr.on('data', (d) => { lastLine = String(d).trim().split('\n').pop() || lastLine; });
  const code = await new Promise((res) => child.on('close', res));
  clearInterval(beat);
  await sending;
  fs.rmSync(file, { force: true });
  const ok = end?.status === 'done';
  const why = (end?.error ?? lastLine ?? `search script exited with code ${code}`).slice(0, 2000);
  if (!ok && !end?.spent && /logged out|not on an analysis page|No analysis is open/i.test(why)) {
    // Nothing was done in the database: give the task back so it runs once someone has logged in.
    await post(`/api/runner/jobs/${job.id}/release`, {});
    say(`${job.id} returned to the queue: ${why}`);
    await post('/api/runner/heartbeat', { name: NAME, agent: AGENT, state: 'logged_out', detail: why.slice(0, 300) }).catch(() => {});
    await new Promise((r) => setTimeout(r, 30000));
    return;
  }
  if (isExport) {
    let error = ok ? null : why;
    if (ok) { // hand the file to the Studio; a copy stays in this PC's runs folder
      const up = await fetch(`${STUDIO}/api/runner/jobs/${job.id}/file`, { method: 'POST', headers: { ...AUTH, 'content-type': 'application/octet-stream', 'x-file-name': path.basename(end.file) }, body: fs.readFileSync(end.file) });
      if (!up.ok) error = `The file was exported to ${end.file} on the runner PC but could not be uploaded to the Studio (${up.status})`;
    }
    const shared = ok ? saveToSharePoint(end.file) : {};
    if (shared.sharedPath) say(`saved to SharePoint folder: ${shared.sharedPath}`);
    if (shared.sharedError) say(shared.sharedError);
    await post(`/api/runner/jobs/${job.id}/export-finish`, { status: error ? 'failed' : 'done', ...(error && { error }), ...shared, creditsBefore: end?.creditsBefore ?? null, creditsAfter: end?.creditsAfter ?? null });
    say(`export ${job.id} ${error ? `failed: ${error}` : `done: ${path.basename(end.file)}`}`);
    return;
  }
  let shared = {};
  if (ok && end.files?.length) { // Prowess: the CSVs stay in runs/ on this PC and are copied to the synced folder for TAIGA
    const copies = end.files.map(saveToSharePoint);
    const paths = copies.map((c) => c.sharedPath).filter(Boolean), errors = copies.map((c) => c.sharedError).filter(Boolean);
    shared = { ...(paths.length && { sharedPath: paths.join(' | ').slice(0, 500) }), ...(errors.length && { sharedError: errors[0] }) };
    await post(`/api/runner/jobs/${job.id}/steps`, { kind: 'files', text: `${paths.length ? 'Copied to the shared folder' : 'Kept on the runner PC'}: ${(paths.length ? paths : end.files).join(' | ')}`.slice(0, 2000) }).catch((err) => say(`could not report a step: ${err.message}`));
  }
  const result = ok ? { status: 'done', total: end.total, boolean: end.boolean, ...shared } : { status: 'failed', error: why };
  await post(`/api/runner/jobs/${job.id}/finish`, result);
  say(`search ${job.id} ${ok ? `done: ${result.total} companies` : `failed: ${why}`}`);
}

say(`runner "${NAME}" for ${AGENT}, Studio at ${STUDIO}`);
for (;;) {
  try {
    const b = await browserState();
    await post('/api/runner/heartbeat', { name: NAME, agent: AGENT, ...b });
    const job = b.state === 'idle' ? await post('/api/runner/claim', { runner: NAME, agent: AGENT }) : null;
    if (job) { await runJob(job); continue; }
  } catch (e) {
    say(`Studio not reachable or request failed: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 5000));
}
