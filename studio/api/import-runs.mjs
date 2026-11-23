// One-off: brings successful command-line runs (runs/<job>-<time>/run-log.json) into the Studio's job list.
//   node studio/api/import-runs.mjs --before 2026-11-17T06:00     (only runs started before that time)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from './db.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const i = process.argv.indexOf('--before');
const before = i > 0 ? Date.parse(process.argv[i + 1]) : Infinity;
const store = openStore(path.join(root, 'studio', 'data', 'studio.db'));
let added = 0, skipped = 0;
for (const dir of fs.readdirSync(path.join(root, 'runs'))) {
  const file = path.join(root, 'runs', dir, 'run-log.json');
  if (!fs.existsSync(file)) continue;
  const log = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (log.error || !Number.isInteger(log.total) || !log.rows || !(Date.parse(log.started) < before)) { skipped += 1; continue; }
  const ok = store.importRun({ id: `run-${dir}`, brief: log.job.brief || log.job.job, spec: log.job, started: log.started, finished: log.finished, total: log.total, boolean: log.boolean ?? null, rows: log.rows.slice(1) });
  console.log(`${ok ? 'added  ' : 'present'} ${dir}  ${log.total}`);
  added += ok ? 1 : 0;
}
console.log(`${added} added, ${skipped} skipped (failed, unfinished or too recent)`);
store.close();
