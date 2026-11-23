// Front-end smoke check in a headless Chrome (separate from the TP Catalyst window).
//   node studio/web/smoke.mjs [http://127.0.0.1:3000]     screenshots go to studio/data/shots
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://127.0.0.1:3000';
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'shots');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const problems = [];
for (const width of [375, 768, 1024, 1440]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`${width}px console: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`${width}px page error: ${e.message}`));
  for (const tab of ['new', 'run', 'searches', 'agents', 'guide']) {
    await page.goto(`${base}/#${tab}`);
    await page.waitForSelector('main h2');
    await page.waitForTimeout(600);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 0) problems.push(`${width}px #${tab}: horizontal scroll of ${overflow}px`);
    const small = await page.evaluate(() => [...document.querySelectorAll('a, button, input, select, textarea')]
      .filter((e) => e.offsetParent && e.getBoundingClientRect().height < 44 && !e.closest('p, li > span, .underline')).map((e) => e.outerHTML.slice(0, 80)));
    for (const s of small) problems.push(`${width}px #${tab}: target under 44px: ${s}`);
    await page.screenshot({ path: path.join(out, `${tab}-${width}.png`), fullPage: true });
  }
  if (width === 1440) { // required-field validation on the New search form
    await page.goto(`${base}/#new`);
    await page.click('button[type=submit]');
    const errors = await page.locator('p.text-bad').count();
    if (errors !== 3) problems.push(`expected 3 "Required" messages on an empty form, saw ${errors}`);
  }
  const done = (await (await fetch(`${base}/api/jobs?status=done&limit=1`)).json()).items[0];
  if (done) { // a finished search shows the approval form; the Approve button stays disabled until the box is ticked
    await page.goto(`${base}/#run/${done.id}`);
    const approve = page.locator("button:text-is('Approve and export')");
    if (done.total > 0 && done.total <= 10000 && !done.export_state) {
      await approve.waitFor({ timeout: 10000 }).catch(() => problems.push(`${width}px: no approval form on a finished search`));
      if (await approve.isEnabled().catch(() => false)) problems.push(`${width}px: Approve is enabled before the credits box is ticked`);
    }
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    const wide = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > document.documentElement.clientWidth + 0.5)
      .map((e) => `${e.tagName} "${e.textContent.trim().slice(0, 30)}"`).slice(-2));
    if (wide.length) problems.push(`${width}px run page: wider than the screen: ${wide.join(' / ')}`);
    await page.screenshot({ path: path.join(out, `export-${width}.png`), fullPage: true });
  }
  if (width === 1440 && process.argv.includes('--plan')) { // real planner call: brief → animation → editable plan
    await page.fill('#f-industry', 'paints, varnishes and coatings');
    await page.fill('#f-function', 'manufacturer');
    await page.fill('#f-your-name', 'smoke test');
    await page.click('button[type=submit]');
    await page.waitForSelector('.plan-orb');
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(out, 'planning-1440.png'), fullPage: true });
    await page.waitForSelector("button:text-is('Run the search')", { timeout: 120000 }).catch(() => problems.push('no plan arrived within 2 minutes'));
    await page.fill('#f-nace-codes', '2030, 2059,');
    if ((await page.inputValue('#f-nace-codes')) !== '2030, 2059,') problems.push('a trailing comma cannot be typed in the codes box');
    await page.screenshot({ path: path.join(out, 'plan-1440.png'), fullPage: true });
  }
  await page.close();
}
await browser.close();
console.log(problems.length ? problems.join('\n') : 'OK: 5 tabs at 375, 768, 1024 and 1440 px; no console errors, no horizontal scroll, validation works');
process.exitCode = problems.length ? 1 : 0;
