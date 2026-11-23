// Runs a list of exploration actions from a JSON file: node explore/act.mjs steps.json
// Actions: ["goto",url] ["click",sel] ["fill",sel,val] ["type",sel,val] ["check",sel] ["press",key]
//          ["snap",root?,max?] ["text",sel] ["html",sel,maxChars?] ["shot",file] ["wait",ms] ["eval",js]
import fs from 'node:fs';
import path from 'node:path';
import { attach, settle, snap } from './lib.mjs';

const steps = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const { browser, page } = await attach();
const base = new URL(page.url()).origin;
try {
  for (const [op, a, b] of steps) {
    console.log(`\n== ${op} ${a ?? ''} ${b ?? ''}`);
    if (op === 'goto') { await page.goto(a.startsWith('http') ? a : base + a, { waitUntil: 'domcontentloaded', timeout: 60000 }); await settle(page); }
    else if (op === 'click') { await page.click(a, { timeout: 10000 }); await settle(page); }
    else if (op === 'fill') { await page.fill(a, b, { timeout: 10000 }); await settle(page); }
    else if (op === 'type') { await page.locator(a).pressSequentially(b, { delay: 60 }); await settle(page); }
    else if (op === 'check') { await page.check(a, { timeout: 10000 }); await settle(page); }
    else if (op === 'press') { await page.keyboard.press(a); await settle(page); }
    else if (op === 'snap') await snap(page, { root: a ?? 'body', max: b ?? 150 });
    else if (op === 'text') console.log((await page.locator(a).allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).join('\n'));
    else if (op === 'html') console.log((await page.locator(a).first().evaluate((e) => e.outerHTML)).replace(/\s+/g, ' ').slice(0, b ?? 3000));
    else if (op === 'shot') await page.screenshot({ path: path.join(path.dirname(process.argv[2]), a) });
    else if (op === 'wait') await page.waitForTimeout(a);
    else if (op === 'eval') console.log(JSON.stringify(await page.evaluate(a), null, 1));
    else throw new Error(`unknown op ${op}`);
  }
} catch (err) {
  console.log(`!! ${err.message.split('\n')[0]}`);
} finally {
  console.log(`\nAT: ${page.url()}`);
  await browser.close();
}
