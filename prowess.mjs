// Runs one Prowess (CMIE) search from a job file in the logged-in Chrome window and saves the two CSV exports.
// The procedure is the one confirmed on 18 Nov 2026 (sop/prowess-notes.md): industry groups to a new company sheet,
// identity columns, three years of financials, related-party worksheet, then "Export as excel csv" for both.
// Every Execute click spends Prowess hits: this script clicks exactly four, never repeats one, and without --go
// it only fills the forms (free) so the selections can be checked.
//   node prowess.mjs --job jobs/<name>.json [--go] [--port 9222] [--out runs] [--events]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const go = process.argv.includes('--go');
const job = JSON.parse(fs.readFileSync(arg('job'), 'utf8'));
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = path.resolve(arg('out', 'runs'), `${job.job}-${stamp}`);
fs.mkdirSync(outDir, { recursive: true });
const log = { job, started: new Date().toISOString(), steps: [], files: [] };
const emit = (e) => { if (process.argv.includes('--events')) console.log(`@@${JSON.stringify(e)}`); };
const step = (kind, text, stepCount) => { console.log(`  ${kind}: ${text}${stepCount ? ` (${stepCount})` : ''}`); log.steps.push({ kind, text, stepCount }); emit({ type: 'step', kind, text, stepCount }); };

