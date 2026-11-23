import { attach } from './lib.mjs';
const { browser, page } = await attach();
for (const u of ['/202610-1/tpcatalyst/1/Companies/Settings', '/202610-1/tpcatalyst/1/Companies']) {
  const t = Date.now();
  try {
    const r = await page.goto('https://tpcatalyst-r1.bvdinfo.com' + u, { timeout: 90000, waitUntil: 'domcontentloaded' });
    console.log(u, r.status(), await page.title(), `${Date.now() - t}ms`, page.url());
  } catch (e) { console.log(u, 'ERR', e.message.split('\n')[0], `${Date.now() - t}ms`); }
}
await browser.close();
