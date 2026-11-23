// Opens Prowess in the project's Chrome (debug port 9222) and prints what the page shows. Read-only: no clicks.
//   node explore/prowess-open.mjs [screenshot.png]
import { chromium } from 'playwright-core';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
let page = ctx.pages().find((p) => p.url().includes('prowess.cmie.com'));
if (!page) { page = await ctx.newPage(); await page.goto('https://prowess.cmie.com/', { waitUntil: 'domcontentloaded', timeout: 60000 }); }
await page.waitForTimeout(5000);
console.log('url  ', page.url());
console.log('title', await page.title());
const text = await page.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 2500));
console.log(text);
if (process.argv[2]) await page.screenshot({ path: process.argv[2] });
await browser.close(); // detaches only; the Chrome window stays open
