// Scratch probe (free): what opens the sheet tabs after a page reload, and how the current sheet is marked.
import { chromium } from 'playwright-core';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts()[0].pages().find((p) => p.url() === 'https://prowess.cmie.com/');
const tabs = () => page.evaluate(() => ({ q: document.body.innerText.match(/Queries Queued:[^\n]*/)?.[0], nav: (() => { const n = document.querySelector('#nav_new_output'); return n ? `${n.tagName} visible=${!!n.offsetParent} "${n.textContent.trim().slice(0, 60)}"` : null; })(), lis: [...document.querySelectorAll('li')].filter((e) => e.offsetParent && /[OW]\d{3,4}$/.test(e.textContent.trim())).map((li) => `${li.textContent.trim()} ${getComputedStyle(li).color}`) }));
try {
  await page.bringToFront();
  console.log('now', await tabs());
  await page.locator('#nav_new_output').click({ timeout: 8000 }); await page.waitForTimeout(6000);
  console.log('after new outputs', await tabs());
  await page.getByText('OSC & Worksheets', { exact: true }).first().click(); await page.waitForTimeout(6000);
  console.log('after OSC & Worksheets', await tabs());
  await page.screenshot({ path: 'sop/screens/prowess/run-osc-after-reload.png' });
} catch (e) { console.log('!!', e.message.split('\n')[0]); }
await browser.close();
