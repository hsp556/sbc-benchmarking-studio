// Builds a TP Catalyst search from a job file in the logged-in Chrome window and stops at the company count.
// No credits are spent: this script never opens the results list.
//   node search.mjs --job jobs/<name>.json [--port 9222] [--out runs]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const job = JSON.parse(fs.readFileSync(arg('job'), 'utf8'));
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = path.resolve(arg('out', 'runs'), `${job.job}-${stamp}`);
fs.mkdirSync(outDir, { recursive: true });
const log = { job, started: new Date().toISOString(), steps: [] };
const say = (...a) => console.log(...a);
// With --events, progress is also printed as "@@{json}" lines for the runner to forward to the Studio.
const emit = (e) => { if (process.argv.includes('--events')) console.log(`@@${JSON.stringify(e)}`); };
// With --export (after approval in the Studio) the search is rebuilt, checked against --expect, then displayed and
// exported with --view. This is the only path that spends credits.
const exporting = process.argv.includes('--export');

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${arg('port', '9222')}`);
const page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes('bvdinfo.com'));
if (!page) throw new Error('No TP Catalyst tab found: log in first in the Chrome window');
page.setDefaultTimeout(45000);
const base = page.url().match(/^https:\/\/[^/]+\/[^/]+\/tpcatalyst\/\d+\/Companies/)?.[0];
if (!base) {
  console.log(page.url().includes('login.bvdinfo.com')
    ? 'TP Catalyst is logged out: log in again in the Chrome window, open the analysis, and rerun.'
    : `The TP Catalyst tab is not on an analysis page: ${page.url()}`);
  await browser.close();
  process.exit(1);
}

const settle = async () => {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(1200);
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
};
let loggedOut = false, noAnalysis = false;
// Opens an address, retrying on the site's gateway errors. Safe to repeat: opening a page changes nothing.
async function go(addr, readySelector) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await page.goto(base + addr, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await settle();
      if (page.url().includes('login.bvdinfo.com')) { loggedOut = true; throw new Error('logged out'); }
      // With no analysis open the site sends every search address back to the home page. Retrying cannot help.
      if (!page.url().includes('/SearchExpert')) { noAnalysis = true; throw new Error('no analysis'); }
      await page.waitForSelector(readySelector, { timeout: 30000 });
      return;
    } catch (e) {
      if (loggedOut || page.url().includes('login.bvdinfo.com')) throw new Error('TP Catalyst is logged out: log in again in the Chrome window, open the analysis, and rerun');
      if (noAnalysis) throw new Error('No analysis is open in TP Catalyst: open or create the analysis in the Chrome window, and rerun');
      if (attempt === 3) throw new Error(`Could not open ${addr}: ${e.message.split('\n')[0]}`);
      say(`  retry ${attempt} opening ${addr}`);
      await page.waitForTimeout(15000);
    }
  }
}
// Every job gets its own analysis, named after the search. The form is submitted once only: a repeat would
// create a second analysis.
async function createAnalysis() {
  const name = `${job.job} ${stamp.slice(0, 16).replace('T', ' ')}`;
  for (let attempt = 1; ; attempt += 1) { // opening the empty form is safe to repeat
    await page.goto(`${base}/Analysis/CreateAnalysis`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await settle();
    if (page.url().includes('login.bvdinfo.com')) throw new Error('TP Catalyst is logged out: log in again in the Chrome window, and rerun');
    if (await page.locator('#analysisname').isVisible().catch(() => false)) break;
    if (attempt === 3) throw new Error('Could not open the Create analysis form');
    await page.waitForTimeout(15000);
  }
  await page.fill('#analysisname', name);
  await page.click("label[name='SkipTested']");
  await page.fill('#CutOffDate', job.closingDate ?? '31/12');
  await page.click('input[type=submit].button.ok');
  await page.waitForURL(/\/SearchExpert/, { timeout: 90000 });
  await settle();
  say(`analysis: ${name}`);
  return name;
}
const rows = () => page.evaluate(() => [...document.querySelectorAll('table.search-summary tbody tr[data-index]')].map((r) => {
  const c = [...r.cells].map((x) => x.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean);
  return { n: Number(r.getAttribute('data-index')) + 1, text: c[0].replace(/ Show more$/, ''), stepCount: c[1], running: c[2] };
}));
const total = async () => Number((await page.locator('#records-count').innerText()).replace(/[^\d]/g, ''));

// Sets a tick box or radio (found by name and value) to the wanted state by clicking its label.
async function tick(name, value, on = true) {
  const input = page.locator(`#main-content input[name='${name}'][value='${value}']`);
  if ((await input.isChecked()) !== on) await page.locator(`label[for='${await input.getAttribute('id')}']`).click();
  await page.waitForTimeout(400);
}
async function pickFromTree(text, selector) {
  const hit = page.locator(`${selector}:visible`).first();
  for (let attempt = 1; ; attempt += 1) {
    if (attempt > 1) { await page.fill('input[name=freetext]:visible', ''); await page.waitForTimeout(2000); }
    await page.fill('input[name=freetext]:visible', text);
    try { await hit.waitFor({ state: 'visible', timeout: 25000 }); break; } catch (e) {
      if (attempt === 3) throw new Error(`"${text}" was not found in the list (check the name or code)`);
    }
  }
  await hit.click();
  await page.waitForTimeout(1200);
}
// Presses OK on a criterion screen and returns the search-page rows it added.
async function ok(before) {
  const btn = page.locator("a.button.ok:text-is('OK')");
  await page.waitForFunction(() => [...document.querySelectorAll('a.button.ok')].some((a) => a.innerText.trim() === 'OK' && !a.classList.contains('disabled')), null, { timeout: 240000 }); // multi-year financial counts are slow
  const chosen = (await page.locator('#main-content h4').first().innerText()).trim();
  await btn.click();
  await page.waitForURL(/\/SearchExpert\/?(\?.*)?$/, { timeout: 60000 });
  await settle();
  const after = await rows();
  const added = after.slice(before.length);
  if (!added.length) throw new Error('OK was pressed but no search step was added');
  return { chosen, added };
}

