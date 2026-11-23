// Is a JavaScript alert blocking the Prowess tab? Reports it and dismisses it (accept) when --accept is given.
import { chromium } from 'playwright-core';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts()[0].pages().find((p) => p.url().includes('prowess.cmie.com'));
const cdp = await page.context().newCDPSession(page);
cdp.on('Page.javascriptDialogOpening', (d) => console.log('dialog event:', d.type, JSON.stringify(d.message)));
await cdp.send('Page.enable');
await new Promise((r) => setTimeout(r, 1500));
if (process.argv.includes('--accept')) {
  try { await cdp.send('Page.handleJavaScriptDialog', { accept: true }); console.log('dismissed a dialog'); } catch (e) { console.log('no dialog:', e.message.split('\n')[0]); }
}
const alive = await Promise.race([page.evaluate(() => document.title), new Promise((r) => setTimeout(() => r('PAGE NOT RESPONDING'), 5000))]);
console.log('page:', alive);
await browser.close();
