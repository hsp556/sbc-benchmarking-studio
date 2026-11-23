// Command-line planner: writes jobs/<name>.json from a brief. The Studio uses planner.mjs directly.
//   node planner/plan.mjs "industry: ...; function: ...; FY 2025; region: ..."
import fs from 'node:fs';
import path from 'node:path';
import { planBrief } from './planner.mjs';

const brief = process.argv.slice(2).join(' ').trim();
if (!brief) { console.error('Usage: node planner/plan.mjs "<industry, function, financial year, region>"'); process.exit(1); }
try {
  const { spec, notes } = await planBrief(brief);
  const job = { ...spec, export: { view: '2025', spendCredits: false }, ...notes };
  fs.mkdirSync('jobs', { recursive: true });
  const file = path.join('jobs', `${job.job}.json`);
  fs.writeFileSync(file, JSON.stringify(job, null, 1));
  console.log(JSON.stringify(job, null, 1));
  console.log(`\nSaved ${file}. Review it, then run: node search.mjs --job ${file}`);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
