// Captures the look of a public reference site: screenshots plus fonts, colours and effects in use.
//   node explore/site-look.mjs <url> <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const [url, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch((e) => console.log('load:', e.message.split('\n')[0]));
await page.waitForTimeout(2500);
await page.screenshot({ path: path.join(out, 'top.png') });
await page.screenshot({ path: path.join(out, 'full.png'), fullPage: true });
const look = await page.evaluate(() => {
  const count = (m, k) => m.set(k, (m.get(k) ?? 0) + 1);
  const maps = { font: new Map(), color: new Map(), bg: new Map(), bgImage: new Map(), radius: new Map(), shadow: new Map(), blur: new Map(), border: new Map() };
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const s = getComputedStyle(el);
    count(maps.font, `${s.fontFamily.split(',')[0]} ${s.fontWeight}`);
    count(maps.color, s.color);
    if (s.backgroundColor !== 'rgba(0, 0, 0, 0)') count(maps.bg, s.backgroundColor);
    if (s.backgroundImage !== 'none') count(maps.bgImage, s.backgroundImage.slice(0, 200));
    if (s.borderRadius !== '0px') count(maps.radius, s.borderRadius);
    if (s.boxShadow !== 'none') count(maps.shadow, s.boxShadow.slice(0, 160));
    if (s.backdropFilter && s.backdropFilter !== 'none') count(maps.blur, s.backdropFilter);
    if (s.borderTopWidth !== '0px') count(maps.border, `${s.borderTopWidth} ${s.borderTopColor}`);
  }
  const top = (m, n = 8) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${v}× ${k}`);
  const b = getComputedStyle(document.body);
  return { title: document.title, body: { bg: b.backgroundColor, bgImage: b.backgroundImage.slice(0, 300), font: b.fontFamily, size: b.fontSize }, ...Object.fromEntries(Object.entries(maps).map(([k, m]) => [k, top(m)])) };
});
console.log(JSON.stringify(look, null, 1));
await browser.close();
