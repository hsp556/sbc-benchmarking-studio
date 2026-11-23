// Walks every category in "Add a search step" and records each criterion's label and address.
import fs from 'node:fs';
import { attach, settle } from './lib.mjs';
const { browser, page } = await attach();
const out = {};
const cats = await page.$$eval('li[data-id]', (els) => els.filter((e) => !e.querySelector('a[href*="/SearchExpert/By/"]') && e.offsetParent).map((e) => e.getAttribute('data-id')));
console.log('categories:', cats.join(' | '));
async function visit(id, depth = 0) {
  const li = page.locator(`li[data-id="${id}"]`).first();
  await li.click({ timeout: 8000 }).catch((e) => console.log('skip', id, e.message.split('\n')[0]));
  await settle(page);
  const items = await page.$$eval('a[href*="/SearchExpert/By/"]', (as) => as.filter((a) => a.offsetParent).map((a) => ({ label: a.innerText.trim().replace(/\s+/g, ' '), href: a.getAttribute('href').replace(/^.*\/SearchExpert\/By\//, '') })));
  out[id] = items;
  console.log(`${'  '.repeat(depth)}${id}: ${items.length}`);
  if (depth === 0) {
    const now = await page.$$eval('li[data-id]', (els) => els.filter((e) => !e.querySelector('a[href*="/SearchExpert/By/"]') && e.offsetParent).map((e) => e.getAttribute('data-id')));
    for (const sub of now.filter((s) => !cats.includes(s))) { cats.push(sub); await visit(sub, 1); }
  }
}
for (const c of [...cats]) await visit(c);
fs.writeFileSync('sop/criteria-catalogue.json', JSON.stringify(out, null, 1));
await browser.close();
