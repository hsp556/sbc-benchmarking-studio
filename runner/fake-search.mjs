// Stand-in for search.mjs in runner tests. Speaks the same "@@{json}" protocol and never opens a browser.
import fs from 'node:fs';
const job = JSON.parse(fs.readFileSync(process.argv[process.argv.indexOf('--job') + 1], 'utf8'));
const emit = (e) => console.log(`@@${JSON.stringify(e)}`);
if (job.job.includes('logout')) { console.log('TP Catalyst is logged out: log in again in the Chrome window, open the analysis, and rerun.'); process.exit(1); }
if (job.job.includes('crash')) { console.error('TypeError: something broke in the script'); process.exit(1); }
if (job.job.includes('zero')) {
  emit({ type: 'step', kind: 'regions', text: '2. Regions', stepCount: '0' });
  emit({ type: 'end', status: 'failed', error: 'Step "regions" matched 0 companies' });
  process.exit(1);
}
if (process.argv.includes('--export')) {
  const expect = Number(process.argv[process.argv.indexOf('--expect') + 1]);
  if (job.job.includes('drift')) { emit({ type: 'end', status: 'failed', total: expect + 5, error: `The count is now ${expect + 5}, not the ${expect} that was approved. No credit was spent: approve the export again.` }); process.exit(1); }
  const file = process.argv[process.argv.indexOf('--job') + 1].replace(/.json$/, ' export.xlsx');
  fs.writeFileSync(file, 'stand-in workbook');
  emit({ type: 'step', kind: 'export', text: 'Results displayed (credit balance before: 800)' });
  emit({ type: 'end', status: 'done', total: expect, file, creditsBefore: 800, creditsAfter: 799 });
  process.exit(0);
}
if (job.groups) { // a Prowess job: the whole search and both files in one task
  if (!process.argv.includes('--go')) { emit({ type: 'end', status: 'failed', error: 'run without --go' }); process.exit(1); }
  const base = process.argv[process.argv.indexOf('--job') + 1].replace(/.json$/, '');
  const files = ['companies', 'related parties'].map((n) => { const f = `${base} - ${n}.csv`; fs.writeFileSync(f, 'stand-in csv'); return f; });
  emit({ type: 'step', kind: 'industry', text: job.groups.join('; '), stepCount: '1,838' });
  emit({ type: 'end', status: 'done', total: 1838, files, spent: 4 });
  process.exit(0);
}
for (const kind of ['analysis', 'regions', 'financial']) emit({ type: 'step', kind, text: `step ${kind}`, stepCount: '1,000' });
emit({ type: 'end', status: 'done', total: 123, boolean: '1 and 2 and 3' });
