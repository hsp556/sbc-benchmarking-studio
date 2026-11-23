// Tests the Excel export once: fills the dialog, presses Export, and reports dialogs, downloads and new tabs.
import fs from 'node:fs';
import path from 'node:path';
import { attach, settle } from './lib.mjs';

const VIEW = process.argv[2] ?? '2025';
const outDir = path.resolve('runs', 'export-test');
fs.mkdirSync(outDir, { recursive: true });
const { browser, page } = await attach();
const ctx = page.context();
const say = (...a) => console.log(...a);
const popupText = () => page.evaluate(() => [...document.querySelectorAll('.popup, [class*=popup__dialog]')].filter((e) => e.offsetParent && e.innerText.trim()).map((e) => `${e.className} >> ${e.innerText.trim().replace(/\s+/g, ' ').slice(0, 500)}`));

page.on('download', async (d) => {
  const target = path.join(outDir, d.suggestedFilename());
  await d.saveAs(target);
  say('DOWNLOAD', d.suggestedFilename(), fs.statSync(target).size, 'bytes', d.url().slice(0, 140));
});
ctx.on('page', (p) => say('NEW TAB', p.url()));
page.on('response', (r) => { if (/export|download/i.test(r.url()) && !/\.(png|js|css)/.test(r.url())) say('RESP', r.status(), r.request().method(), r.url().slice(0, 170)); });

await page.click("a:text-is('Excel')");
await settle(page);
say('DIALOG 1:', await popupText());
const dlg = page.locator('.popup__dialog.export');
if (await dlg.count()) {
  await dlg.locator("input[name='component.FileName']").fill('ZZ automation test export');
  await dlg.locator("select[name='component.SelectedFormatId']").selectOption({ label: VIEW });
  await dlg.locator("select[name='component.RangeOptionSelectedId']").selectOption('All');
  await dlg.locator('a.showHideOptionsexcel').click().catch(() => {});
  await page.waitForTimeout(1000);
  say('OPTIONS:', await dlg.evaluate((d) => [...d.querySelectorAll('input,select,label')].filter((e) => e.offsetParent).map((e) => `${e.tagName}|${e.name || ''}|${e.type || ''}|${e.tagName === 'SELECT' ? [...e.options].map((o) => `${o.value}=${o.text.trim()}`).join(';').slice(0, 200) : e.value || ''}|${e.checked ? 'CHECKED' : ''}|${e.innerText.trim().slice(0, 70)}`)));
  await dlg.locator('a.button.submit.ok').click();
  await page.waitForTimeout(6000);
  say('AFTER EXPORT:', await popupText());
}
for (let i = 0; i < 12; i += 1) await page.waitForTimeout(5000);
say('FINAL POPUPS:', await popupText());
say('AT', page.url());
await browser.close();
