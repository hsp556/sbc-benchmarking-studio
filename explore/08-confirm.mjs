// Confirms the credit warning that follows Export, then watches for the export to be produced.
import fs from 'node:fs';
import path from 'node:path';
import { attach } from './lib.mjs';
const outDir = path.resolve('runs', 'export-test');
fs.mkdirSync(outDir, { recursive: true });
const { browser, page } = await attach();
const say = (...a) => console.log(...a);
page.on('download', async (d) => { const t = path.join(outDir, d.suggestedFilename()); await d.saveAs(t); say('DOWNLOAD', d.suggestedFilename(), fs.statSync(t).size, 'bytes'); });
page.on('response', async (r) => {
  if (/Exports|\/Export|GetData/i.test(r.url()) && r.url().includes('bvdinfo')) {
    let body = '';
    if (/AsyncProgress|\/Export\?/i.test(r.url())) body = (await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
    say('RESP', r.status(), r.request().method(), r.url().replace(/^.*\/Companies/, '').slice(0, 110), body);
  }
});
const popup = page.locator('.popup').filter({ has: page.locator('.creditResults') }).last();
say('POPUP BUTTONS:', await popup.evaluate((p) => [...p.querySelectorAll('a,button')].map((e) => `${e.className}|${e.innerText.trim()}`)).catch((e) => e.message.split('\n')[0]));
await popup.locator("label:has-text('Use 1 credit')").click();
await popup.locator("a:text-is('OK'), button:text-is('OK')").first().click();
for (let i = 0; i < 9; i += 1) await page.waitForTimeout(5000);
say('VISIBLE POPUPS:', await page.evaluate(() => [...document.querySelectorAll('.popup')].filter((e) => e.offsetParent && e.innerText.trim()).map((e) => e.innerText.trim().replace(/\s+/g, ' ').slice(0, 400))));
say('AT', page.url());
await browser.close();
