// Live acceptance runs: each brief is planned and run through the Studio, then the Studio's total is compared with
// the count on the TP Catalyst screen. Needs the Studio, the runner and a logged-in TP Catalyst. Spends no credits.
//   node studio/acceptance.mjs
import { chromium } from 'playwright-core';

const base = 'http://127.0.0.1:3000';
const BRIEFS = [
  'industry: household appliances; function: distributor; FY 2025; region: Eastern Europe, Middle East, Africa, MENA, United Arab Emirates',
  'industry: paints, varnishes and coatings; function: manufacturer; FY 2025; region: Eastern Europe, Middle East, Africa, MENA, United Arab Emirates',
  'industry: software development and IT support; function: service provider; FY 2025; region: India, Far East and Central Asia',
  'industry: plastic packaging; function: manufacturer; FY 2025; region: Western Europe, Eastern Europe',
  'industry: fruits and vegetables; function: wholesale and retail distribution; FY 2025; region: Eastern Europe, Middle East, Africa, MENA, United Arab Emirates',
];
const json = (body) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
async function siteCount() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  try {
    const page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes('bvdinfo.com'));
    return Number((await page.locator('#records-count').innerText({ timeout: 15000 })).replace(/[^\d]/g, ''));
  } catch { return null; } finally { await browser.close(); }
}

let bad = 0;
for (const brief of BRIEFS) {
  const started = Date.now();
  const lines = (await (await fetch(`${base}/api/plan`, json({ brief }))).text()).trim().split('\n').map((l) => JSON.parse(l));
  const plan = lines.at(-1).result;
  if (!plan) { console.log(`FAIL  no plan: ${lines.at(-1).error}\n      ${brief}`); bad += 1; continue; }
  const job = await (await fetch(`${base}/api/jobs`, json({ agent: 'catalyst', brief, spec: plan.spec, createdBy: 'acceptance run' }))).json();
  let j;
  do { await new Promise((r) => setTimeout(r, 10000)); j = await (await fetch(`${base}/api/jobs/${job.id}`)).json(); } while (['queued', 'running'].includes(j.status) && Date.now() - started < 12 * 60000);
  const site = j.status === 'done' ? await siteCount() : null;
  const ok = j.status === 'done' && site === j.total;
  bad += ok ? 0 : 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${Math.round((Date.now() - started) / 1000)}s  Studio ${j.total ?? '-'}  site ${site ?? '-'}  steps ${j.steps.length}  ${j.status}${j.error ? `: ${j.error}` : ''}\n      ${brief.slice(0, 110)}\n      nace ${plan.spec.nace} | usSic ${plan.spec.usSic} | naics ${plan.spec.naics} | keywords ${plan.spec.text.length}`);
}
console.log(`\n${BRIEFS.length - bad} of ${BRIEFS.length} runs matched the site`);
process.exitCode = bad ? 1 : 0;
