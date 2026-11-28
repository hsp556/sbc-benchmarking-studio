// Rebuilds sop/prowess-product-groups.json: CMIE's "Main product/service group" tree names and codes, read from the
// industry form in the logged-in Prowess tab. Free: it opens the form and reads the tree; it ticks and runs nothing.
//   node explore/prowess-groups.mjs [--port 9222]
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const i = process.argv.indexOf('--port');
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${i > 0 ? process.argv[i + 1] : '9222'}`);
const page = browser.contexts()[0].pages().find((p) => p.url().startsWith('https://prowess.cmie.com'));
if (!page) { console.log('No Prowess tab: open https://prowess.cmie.com in the Chrome window and log in.'); process.exit(1); }
page.setDefaultTimeout(20000);
await page.bringToFront();
if (!(await page.locator('#btn1').isVisible())) { await page.getByText('Query Builder', { exact: true }).first().click(); await page.waitForTimeout(2500); }
if (!(await page.locator('#CCt54').isVisible())) { await page.locator('#btn7').click(); await page.waitForTimeout(1200); }
await page.locator('#CCt54').click();
await page.waitForTimeout(6000);
const groups = await page.evaluate(() => [...document.querySelectorAll('#t54_td_r2c1_tree_T input.tree_cbox')].map((cb) => ({
  sid: cb.getAttribute('sid'), label: cb.closest('tr')?.querySelector('span.node_text')?.textContent.trim() ?? '',
})).filter((g) => g.sid && g.label));
await browser.close();
if (groups.length < 1000) { console.log(`Only ${groups.length} groups read: the tree did not load fully. Nothing written.`); process.exit(1); }
fs.writeFileSync('sop/prowess-product-groups.json', JSON.stringify(groups, null, 1));
console.log(`${groups.length} groups written to sop/prowess-product-groups.json (${new Set(groups.map((g) => g.label)).size} distinct names)`);
