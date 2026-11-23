// Exploration helpers: attach to the logged-in Chrome and describe what is on the page.
import { chromium } from 'playwright-core';

export async function attach() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const pages = browser.contexts().flatMap((c) => c.pages());
  const page = pages.find((p) => p.url().includes('bvdinfo.com')) ?? pages[0];
  return { browser, page, pages };
}

// Waits for the site's "Loading ..." overlay and network to settle.
export async function settle(page) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(1500);
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
}

// Lists visible interactive elements with enough attributes to write selectors.
export async function snap(page, { root = 'body', max = 150 } = {}) {
  const rows = await page.evaluate(({ root, max }) => {
    const scope = document.querySelector(root) ?? document.body;
    const sel = 'a,button,input,select,textarea,[role=button],[role=tab],[role=checkbox],[role=radio],[onclick],label,h1,h2,h3,li[data-id],[data-action]';
    const out = [];
    for (const el of scope.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if (!r.width || !r.height || st.visibility === 'hidden' || st.display === 'none') continue;
      const text = (el.innerText || el.value || el.getAttribute('aria-label') || el.title || el.placeholder || '').trim().replace(/\s+/g, ' ').slice(0, 90);
      const a = (n) => (el.getAttribute(n) ? ` ${n}="${el.getAttribute(n).slice(0, 70)}"` : '');
      out.push(`<${el.tagName.toLowerCase()}${el.id ? ` #${el.id}` : ''}${a('name')}${a('type')}${a('class')}${a('data-id')}${a('data-action')}${a('href')}${a('for')}> ${text}`);
      if (out.length >= max) break;
    }
    return out;
  }, { root, max });
  console.log(`URL: ${page.url()}\nTITLE: ${await page.title()}\n${rows.join('\n')}`);
}
