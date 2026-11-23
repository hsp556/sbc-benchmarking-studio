// Ad-hoc exploration of the live Prowess tab in the project's Chrome (port 9222): node explore/prowess-act.mjs steps.json
// Actions: ["click",sel] ["clickText",text] ["fill",sel,val] ["press",key] ["text",sel,maxChars?] ["html",sel,maxChars?]
//          ["shot",file] ["wait",ms] ["eval",js] ["controls",rootSel?]  (controls = visible buttons, links, inputs)
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const steps = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts()[0].pages().find((p) => p.url().includes('prowess.cmie.com'));
if (!page) { console.log('No Prowess tab is open'); process.exit(1); }
const clean = (s, n) => s.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').slice(0, n);
try {
  for (const [op, a, b] of steps) {
    console.log(`\n== ${op} ${a ?? ''} ${b ?? ''}`);
    if (op === 'click') await page.click(a, { timeout: 10000 });
    else if (op === 'clickText') await page.getByText(a, { exact: true }).filter({ visible: true }).first().click({ timeout: 10000 });
    else if (op === 'fill') await page.fill(a, b, { timeout: 10000 });
    else if (op === 'press') await page.keyboard.press(a);
    else if (op === 'text') console.log(clean((await page.locator(a).first().innerText()), b ?? 3000));
    else if (op === 'html') console.log((await page.locator(a).first().evaluate((e) => e.outerHTML)).replace(/\s+/g, ' ').slice(0, b ?? 3000));
    else if (op === 'shot') await page.screenshot({ path: a });
    else if (op === 'wait') await page.waitForTimeout(a);
    else if (op === 'eval') console.log(JSON.stringify(await page.evaluate(a), null, 1));
    else if (op === 'controls') console.log((await page.evaluate((root) => [...(document.querySelector(root) ?? document.body).querySelectorAll('button, a, input, select, [role=button], [onclick]')]
      .filter((e) => e.offsetParent !== null)
      .map((e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.name ? '[name=' + e.name + ']' : ''}${e.type ? ':' + e.type : ''} "${(e.innerText || e.value || e.placeholder || e.title || '').trim().replace(/\s+/g, ' ').slice(0, 50)}"`), a ?? 'body')).join('\n').slice(0, b ?? 6000));
    else throw new Error(`unknown op ${op}`);
    if (['click', 'clickText', 'fill', 'press'].includes(op)) await page.waitForTimeout(1500);
  }
} catch (err) {
  console.log(`!! ${err.message.split('\n')[0]}`);
} finally {
  console.log(`\nAT: ${page.url()}`);
  await browser.close(); // detaches; Chrome stays open
}