const HAS = { website: 'AllCompaniesWithWebsiteAddressSM', overview: 'AllCompaniesWithOverview', tradeDescription: 'AllCompaniesWithTradeDescription' };
const INDEP = { A: 'a', B: 'b', C: 'c', D: 'DKey', U: 'UKey' };
const STATUS = { Active: 'ActiveRootKeys', Inactive: 'InactiveRootKeys', Unknown: 'UnknownSituationKeys' };
const SCHEME = { nace: 'Nace', usSic: 'UsSic', naics: 'Naics' };

const blocks = {
  async regions(names) {
    await go('/SearchExpert/By/CountryRegion', 'input[name=freetext]');
    for (const n of names) await pickFromTree(n, `li[data-id] div[title='${n}'] span.selector`);
  },
  async accountType(v) {
    await go('/SearchExpert/By/AccountType', 'input[name=picklist]');
    await tick('picklist', `${v}Keys`);
  },
  async status(values) {
    await go('/SearchExpert/By/Status', 'li[data-id]');
    for (const v of values) { await page.locator(`li[data-id='${STATUS[v]}'] span.selector`).first().click(); await page.waitForTimeout(800); }
  },
  async independence(values) {
    await go('/SearchExpert/By/IndependenceIndicator', 'input[name=values]');
    for (const [k, v] of Object.entries(INDEP)) await tick('values', v, values.includes(k));
  },
  async companiesWith(values) {
    await go('/SearchExpert/By/TPAllCompaniesWith', 'input[name=ids]');
    for (const v of values) await tick('ids', HAS[v]);
  },
  async financial(f) {
    await go('/SearchExpert/By/TPGlobalStandardFormat', '#tab-FinancialItem');
    await page.click('#tab-FinancialItem');
    await page.waitForTimeout(1500);
    await page.locator("li[data-id='PROFIT_LOSS_ACCOUNT_IND_IND']").first().click();
    await page.waitForTimeout(1500);
    await page.locator('#main-content label').filter({ hasText: new RegExp(`^\\s*${f.item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) }).first().click();
    // Order matters: the value must be typed (real keystrokes) before the years are chosen,
    // otherwise the site never produces a count and OK stays disabled.
    await page.click('#tab-Financials');
    await page.waitForTimeout(1500);
    await page.selectOption('#unit', { label: f.unit ?? 'million' });
    await page.selectOption('#currency', { label: f.currency ?? 'USD' });
    for (const [box, value] of [['minValue', f.min], ['maxValue', f.max]]) {
      if (value == null) continue;
      await page.locator(`input[name=${box}]`).click();
      await page.keyboard.type(String(value), { delay: 150 });
      await page.keyboard.press('Tab');
    }
    await page.waitForTimeout(3000);
    await page.click('#tab-TimePeriod');
    await page.waitForTimeout(1500);
    await tick('time', 'year-0', false); // "Last available year" is pre-ticked on the Relative list
    await page.locator("#main-content a:text-is('Absolute')").click();
    await page.waitForTimeout(1200);
    for (const y of job.years) await tick('time', `year-${y}`);
    await tick('choiceOfValidation', job.yearRule === 'all' ? 'AllYears' : 'AtLeastOneYear');
  },
  async industry({ scheme, codes }) {
    await go('/SearchExpert/By/IndustryClassificationsTP', `#tab-${SCHEME[scheme]}`);
    const tab = page.locator(`#tab-${SCHEME[scheme]}`);
    if (!/selected/.test((await tab.getAttribute('class')) ?? '')) { await tab.click(); await settle(); }
    for (const c of codes) await pickFromTree(c, `li[data-id='${c}'] span.selector`);
  },
  async text(query) {
    await go('/SearchExpert/By/TradeDescriptionLucene', 'textarea#text');
    await page.fill('textarea#text', query);
    await page.locator("a.button.ok:text-is('Search')").click();
    await settle();
  },
};

// Paid part, run only with --export. Every click that spends a credit is made once: nothing here is retried.
// It reads the credit balance and saves the file; it never reads company rows.
let spending = false; // true once a credit-spending click has been made: from then on the run is never handed back for a rerun
async function exportResults() {
  const expect = Number(arg('expect')), view = arg('view', '2025');
  const note = (text) => { say(`  export: ${text}`); emit({ type: 'step', kind: 'export', text }); };
  if (!(log.total > 0)) throw new Error('Nothing to export: the search matched 0 companies');
  if (log.total > 10000) throw new Error(`The results list refuses more than 10,000 companies (this search has ${log.total})`);
  if (log.total !== expect) throw new Error(`The count is now ${log.total}, not the ${expect} that was approved. No credit was spent: approve the export again.`);
  note(`Search rebuilt: ${log.total} companies, as approved`);
  const balance = async (scope) => Number((await scope.locator('p.creditBalanceMsg b').first().innerText({ timeout: 10000 }).catch(() => '')).replace(/[^\d]/g, '')) || null;

  await page.goto(`${base}/List`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await settle();
  await page.locator('div.creditResults').first().waitFor({ state: 'visible', timeout: 45000 });
  log.creditsBefore = await balance(page);
  const paid = page.locator("input[name=ViewFormat][value='current']").first(); // the paid view; the script picks it explicitly
  const paidLabel = page.locator(`label[for='${await paid.getAttribute('id')}']`);
  if (await paidLabel.count()) await paidLabel.first().click(); else await paid.check({ force: true });
  spending = true;
  await page.click('#okLink');
  await page.locator("a:text-is('Excel')").waitFor({ state: 'visible', timeout: 120000 });
  note(`Results displayed (credit balance before: ${log.creditsBefore ?? 'not shown'})`);

  await page.click("a:text-is('Excel')");
  const dlg = page.locator('.popup__dialog.export');
  await dlg.waitFor({ state: 'visible', timeout: 30000 });
  await dlg.locator("select[name='component.SelectedFormatId']").selectOption({ label: view }).catch(() => { throw new Error(`The export view "${view}" does not exist in TP Catalyst. A credit was spent on displaying the results.`); });
  await dlg.locator("select[name='component.RangeOptionSelectedId']").selectOption('All');
  const download = page.waitForEvent('download', { timeout: 600000 });
  download.catch(() => {}); // reported below if it never arrives
  await dlg.locator('a.button.submit.ok').click();
  // The first Export request is refused and a second credit warning opens; confirm it once.
  const second = page.locator('.popup').filter({ has: page.locator('.creditResults') }).last();
  if (await second.waitFor({ state: 'visible', timeout: 30000 }).then(() => true, () => false)) {
    log.creditsAfter = await balance(second); // the balance after the display charge, before the export charge
    await second.locator("label:has-text('Use 1 credit')").click();
    await second.locator("a:text-is('OK'), button:text-is('OK')").first().click();
  }
  note('Export requested; waiting for the file');
  const file = await download.catch(() => { throw new Error('No file arrived within 10 minutes. Credits were spent: check the Exports area in TP Catalyst before trying again.'); });
  // The file is named after the industry and the function in the brief (user decision); the job name is the fallback.
  const part = (k) => (job.brief ?? '').match(new RegExp(`${k}:\\s*([^;]+)`, 'i'))?.[1].replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  const named = [part('industry'), part('function')].filter(Boolean).join(' - ').slice(0, 120);
  log.exportFile = path.join(outDir, `${named || job.job}.xlsx`);
  await file.saveAs(log.exportFile);
  note(`File saved: ${path.basename(log.exportFile)} (${Math.round(fs.statSync(log.exportFile).size / 1024)} KB)`);
}

// The job lists what to search for; the plan below fixes the order and how groups combine.
const plan = [
  ['regions', job.regions, 'and'], ['accountType', job.accountType, 'and'], ['status', job.status, 'and'],
  ['independence', job.independence, 'and'], ['companiesWith', job.companiesWith, 'has'],
  ...job.financials.map((f) => ['financial', f, 'and']),
  ...['nace', 'usSic', 'naics'].filter((s) => job[s]?.length).map((s) => ['industry', { scheme: s, codes: job[s] }, 'activity']),
  ...(job.text ?? []).map((q) => ['text', q, 'activity']),
];

let failed = null;
try {
  const analysis = await createAnalysis();
  log.analysis = analysis;
  if (!exporting) emit({ type: 'step', kind: 'analysis', text: `New analysis "${analysis}", accounts closing date ${job.closingDate ?? '31/12'}` });
  await go('/SearchExpert', '#records-count');
  if ((await rows()).length > 1) {
    await page.locator("a:text-is('Clear search steps')").click();
    await page.waitForTimeout(1500);
    const confirm = page.locator(".popup a.button.ok, .popup button.ok").filter({ hasText: /./ }).first();
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
    await settle();
    if ((await rows()).length > 1) throw new Error('Could not clear the previous search steps');
  }
  const groups = { and: [1], has: [], activity: [] };
  const activity = { nace: [], usSic: [], naics: [], text: [] }; // activity rows by kind, for narrowing
  for (const [kind, value, group] of plan) {
    const before = await rows();
    say(`> ${kind} ${JSON.stringify(value).slice(0, 110)}`);
    await blocks[kind](value);
    const { chosen, added } = await ok(before);
    groups[group].push(...added.map((r) => r.n));
    if (group === 'activity') activity[kind === 'industry' ? value.scheme : 'text'].push(...added.map((r) => r.n));
    for (const r of added) say(`   ${r.text.slice(0, 120)}  [step ${r.stepCount}]`);
    log.steps.push({ kind, value, chosen, added });
    if (!exporting) for (const r of added) emit({ type: 'step', kind, text: r.text, stepCount: r.stepCount, running: r.running });
    await page.screenshot({ path: path.join(outDir, `${String(log.steps.length).padStart(2, '0')}-${kind}.png`) });
    if (added.some((r) => r.stepCount === '0')) throw new Error(`Step "${kind}" matched 0 companies`);
  }
  const or = (g) => (g.length > 1 ? `(${g.join(' or ')})` : g.join(''));
  const withActivity = (a) => [groups.and.slice(0, 5).join(' and '), or(groups.has), groups.and.slice(5).join(' and '), a].filter(Boolean).join(' and ');
  // Sets the Boolean and returns the count. The count is recalculated in the background: wait for it to change from
  // the one shown before, then for two equal readings. (If it really is the same, this waits out the 60 seconds.)
  const setFormula = async (formula, stale) => {
    await page.fill('#searchFormula', formula);
    await page.click('button.refresh');
    await settle();
    await page.waitForFunction((old) => Number(document.querySelector('#records-count')?.innerText.replace(/[^\d]/g, '')) !== old, stale, { timeout: 60000 }).catch(() => {});
    for (let last = -1, now = await total(); now !== last; now = await total()) { last = now; await page.waitForTimeout(2500); }
    return total();
  };
  // Narrowing (user decision: at most 2,000 companies). The steps stay as they are; only the way the activity steps
  // are joined gets stricter, broadest first, until the count is within the limit. Thresholds are never changed.
  const schemes = ['nace', 'usSic', 'naics'].map((s) => activity[s]).filter((g) => g.length);
  const codes = schemes.flat(), text = activity.text;
  const ladder = [['any industry code or keyword search', or([...codes, ...text])]];
  if (codes.length && text.length) ladder.push(['an industry code and a keyword search', `${or(codes)} and ${or(text)}`]);
  if (schemes.length > 1) ladder.push([`a code in every classification${text.length ? ' and a keyword search' : ''}`, [...schemes, ...(text.length ? [text] : [])].map(or).join(' and ')]);
  const limit = job.maxCompanies ?? 2000;
  const narrowNote = (t) => { say(`  narrow: ${t}`); if (!exporting) emit({ type: 'step', kind: 'narrow', text: t }); };
  let shown = await total(), kept = null; // shown starts as the count for the site's default formula (every step and-ed)
  log.narrowing = [];
  for (const [label, a] of ladder) {
    const formula = withActivity(a), n = await setFormula(formula, shown);
    shown = n;
    log.narrowing.push({ label, formula, total: n });
    if (kept && n === 0) { narrowNote(`Requiring ${label} leaves no companies, so the search stays at ${kept.n.toLocaleString()}`); break; }
    if (kept) narrowNote(`${kept.n.toLocaleString()} companies is over the limit of ${limit.toLocaleString()}: now requiring ${label}, ${n.toLocaleString()} companies`);
    kept = { formula, n };
    if (n <= limit) break;
  }
  if (shown !== kept.n) await setFormula(kept.formula, shown);
  if (kept.n > limit) narrowNote(`Still ${kept.n.toLocaleString()} companies, over the limit of ${limit.toLocaleString()}: tighten the codes or keywords and run again`);
  log.boolean = await page.inputValue('#searchFormula');
  log.total = await total();
  log.rows = await rows();
  say(`\nBOOLEAN: ${log.boolean}\nTOTAL: ${log.total} companies${log.total > 10000 ? '  (over the 10,000 cap: narrow the search)' : ''}`);
  if (exporting) await exportResults();
} catch (e) {
  // A session that drops part-way shows up as a missing control. Name it, so the runner hands the task back and it
  // runs again from the start in a new analysis once someone has logged in. Not after credits were spent.
  if (!spending && page.url().includes('login.bvdinfo.com') && !/logged out/.test(e.message)) e = new Error('TP Catalyst logged out during the run: log in again in the Chrome window, and rerun');
  failed = e;
  log.error = e.message;
  await page.screenshot({ path: path.join(outDir, 'error.png') }).catch(() => {});
  say(`FAILED: ${e.message}\n  at ${page.url()}`);
}
log.finished = new Date().toISOString();
emit({ type: 'end', status: failed ? 'failed' : 'done', total: log.total, boolean: log.boolean, error: log.error, file: log.exportFile, creditsBefore: log.creditsBefore, creditsAfter: log.creditsAfter });
fs.writeFileSync(path.join(outDir, 'run-log.json'), JSON.stringify(log, null, 1));
say(`log: ${outDir}`);
await browser.close();
process.exit(failed ? 1 : 0);