const IDENTITY = ['NIC code', 'NIC name', 'Industry type', 'Industry group', 'Main product/service group'];
const FINANCIALS = ['Year', 'Months', 'Total income', 'Total expenses', 'Income from non-financial operations', 'Net worth', 'PBT', 'Export as (%) of Sales'];
const RELATED = ['Total revenue receipts/income as % of Total income', 'Total revenue expenses/payments as % of Total expenses'];
const HOME = 'https://prowess.cmie.com/';
const PROFILE = `${HOME}kommon/bin/sr.php?kall=wuserdet&tab=1000`;

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${arg('port', '9222')}`);
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url() === HOME);
const stop = async (message) => { console.log(message); await browser.close(); process.exit(1); };
if (!page) await stop('Prowess is logged out or not open: open https://prowess.cmie.com in the Chrome window, log in, and rerun.');
page.setDefaultTimeout(20000);
const wait = (ms) => page.waitForTimeout(ms);
let spent = 0; // Execute clicks made. Once above 0 the task must never be handed back or repeated.

// Hits allowed and consumed, from the profile page in its own tab (free).
async function hits() {
  const prof = ctx.pages().find((p) => p.url().includes('kall=wuserdet')) ?? await ctx.newPage();
  await prof.goto(PROFILE, { waitUntil: 'domcontentloaded' });
  await prof.waitForTimeout(1500);
  const m = await prof.evaluate(() => document.body.innerText.match(/Maximum hits allowed\s+(\d+)\s+Hits consumed\s+(\d+)/));
  await page.bringToFront();
  return m ? { allowed: +m[1], consumed: +m[2] } : null;
}
// The newest row of Commands History and Planner: the command text, its status, company count and sheets.
async function lastCommand() {
  await page.getByText('Commands History and Planner', { exact: true }).first().click();
  await wait(3500);
  const rows = await page.evaluate(() => [...document.querySelectorAll('tr')].filter((r) => r.offsetParent && r.children.length >= 6)
    .map((r) => [...r.children].map((c) => (c.getAttribute('title') || c.innerText).replace(/\s+/g, ' ').trim())).filter((r) => r[0].includes('-trig{')));
  const r = rows.at(-1);
  return r ? { cmd: r[0], status: r[1], error: r[2], ended: r[4], count: r[5], sheet: r[6], ws: r[7] ?? '', key: `${rows.length}|${r[0]}|${r[4]}` } : { key: '0' };
}
async function open(btn, cct) {
  if (!(await page.locator('#btn1').isVisible())) { await page.getByText('Query Builder', { exact: true }).first().click(); await wait(2500); }
  if (!(await page.locator(`#${cct}`).isVisible())) { await page.locator(`#${btn}`).click(); await wait(1200); }
  await page.locator(`#${cct}`).click();
  await wait(4500);
}
// Ticks tree nodes by exact label (one direct DOM lookup: the trees are too big for :has selectors). `scope` is a
// CSS prefix for the tree, or '' for the visible form.
const tickTree = (scope, labels) => page.evaluate(([s, ls]) => ls.map((label) => {
  const spans = [...document.querySelectorAll(`${s} span.node_text`)].filter((e) => e.textContent.trim() === label && (s || !e.closest('[id^=t28_],[id^=t54_]')));
  if (spans.length !== 1) return `"${label}" was found ${spans.length} times`;
  const cb = spans[0].closest('tr').querySelector('input.tree_cbox');
  if (!cb.checked) cb.click();
  return cb.checked ? null : `"${label}" could not be ticked`;
}).filter(Boolean), [scope, labels]);
// Ticks rows of a flat list (identity indicators, party types) by exact label and returns how many are ticked in all.
const tickRows = (labels) => page.evaluate((ls) => {
  const rows = [...document.querySelectorAll('td.search_node_text')].filter((e) => e.offsetParent);
  const problems = ls.map((label) => {
    const tds = rows.filter((e) => e.textContent.trim() === label);
    if (tds.length !== 1) return `"${label}" was found ${tds.length} times`;
    const cb = tds[0].parentElement.querySelector('input[type=checkbox]');
    if (!cb.checked) cb.click();
    return cb.checked ? null : `"${label}" could not be ticked`;
  }).filter(Boolean);
  return { problems, ticked: rows.filter((e) => e.parentElement.querySelector('input[type=checkbox]')?.checked).length };
}, labels);
// The "(n)" or "(n/m)" counter the form shows beside a heading such as "Selected Indicator".
const counter = (heading) => page.evaluate((h) => {
  const hit = [...document.querySelectorAll('th,td,div,span')].filter((e) => e.offsetParent && e.children.length <= 3)
    .map((e) => e.innerText.trim().replace(/\s+/g, ' ')).find((t) => t.startsWith(h) && /\((\d+)(\/\d+)?\)$/.test(t));
  return hit ? Number(hit.match(/\((\d+)(\/\d+)?\)$/)[1]) : null;
}, heading);
const must = (ok, message) => { if (!ok) throw new Error(message); };
// Opens the sheet tabs and waits for this sheet's tab. The "New Outputs" counter lags behind the history, so a click
// made at once can do nothing (this stopped the first Studio run after one Execute): keep trying, the clicks are
// free, for up to 90 seconds. Only works for sheets made since the page was loaded: after a reload the sheet tabs
// are empty and an older sheet has to be fetched from Commands History (not done here: cost unknown).
async function openSheet(sheet) {
  for (const end = Date.now() + 90000; ;) {
    const state = await page.evaluate((n) => ({
      tab: [...document.querySelectorAll('li')].some((e) => e.offsetParent && e.textContent.trim().endsWith(n)),
      fresh: Number(document.body.innerText.match(/New Outputs: (\d+)/)?.[1] ?? 0),
    }), sheet);
    if (state.tab) return;
    must(Date.now() < end, `Sheet ${sheet} did not open in Prowess within 90 seconds. It is still in the account.`);
    if (state.fresh > 0) await page.locator('#nav_new_output').click(); else await page.getByText('OSC & Worksheets', { exact: true }).first().click();
    await wait(5000);
  }
}

