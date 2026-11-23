// Lists today's rows of Prowess "Commands History and Planner" (free: no Execute click). node explore/prowess-history.mjs
import { chromium } from 'playwright-core';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts()[0].pages().find((p) => p.url() === 'https://prowess.cmie.com/');
try {
  await page.getByText('Commands History and Planner', { exact: true }).first().click();
  await page.waitForTimeout(4000);
  const day = new Date().toISOString().slice(0, 10);
  const rows = await page.evaluate((d) => [...document.querySelectorAll('tr')].filter((r) => r.offsetParent && r.innerText.includes(d) && r.children.length >= 6)
    .map((r) => [...r.children].map((c) => (c.getAttribute('title') || c.innerText).replace(/\s+/g, ' ').trim())), day);
  for (const r of rows) console.log(`${r[0].slice(0, 110)} | ${r.slice(1).join(' | ')}`);
  console.log(await page.evaluate(() => document.body.innerText.match(/Queries Queued:[^\n]*/)?.[0]));
} catch (e) { console.log('!!', e.message.split('\n')[0]); }
await browser.close();
