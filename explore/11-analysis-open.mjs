// Is an analysis open? Opens /SearchExpert and reports where the site lands; then looks on the home page
// for the test analysis and the autosave entry (names only, no company data).
import { chromium } from 'playwright-core';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes('bvdinfo.com'));
const base = page.url().match(/^https:\/\/[^/]+\/[^/]+\/tpcatalyst\/\d+\/Companies/)?.[0];
console.log('start:', page.url());
await page.goto(base + '/SearchExpert', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
console.log('after /SearchExpert:', page.url());
console.log('summary table:', await page.locator('table.search-summary').count(), '| h1/h2:', (await page.locator('h1, h2').allInnerTexts()).slice(0, 4).join(' / ').replace(/\s+/g, ' ').slice(0, 200));
await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
const hits = await page.evaluate(() => [...document.querySelectorAll('a, li, td, span')]
  .filter((e) => e.children.length === 0 && /ZZ automation test|_AUTOSAVE_/i.test(e.textContent))
  .map((e) => `${e.tagName} "${e.textContent.trim().slice(0, 60)}" href=${e.closest('a')?.getAttribute('href')?.slice(0, 90) ?? ''}`));
console.log('home matches:', hits.length ? '\n  ' + [...new Set(hits)].join('\n  ') : 'none');
await browser.close();