// Clicks one Execute button, once, and waits for its row in the history. `before` is lastCommand() read before the form was filled.
async function execute(kind, buttonId, trig, before, describe) {
  if (!go) { step(kind, `${describe} [form filled, not run]`); await page.screenshot({ path: path.join(outDir, `${kind}-form.png`) }); return null; }
  await page.screenshot({ path: path.join(outDir, `${kind}-form.png`) });
  await page.locator(`#${buttonId}`).click({ timeout: 8000 });
  spent += 1;
  for (const end = Date.now() + 15 * 60000; ;) {
    await wait(6000);
    const row = await lastCommand();
    if (row.key !== before.key && row.cmd?.includes(`-trig{${trig}}`) && (row.status === 'OK' || row.error)) {
      must(row.status === 'OK', `Prowess reported "${row.status} ${row.error}" for ${describe}`);
      step(kind, describe, row.count);
      return row;
    }
    must(Date.now() < end, `No result after 15 minutes for ${describe}. Check Commands History in Prowess before running again: the click was made.`);
  }
}

let failed = null;
try {
  // A fresh page: the forms keep old ticks and range values while the page stays open.
  await page.bringToFront();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await wait(5000);
  must(!(await page.locator('input[type=password]').first().isVisible().catch(() => false)) && await page.getByText('Query Builder', { exact: true }).first().isVisible().catch(() => false),
    'Prowess is logged out: log in again in the Chrome window, and rerun.');
  const hitsBefore = await hits();
  log.hitsBefore = hitsBefore?.consumed ?? null;
  step('start', `Prowess hits consumed before the run: ${hitsBefore ? `${hitsBefore.consumed.toLocaleString('en')} of ${hitsBefore.allowed.toLocaleString('en')}` : 'not readable'}`);
  must(await page.locator('#cp_currency').inputValue().catch(() => 'RSCRORE') === 'RSCRORE' || !(await page.locator('#cp_currency').isVisible()), 'The currency is not Rs. Crore: set it in Prowess first.');

  // 1. Industry: tick the product/service groups, all companies, new company sheet.
  let before = await lastCommand();
  await open('btn7', 'CCt54');
  let problems = await tickTree('#t54_td_r2c1_tree_T', job.groups);
  must(!problems.length, `Industry groups not found in Prowess exactly as written: ${problems.join('; ')}. Nothing was run.`);
  must(await counter('Selected Products/Services (CMIE)') === job.groups.length && !(await counter('Selected Products/Services (NIC)')), 'The industry form shows a different selection from the plan. Nothing was run.');
  await page.locator('#rp_all_t54').check();
  await page.locator('#rp_OSC_t54').check();
  const osc = await execute('industry', 'submit_t54NEW', 't54', before, `Main product/service group: ${job.groups.join('; ')} → new company sheet`);
  if (osc) {
    log.total = Number(osc.count.replace(/\D/g, ''));
    must(log.total > 0, 'The industry groups matched no companies.');
    // The new sheet must be the current one before data is added to it (its tab is blue when current).
    await openSheet(osc.sheet);
    const current = await page.evaluate((n) => { const li = [...document.querySelectorAll('li')].find((e) => e.offsetParent && e.textContent.trim().endsWith(n)); if (!li) return null; const [r, , b] = getComputedStyle(li).color.match(/\d+/g).map(Number); return b > r + 80; }, osc.sheet);
    must(current, `The new sheet ${osc.sheet} is not the current sheet in Prowess, so data cannot be added to it safely.`);
  }

  // 2. Identity columns.
  before = await lastCommand();
  await open('btn2', 'CCt10');
  let rows = await tickRows(IDENTITY);
  must(!rows.problems.length && rows.ticked === IDENTITY.length, `The identity form is not as expected: ${rows.problems.join('; ') || `${rows.ticked} fields ticked`}.`);
  await page.locator('#rp_curr_t10').check();
  await execute('identity', 'submit_t10ADDCOL', 't10', before, `Identity columns added: ${IDENTITY.join(', ')}`);

  // 3. Financials for the years, standalone, no ranges.
  const range = `${job.fromYear}03-${job.toYear}03`;
  before = await lastCommand();
  await open('btn5', 'CCt28');
  problems = await tickTree('#t28_td_r1c1_tree_T', FINANCIALS);
  must(!problems.length && await counter('Selected Indicator') === FINANCIALS.length, `The financials form is not as expected: ${problems.join('; ') || 'a different number of indicators is selected'}.`);
  await page.locator('#t28_queryondate').fill(range);
  await page.locator('#rp_curr_t28').check();
  await page.locator('#rp_OSC_t28').check();
  const fin = await execute('financials', 'submit_t28ADDCOL', 't28', before, `Financials added for ${range} (Rs. Crore, standalone): ${FINANCIALS.join(', ')}`);
  if (fin) must(/Net worth\|S\|\|\|/.test(fin.cmd), 'A range value was applied to the financials, so companies may have been filtered. Check the sheet in Prowess.');

  // 4. Related parties for one year, to a new worksheet.
  before = await lastCommand();
  await open('btn4', 'CCt27');
  rows = await tickRows(['All Party Types']);
  problems = await tickTree('', RELATED);
  must(!rows.problems.length && rows.ticked === 1 && !problems.length && await counter('Select Indicator') === RELATED.length, `The related-party form is not as expected: ${[...rows.problems, ...problems].join('; ') || 'a different selection is ticked'}.`);
  await page.locator('#t27_queryondate').fill(`${job.rptYear}03`);
  await page.locator('#rp_curr_t27').check();
  await page.locator('#rp_WS_t27').check();
  const ws = await execute('related', 'submit_t27NEW', 't27', before, `Related-party percentages for ${job.rptYear}03, all party types → new worksheet`);

  // 5. Export both sheets as CSV (measured at 0 hits). Over CDP the download must be caught and saved here.
  if (osc && ws) {
    for (const [sheet, name] of [[osc.sheet, 'companies'], [ws.ws, 'related parties']]) {
      await openSheet(sheet);
      const tab = await page.evaluate((n) => { const l = [...document.querySelectorAll('label')].find((e) => e.offsetParent && e.textContent.trim().endsWith(n)); if (!l) return null; const r = l.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sheet);
      must(tab, `Sheet ${sheet} is not open in Prowess, so it was not exported. It is still in the account.`);
      await page.mouse.click(tab.x, tab.y);
      await wait(5000);
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.locator(`#menu_dcsv_${sheet}`).click({ timeout: 8000 })]);
      const file = path.join(outDir, `${job.job} - ${name}.csv`);
      await dl.saveAs(file);
      log.files.push(file);
      step('export', `${sheet} exported: ${path.basename(file)} (${Math.round(fs.statSync(file).size / 1024).toLocaleString('en')} KB)`);
    }
  }
  const hitsAfter = await hits();
  log.hitsAfter = hitsAfter?.consumed ?? null;
  if (go) step('hits', `Prowess hits consumed after the run: ${hitsAfter?.consumed.toLocaleString('en') ?? 'not readable'}${hitsBefore && hitsAfter ? ` (this run: ${hitsAfter.consumed - hitsBefore.consumed})` : ''}`);
} catch (e) {
  failed = e;
  log.error = `${e.message.split('\n')[0]}${spent ? ` (${spent} Execute click${spent > 1 ? 's were' : ' was'} made before this; do not rerun without checking Prowess)` : ''}`;
  console.log(log.error);
  await page.screenshot({ path: path.join(outDir, 'error.png') }).catch(() => {});
}
log.finished = new Date().toISOString();
log.spent = spent;
fs.writeFileSync(path.join(outDir, 'run.json'), JSON.stringify(log, null, 1));
emit({ type: 'end', status: failed ? 'failed' : 'done', total: log.total, error: log.error, files: log.files, spent, hitsBefore: log.hitsBefore, hitsAfter: log.hitsAfter });
console.log(failed ? 'FAILED' : go ? `done: ${log.total} companies, ${log.files.length} files in ${outDir}` : `forms checked, nothing run: ${outDir}`);
await browser.close();
process.exit(failed ? 1 : 0);
