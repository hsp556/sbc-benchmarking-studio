// Opens each criterion screen (without confirming anything) and saves a description of its controls.
// Usage: node explore/05-screens.mjs [Id ...]   (ids as in sop/criteria-catalogue.json; default: all)
import fs from 'node:fs';
import { attach, settle } from './lib.mjs';

const cat = JSON.parse(fs.readFileSync('sop/criteria-catalogue.json', 'utf8'));
const all = new Map();
for (const items of Object.values(cat)) for (const i of items) all.set(i.href, i.label);
const want = process.argv.slice(2);
const targets = [...all.keys()].filter((h) => !want.length || want.includes(h.split('?')[0]));
fs.mkdirSync('sop/screens', { recursive: true });

const { browser, page } = await attach();
const base = page.url().replace(/\/SearchExpert.*$/, '/SearchExpert');
for (const href of targets) {
  const id = href.split('?')[0];
  try {
    await page.goto(`${base}/By/${href}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await settle(page);
    const desc = await page.evaluate(() => {
      const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width && r.height && s.visibility !== 'hidden' && s.display !== 'none'; };
      const main = document.querySelector('#main-content') ?? document.body;
      const lines = [];
      for (const el of main.querySelectorAll('h1,h2,h3,h4,li,label,a,button,input,select,textarea,[role=tab]')) {
        if (!vis(el)) continue;
        const tag = el.tagName.toLowerCase();
        if (tag === 'li' && el.querySelector('li,input,select')) continue;
        let text = (el.innerText || el.value || el.placeholder || el.title || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 110);
        if (tag === 'select') text = [...el.options].map((o) => o.text.trim()).slice(0, 15).join(' | ');
        const a = (n) => (el.getAttribute(n) ? ` ${n}="${el.getAttribute(n).slice(0, 60)}"` : '');
        if (!text && !el.id && !el.name) continue;
        lines.push(`<${tag}${el.id ? ` #${el.id}` : ''}${a('name')}${a('type')}${a('class')}${a('data-id')}${a('data-value')}${a('for')}> ${text}`);
        if (lines.length > 220) break;
      }
      return lines.join('\n');
    });
    fs.writeFileSync(`sop/screens/${id}.txt`, `LABEL: ${all.get(href)}\nADDRESS: /SearchExpert/By/${href}\nLANDED: ${page.url()}\n\n${desc}\n`);
    console.log(`ok   ${id}  (${desc.split('\n').length} lines)`);
  } catch (e) {
    console.log(`FAIL ${id}  ${e.message.split('\n')[0]}`);
  }
  await page.waitForTimeout(1500);
}
await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
await browser.close();
